// Gera public/tilesets/vila-atlas.png a partir dos recortes listados em src/village/atlas-spec.ts.
// Uso: node --experimental-strip-types scripts/build-vila-atlas.mjs
// (Chromium do Playwright; PW_CHANNEL=msedge usa o Edge instalado.) O PNG gerado vai para o repositório: o app e o CI
// não rodam este script, ele só documenta e refaz o atlas quando a lista de recortes muda.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ATLAS_SOURCES, ATLAS_W, packAtlas } from '../src/village/atlas-spec.ts';

const root = resolve(import.meta.dirname, '..');
const { rects, h } = packAtlas();
const sheets = [...new Set(ATLAS_SOURCES.map((s) => s.sheet))];
const urls = Object.fromEntries(sheets.map((s) => [s, 'data:image/png;base64,' + readFileSync(resolve(root, 'tilesets', s)).toString('base64')]));
const jobs = ATLAS_SOURCES.map((s) => ({ ...s, to: rects.get(s.id) }));

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage();
const b64 = await page.evaluate(
  async ({ urls, jobs, W, H }) => {
    const imgs = {};
    for (const [k, u] of Object.entries(urls)) {
      const img = new Image();
      img.src = u;
      await img.decode();
      imgs[k] = img;
    }
    // As folhas marcam blocos vazios com um X vermelho em fundo branco: esses blocos (16×16, alinhados à folha) saem
    // transparentes, para não aparecerem nos cantos das casas e prédios.
    const clearPlaceholders = (ctx, j) => {
      for (let cy = Math.floor(j.y / 16) * 16; cy < j.y + j.h; cy += 16) {
        for (let cx = Math.floor(j.x / 16) * 16; cx < j.x + j.w; cx += 16) {
          const x0 = Math.max(cx, j.x), y0 = Math.max(cy, j.y);
          const x1 = Math.min(cx + 16, j.x + j.w), y1 = Math.min(cy + 16, j.y + j.h);
          if (x1 <= x0 || y1 <= y0) continue;
          const d = ctx.getImageData(j.to.x + x0 - j.x, j.to.y + y0 - j.y, x1 - x0, y1 - y0);
          let white = 0, red = 0;
          for (let i = 0; i < d.data.length; i += 4) {
            const [r, g, b, a] = [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]];
            if (a > 0 && r > 240 && g > 240 && b > 240) white++;
            else if (a > 0 && r > 200 && g < 60 && b < 60) red++;
          }
          const n = d.data.length / 4;
          if (white / n > 0.35 && red / n > 0.12) ctx.clearRect(j.to.x + x0 - j.x, j.to.y + y0 - j.y, x1 - x0, y1 - y0);
        }
      }
    };
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (const j of jobs) {
      if (!j.half) {
        ctx.drawImage(imgs[j.sheet], j.x, j.y, j.w, j.h, j.to.x, j.to.y, j.w, j.h);
        clearPlaceholders(ctx, j);
        for (const [ex, ey, ew, eh] of j.erase ?? []) ctx.clearRect(j.to.x + ex - j.x, j.to.y + ey - j.y, ew, eh);
        continue;
      }
      // 2× → 1×: o pixel de cima à esquerda de cada bloco 2×2 (todos iguais nos autotiles).
      const src = document.createElement('canvas');
      src.width = j.w;
      src.height = j.h;
      const sctx = src.getContext('2d');
      sctx.drawImage(imgs[j.sheet], j.x, j.y, j.w, j.h, 0, 0, j.w, j.h);
      const from = sctx.getImageData(0, 0, j.w, j.h);
      const out = ctx.createImageData(j.w / 2, j.h / 2);
      for (let y = 0; y < j.h / 2; y++) for (let x = 0; x < j.w / 2; x++) for (let k = 0; k < 4; k++) out.data[(y * (j.w / 2) + x) * 4 + k] = from.data[(y * 2 * j.w + x * 2) * 4 + k];
      ctx.putImageData(out, j.to.x, j.to.y);
    }
    return c.toDataURL('image/png').split(',')[1];
  },
  { urls, jobs, W: ATLAS_W, H: h },
);
await browser.close();
const out = resolve(root, 'public/tilesets/vila-atlas.png');
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(`atlas ${ATLAS_W}×${h}, ${ATLAS_SOURCES.length} recortes → ${out}`);
