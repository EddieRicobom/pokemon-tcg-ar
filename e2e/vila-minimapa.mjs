/** O minimapa da Vila fica atrás do menu e das folhas: o ponto do minimapa sob o menu é do próprio menu.
 * APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ BROWSER_PATH=<opcional> node e2e/vila-minimapa.mjs
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4175/pokemon-tcg-ar/';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('tcg-ar-onboarding-v1', '1');
    localStorage.setItem('tcg-ar-perfil-v1', JSON.stringify({ name: 'Teste visual', sprite: 'red' }));
    localStorage.setItem('tcg-ar-vila-controls-hint-hidden-v1', 'true');
    localStorage.setItem('tcg-ar-vila-v1', JSON.stringify({
      v: 1, layout: 2, seed: 20261014, house: 6, player: { x: 45, y: 41, dir: 'down' }, coins: 500,
      digital: { introSeen: true, tutorialSeen: true, starterGiven: true, ledger: [], instances: [] },
      recap: { day: '2026-10-23', at: Date.now() }, lastSeen: Date.now(),
      legendary: { history: [], attempts: 1, lastRollDay: '2026-10-23', active: null },
    }));
  });
  await page.goto(`${base}#/vila`);
  await page.waitForSelector('.village-minimap');
  // Conta os pontos da área comum entre o minimapa e o menu em que o que está por cima é o minimapa (e não o menu).
  const hiddenBehindMinimap = () => page.evaluate(() => {
    const mini = document.querySelector('.village-minimap');
    const sheet = document.querySelector('.village-menu');
    if (!mini || !sheet) return { area: 0, minimapOnTop: 0 };
    const a = mini.getBoundingClientRect();
    const b = sheet.getBoundingClientRect();
    const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom);
    let area = 0, minimapOnTop = 0;
    for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
      const x = left + ((right - left) * i) / 10, y = top + ((bottom - top) * j) / 10;
      if (right <= left || bottom <= top) break;
      area++;
      if (mini.contains(document.elementFromPoint(x, y))) minimapOnTop++;
    }
    return { area, minimapOnTop };
  });

  for (const [name, size] of [['celular', { width: 390, height: 844 }], ['paisagem', { width: 844, height: 390 }]]) {
    await page.setViewportSize(size);
    // Dicas de primeira vez ("Entendi") escondem o botão do menu: fecha antes de abrir.
    await page.getByRole('button', { name: 'Entendi' }).click({ timeout: 1000 }).catch(() => undefined);
    await page.getByRole('button', { name: /Abrir o menu da Vila|^Abrir menu$/ }).first().click();
    await page.locator('.village-menu').waitFor();
    const normal = await hiddenBehindMinimap();
    assert.equal(normal.minimapOnTop, 0, `${name}: o minimapa cobre o menu`);
    await page.getByRole('button', { name: 'Fechar o menu' }).click();
    await page.locator('.village-menu').waitFor({ state: 'detached' });
    console.log(`ok (${name}): área comum ${normal.area}, minimapa por cima ${normal.minimapOnTop}`);
  }
  assert.deepEqual(errors, [], `erros na página: ${errors.join(' | ')}`);
} finally {
  await browser.close();
}
