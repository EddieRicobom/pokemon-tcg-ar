// Atlas reproduzível, sem navegador ou rede. Uso: node --experimental-strip-types scripts/build-vila-atlas.mjs [--check]
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ATLAS_SOURCES, ATLAS_W, packAtlas } from '../src/village/atlas-spec.ts';

const root = resolve(import.meta.dirname, '..');
const { rects, h } = packAtlas();
const sheets = new Map();
const jobs = [];
for (const source of ATLAS_SOURCES) {
  let sheet = sheets.get(source.sheet);
  if (!sheet) {
    sheet = await sharp(resolve(root, 'tilesets', source.sheet)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    sheets.set(source.sheet, sheet);
  }
  if (source.x < 0 || source.y < 0 || source.x + source.w > sheet.info.width || source.y + source.h > sheet.info.height) throw new Error(`Recorte fora da folha: ${source.id}`);
  const pixels = Buffer.alloc(source.w * source.h * 4);
  for (let y = 0; y < source.h; y++) {
    const start = ((source.y + y) * sheet.info.width + source.x) * 4;
    sheet.data.copy(pixels, y * source.w * 4, start, start + source.w * 4);
  }
  for (const [x, y, w, height, dx, dy] of source.patches ?? []) {
    if (x < 0 || y < 0 || x + w > sheet.info.width || y + height > sheet.info.height || dx < 0 || dy < 0 || dx + w > source.w || dy + height > source.h) throw new Error(`Peça modular fora dos limites: ${source.id}`);
    for (let row = 0; row < height; row++) {
      const start = ((y + row) * sheet.info.width + x) * 4;
      sheet.data.copy(pixels, ((dy + row) * source.w + dx) * 4, start, start + w * 4);
    }
  }
  // X vermelhos sobre branco marcam peças vazias, não partes da construção.
  for (let cy = Math.floor(source.y / 16) * 16; cy < source.y + source.h; cy += 16) {
    for (let cx = Math.floor(source.x / 16) * 16; cx < source.x + source.w; cx += 16) {
      const x0 = Math.max(cx, source.x) - source.x, y0 = Math.max(cy, source.y) - source.y;
      const x1 = Math.min(cx + 16, source.x + source.w) - source.x, y1 = Math.min(cy + 16, source.y + source.h) - source.y;
      let white = 0, red = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * source.w + x) * 4;
        const [r, g, b, a] = pixels.subarray(i, i + 4);
        if (a && r > 240 && g > 240 && b > 240) white++;
        else if (a && r > 200 && g < 60 && b < 60) red++;
      }
      const n = (x1 - x0) * (y1 - y0);
      if (white / n > .35 && red / n > .12) for (let y = y0; y < y1; y++) pixels.fill(0, (y * source.w + x0) * 4, (y * source.w + x1) * 4);
    }
  }
  for (const [x, y, w, height] of source.erase ?? []) {
    for (let row = y - source.y; row < y - source.y + height; row++) pixels.fill(0, (row * source.w + x - source.x) * 4, (row * source.w + x - source.x + w) * 4);
  }
  if (source.removeGrass) for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 1] > pixels[i] * 1.1 && pixels[i + 1] > pixels[i + 2] * 1.1) pixels.fill(0, i, i + 4);
  }
  const target = rects.get(source.id);
  const image = sharp(pixels, { raw: { width: source.w, height: source.h, channels: 4 } });
  if (source.half) image.resize(target.w, target.h, { kernel: 'nearest' });
  jobs.push({ input: await image.png().toBuffer(), left: target.x, top: target.y });
}
const output = await sharp({ create: { width: ATLAS_W, height: h, channels: 4, background: '#0000' } }).composite(jobs).png().toBuffer();
const path = resolve(root, 'src/village/vila-atlas.png');
if (process.argv.includes('--check')) {
  const stored = await sharp(readFileSync(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const expected = await sharp(output).raw().toBuffer();
  if (stored.info.width !== ATLAS_W || stored.info.height !== h || !stored.data.equals(expected)) throw new Error('Atlas publicado difere dos recortes. Execute scripts/build-vila-atlas.mjs e inclua o PNG no commit.');
  console.log('ok: atlas publicado corresponde a todos os recortes');
} else {
  writeFileSync(path, output);
  console.log(`atlas ${ATLAS_W}×${h}, ${ATLAS_SOURCES.length} recortes → ${path}`);
}
