/**
 * Mede a Torre de Sobrevivência com muitos inimigos e orbes no Chromium (componente real): intervalo entre quadros e um
 * perfil de CPU. Não mede câmera nem celular.
 *
 *   PERF_BASE=http://127.0.0.1:4192 PERF_THROTTLE=6 node e2e/survival-perf.mjs [inimigos=0] [orbes=0] [segundos=12]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const ENEMIES = process.argv[2] ?? '0';
const ORBS = process.argv[3] ?? '0';
const SECONDS = Number(process.argv[4] ?? 12);
const THROTTLE = Number(process.env.PERF_THROTTLE ?? 1);
const base = process.env.PERF_BASE;
if (!base) throw new Error('Defina PERF_BASE com o endereço de um Vite já rodando.');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/pokemon-tcg-ar/e2e/survival-perf/index.html?enemies=${ENEMIES}&orbs=${ORBS}&scenery=${process.env.PERF_SCENERY ?? 1}`);
await page.waitForFunction(() => window.survivalPerf?.ready(), null, { timeout: 120_000 });
await page.waitForTimeout(1000);
await page.evaluate(() => window.survivalPerf.snapshot());
const cdp = await page.context().newCDPSession(page);
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.waitForTimeout(SECONDS * 1000);
const snap = await page.evaluate(() => window.survivalPerf.snapshot());
const { profile } = await cdp.send('Profiler.stop');
console.log(`[CPU ${THROTTLE}x] inimigos=${snap.enemies} orbes=${snap.orbs}: intervalo entre quadros mediana ${snap.gapMedian} ms, p99 ${snap.gapP99} ms · quadros acima de 33 ms: ${snap.longFrames} de ${snap.gaps}`);
if (errors.length) console.log('erros de página:', errors.slice(0, 3));
mkdirSync('e2e/.tmp', { recursive: true });
writeFileSync(`e2e/.tmp/survival-perf-${ENEMIES}-${ORBS}.cpuprofile`, JSON.stringify(profile));
await browser.close();
