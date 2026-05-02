// Smoke test: carga game.html en Chromium headless via Playwright y falla si
// hay errores de consola o page-errors en los primeros 6 segundos. No valida
// gameplay — solo que el bundle no esté roto.

import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL || 'http://127.0.0.1:5050/game.html';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const errors = [];
const warnings = [];

page.on('console', (msg) => {
  const type = msg.type();
  const text = msg.text();
  if (type === 'error') errors.push('[console.error] ' + text);
  else if (type === 'warning') warnings.push('[console.warn] ' + text);
});

page.on('pageerror', (err) => {
  errors.push('[pageerror] ' + (err && err.message ? err.message : String(err)));
});

console.log('→ Cargando ' + URL);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });

// Dejamos correr 6s para capturar errores diferidos del IIFE de game.html
await page.waitForTimeout(6_000);

// Verificación mínima: el game state está disponible
const ok = await page.evaluate(() => {
  return !!(window.XTANCO_APP && window.xtAPI);
});

await browser.close();

console.log('Errores: ' + errors.length + ' · Warnings: ' + warnings.length);
if (warnings.length) console.log(warnings.slice(0, 5).join('\n'));
if (errors.length) {
  console.error('--- ERRORES DETECTADOS ---');
  console.error(errors.join('\n'));
  process.exit(1);
}
if (!ok) {
  console.error('XTANCO_APP / xtAPI no disponibles tras la carga. El bundle no se inicializó.');
  process.exit(1);
}
console.log('✓ Página carga sin errores y window.XTANCO_APP + window.xtAPI están disponibles.');
process.exit(0);
