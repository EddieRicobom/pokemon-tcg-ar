/**
 * Copia os arquivos do OCR (Tesseract.js) de node_modules para public/ocr/, para o app servi-los
 * do próprio GitHub Pages (nada de CDN em tempo de execução). Roda antes de `dev` e `build`.
 *
 *   public/ocr/worker.min.js
 *   public/ocr/core/tesseract-core-{relaxedsimd-,simd-,}lstm.wasm.js   (o navegador baixa só um)
 *   public/ocr/lang/eng.traineddata.gz                                  (best_int, ≈ 2,9 MB)
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

for (const [from, to] of files) {
  const target = join(out, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, from), target);
  console.log(`ocr: ${to} (${(statSync(target).size / 1024 / 1024).toFixed(2)} MB)`);
}
