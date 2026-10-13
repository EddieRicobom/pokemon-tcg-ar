// Ferramenta de desenvolvimento (não roda no CI): valida compilação do alvo + rastreamento do MindAR com câmera falsa.
// Uso: npx vite build -c e2e/vite.harness.config.mjs; copie card.png, sprite.gif para a pasta e sirva com um servidor estático.
// Validação do AR real (MindAR + WebGL por software) com câmera FALSA. Não substitui um celular.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=e2e/.tmp/cam.y4m', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[console.' + m.type() + ']', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(process.env.URL ?? 'http://localhost:5199/e2e/ar-harness.html');
await page.evaluate(() => window.run());
const deadline = Date.now() + 60000;
let log = [];
while (Date.now() < deadline) {
  log = await page.evaluate(() => window.log);
  if (log.some((l) => l.startsWith('ERROR')) || log.includes('state tracking')) break;
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(2500);
log = await page.evaluate(() => window.log);
console.log(log.join('\n'));
await page.screenshot({ path: 'e2e/.tmp/ar-shot.png' });
const gl = await page.evaluate(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); if (!g) return 'sem webgl2'; return { renderer: g.getParameter(g.RENDERER), floatRender: !!g.getExtension('EXT_color_buffer_float'), halfFloat: !!g.getExtension('EXT_color_buffer_half_float'), maxTex: g.getParameter(g.MAX_TEXTURE_SIZE) }; });
console.log('glinfo', JSON.stringify(gl));
await browser.close();
