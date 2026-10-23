/**
 * Converte uma cena PNG num vídeo Y4M (YUV 4:2:0, sem compressão) para a câmera falsa do Chromium, sem precisar do ffmpeg.
 * O CI usa o ffmpeg (`e2e.yml`); este script serve para rodar o teste de ponta a ponta num PC sem ele (por exemplo, Windows).
 *
 *   node e2e/png-to-y4m.mjs e2e/.tmp/base1-4.png e2e/.tmp/base1-4.y4m [segundos=3] [quadros por segundo=10]
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const [, , input, output, seconds = '3', fps = '10'] = process.argv;
if (!input || !output) {
  console.error('Uso: node e2e/png-to-y4m.mjs entrada.png saida.y4m [segundos] [fps]');
  process.exit(1);
}

const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
if (W % 2 || H % 2) throw new Error('Largura e altura precisam ser pares (YUV 4:2:0).');
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const Y = Buffer.alloc(W * H);
const U = Buffer.alloc((W / 2) * (H / 2));
const V = Buffer.alloc((W / 2) * (H / 2));

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    Y[y * W + x] = clamp(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
}
for (let y = 0; y < H / 2; y++) {
  for (let x = 0; x < W / 2; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = ((y * 2 + dy) * W + x * 2 + dx) * 3;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    r /= 4;
    g /= 4;
    b /= 4;
    U[y * (W / 2) + x] = clamp(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
    V[y * (W / 2) + x] = clamp(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
  }
}

writeFileSync(output, `YUV4MPEG2 W${W} H${H} F${fps}:1 Ip A1:1 C420jpeg\n`);
const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, U, V]);
for (let k = 0; k < Number(seconds) * Number(fps); k++) appendFileSync(output, frame);
console.log(`ok: ${output} (${W}x${H}, ${seconds}s a ${fps} quadros/s)`);
