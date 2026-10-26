/** Verifica que a Torre não escolhe um Pokémon oculto quando a coleção está vazia. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem('tcg-ar-onboarding-v1', '1');
    localStorage.setItem('tcg-ar-perfil-v1', JSON.stringify({ name: 'Teste', sprite: 'red' }));
    localStorage.setItem('tcg-ar-trainer-v1', JSON.stringify({ v: 1, xp: 1_000_000 }));
    localStorage.setItem('tcg-ar-vila-controls-hint-hidden-v1', 'true');
    localStorage.setItem('tcg-ar-vila-v1', JSON.stringify({ v: 1, layout: 2, seed: 20261014,
      house: 1, player: { x: 32, y: 34, dir: 'up' }, coins: 0,
      digital: { introSeen: true, tutorialSeen: true, starterGiven: true, instances: [] },
      recap: { day: '2026-10-26', at: Date.now() }, lastSeen: Date.now() }));
  });
  await page.goto(process.env.APP_URL ?? 'http://127.0.0.1:4175/pokemon-tcg-ar/#/vila', { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForSelector('.village-pad');
  await page.getByRole('button', { name: /Abrir o menu da Vila/ }).click();
  await page.getByRole('button', { name: /Survival/ }).click();
  const empty = page.getByRole('dialog', { name: 'Você precisa de um companheiro', exact: true });
  await empty.waitFor();
  assert.match(await empty.innerText(), /Escaneie uma carta ou conclua o questionário inicial da Vila/);
  assert.doesNotMatch(await empty.innerText(), /Pikachu/);
  await empty.getByRole('button', { name: 'Voltar à Vila' }).click();
  await empty.waitFor({ state: 'detached' });
  console.log('ok: Torre explica a ausência de companheiro e volta à Vila');
} finally { await browser.close(); }
