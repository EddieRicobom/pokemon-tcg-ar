/** O menu único da Arena: o Coliseu da Vila abre a Arena (ou direto a Liga e o PvP), o Fliperama cai em «Batalha livre»,
 * os endereços antigos (`#/caixa?pvp=1`) levam ao menu, e «Voltar à Vila» funciona. Sem câmera e sem rede: só navegação e telas.
 * APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ BROWSER_PATH=<opcional> SCREENSHOT_DIR=<opcional> node e2e/coliseu-hub.mjs
 * Não abre câmera nem WebGL (só o menu); o palco em si é visto em `e2e/caixa-batalha.mjs`.
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4175/pokemon-tcg-ar/';
const shots = process.env.SCREENSHOT_DIR;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (localStorage.getItem('seeded-hub')) return;
    localStorage.setItem('seeded-hub', '1');
    localStorage.setItem('tcg-ar-onboarding-v1', '1');
    localStorage.setItem('tcg-ar-perfil-v1', JSON.stringify({ name: 'Teste visual', sprite: 'red' }));
    // Nível 10 de Treinador: o Fliperama (nível 2) e o Coliseu (nível 6) estão abertos.
    localStorage.setItem('tcg-ar-trainer-v1', JSON.stringify({ v: 1, xp: 5000 }));
    localStorage.setItem('tcg-ar-vila-v1', JSON.stringify({
      v: 1, layout: 2, seed: 20261014, house: 6, player: { x: 45, y: 41, dir: 'down' }, coins: 500,
      digital: { introSeen: true, tutorialSeen: true, starterGiven: true, ledger: [], instances: [] },
      recap: { day: '2026-10-23', at: Date.now() }, lastSeen: Date.now(),
      legendary: { history: [], attempts: 1, lastRollDay: '2026-10-23', active: null },
    }));
    localStorage.setItem('tcg-ar-vila-controls-hint-hidden-v1', 'true');
  });
  const capture = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
  const hash = () => page.evaluate(() => window.location.hash);
  const dismissNotices = async () => {
    for (const label of [/Entendi/, /Fechar aviso/, /^OK$/]) {
      const button = page.getByRole('button', { name: label });
      if (await button.count()) await button.first().click({ timeout: 2000 }).catch(() => undefined);
    }
  };
  const openPlace = async (place) => {
    await page.getByRole('button', { name: /Abrir o menu da Vila/ }).click();
    // Os lugares da Vila ficam na aba «Lugares» do menu.
    await page.getByText('Lugares', { exact: true }).first().click();
    await page.locator('button.menu-tile').filter({ hasText: place }).first().click();
  };

  // --- 1. Coliseu → menu único da Arena (sem escolha ainda) e de volta à Vila
  await page.goto(`${base}#/vila`);
  await page.waitForSelector('.village-pad');
  await dismissNotices();
  await openPlace('Arena');
  const hub = ['Abrir a Arena', 'Liga e desafios', 'PvP com um amigo'];
  for (const label of hub) await page.getByRole('button', { name: new RegExp(label) }).waitFor({ timeout: 10_000 });
  await capture('coliseu-hub');
  // A barra de baixo não tem aba da Arena; a aba da Vila fica acesa nas lutas.
  assert.deepEqual(await page.locator('nav.tabs a').allInnerTexts(), ['Escanear', 'Vila', 'Cartas', 'Treinador']);
  await page.getByRole('button', { name: /Abrir a Arena/ }).click();
  await page.getByRole('heading', { name: 'Arena', exact: true }).waitFor();
  assert.match(await hash(), /^#\/arena/);
  assert.deepEqual(await page.locator('nav.tabs a.active').allInnerTexts(), ['Vila']);
  assert.equal(await page.locator('nav.modes').count(), 0);
  for (const title of ['Batalha livre', 'Liga e desafios', 'Corridas 6×6', 'PvP com um amigo']) await page.locator('button.arena-choice').filter({ hasText: title }).waitFor();
  assert.equal(await page.locator('button.arena-choice.on').count(), 0, 'sem pista no endereço, a pessoa escolhe');
  assert.equal(await page.locator('button.arena-go').isDisabled(), true, 'o botão principal só liga depois das escolhas');
  assert.match(await page.locator('.arena-guide').innerText(), /Escolha o que quer fazer/);
  await capture('hub-arena');
  await page.getByRole('link', { name: 'Voltar à Vila' }).click();
  await page.waitForSelector('.village-pad');
  assert.equal(await hash(), '#/vila');

  // --- 2. Coliseu → Liga e desafios (menu já na Liga) e o ✕ da Vila
  await dismissNotices();
  await openPlace('Arena');
  await page.getByRole('button', { name: /Liga e desafios/ }).click();
  await page.waitForFunction(() => document.querySelector('button.arena-choice.on')?.textContent?.includes('Liga e desafios'));
  await page.getByRole('link', { name: 'Voltar à Vila' }).waitFor();
  await page.getByRole('link', { name: 'Voltar à Vila' }).click();
  await page.waitForSelector('.village-pad');
  // O ✕ da Vila volta de onde a pessoa veio (aqui, o Escanear), não para o menu que a própria Vila abriu.
  await dismissNotices();
  await page.getByRole('button', { name: 'Sair da Vila' }).click();
  await page.getByText('Escanear carta').first().waitFor();
  assert.equal(await hash(), '#/');
  await page.goto(`${base}#/vila`);
  await page.waitForSelector('.village-pad');
  await capture('vila-com-coliseu');

  // --- 3. Fliperama → menu da Arena já em «Batalha livre», com as moedas do dia
  await dismissNotices();
  await openPlace('Fliperama');
  await page.getByRole('button', { name: /Batalha na Arena/ }).click();
  await page.getByRole('heading', { name: 'Arena', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('button.arena-choice.on')?.textContent?.includes('Batalha livre'));
  assert.match(await page.locator('.arena-view').innerText(), /Fliperama/);
  await capture('hub-fliperama-arena');

  // --- 4. Os endereços antigos continuam valendo: o PvP da Caixa leva ao menu, e o palco abre pelo endereço do palco
  await page.goto(`${base}#/caixa?pvp=1&virtual=1`);
  await page.waitForFunction(() => document.querySelector('button.arena-choice.on')?.textContent?.includes('PvP com um amigo'));
  await page.getByText('Conecte com o amigo').first().waitFor();
  await capture('arena-pvp');
  await page.goto(`${base}#/arena?restauracao=1`);
  await page.waitForFunction(() => document.querySelector('button.arena-mode.on')?.textContent?.includes('Restauração digital'));
  await capture('arena-corridas');

  assert.deepEqual(errors, [], `erros na página: ${errors.join(' | ')}`);
  console.log('ok: menu único da Arena (Coliseu, Liga, Fliperama, PvP e corridas caem na opção certa) e volta à Vila');
} finally {
  await browser.close();
}
