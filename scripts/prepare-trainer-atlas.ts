/** Preparo mecânico da arte gerada: recorte, escala única e alinhamento dos pés, sem desenhar poses. */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const [source, destination] = process.argv.slice(2);
if (!source || !destination || source === destination) throw new Error('Uso: node scripts/prepare-trainer-atlas.ts origem.png destino.png (arquivos diferentes)');
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const frames = [];
for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
  const x0 = Math.round(column * info.width / 4);
  const y0 = Math.round(row * info.height / 4);
  const x1 = Math.round((column + 1) * info.width / 4);
  const y1 = Math.round((row + 1) * info.height / 4);
  let left = x1, top = y1, right = -1, bottom = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (data[(y * info.width + x) * 4 + 3]! < 8) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error(`Quadro vazio: linha ${row + 1}, coluna ${column + 1}`);
  if (left <= x0 || right >= x1 - 1 || top <= y0 || bottom >= y1 - 1) throw new Error(`Arte toca a borda do quadro ${row + 1}/${column + 1}; revisar a origem`);
  frames.push({ left, top, width: right - left + 1, height: bottom - top + 1, row, column });
}
// Um fator para toda a folha: não altera a proporção do personagem entre quadros.
const cellWidth = 64, cellHeight = 80;
const scale = Math.min(56 / Math.max(...frames.map((frame) => frame.width)), 70 / Math.max(...frames.map((frame) => frame.height)));
const overlays = await Promise.all(frames.map(async (frame) => {
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const input = await sharp(source).extract({ left: frame.left, top: frame.top, width: frame.width, height: frame.height })
    .resize(width, height, { kernel: 'nearest' }).png().toBuffer();
  return { input, left: frame.column * cellWidth + Math.floor((cellWidth - width) / 2), top: frame.row * cellHeight + 76 - height };
}));
await mkdir(dirname(destination), { recursive: true });
await sharp({ create: { width: cellWidth * 4, height: cellHeight * 4, channels: 4, background: '#00000000' } })
  .composite(overlays).png({ compressionLevel: 9 }).toFile(destination);
console.log(`Atlas preparado: ${destination} (16 quadros, 256×320, pivô no centro dos pés)`);
