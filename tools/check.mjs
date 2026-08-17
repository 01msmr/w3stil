#!/usr/bin/env node
/**
 * check.mjs — prüft, ob die Selektoren in src/ auf den echten Seiten noch matchen.
 *
 *   node tools/check.mjs                 alle Domains
 *   node tools/check.mjs heise.de        nur eine
 *   node tools/check.mjs --json          maschinenlesbar (für CI-Issues)
 *
 * Exit 1 bei toten Selektoren. Das ist der eigentliche Wert des Repos:
 * du erfährst von einem Redesign, bevor du auf der Seite landest.
 *
 * Optionale Annotation im CSS, direkt über einer Regel:
 *   /* expect: 1 *\/        genau ein Treffer erwartet
 *   /* expect: 1..5 *\/     Bereich
 *   /* expect: 0 *\/        darf verschwinden (z.B. Werbecontainer)
 */

import { readdir, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postcss from 'postcss';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const only = args.filter((a) => !a.startsWith('--'));

/** Selektoren + erwartete Trefferzahl aus einer CSS-Datei ziehen. */
function extract(css) {
  const rules = [];
  const ast = postcss.parse(css);

  ast.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /^(keyframes|media|supports)/.test(rule.parent.name)) {
      if (/keyframes/.test(rule.parent.name)) return;
    }

    let expect = null;
    let prev = rule.prev();
    if (prev?.type === 'comment') {
      const m = prev.text.match(/expect:\s*(\d+)(?:\.\.(\d+))?/);
      if (m) expect = [Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])];
    }

    for (const sel of rule.selectors) {
      const s = sel.trim();
      if (!s || s.startsWith(':root') || s.startsWith('@') || s === '*') continue;
      // Pseudo-Elemente und Zustandsselektoren sind zur Laufzeit nicht zählbar
      if (/::?(before|after|hover|focus|active|visited|first-line)/.test(s)) continue;
      rules.push({ sel: s, expect, line: rule.source?.start?.line });
    }
  });

  return rules;
}

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 w3stil-check/1.0 (+https://w3.msmr.co)';

const browser = await chromium.launch();

/** Consent-Walls: gespeicherte Session aus tools/auth.mjs verwenden, falls vorhanden. */
async function contextFor(domain) {
  const state = join(ROOT, '.auth', `${domain}.json`);
  const opts = { userAgent: UA, viewport: { width: 1440, height: 900 } };
  try {
    await access(state);
    opts.storageState = state;
  } catch {}
  return browser.newContext(opts);
}

/** Erkennt, ob die Seite auf einen Zustimmungs-/Login-Interstitial umgeleitet hat. */
const isWall = (url) =>
  /zustimmung|consent|cookie|datenschutz|login|sso|captcha|challenge/i.test(url);

const files = (await readdir(SRC))
  .filter((f) => f.endsWith('.css') && !f.startsWith('_'))
  .filter((f) => !only.length || only.includes(f.replace(/\.css$/, '')));

const report = [];
let failures = 0;

for (const file of files) {
  const domain = file.replace(/\.css$/, '').replace('!exact', '');
  const rules = extract(await readFile(join(SRC, file), 'utf8'));
  const ctx = await contextFor(domain);
  const page = await ctx.newPage();

  try {
    await page.goto(`https://${domain}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500); // Client-Rendering abwarten
  } catch (e) {
    report.push({ domain, sel: null, status: 'unreachable', msg: e.message.split('\n')[0] });
    failures++;
    await ctx.close();
    continue;
  }

  if (isWall(page.url())) {
    report.push({
      domain,
      sel: null,
      status: 'wall',
      msg: `Interstitial: ${page.url()} — einmalig \`node tools/auth.mjs ${domain}\` ausführen`,
    });
    failures++;
    await ctx.close();
    continue;
  }

  for (const r of rules) {
    let n;
    try {
      n = await page.evaluate((s) => document.querySelectorAll(s).length, r.sel);
    } catch (e) {
      report.push({ domain, ...r, status: 'invalid', n: -1 });
      failures++;
      continue;
    }

    let status = 'ok';
    if (n === 0 && (!r.expect || r.expect[0] > 0)) status = 'dead';
    else if (r.expect && (n < r.expect[0] || n > r.expect[1])) status = 'drift';

    if (status !== 'ok') failures++;
    report.push({ domain, ...r, n, status });
  }

  await ctx.close();
}

await browser.close();

if (asJson) {
  console.log(JSON.stringify(report.filter((r) => r.status !== 'ok'), null, 2));
} else {
  const icon = { ok: '✓', dead: '✗', drift: '~', invalid: '?', unreachable: '!', wall: '⊘' };
  let domain = null;
  for (const r of report) {
    if (r.domain !== domain) {
      domain = r.domain;
      console.log(`\n${domain}`);
    }
    if (r.status === 'ok') continue;
    if (r.status === 'unreachable' || r.status === 'wall') {
      console.log(`  ${icon[r.status]} ${r.msg}`);
      continue;
    }
    const exp = r.expect ? ` (erwartet ${r.expect[0]}..${r.expect[1]})` : '';
    console.log(`  ${icon[r.status]} ${r.sel}  →  ${r.n} Treffer${exp}   src/${domain}.css:${r.line}`);
  }
  const checked = report.filter((r) => r.sel).length;
  console.log(`\n${checked} Selektoren geprüft, ${failures} auffällig.`);
}

process.exit(failures ? 1 : 0);

