/** Preparo mecânico da arte gerada: recorte, escala única e alinhamento dos pés, sem desenhar poses. */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sheetCuts } from '../src/core/trainer-sheet-layout.ts';

const [source, destination] = process.argv.slice(2);
if (!source || !destination || source === destination) throw new Error('Uso: node scripts/prepare-trainer-atlas.ts origem.png destino.png (arquivos diferentes)');
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const rowPixels = new Array<number>(info.height).fill(0);
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  if (data[(y * info.width + x) * 4 + 3]! < 8) continue;
  rowPixels[y]!++;
}
const rows = sheetCuts(rowPixels);
if (!rows) throw new Error('A folha precisa de quatro linhas separadas por transparência; revisar a origem.');
const frames = [];
for (let row = 0; row < 4; row++) {
 const columnPixels = new Array<number>(info.width).fill(0);
 for (let y = rows[row]!; y < rows[row + 1]!; y++) for (let x = 0; x < info.width; x++) {
   if (data[(y * info.width + x) * 4 + 3]! >= 8) columnPixels[x]!++;
 }
 const columns = sheetCuts(columnPixels);
 if (!columns) throw new Error(`Linha ${row + 1}: quatro poses precisam estar separadas por transparência.`);
 for (let column = 0; column < 4; column++) {
  const x0 = columns[column]!;
  const y0 = rows[row]!;
  const x1 = columns[column + 1]!;
  const y1 = rows[row + 1]!;
  let left = x1, top = y1, right = -1, bottom = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (data[(y * info.width + x) * 4 + 3]! < 8) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error(`Quadro vazio: linha ${row + 1}, coluna ${column + 1}`);
  if (left <= x0 || right >= x1 - 1 || top <= y0 || bottom >= y1 - 1) throw new Error(`Arte toca a borda do quadro ${row + 1}/${column + 1}; revisar a origem`);
  // O eixo vem das pernas/pés, não de um cachecol ou mochila que se projeta para um lado.
  let feetLeft = right, feetRight = left;
  for (let y = top + Math.floor((bottom - top + 1) * 0.72); y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (data[(y * info.width + x) * 4 + 3]! < 8) continue;
    feetLeft = Math.min(feetLeft, x); feetRight = Math.max(feetRight, x);
  }
  const pivotX = (feetLeft + feetRight + 1) / 2;
  frames.push({ left, top, width: right - left + 1, height: bottom - top + 1, row, column, pivotX });
 }
}
// Um fator para toda a folha: não altera a proporção do personagem entre quadros.
const cellWidth = 64, cellHeight = 80;
const halfExtent = Math.max(...frames.map((frame) => Math.max(frame.pivotX - frame.left, frame.left + frame.width - frame.pivotX)));
const scale = Math.min(28 / halfExtent, 70 / Math.max(...frames.map((frame) => frame.height)));
const overlays = await Promise.all(frames.map(async (frame) => {
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const input = await sharp(source).extract({ left: frame.left, top: frame.top, width: frame.width, height: frame.height })
    .resize(width, height, { kernel: 'nearest' }).png().toBuffer();
  return { input, left: frame.column * cellWidth + 32 - Math.round((frame.pivotX - frame.left) * scale), top: frame.row * cellHeight + 76 - height };
}));
await mkdir(dirname(destination), { recursive: true });
await sharp({ create: { width: cellWidth * 4, height: cellHeight * 4, channels: 4, background: '#00000000' } })
  .composite(overlays).png({ compressionLevel: 9 }).toFile(destination);
console.log(`Atlas preparado: ${destination} (16 quadros, 256×320, pivô no centro dos pés)`);
