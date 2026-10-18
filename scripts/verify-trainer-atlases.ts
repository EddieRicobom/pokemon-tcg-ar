/** Confere os arquivos que o renderizador consome; não tenta julgar identidade ou direção por pixels. */
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { PLAYER_SPRITES } from '../src/core/trainer-sprites.ts';

let totalBytes = 0;
for (const trainer of PLAYER_SPRITES) {
  const path = `public/art/trainers/${trainer.id}.png`;
  const png = PNG.sync.read(await readFile(path));
  if (png.width !== 256 || png.height !== 320) throw new Error(`${path}: esperado 256×320`);
  const fingerprints = [];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    let opaque = 0;
    const hash = createHash('sha256');
    for (let y = 0; y < 80; y++) {
      const offset = ((row * 80 + y) * png.width + column * 64) * 4;
      hash.update(png.data.subarray(offset, offset + 64 * 4));
      for (let x = 0; x < 64; x++) {
        const alpha = png.data[offset + x * 4 + 3]!;
        if (alpha < 8) continue;
        opaque++;
        if (x === 0 || x === 63 || y === 0 || y === 79) throw new Error(`${path}: arte cortada no quadro ${row}/${column}`);
      }
    }
    if (opaque < 100 || opaque > 80 * 64 * 0.9) throw new Error(`${path}: quadro vazio ou sem transparência em ${row}/${column}`);
    fingerprints.push(hash.digest('hex'));
  }
  for (let row = 0; row < 4; row++) {
    const frames = fingerprints.slice(row * 4, row * 4 + 4);
    if (frames[0] === frames[1] || frames[1] === frames[3]) throw new Error(`${path}: caminhada sem poses distintas na direção ${row}`);
  }
  const bytes = (await stat(path)).size;
  if (bytes > 180 * 1024) throw new Error(`${path}: atlas acima de 180 KiB`);
  totalBytes += bytes;
}
console.log(`${PLAYER_SPRITES.length} treinadores: 640 quadros com transparência, margens e caminhada distintas; ${(totalBytes / 1024 / 1024).toFixed(2)} MiB no total.`);
