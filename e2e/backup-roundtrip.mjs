/** Backup real no navegador, com perfil descartável e dados de diagnóstico. Exige Vite dev server. */
import { chromium, expect } from '@playwright/test';
import { unzipSync } from 'fflate';
const base = process.env.BACKUP_TEST_URL ?? 'http://127.0.0.1:4192/pokemon-tcg-ar/';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(20_000);
      console.log('Iniciando', viewport);
      page.on('pageerror', (error) => console.error('Erro na página:', error.message));
      await page.route('**/*', (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
      await page.goto(`${base}#/treinador`);
      await page.getByRole('button', { name: 'Dados', exact: true }).waitFor();
      console.log('App pronto');
      const expected = await page.evaluate(async (baseUrl) => {
        const { openCacheDb } = await import(new URL('src/cache/db.ts', baseUrl).href);
        const { ASSET_CACHE_NAME } = await import(new URL('src/cache/types.ts', baseUrl).href);
        const { loadVillage, saveVillage } = await import(new URL('src/app/village-store.ts', baseUrl).href);
        const state = loadVillage(); state.coins = 12345; state.farm.seeds['sem-tomate'] = 7; saveVillage(state);
        localStorage.setItem('tcg-ar-backup-validation-v1', 'diagnóstico isolado');
        const url = new URL('diagnostic-reference.bin', baseUrl).href;
        const bytes = Uint8Array.from({ length: 1024 * 1024 }, (_, i) => i % 251);
        const db = await openCacheDb();
        await db.put('cards', { id: 'diagnostic-backup-1', schema: 1, name: 'Diagnóstico de backup', setId: 'diagnostic', setName: 'Diagnóstico', localId: '1', setOfficial: 1, setTotal: 1, dexIds: [1], reference: { state: 'ok', key: url }, sprite: { state: 'missing' }, target: { state: 'missing' }, firstSeenAt: 1, lastSeenAt: 1, scanCount: 1 });
        await db.put('assets', { url, kind: 'reference', bytes: bytes.length, refs: ['diagnostic-backup-1'], storedAt: 1 });
        await db.put('meta', { ok: true, tags: ['backup', 'navegador'] }, 'backup-validation'); db.close();
        await (await caches.open(ASSET_CACHE_NAME)).put(url, new Response(bytes));
        return { url, village: localStorage.getItem('tcg-ar-vila-v1') };
      }, base);
      console.log('Fixture pronta');
      await page.getByRole('button', { name: 'Dados', exact: true }).click();
      const downloadPending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Baixar backup', exact: true }).click();
      const download = await downloadPending; console.log('Download iniciado');
      const stream = await download.createReadStream(), parts = [];
      for await (const part of stream) parts.push(part);
      const zip = Buffer.concat(parts), files = unzipSync(zip);
      if (!files['collection/cards.json'] || !files['collection/assets/0.bin']) throw new Error('ZIP sem coleção');
      await page.evaluate(async (baseUrl) => {
        const { openCacheDb } = await import(new URL('src/cache/db.ts', baseUrl).href);
        const { ASSET_CACHE_NAME } = await import(new URL('src/cache/types.ts', baseUrl).href);
        localStorage.clear(); const db = await openCacheDb();
        await db.clear('cards'); await db.clear('assets'); await db.clear('meta'); db.close();
        await caches.delete(ASSET_CACHE_NAME);
      }, base);
      console.log('Dados apagados no perfil descartável');
      await page.locator('input[type=file]').setInputFiles({ name: 'backup-validado.zip', mimeType: 'application/zip', buffer: zip });
      await page.getByRole('button', { name: 'Confirmar e substituir', exact: true }).waitFor();
      expect(await page.evaluate(() => localStorage.getItem('tcg-ar-backup-validation-v1'))).toBeNull();
      console.log('Arquivo validado, confirmando');
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.getByRole('button', { name: 'Confirmar e substituir', exact: true }).click()]);
      try { await page.waitForFunction(() => localStorage.getItem('tcg-ar-backup-validation-v1') === 'diagnóstico isolado', null, { timeout: 8000 }); }
      catch (error) {
        console.error('Estado da interface:', await page.locator('body').innerText());
        throw error;
      }
      await page.getByRole('button', { name: 'Dados', exact: true }).waitFor();
      const result = await page.evaluate(async ({ baseUrl, wanted }) => {
        const { openCacheDb } = await import(new URL('src/cache/db.ts', baseUrl).href);
        const { ASSET_CACHE_NAME } = await import(new URL('src/cache/types.ts', baseUrl).href);
        const db = await openCacheDb(), card = await db.get('cards', 'diagnostic-backup-1'), meta = await db.get('meta', 'backup-validation'); db.close();
        const response = await (await caches.open(ASSET_CACHE_NAME)).match(wanted.url);
        const bytes = new Uint8Array(await response.arrayBuffer());
        return { village: localStorage.getItem('tcg-ar-vila-v1'), card: card.name, meta, bytes: bytes.length, intact: bytes.every((value, i) => value === i % 251) };
      }, { baseUrl: base, wanted: expected });
      expect(result).toEqual({ village: expected.village, card: 'Diagnóstico de backup', meta: { ok: true, tags: ['backup', 'navegador'] }, bytes: 1024 * 1024, intact: true });
      console.log(JSON.stringify({ viewport, zipBytes: zip.length, restored: true, confirmationRequired: true, assetBytes: result.bytes }));
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
