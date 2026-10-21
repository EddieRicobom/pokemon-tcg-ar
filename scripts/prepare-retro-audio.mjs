/** Uso: node scripts/prepare-retro-audio.mjs caminho/ffmpeg pasta-dos-originais
 * Os quatro originais estão relacionados em public/audio/CREDITS.md. Nenhuma ROM é necessária.
 * Tratamento de uma gravação: não substitui os instrumentos por um arranjo GBA.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [ffmpeg, input] = process.argv.slice(2);
if (!ffmpeg || !input) throw new Error('Informe o executável do FFmpeg e a pasta com kalos/alola/galar/paldea.mp3.');
const output = resolve('public/audio/survival');
mkdirSync(output, { recursive: true });
// PCM de 16 bits, faixa de frequências e amostragem mais próximas de áudio de consoles portáteis antigos.
// A granulação é misturada em baixa intensidade para preservar a melodia e evitar fadiga.
const filter = 'highpass=f=60,lowpass=f=6500,aresample=22050,acrusher=bits=12:mix=0.18,aformat=sample_fmts=s16,loudnorm=I=-20:TP=-2:LRA=9';
const blobs = { kalos: '46c3fd04eb758e85c336c631ade07a26498f9731', alola: '2d595c25f1eb8d03fc50b6090dd9b0af9711f12d', galar: '539b389bb3aace5b8797bc5d6e8bb3bde9496c17', paldea: '2cef63209fb42d7baa2f81f8f124f4423316153e' };
for (const region of ['kalos', 'alola', 'galar', 'paldea']) {
  const data = readFileSync(resolve(input, `${region}.mp3`));
  const hash = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
  if (hash !== blobs[region]) throw new Error(`Original inesperado: ${region}; use a revisão documentada nos créditos.`);
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', resolve(input, `${region}.mp3`), '-map', '0:a:0', '-vn', '-map_metadata', '-1', '-af', filter, '-ar', '22050', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '96k', resolve(output, `${region}.mp3`)], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Falha ao converter ${region}: ${result.error?.message ?? result.status}`);
  console.log(`${region}: MP3 estéreo, 22050 Hz, 96 kb/s`);
}
