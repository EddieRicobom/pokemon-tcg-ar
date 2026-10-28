// Capturas da Vila em pontos fixos, de dia ou de noite (Edge + Playwright, relógio fixo).
// uso: node .claude/vila-shots.mjs <prefixo-saida> '<json [{name,x,y,hour,keys?}]>' [porta]
import { chromium } from 'playwright';
const out = process.argv[2];
const spots = JSON.parse(process.argv[3]);
const port = process.argv[4] ?? '5191';
const base = `http://localhost:${port}/pokemon-tcg-ar/`;
const browser = await chromium.launch({ channel: 'msedge' });
for (const spot of spots) {
  const page = await browser.newPage({ viewport: { width: spot.w ?? 2400, height: spot.h ?? 1500 }, deviceScaleFactor: spot.dpr ?? 0.5 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.clock.setFixedTime(new Date(`2026-10-17T${String(spot.hour ?? 12).padStart(2, '0')}:00:00`));
  await page.goto(`${base}#/treinador`);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { localStorage.setItem('tcg-ar-onboarding-v1', '1'); const k = 'tcg-ar-trainer-v1'; const t = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...t, v: t.v ?? 1, xp: 400000 })); });
  await page.goto(`${base}?r=2#/vila`);
  await page.waitForTimeout(3500);
  await page.goto(`${base}?r=3#/treinador`);
  await page.waitForTimeout(800);
  await page.evaluate((s) => {
    const k = 'tcg-ar-vila-v1';
    const v = JSON.parse(localStorage.getItem(k));
    const mk = (i, dex, name) => ({ instanceId: `dp_t${i}_${dex}_${i}`, originCardId: 'base1-58', dexId: dex, name, isDigitalPokemon: true, source: 'fonte', grantedAt: `2026-10-16T10:0${i}:00.000Z`, stage: 0 });
    v.digital = { ...v.digital, starterGiven: true, instances: [mk(0, 25, 'Pikachu'), mk(1, 1, 'Bulbasaur'), mk(2, 4, 'Charmander'), mk(3, 7, 'Squirtle'), mk(4, 133, 'Eevee'), mk(5, 143, 'Snorlax')] };
    const hv = (l, d, r) => (l & 3) | ((d & 15) << 2) | ((r & 7) << 6);
    v.homes = { 0: hv(3, 15, 1), 1: hv(3, 0, 2), 2: hv(2, 1, 0), 3: hv(1, 6, 3), 4: hv(0, 0, 0), 5: hv(3, 4, 5) };
    v.house = 3; v.digital.introSeen = true;
    v.tower = { ...(v.tower ?? {}), dojoLevel: 3 };
    v.player = { x: s.x, y: s.y, dir: 'down' };
    localStorage.setItem(k, JSON.stringify(v));
  }, spot);
  await page.goto(`${base}?r=4#/vila`);
  await page.waitForTimeout(5000);
  for (let n = 0; n < 6; n++) { const b = page.getByRole('button', { name: /Continuar|Entendi|Fechar|OK|Agora não/ }).first(); if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); } }
  if (spot.keys) for (const [key, ms] of spot.keys) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(250); }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}-${spot.name}.png` });
  await page.close();
}
await browser.close();
