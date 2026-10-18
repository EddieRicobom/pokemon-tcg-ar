import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
for (const f of files) {
  const url = 'data:image/png;base64,' + readFileSync(f).toString('base64');
  const r = await page.evaluate(async (url) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let uni = 0, tot = 0;
    for (let y = 0; y + 1 < c.height; y += 2) for (let x = 0; x + 1 < c.width; x += 2) {
      const i = (y * c.width + x) * 4; if (d[i + 3] === 0) continue;
      tot++; let same = true;
      for (const j of [i + 4, i + c.width * 4, i + c.width * 4 + 4]) for (let k = 0; k < 4; k++) if (d[j + k] !== d[i + k]) same = false;
      if (same) uni++;
    }
    return (uni / Math.max(1, tot)).toFixed(3);
  }, url);
  console.log(r, f);
}
await browser.close();
