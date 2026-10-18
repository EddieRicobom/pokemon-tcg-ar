import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
// uso: node blobs.mjs "arquivo:x:y:w:h" ...  → caixas (x,y,w,h) das figuras conectadas (alfa>0), ≥ 64 px
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
for (const spec of process.argv.slice(2)) {
  const p = spec.split(':'); const [x0, y0, w, h] = p.slice(-4).map(Number); const file = p.slice(0, -4).join(':');
  const url = 'data:image/png;base64,' + readFileSync(file).toString('base64');
  const boxes = await page.evaluate(async ({ url, x0, y0, w, h }) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(x0, y0, w, h).data;
    const seen = new Uint8Array(w * h); const out = [];
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || d[i * 4 + 3] === 0) continue;
      let minx = w, miny = h, maxx = -1, maxy = -1, n = 0; const st = [i]; seen[i] = 1;
      while (st.length) { const j = st.pop(); const x = j % w, y = (j - x) / w; n++;
        if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const k = ny * w + nx; if (!seen[k] && d[k * 4 + 3] > 0) { seen[k] = 1; st.push(k); } } }
      if (n >= 64) out.push([x0 + minx, y0 + miny, maxx - minx + 1, maxy - miny + 1, n]);
    }
    return out;
  }, { url, x0, y0, w, h });
  console.log(file.split('/').pop(), `@${x0},${y0}`, JSON.stringify(boxes));
}
await browser.close();
