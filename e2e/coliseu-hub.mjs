/** O hub do Coliseu na Vila: o diálogo da Arena oferece Arena 3D e Caixa em AR, o Fliperama oferece a batalha na Arena 3D,
 * a Arena Digital leva o fundo escolhido, e a Caixa volta para a Vila. Sem câmera e sem rede: só navegação e telas.
 * APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ BROWSER_PATH=<opcional> SCREENSHOT_DIR=<opcional> node e2e/coliseu-hub.mjs
 * Não abre câmera nem WebGL (a Caixa só mostra a tela inicial); o palco em si é visto em `e2e/caixa-batalha.mjs`.
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

  // --- 1. Coliseu → Arena 3D (sem câmera) e de volta à Vila
  await page.goto(`${base}#/vila`);
  await page.waitForSelector('.village-pad');
  await dismissNotices();
  await openPlace('Arena');
  const hub = ['Arena 3D (sem câmera)', 'Caixa em AR (câmera)', 'Liga e corridas 6×6', 'Batalhar com um amigo (PvP)'];
  for (const label of hub) await page.getByRole('button', { name: new RegExp(label.replace(/[()]/g, '\\$&')) }).waitFor({ timeout: 10_000 });
  await capture('coliseu-hub');
  await page.getByRole('button', { name: /Arena 3D \(sem câmera\)/ }).click();
  await page.getByRole('heading', { name: 'Arena 3D' }).waitFor();
  assert.match(await hash(), /^#\/caixa/);
  await page.getByRole('button', { name: /Entrar na Arena 3D/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: '🏟️ Arena virtual' }).getAttribute('aria-pressed'), 'true');
  await capture('hub-arena3d');
  await page.getByRole('link', { name: 'Voltar à Vila' }).click();
  await page.waitForSelector('.village-pad');
  assert.equal(await hash(), '#/vila');

  // --- 2. Coliseu → Caixa em AR (câmera), também com «Voltar à Vila»
  await dismissNotices();
  await openPlace('Arena');
  await page.getByRole('button', { name: /Caixa em AR \(câmera\)/ }).click();
  await page.getByRole('heading', { name: 'Caixa em AR' }).waitFor();
  await page.getByRole('button', { name: /Abrir câmera e sensores/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: '📷 Câmera (AR)' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('link', { name: 'Voltar à Vila' }).waitFor();
  await page.getByRole('link', { name: 'Voltar à Vila' }).click();
  await page.waitForSelector('.village-pad');

  // --- 3. Fliperama → batalha na Arena 3D (com a batalha em destaque)
  await dismissNotices();
  await openPlace('Fliperama');
  await page.getByRole('button', { name: /Batalha na câmera/ }).waitFor();
  await page.getByRole('button', { name: /Batalha na Arena 3D/ }).click();
  await page.getByRole('heading', { name: 'Arena 3D' }).waitFor();
  await page.getByRole('button', { name: /Entrar na arena e batalhar/ }).waitFor();
  await capture('hub-fliperama-arena3d');

  // --- 4. Arena Digital: o padrão é a Arena 3D e o fundo acompanha o link
  await page.goto(`${base}#/arena`);
  await page.getByRole('heading', { name: 'Arena Digital' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Arena 3D \(sem câmera\)/ }).getAttribute('aria-pressed'), 'true');
  assert.match((await page.getByRole('link', { name: 'Abrir a Arena 3D' }).getAttribute('href')) ?? '', /virtual=1/);
  await page.getByRole('button', { name: /Caixa em AR \(câmera\)/ }).click();
  const camera = (await page.getByRole('link', { name: 'Abrir Caixa AR' }).getAttribute('href')) ?? '';
  assert.doesNotMatch(camera, /virtual/);
  assert.match(camera, /#\/caixa$/);
  await capture('arena-digital');

  assert.deepEqual(errors, [], `erros na página: ${errors.join(' | ')}`);
  console.log('ok: hub do Coliseu (Arena 3D e Caixa em AR), Fliperama na Arena 3D, Arena Digital com o fundo e volta à Vila');
} finally {
  await browser.close();
}
