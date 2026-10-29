// Capturas da Arena, Liga e telas de batalha (Edge + Playwright).
// uso: node .claude/arena-shots.mjs <prefixo-saida> [porta]
import { chromium } from 'playwright';
const out = process.argv[2];
const port = process.argv[3] ?? '5192';
const base = `http://localhost:${port}/pokemon-tcg-ar/`;
const browser = await chromium.launch({ channel: 'msedge' });
const sizes = { m: { width: 375, height: 812 }, d: { width: 1280, height: 800 } };
const mk = (i, dex, name) => ({ instanceId: `dp_t${i}_${dex}_${i}`, originCardId: 'base1-58', dexId: dex, name, isDigitalPokemon: true, source: 'fonte', grantedAt: `2026-10-16T10:0${i}:00.000Z`, stage: 0 });
async function open(size, hash, seed) {
  const ctx = await browser.newContext({ viewport: sizes[size], deviceScaleFactor: 1, hasTouch: size === 'm' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${base}#/treinador`);
  await page.evaluate((s) => {
    localStorage.setItem('tcg-ar-onboarding-v1', '1');
    if (s) localStorage.setItem('tcg-ar-liga-v1', JSON.stringify(s));
  }, seed ?? null);
  await page.goto(`${base}?r=${Math.random()}#${hash}`);
  await page.waitForTimeout(2500);
  return page;
}
const shots = [
  ['arena', '/arena'],
  ['treinador', '/treinador'],
  ['caixa-arena', '/caixa?arena=1&virtual=1'],
];
for (const size of ['m', 'd']) {
  for (const [name, hash] of shots) {
    const page = await open(size, hash);
    await page.screenshot({ path: `${out}-${name}-${size}.png`, fullPage: name !== 'caixa-arena' });
    await page.context().close();
  }
}
await browser.close();
