#!/usr/bin/env node
/**
 * build.mjs — erzeugt dist/reduce.user.css aus src/
 *
 * Ein Artefakt, eine @updateURL. Jede Datei src/<domain>.css wird zu einer
 * @-moz-document-Sektion; src/_reset.css wird jeder Sektion vorangestellt.
 *
 *   node build.mjs            einmalig bauen
 *   node build.mjs --watch    bei Änderungen in src/ neu bauen
 *   node build.mjs --serve    watch + HTTP-Server auf :8787 (Dev-Install)
 *
 * Bewusst ohne Dependencies: der Build soll auch in fünf Jahren noch laufen.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { watch, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'dist', 'reduce.user.css');

const META = {
  name: 'reduce',
  namespace: 'msmr.dev',
  description: 'Reduziertes Lese-Layout für häufig besuchte Seiten',
  author: 'msmr',
  license: 'MIT',
  updateURL: 'https://w3.msmr.co/reduce.user.css',
};

/**
 * Version = <major>.<minor> aus package.json + Anzahl der Commits als Patch,
 * also 0.1.0, 0.1.1, 0.1.2 … Muss bei jedem Deploy steigen, sonst ignoriert
 * Stylus das Update stillschweigend; der Commit-Zähler garantiert das.
 * Ein Rebuild ohne Commit erzeugt bewusst dieselbe Version.
 *
 * Minor/Major bumpst du in package.json — der Zähler läuft dabei weiter, die
 * Reihenfolge bleibt also auch über einen Bump hinweg monoton.
 */
function version() {
  const base = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    .version.split('.')
    .slice(0, 2)
    .join('.');
  try {
    const raw = execSync('git rev-list --count HEAD', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return `${base}.${raw.toString().trim()}`;
  } catch {
    return `${base}.0`; // kein Git (Tarball, frischer Clone ohne Historie)
  }
}

/**
 * Dateiname -> Matcher.
 *   heise.de.css          -> domain("heise.de")      inkl. aller Subdomains
 *   heise.de!exact.css    -> domain("heise.de") ohne Subdomains via regexp
 *   news.ycombinator.com.css
 * Für Pfad-Scoping direkt @-moz-document im Site-File schreiben und die
 * Datei mit "_" präfixen ist nicht nötig — Sektionen dürfen verschachtelt
 * nicht sein, also lieber eine eigene Datei pro Domain halten.
 */
function matcherFor(domain) {
  if (domain.endsWith('!exact')) {
    const d = domain.slice(0, -'!exact'.length).replace(/\./g, '\\.');
    return `regexp("https?://${d}/.*")`;
  }
  return `domain("${domain}")`;
}

/**
 * Kommentare fliegen aus dem Artefakt: _reset.css landet in JEDER Sektion,
 * die Doku würde sich also n-fach duplizieren. Die Quelle bleibt kommentiert.
 * Mit --comments abschaltbar, wenn du im Stylus-Editor lesen willst.
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n');
}

function indent(css) {
  return css
    .split('\n')
    .map((l) => (l.trim() ? '  ' + l : ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

export async function build() {
  const reset = await readFile(join(SRC, '_reset.css'), 'utf8');
  const files = (await readdir(SRC))
    .filter((f) => f.endsWith('.css') && !f.startsWith('_'))
    .sort();

  if (files.length === 0) throw new Error('src/ enthält keine Site-Dateien');

  const keep = process.argv.includes('--comments');
  const clean = (s) => (keep ? s.trim() : stripComments(s).trim());

  const sections = [];
  for (const file of files) {
    const domain = file.replace(/\.css$/, '');
    const site = await readFile(join(SRC, file), 'utf8');
    const siteCss = clean(site);

    /* Opt-out: eine Site-Datei, die @no-reset deklariert, bekommt _reset.css
     * NICHT vorangestellt. Gedacht für Seiten, an denen ausdrücklich nur ein
     * Ausschnitt verändert werden soll — _reset greift ins Grundlayout ein
     * (Seitenhintergrund, Schrift, aside ausblenden) und lässt sich aus der
     * Site-Datei heraus nicht zurücknehmen, weil !important in derselben
     * Kaskadenschicht nicht rückgängig zu machen ist. */
    const bare = /^\s*\/\*\s*@no-reset\b/.test(site);

    const body = [
      `/* ---- ${domain}${bare ? ' (ohne _reset) ' : ' '}---- */`,
      bare ? '' : clean(reset),
      siteCss ? `${bare ? '' : '\n'}/* site */\n${siteCss}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    sections.push(`@-moz-document ${matcherFor(domain)} {\n${indent(body)}\n}`);
  }

  const header = [
    '/* ==UserStyle==',
    `@name        ${META.name}`,
    `@namespace   ${META.namespace}`,
    `@version     ${version()}`,
    `@description ${META.description}`,
    `@author      ${META.author}`,
    `@license     ${META.license}`,
    `@updateURL   ${META.updateURL}`,
    '==/UserStyle== */',
    '',
    '/* GENERIERT — nicht hier editieren, sondern in src/ und neu bauen. */',
  ].join('\n');

  const out = [header, ...sections].join('\n\n') + '\n';
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, out);

  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`✓ dist/reduce.user.css — ${files.length} Sektionen, ${kb} kB, v${version()}`);
  return out;
}

// --- CLI -------------------------------------------------------------------

const args = process.argv.slice(2);
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  await build().catch((e) => {
    console.error('✗', e.message);
    process.exit(1);
  });

  if (args.includes('--watch') || args.includes('--serve')) {
    let pending;
    watch(SRC, { recursive: true }, () => {
      clearTimeout(pending);
      pending = setTimeout(() => build().catch((e) => console.error('✗', e.message)), 80);
    });
    console.log('… beobachte src/');
  }

  if (args.includes('--serve')) {
    const port = 8787;
    createServer(async (req, res) => {
      if (!req.url.endsWith('.user.css')) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-store',
        // erlaubt, den Dev-Stand aus einer beliebigen Seite heraus zu testen
        'Access-Control-Allow-Origin': '*',
      });
      res.end(await readFile(OUT, 'utf8'));
    }).listen(port, () => {
      console.log(`… http://localhost:${port}/reduce.user.css  (als Dev-Style installieren)`);
    });
  }
}

