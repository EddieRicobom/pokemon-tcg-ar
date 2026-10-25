/** Verificação isolada de foco e fechamento; não usa dados do perfil do usuário. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.install({ time: new Date('2026-10-22T15:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('tcg-ar-onboarding-v1', '1');
    localStorage.setItem('tcg-ar-perfil-v1', JSON.stringify({ name: 'Teste', sprite: 'red' }));
    localStorage.setItem('tcg-ar-vila-controls-hint-hidden-v1', 'true');
    localStorage.setItem('tcg-ar-vila-v1', JSON.stringify({ v: 1, layout: 2, seed: 20261014,
      house: 6, player: { x: 32, y: 34, dir: 'up' }, coins: 500,
      digital: { introSeen: true, tutorialSeen: true, starterGiven: true },
      recap: { day: '2026-10-22', at: Date.now() }, lastSeen: Date.now(),
      legendary: { history: [], attempts: 1, lastRollDay: '2026-10-22', active: null } }));
  });
  await page.goto(process.env.APP_URL ?? 'http://127.0.0.1:4175/pokemon-tcg-ar/#/vila', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.village-pad');
  await page.clock.runFor(2000);
  await page.keyboard.press('z');
  const home = page.getByRole('dialog', { name: 'Sua casa', exact: true });
  await home.waitFor();
  assert.equal(await home.getAttribute('aria-modal'), 'true');
  const close = home.getByRole('button', { name: 'Sair Sua casa' });
  await close.focus();
  await page.keyboard.press('Tab');
  assert.equal(await home.evaluate((el) => el.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await home.waitFor({ state: 'detached' });
  const menuButton = page.getByRole('button', { name: /Abrir o menu da Vila/ });
  await menuButton.click();
  const menu = page.locator('.village-menu');
  await menu.waitFor();
  assert.equal(await menu.getAttribute('aria-modal'), 'true');
  await page.clock.runFor(100);
  await page.waitForFunction(() => document.querySelector('.village-menu')?.contains(document.activeElement));
  await menu.getByRole('button', { name: /Mochila/ }).first().click();
  await page.clock.runFor(100);
  assert.match(await menu.locator('#village-menu-title').innerText(), /Mochila/);
  await page.keyboard.press('Escape');
  assert.match(await menu.locator('#village-menu-title').innerText(), /Menu da Vila/);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  assert.equal(await menuButton.evaluate((el) => el === document.activeElement), true);
  console.log('ok: casa e menu abrem, Tab permanece no painel, Esc volta da seção e fecha, foco retorna ao menu');
} finally { await browser.close(); }
