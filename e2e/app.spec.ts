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
const references: Record<string, string> = existsSync(`${dir}/references.json`)
  ? (JSON.parse(readFileSync(`${dir}/references.json`, 'utf8')) as Record<string, string>)
  : {};
const RECOGNITION_TIMEOUT = 60_000;
const TRACKING_TIMEOUT = 45_000;
const CACHE_TIMEOUT = 15_000;

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

// Com a câmera ligada o resultado e o estado do AR aparecem como avisos sobre a imagem (`.stage-head .pill`).
const PILLS = '.stage-head .pill';
const RECOGNIZED = 'reconhecida automaticamente';
const TRACKING = 'Carta rastreada';

/** Abre «Cartas» em modo Lista (a Box é o padrão e não mostra o estado de cada carta). */
async function openCardList(page: Page): Promise<void> {
  await page.evaluate(() => (window.location.hash = '#/cartas'));
  await page.getByRole('button', { name: 'Lista', exact: true }).click({ timeout: 15_000 }).catch(() => undefined);
}

/** Ids das cartas guardadas no IndexedDB do app (a fonte da verdade do que foi reconhecido). */
async function storedCardIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('pokemon-tcg-ar');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('cards')) return resolve([]);
          const all = db.transaction('cards').objectStore('cards').getAll();
          all.onsuccess = () => resolve((all.result as { id: string; pending?: boolean }[]).filter((c) => !c.pending).map((c) => c.id));
          all.onerror = () => resolve([]);
        };
      }),
  );
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
      // A tela de boas-vindas da primeira abertura cobre o botão da câmera; o teste parte de um perfil que já a viu.
      await context.addInitScript(() => {
        try { localStorage.setItem('tcg-ar-onboarding-v1', '1'); } catch { /* sem armazenamento */ }
      });
      // A referência da carta do cenário vem dos bytes oficiais baixados no preparo (sem depender do CORS duplicado do CDN).
      // As referências das outras candidatas vêm do CDN de verdade, só com o cabeçalho de CORS corrigido: se elas falhassem,
      // as concorrentes ficariam sem comparação e o app (corretamente) pediria ao usuário para escolher a impressão.
      // Nunca injetamos um resultado de reconhecimento.
      await context.route('https://assets.tcgdex.net/**', async (route) => {
        const fixture = references[route.request().url()];
        if (!fixture) {
          try {
            const response = await route.fetch();
            return await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
          } catch {
            return route.abort();
          }
        }
        return route.fulfill({
          status: 200,
          contentType: 'image/webp',
          headers: { 'access-control-allow-origin': '*' },
          body: readFileSync(`${dir}/${fixture}`),
        });
      });
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
        result.identified = await waitText(page, PILLS, RECOGNIZED, RECOGNITION_TIMEOUT);
        result.recognizeMs = Date.now() - started;
        if (!result.identified) {
          result.hudAfterScan = ((await page.locator('.stage-head').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 160);
          return;
        }

        // 2) AR: alvo compilado → rastreamento da carta → sprite
        const trackStart = Date.now();
        result.tracking = await waitText(page, PILLS, TRACKING, TRACKING_TIMEOUT);
        result.trackingMs = Date.now() - trackStart;
        result.spriteText = ((await page.locator('.stage-head').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 160);
        // A carta só deixa de ser «pendente» quando referência, sprite e alvo terminam: espera até aparecer no armazenamento.
        const deadline = Date.now() + CACHE_TIMEOUT;
        let ids = await storedCardIds(page);
        while (ids.length === 0 && Date.now() < deadline) {
          await page.waitForTimeout(500);
          ids = await storedCardIds(page);
        }
        result.predictedId = ids.length === 1 ? ids[0] : ids.join(',') || undefined;
        await page.screenshot({ path: `${dir}/${id}-ar.png` });

        // 3) Cache: aparece em "Carregar" e sobrevive a recarregar a página
        await openCardList(page);
        result.cacheListed = await waitText(page, '.card-row', result.predictedId ? '/' : '', CACHE_TIMEOUT);
        result.cacheBadge = ((await page.locator('.card-row .badge').first().textContent().catch(() => '')) ?? '').trim();
        await page.reload();
        await openCardList(page);
        result.survivedReload = await waitText(page, '.card-row', '/', CACHE_TIMEOUT);
        await page.screenshot({ path: `${dir}/${id}-carregar.png`, fullPage: true });

        // 4) Offline: reconhece a mesma carta só com o que está guardado
        // Os módulos das telas só entram no cache quando são visitados: abre o Diagnóstico agora, com rede, para ele funcionar offline.
        await page.evaluate(() => (window.location.hash = '#/diagnostico'));
        await page.getByText('Diagnóstico', { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
        await context.setOffline(true);
        await page.reload();
        await page.evaluate(() => (window.location.hash = '#/'));
        await page.getByRole('button', { name: 'Abrir câmera' }).click();
        result.offlineRecognized = await waitText(page, PILLS, RECOGNIZED, RECOGNITION_TIMEOUT);
        if (result.offlineRecognized) {
          result.offlineTracking = await waitText(page, PILLS, TRACKING, TRACKING_TIMEOUT);
          await page.evaluate(() => (window.location.hash = '#/diagnostico'));
          const source = await page.locator('li', { hasText: 'Candidatas · origem' }).first().textContent({ timeout: 10_000 }).catch(() => '');
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
