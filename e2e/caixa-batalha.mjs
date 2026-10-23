/** Fumaça da Caixa com câmera FALSA: abre a câmera, coloca a caixa, batalha e para, sem erros de página.
 * Três cenários: a batalha comum (3 moradores), a corrida 6×6 da Arena (6 moradores, `#/caixa?formatacao=1`) e a Arena 3D
 * (palco virtual, `#/caixa?virtual=1`: sem câmera, sem sensores, a arena já nasce de frente).
 * Não simula cartas reconhecidas nem AR de verdade: os moradores são Digital Pokémon num save de teste, com sprites
 * do pacote local. Os dados de batalha vêm da rede (sem rede, o app usa valores neutros e avisa).
 * APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ BROWSER_PATH=<opcional> SCREENSHOT_DIR=<opcional> node e2e/caixa-batalha.mjs
 * Câmera, sensores e GPU reais só se validam em aparelho (o GL aqui é por software).
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4175/pokemon-tcg-ar/';
const shots = process.env.SCREENSHOT_DIR;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

/** Uma página nova, com `count` Digital Pokémon no save e o celular "parado, apontado para o chão". */
async function openPage(count) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource|net::ERR/.test(message.text())) errors.push(message.text()); });
  await page.addInitScript((n) => {
    localStorage.setItem('tcg-ar-onboarding-v1', '1');
    localStorage.setItem('tcg-ar-perfil-v1', JSON.stringify({ name: 'Teste visual', sprite: 'red' }));
    const grantedAt = '2026-10-01T10:00:00.000Z';
    const mon = (i, dexId, name, originCardId) => ({ instanceId: `digital:${i}`, originCardId, dexId, name, isDigitalPokemon: true, source: 'presente', grantedAt, stage: 0 });
    const all = [mon(1, 1, 'Bulbasaur', 'base1-44'), mon(2, 4, 'Charmander', 'base1-46'), mon(3, 7, 'Squirtle', 'base1-63'), mon(4, 25, 'Pikachu', 'base1-58'), mon(5, 39, 'Jigglypuff', 'base1-54'), mon(6, 52, 'Meowth', 'base1-56')];
    localStorage.setItem('tcg-ar-vila-v1', JSON.stringify({
      v: 1, layout: 2, seed: 20261014, house: 6, player: { x: 45, y: 41, dir: 'down' }, coins: 500,
      digital: { introSeen: true, tutorialSeen: true, starterGiven: true, ledger: [], instances: all.slice(0, n) },
      recap: { day: '2026-10-23', at: Date.now() }, lastSeen: Date.now(),
      legendary: { history: [], attempts: 1, lastRollDay: '2026-10-23', active: null },
    }));
    // Conta os pedidos de câmera: a Arena 3D (palco virtual) não pode pedir nenhum.
    const gum = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (gum) navigator.mediaDevices.getUserMedia = (...args) => { window.__gum = (window.__gum ?? 0) + 1; return gum(...args); };
    // Sem eventos de sensor o app cai no modo manual depois de 1,5 s.
    setInterval(() => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 25, gamma: 0 })), 16);
  }, count);
  return { page, errors, capture: async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); } };
}

