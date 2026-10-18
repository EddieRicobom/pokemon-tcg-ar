import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
// uso: node extent.mjs "arquivo:x:y:w:h" → faixas de linhas com algum pixel opaco (e colunas de cada faixa)
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
for (const spec of process.argv.slice(2)) {
  const p = spec.split(':'); const [x0, y0, w, h] = p.slice(-4).map(Number); const file = p.slice(0, -4).join(':');
  const url = 'data:image/png;base64,' + readFileSync(file).toString('base64');
  const r = await page.evaluate(async ({ url, x0, y0, w, h }) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(x0, y0, w, h).data;
    const rowOn = (y) => { for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 0) return true; return false; };
    const bands = []; let start = -1;
    for (let y = 0; y <= h; y++) { const on = y < h && rowOn(y); if (on && start < 0) start = y; if (!on && start >= 0) { let minx = w, maxx = -1; for (let yy = start; yy < y; yy++) for (let x = 0; x < w; x++) if (d[(yy * w + x) * 4 + 3] > 0) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); } bands.push([x0 + minx, y0 + start, maxx - minx + 1, y - start]); start = -1; } }
    return bands;
  }, { url, x0, y0, w, h });
  console.log(file.split('/').pop(), `@${x0},${y0},${w}x${h}`, JSON.stringify(r));
}
await browser.close();
