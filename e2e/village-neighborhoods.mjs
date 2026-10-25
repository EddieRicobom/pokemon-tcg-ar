/** Save isolado para validar a Vila normal. Não simula cartas reconhecidas nem AR.
 * APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ BROWSER_PATH=<opcional> node e2e/village-neighborhoods.mjs
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-22T15:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('tcg-ar-onboarding-v1', '1');
    localStorage.setItem('tcg-ar-perfil-v1', JSON.stringify({ name: 'Teste visual', sprite: 'red' }));
    if (!localStorage.getItem('tcg-ar-vila-v1')) localStorage.setItem('tcg-ar-vila-v1', JSON.stringify({ v: 1, layout: 2, seed: 20261014,
      house: 6, player: { x: 32, y: 34, dir: 'up' }, coins: 500,
      homeInterior: { wallpaper: 'floral', floor: 'carvalho', placed: [
        { x: 0, y: 0, item: 'cama-colcha' }, { x: 1, y: 1, item: 'comoda' }, { x: 6, y: 0, item: 'balcao-cozinha' },
        { x: 5, y: 0, item: 'armario-loucas' }, { x: 2, y: 2, item: 'mesa-jantar' }, { x: 4, y: 2, item: 'almofadas' }, { x: 2, y: 0, item: 'estante-plantas' },
      ] },
      digital: { introSeen: true, tutorialSeen: true, starterGiven: true }, recap: { day: '2026-10-22', at: Date.now() }, lastSeen: Date.now(),
      legendary: { history: [], attempts: 1, lastRollDay: '2026-10-22', active: null } }));
    localStorage.setItem('tcg-ar-vila-controls-hint-hidden-v1', 'true');
  });
  const shots = process.env.SCREENSHOT_DIR;
  if (shots) await mkdir(shots, { recursive: true });
  const capture = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
  await page.goto(`${process.env.APP_URL ?? 'http://127.0.0.1:4175/pokemon-tcg-ar/'}#/vila`);
  await page.waitForSelector('.village-pad');
  await page.clock.runFor(2000);
  await capture('village-start');
  await page.keyboard.press('z');
  await capture('village-interact');
  const home = page.getByRole('dialog', { name: 'Sua casa', exact: true });
  await home.waitFor();
  assert.equal(await home.locator('.home-furniture').count(), 7);
  await home.getByRole('button', { name: /Examinar Cama com colcha/ }).click();
  assert.match(await home.locator('.home-inspection').innerText(), /Descanso/);
  await capture('home-portrait');
  await page.setViewportSize({ width: 844, height: 390 });
  const exit = home.getByRole('button', { name: 'Sair da casa e voltar à Vila' });
  await exit.scrollIntoViewIfNeeded();
  const box = await exit.boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height <= 390, 'Porta acessível em paisagem');
  await capture('home-landscape');
  await exit.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir mapa grande', exact: true }).click();
  const guides = page.getByRole('navigation', { name: 'Guia de lugares da Vila' });
  assert.ok(await guides.getByRole('button').count() >= 17);
  assert.match(await guides.innerText(), /Praia das Conchas/);
  await capture('map-guides-portrait');
  await page.setViewportSize({ width: 844, height: 390 });
  await capture('map-guides-landscape');
  await guides.getByRole('button', { name: /Praia das Conchas/ }).click();
  await page.clock.runFor(55000);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('beach-portrait');
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('tcg-ar-vila-v1')));
  assert.ok(Math.abs(save.player.x - 109) + Math.abs(save.player.y - 49) <= 2, `Caminhada até a praia: ${JSON.stringify(save.player)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('ok: interior, exame de móveis, porta em paisagem, guias legíveis, caminhada real até a praia, sem overflow horizontal ou erros de página');
} finally { await browser.close(); }