const bar = (page) => page.getByRole('toolbar', { name: 'Controles da Caixa AR' });
const openAndPlace = async (page) => {
  await page.getByRole('button', { name: /Abrir câmera/ }).click();
  await page.getByRole('button', { name: 'Colocar a caixa aqui' }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Colocar a caixa aqui' }).click();
};
/** O botão principal da barra só habilita com os Pokémon já carregados na caixa. */
const waitEnabled = (page, label) => page.waitForFunction((text) => [...document.querySelectorAll('.stage-bar button')].some((b) => new RegExp(text).test(b.textContent ?? '') && !b.disabled), label, { timeout: 60_000 });

try {
  {
    const { page, errors, capture } = await openPage(3);
    await page.goto(`${base}#/caixa`);
    await openAndPlace(page);
    await waitEnabled(page, 'Batalhar');
    await capture('caixa-montada');
    await bar(page).getByRole('button', { name: 'Batalhar' }).click();
    await page.locator('.battle-hud').waitFor({ timeout: 60_000 });
    await capture('batalha-em-cena');
    // A luta termina sozinha (batalha de exibição); espera o botão "De novo" e confere o resumo.
    await page.getByRole('button', { name: 'De novo' }).waitFor({ timeout: 180_000 });
    await capture('batalha-fim');
    await page.getByRole('button', { name: 'Resumo' }).click();
    await page.getByRole('dialog', { name: 'Resumo da batalha' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Parar' }).click();
    await page.locator('.battle-hud').waitFor({ state: 'detached', timeout: 10_000 });
    await page.getByRole('button', { name: 'Fechar' }).click();
    await page.getByRole('button', { name: /Abrir câmera e sensores/ }).waitFor();
    assert.deepEqual(errors, [], `erros na página (batalha comum): ${errors.join(' | ')}`);
    console.log('ok: batalha comum (câmera, caixa, luta completa, resumo, parar e fechar) sem erros');
  }
  {
    const { page, errors, capture } = await openPage(6);
    await page.goto(`${base}#/caixa?formatacao=1`);
    await openAndPlace(page);
    await waitEnabled(page, 'Começar');
    await bar(page).getByRole('button', { name: /Começar/ }).click();
    await page.locator('.battle-hud').waitFor({ timeout: 90_000 });
    await capture('arena-6x6-em-cena');
    await bar(page).getByRole('button', { name: /Desistir/ }).click();
    await page.locator('.battle-hud').waitFor({ state: 'detached', timeout: 10_000 });
    await page.getByRole('button', { name: 'Fechar' }).click();
    assert.deepEqual(errors, [], `erros na página (corrida 6×6): ${errors.join(' | ')}`);
    console.log('ok: corrida 6×6 da Arena (começar, em cena, desistir) sem erros');
  }
  {
    const { page, errors, capture } = await openPage(3);
    await page.goto(`${base}#/caixa?virtual=1`);
    await page.getByRole('heading', { name: 'Arena 3D' }).waitFor();
    await capture('arena3d-ociosa');
    await page.getByRole('button', { name: /Entrar na Arena 3D/ }).click();
    await waitEnabled(page, 'Batalhar');
    assert.equal(await page.getByRole('button', { name: 'Colocar a caixa aqui' }).count(), 0, 'a Arena 3D não pede para colocar a caixa');
    assert.equal(await bar(page).getByRole('button', { name: 'Mover' }).count(), 0, 'sem "Mover" no palco virtual');
    await page.waitForTimeout(1500);
    await capture('arena3d-montada');
    // Sem sensores: arrastar na imagem gira a visão (para os lados e para cima), e a arena continua no lugar.
    const stage = await page.locator('.box-viewport canvas').boundingBox();
    await page.mouse.move(stage.x + 200, stage.y + 300);
    await page.mouse.down();
    await page.mouse.move(stage.x + 60, stage.y + 360, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await capture('arena3d-girada');
    await bar(page).getByRole('button', { name: 'Batalhar' }).click();
    await page.locator('.battle-hud').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    await capture('arena3d-batalha');
    await page.getByRole('button', { name: 'De novo' }).waitFor({ timeout: 180_000 });
    await capture('arena3d-fim');
    await bar(page).getByRole('button', { name: 'Parar' }).click();
    await page.locator('.battle-hud').waitFor({ state: 'detached', timeout: 10_000 });
    await page.getByRole('button', { name: 'Fechar' }).click();
    await page.getByRole('button', { name: /Entrar na Arena 3D/ }).waitFor();
    assert.equal(await page.evaluate(() => window.__gum ?? 0), 0, 'a Arena 3D não pode pedir a câmera');
    // O interruptor volta para a câmera (AR) sem recarregar.
    await page.getByRole('button', { name: /Câmera \(AR\)/ }).click();
    await page.getByRole('button', { name: /Abrir câmera e sensores/ }).waitFor();
    assert.deepEqual(errors, [], `erros na página (Arena 3D): ${errors.join(' | ')}`);
    console.log('ok: Arena 3D (sem câmera, sem pedir a câmera, batalha completa, parar, fechar e interruptor de AR) sem erros');
  }
} finally {
  await browser.close();
}
