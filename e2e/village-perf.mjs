/**
 * Mede a Vila com N moradores sintéticos no Chromium: tempo de `update` e `draw` por quadro (VillageGame real) e um
 * perfil de CPU do Chromium. Não mede câmera nem celular.
 *
 *   node e2e/village-perf.mjs [moradores=30] [segundos=12]
 *
 * Sobe o Vite (`e2e/village-perf/index.html`) na porta 4190 e usa o Chromium do Playwright.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const N = process.argv[2] ?? '30';
const SECONDS = Number(process.argv[3] ?? 12);
/** Lentidão simulada da CPU (1 = este PC; ~4–6 aproxima um celular de faixa média). */
const THROTTLE = Number(process.env.PERF_THROTTLE ?? 1);
const HD2D = process.env.PERF_HD2D === '1';
const PORT = 4190;
// PERF_BASE aponta para um Vite já rodando (ex.: http://127.0.0.1:4192); sem ele o script sobe o próprio.
const base = process.env.PERF_BASE ?? `http://127.0.0.1:${PORT}`;
const vite = process.env.PERF_BASE ? null : spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { shell: true, stdio: 'ignore' });
try {
  for (let tries = 0; ; tries++) {
    if (tries > 120) throw new Error('Vite não subiu');
    try {
      const response = await fetch(`${base}/pokemon-tcg-ar/e2e/village-perf/index.html`);
      if (response.ok) break;
    } catch { /* ainda subindo */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(`${base}/pokemon-tcg-ar/e2e/village-perf/index.html?n=${N}&reactive=${process.env.PERF_REACTIVE ?? 1}&hd2d=${HD2D ? 1 : 0}`);
  try {
    await page.waitForFunction(() => window.villagePerf !== undefined, null, { timeout: 120_000 });
  } catch (error) {
    console.log('a página não iniciou a Vila. Erros:', errors.slice(0, 3));
    throw error;
  }
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.villagePerf.snapshot());
  const cdp = await page.context().newCDPSession(page);
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(SECONDS * 1000);
  const snap = await page.evaluate(() => window.villagePerf.snapshot());
  const { profile } = await cdp.send('Profiler.stop');
  console.log(`[CPU ${THROTTLE}x] moradores=${N}, 2D-HD=${HD2D ? 'ligado' : 'desligado'}: frames=${snap.frames} (${(snap.frames / SECONDS).toFixed(1)}/s) · update mediana ${snap.updateMedian} ms, p95 ${snap.updateP95} ms · draw mediana ${snap.drawMedian} ms, p95 ${snap.drawP95} ms, máx ${snap.drawMax} ms`);
  console.log(`  intervalo entre quadros: mediana ${snap.gapMedian} ms, p99 ${snap.gapP99} ms · quadros acima de 33 ms (abaixo de 30 fps): ${snap.longFrames} de ${snap.gaps}`);
  if (errors.length) console.log('erros de página:', errors.slice(0, 3));
  mkdirSync('e2e/.tmp', { recursive: true });
  writeFileSync(`e2e/.tmp/village-perf-${N}.cpuprofile`, JSON.stringify(profile));
  await browser.close();
} finally {
  vite?.kill();
}
