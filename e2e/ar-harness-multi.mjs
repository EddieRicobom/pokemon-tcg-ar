// Ferramenta de desenvolvimento (não roda no CI): duas cartas no mesmo vídeo, rastreadas juntas pelo MindAR real.
// Preparo: gere e2e/.tmp/cam-multi.y4m (duas cartas lado a lado), rode `npx vite build -c e2e/vite.harness.config.mjs`
// (adicione ar-harness-multi.html às entradas), copie card.png, rect.png e sprite.gif para a pasta e sirva-a.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=e2e/.tmp/cam-multi.y4m', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[console.' + m.type() + ']', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.addInitScript(() => setInterval(() => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 90, gamma: 0 })), 16));
await page.goto(process.env.URL ?? 'http://localhost:5199/e2e/ar-harness-multi.html');
await page.evaluate(() => window.run());
const deadline = Date.now() + 120000;
let log = [];
while (Date.now() < deadline) {
  log = await page.evaluate(() => window.log);
  if (log.some((l) => l.startsWith('ERROR')) || log.some((l) => /visible=c0,c1|visible=c1,c0/.test(l))) break;
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(3000);
log = await page.evaluate(() => window.log);
console.log(log.join('\n'));
await page.screenshot({ path: 'e2e/.tmp/multi-shot.png' });
console.log('estado final', JSON.stringify(await page.evaluate(() => window.multi?.session.currentState)));
await browser.close();
