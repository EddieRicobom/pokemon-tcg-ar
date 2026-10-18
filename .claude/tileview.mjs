import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
// uso: node tileview.mjs out.png scale grid "arquivo.png:x:y:w:h" [...]
const [out, scaleS, gridS, ...specs] = process.argv.slice(2);
const scale = Number(scaleS), grid = Number(gridS);
const items = specs.map((s) => { const p = s.split(':'); const [x, y, w, h] = p.slice(-4).map(Number); const file = p.slice(0, -4).join(':'); return { url: 'data:image/png;base64,' + readFileSync(file).toString('base64'), x, y, w, h, name: file.split(/[\/]/).pop() }; });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.setContent('<body style="margin:0;background:#f0f"></body>');
const size = await page.evaluate(async ({ items, scale, grid }) => {
  const pad = 30;
  let W = 0, H = 0;
  for (const it of items) { W = Math.max(W, it.w * scale + pad); H += it.h * scale + pad + 16; }
  const c = document.createElement('canvas'); c.width = W; c.height = H; document.body.appendChild(c);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, W, H);
  let oy = 0;
  for (const it of items) {
    const img = new Image(); img.src = it.url; await img.decode();
    ctx.fillStyle = '#000'; ctx.font = '12px monospace'; ctx.fillText(`${it.name} @${it.x},${it.y}`, 2, oy + 12);
    oy += 16;
    ctx.drawImage(img, it.x, it.y, it.w, it.h, pad, oy + pad, it.w * scale, it.h * scale);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.fillStyle = '#000'; ctx.font = '10px monospace';
    for (let gx = 0; gx <= it.w; gx += grid) { ctx.beginPath(); ctx.moveTo(pad + gx * scale + 0.5, oy + pad); ctx.lineTo(pad + gx * scale + 0.5, oy + pad + it.h * scale); ctx.stroke(); if (gx < it.w) ctx.fillText(String(it.x + gx), pad + gx * scale + 2, oy + pad - 4); }
    for (let gy = 0; gy <= it.h; gy += grid) { ctx.beginPath(); ctx.moveTo(pad, oy + pad + gy * scale + 0.5); ctx.lineTo(pad + it.w * scale, oy + pad + gy * scale + 0.5); ctx.stroke(); if (gy < it.h) ctx.fillText(String(it.y + gy), 0, oy + pad + gy * scale + 12); }
    oy += it.h * scale + pad;
  }
  return { W, H };
}, { items, scale, grid });
await page.setViewportSize({ width: Math.ceil(size.W), height: Math.ceil(size.H) });
await page.locator('canvas').screenshot({ path: out });
await browser.close();
