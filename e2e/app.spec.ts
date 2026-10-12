import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Ponta a ponta com câmera FALSA: vídeo gerado de um escaneamento oficial → detecção → OCR → candidatas do
 * TCGdex → carta exata → dexId → GIF → alvo de AR compilado no navegador → rastreamento → sprite em pé.
 * Depois: cache (lista "Carregar"), sobrevivência a recarregar, e repetição OFFLINE a partir do cache.
 * Cada carta grava um JSON de resultado; o último teste exige que ao menos uma carta feche o fluxo todo.
 */
const base = process.env.BASE_PATH ?? '/pokemon-tcg-ar/';
const origin = 'http://localhost:4173';
const dir = process.env.E2E_DIR ?? 'e2e/.tmp';
const resultsDir = `${dir}/results`;
const cards: string[] = existsSync(`${dir}/cards.json`) ? (JSON.parse(readFileSync(`${dir}/cards.json`, 'utf8')) as string[]) : [];

interface CardResult {
  id: string;
  identified: boolean;
  predictedId?: string;
  recognizeMs?: number;
  hudAfterScan?: string;
  tracking?: boolean;
  trackingMs?: number;
  spriteText?: string;
  cacheListed?: boolean;
  cacheBadge?: string;
  survivedReload?: boolean;
  offlineRecognized?: boolean;
  offlineSource?: string;
  offlineTracking?: boolean;
  consoleErrors: string[];
}

async function openScan(page: Page): Promise<void> {
  await page.goto(`${origin}${base}`);
  await page.getByRole('button', { name: 'Abrir câmera' }).click();
}

async function waitText(page: Page, selector: string, text: string, timeout: number): Promise<boolean> {
  try {
    await page.locator(selector).filter({ hasText: text }).first().waitFor({ state: 'attached', timeout });
    return true;
  } catch {
    return false;
  }
}

for (const id of cards) {
  test.describe(`carta ${id}`, () => {
    test(`fluxo completo de ${id}`, async () => {
      // O vídeo da câmera falsa é um argumento do navegador, então cada carta abre o seu próprio Chromium.
      const browser = await chromium.launch({
        executablePath: process.env.PW_CHROMIUM_PATH || undefined,
        args: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          `--use-file-for-fake-video-capture=${dir}/${id}.y4m`,
          '--ignore-gpu-blocklist',
          '--enable-unsafe-swiftshader',
          '--use-angle=swiftshader',
        ],
      });
      const context = await browser.newContext({ permissions: ['camera'], viewport: { width: 420, height: 900 }, serviceWorkers: 'allow' });
      const page = await context.newPage();
      const result: CardResult = { id, identified: false, consoleErrors: [] };
      page.on('console', (msg) => {
        if (msg.type() === 'error') result.consoleErrors.push(msg.text().slice(0, 200));
      });
      page.on('pageerror', (error) => result.consoleErrors.push(`pageerror: ${error.message.slice(0, 200)}`));
      mkdirSync(resultsDir, { recursive: true });
      const save = () => writeFileSync(`${resultsDir}/${id}.json`, JSON.stringify(result, null, 2));

      try {
        // 1) Câmera → reconhecimento
        const started = Date.now();
        await openScan(page);
        result.identified = await waitText(page, '.result', 'Reconhecida automaticamente', 150_000);
        result.recognizeMs = Date.now() - started;
        if (!result.identified) {
          result.hudAfterScan = ((await page.locator('.hud').first().textContent().catch(() => '')) ?? '').slice(0, 160);
          return;
        }
        result.predictedId = (await page.locator('.result code').first().textContent()) ?? undefined;

        // 2) AR: alvo compilado → rastreamento da carta → sprite
        const trackStart = Date.now();
        result.tracking = await waitText(page, '.hud', 'Carta rastreada', 90_000);
        result.trackingMs = Date.now() - trackStart;
        result.spriteText = ((await page.locator('.result .message').first().textContent().catch(() => '')) ?? '').slice(0, 160);
        await page.screenshot({ path: `${dir}/${id}-ar.png` });

        // 3) Cache: aparece em "Carregar" e sobrevive a recarregar a página
        await page.evaluate(() => (window.location.hash = '#/carregar'));
        result.cacheListed = await waitText(page, '.card-row', result.predictedId ? '/' : '', 20_000);
        result.cacheBadge = ((await page.locator('.card-row .badge').first().textContent().catch(() => '')) ?? '').trim();
        await page.reload();
        await page.evaluate(() => (window.location.hash = '#/carregar'));
        result.survivedReload = await waitText(page, '.card-row', '/', 20_000);
        await page.screenshot({ path: `${dir}/${id}-carregar.png`, fullPage: true });

        // 4) Offline: reconhece a mesma carta só com o que está guardado
        await context.setOffline(true);
        await page.reload();
        await page.evaluate(() => (window.location.hash = '#/'));
        await page.getByRole('button', { name: 'Abrir câmera' }).click();
        result.offlineRecognized = await waitText(page, '.result', 'Reconhecida automaticamente', 150_000);
        if (result.offlineRecognized) {
          result.offlineTracking = await waitText(page, '.hud', 'Carta rastreada', 90_000);
          await page.evaluate(() => (window.location.hash = '#/diagnostico'));
          const source = await page.locator('li', { hasText: 'Candidatas · origem' }).first().textContent().catch(() => '');
          result.offlineSource = (source ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
        }
        await context.setOffline(false);
      } finally {
        save();
        await browser.close();
      }
    });
  });
}

test('resumo: ao menos uma carta fecha o fluxo todo e nada é reconhecido de errado', async () => {
  const files = existsSync(resultsDir) ? readdirSync(resultsDir).filter((f) => f.endsWith('.json')) : [];
  expect(files.length).toBeGreaterThan(0);
  const results = files.map((f) => JSON.parse(readFileSync(`${resultsDir}/${f}`, 'utf8')) as CardResult);
  writeFileSync(`${dir}/e2e-summary.json`, JSON.stringify(results, null, 2));
  for (const r of results) if (r.identified) expect(r.predictedId, `carta reconhecida errada: ${r.id}`).toBe(r.id);
  expect(results.some((r) => r.identified && r.tracking && r.cacheListed && r.survivedReload)).toBe(true);
});
