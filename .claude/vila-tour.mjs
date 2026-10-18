import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
await page.goto('http://localhost:5173/pokemon-tcg-ar/#/treinador');
await page.waitForTimeout(1500);
if (process.env.XP) await page.evaluate((xp) => { const k = 'tcg-ar-trainer-v1'; const t = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...t, v: t.v ?? 1, xp: Number(xp) })); }, process.env.XP);
if (process.env.SETUP) {
  await page.goto('http://localhost:5173/pokemon-tcg-ar/?r=2#/vila');
  await page.waitForTimeout(4000);
  await page.goto('http://localhost:5173/pokemon-tcg-ar/?r=2#/treinador');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const k = 'tcg-ar-vila-v1';
    const v = JSON.parse(localStorage.getItem(k));
    const mk = (i, dex, name) => ({ instanceId: `dp_t${i}_${dex}_${i}`, originCardId: 'base1-58', dexId: dex, name, isDigitalPokemon: true, source: 'fonte', grantedAt: `2026-10-16T10:0${i}:00.000Z`, stage: 0 });
    v.digital = { ...v.digital, starterGiven: true, instances: [mk(0, 25, 'Pikachu'), mk(1, 1, 'Bulbasaur'), mk(2, 4, 'Charmander'), mk(3, 7, 'Squirtle'), mk(4, 133, 'Eevee'), mk(5, 143, 'Snorlax')] };
    const hv = (l, d, r) => (l & 3) | ((d & 15) << 2) | ((r & 7) << 6);
    v.homes = { 0: hv(3, 15, 1), 1: hv(3, 0, 2), 2: hv(2, 1, 0), 3: hv(1, 6, 3), 4: hv(0, 0, 0), 5: hv(3, 4, 5) };
    v.house = 3;
    localStorage.setItem(k, JSON.stringify(v));
  });
}
await page.goto('http://localhost:5173/pokemon-tcg-ar/?r=3#/vila');
await page.waitForTimeout(6000);
for (let n = 0; n < 6; n++) { const b = page.getByRole('button', { name: /Continuar|Entendi|Fechar|OK/ }).first(); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(400); } }
await page.mouse.click(700, 300);
const walk = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(300); };
const legs = JSON.parse(process.argv[3]);
let i = 0;
await page.screenshot({ path: `${out}-0.png` });
for (const leg of legs) {
  for (const [k, ms] of leg) await walk(k, ms);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}-${++i}.png` });
}
await browser.close();
