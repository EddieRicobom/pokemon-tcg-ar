/** Validação de UI com save isolado de teste. Não reconhece carta nem simula AR.
 * APP_URL=http://127.0.0.1:4192/pokemon-tcg-ar/ BROWSER_PATH=<opcional> node e2e/village-legends.mjs
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-21T15:00:00Z') });
  await page.addInitScript(() => {
    if (!localStorage.getItem('tcg-ar-vila-v1')) localStorage.setItem('tcg-ar-vila-v1', JSON.stringify({ v: 1, seed: 20261014,
      digital: { introSeen: true, tutorialSeen: true, starterGiven: true }, recap: { day: '2026-10-21', at: Date.now() }, lastSeen: Date.now(),
      legendary: { history: [], attempts: 1, lastRollDay: '2026-10-21', active: null } }));
    localStorage.setItem('tcg-ar-vila-controls-hint-hidden-v1', 'true');
  });
  const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('tcg-ar-vila-v1')));
  await page.goto(`${process.env.APP_URL ?? 'http://127.0.0.1:4192/pokemon-tcg-ar/'}#/vila`);
  await page.locator('.menu-control-btn').click();
  await page.getByRole('tab', { name: /Histórias/ }).click();
  await page.getByRole('button', { name: /Caderno de Lendas/ }).click();
  assert.equal(await page.locator('.legend-cards article').count(), 94);
  await page.getByRole('button', { name: 'Investigar Articuno', exact: true }).click();
  await page.clock.runFor(6000);
  await page.getByRole('button', { name: 'Investigar pista', exact: true }).click();
  assert.equal((await save()).legendary.investigation.step, 1);
  await page.reload(); // A pista persiste; voltar não cria outra oportunidade de visita aleatória.
  await page.getByRole('button', { name: 'Seguir pista', exact: true }).click();
  await page.clock.runFor(20000);
  await page.getByRole('button', { name: 'Investigar pista', exact: true }).click();
  await page.waitForSelector('.legend-cutscene');
  const beforeReplay = await save();
  assert.equal(beforeReplay.legendary.history.length, 1);
  assert.equal(beforeReplay.legendary.active.id, 'articuno');
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.clock.runFor(1800); // Inclui a entrada animada no enquadramento da captura.
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/legend-articuno-portrait.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const next = page.getByRole('button', { name: 'Voltar à Vila', exact: true });
  const box = await next.boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height <= 390, 'A ação final deve caber em paisagem');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/legend-articuno-landscape.png` });
  await next.click();
  await page.locator('.menu-control-btn').click();
  await page.getByRole('tab', { name: /Histórias/ }).click();
  await page.getByRole('button', { name: /Caderno de Lendas/ }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Rever Articuno', exact: true }).click();
  await page.waitForSelector('.legend-cutscene.still');
  assert.equal(await page.locator('.legend-cutscene').evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length), 0);
  await page.keyboard.press('Escape');
  const afterReplay = await save();
  assert.equal(afterReplay.legendary.active, null);
  assert.deepEqual(afterReplay.legendary.history, beforeReplay.legendary.history);
  assert.deepEqual(afterReplay.legendary.seen, beforeReplay.legendary.seen);
  assert.equal(afterReplay.coins, beforeReplay.coins);
  assert.deepEqual(errors, []);
  console.log('ok: 94 lendas; duas pistas percorridas; retomada; cena; paisagem; movimento reduzido; replay sem novo efeito; nenhum erro de página');
} finally { await browser.close(); }
