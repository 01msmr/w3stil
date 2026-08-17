#!/usr/bin/env node
/**
 * auth.mjs — einmalig eine Session für eine Domain aufzeichnen.
 *
 *   node tools/auth.mjs golem.de
 *
 * Öffnet einen sichtbaren Browser. Consent-Dialog wegklicken oder einloggen,
 * dann im Terminal Enter drücken. Cookies + localStorage landen in
 * .auth/<domain>.json und werden von check.mjs automatisch verwendet.
 *
 * .auth/ ist gitignored — die Dateien enthalten Session-Tokens und gehören
 * weder ins Repo noch in die CI. In GitHub Actions läuft der Check für solche
 * Domains ohne Session und meldet "⊘ Interstitial"; das ist gewollt, weil ein
 * grüner CI-Lauf mit fremden Cookies weniger wert wäre als ein ehrlicher Skip.
 */

import { mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const domain = process.argv[2];

if (!domain) {
  console.error('Aufruf: node tools/auth.mjs <domain>');
  process.exit(1);
}

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto(`https://${domain}/`, { waitUntil: 'domcontentloaded' });

console.log(`\nBrowser offen auf ${domain}.`);
console.log('Consent bestätigen bzw. einloggen, dann hier Enter drücken.');

const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question('');
rl.close();

await mkdir(join(ROOT, '.auth'), { recursive: true });
const path = join(ROOT, '.auth', `${domain}.json`);
await ctx.storageState({ path });

console.log(`✓ .auth/${domain}.json — check.mjs verwendet sie ab jetzt automatisch.`);

await browser.close();

