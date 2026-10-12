/** Utilitários compartilhados pelos scripts de avaliação (rodam só no CI, com rede). */
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { prng, renderScene } from '../src/recognition/__fixtures__/synthetic';
import { boxBlur } from '../src/recognition/image';
import { ocrParams, prepareForOcr } from '../src/recognition/ocr';
import type { OcrEngine } from '../src/recognition/ocr';
import type { Quad, RgbaImage } from '../src/recognition/types';

export type Level = 'facil' | 'medio' | 'dificil';
export const LEVELS: Level[] = ['facil', 'medio', 'dificil'];
/** Quadro de 1080p (como o vídeo de um celular em paisagem); a carta ocupa ~85% da altura. */
export const SCENE_W = 1920;
export const SCENE_H = 1080;

export function decodePng(buffer: Buffer): RgbaImage {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

export function encodePng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}

export async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 3) throw new Error(`${url}: ${String(error)}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

export function blurImage(image: RgbaImage, passes: number): RgbaImage {
  const out = new Uint8ClampedArray(image.data);
  for (let c = 0; c < 3; c++) {
    let plane: Float32Array = new Float32Array(image.width * image.height);
    for (let i = 0; i < plane.length; i++) plane[i] = image.data[i * 4 + c] ?? 0;
    for (let p = 0; p < passes; p++) plane = boxBlur(plane, image.width, image.height);
    for (let i = 0; i < plane.length; i++) out[i * 4 + c] = plane[i] ?? 0;
  }
  return { ...image, data: out };
}

/** Cena com a carta em perspectiva; a dificuldade controla inclinação, rotação, desfoque, ruído e brilho. */
export function makeScene(card: RgbaImage, seed: number, level: Level): { scene: RgbaImage; quad: Quad } {
  const random = prng(seed);
  const W = SCENE_W;
  const H = SCENE_H;
  const spec = {
    facil: { tilt: 0, rotate: 0.05, blur: 0, noise: 0, light: 1, glare: 0 },
    medio: { tilt: 0.12, rotate: 0.3, blur: 1, noise: 8, light: 0.9, glare: 0.1 },
    dificil: { tilt: 0.25, rotate: 0.6, blur: 2, noise: 18, light: 0.72, glare: 0.3 },
  }[level];
  const h = 880 + random() * 80;
  const w = h * (63 / 88);
  const angle = (random() - 0.5) * 2 * spec.rotate;
  const cx = W / 2 + (random() - 0.5) * 80;
  const cy = H / 2 + (random() - 0.5) * 40;
  const corners: [number, number][] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const quad = corners.map(([x, y]) => {
    const jitterX = (random() - 0.5) * spec.tilt * w;
    const jitterY = (random() - 0.5) * spec.tilt * h;
    const rx = (x + jitterX) * Math.cos(angle) - (y + jitterY) * Math.sin(angle);
    const ry = (x + jitterX) * Math.sin(angle) + (y + jitterY) * Math.cos(angle);
    return { x: cx + rx, y: cy + ry };
  }) as Quad;
  let scene = renderScene(card, quad, W, H, { noise: spec.noise, seed, background: [70 + random() * 40, 60 + random() * 40, 50 + random() * 40] });
  if (spec.blur > 0) scene = blurImage(scene, spec.blur);
  // Brilho global e uma faixa de reflexo diagonal.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const glare = spec.glare * Math.max(0, 1 - Math.abs((x + y) / (W + H) - 0.5) * 6) * 120;
      for (let c = 0; c < 3; c++) scene.data[o + c] = (scene.data[o + c] ?? 0) * spec.light + glare;
    }
  }
  return { scene, quad };
}

export async function createNodeOcr(): Promise<OcrEngine> {
  const require = createRequire(import.meta.url);
  const langPath = require.resolve('@tesseract.js-data/eng/package.json').replace('package.json', '4.0.0_best_int');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: 'none' });
  return {
    async recognize(image, region) {
      const params = ocrParams(region);
      await worker.setParameters({
        tessedit_pageseg_mode: params.psm === '7' ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: params.whitelist,
        user_defined_dpi: '150',
      });
      const result = await worker.recognize(encodePng(prepareForOcr(image)));
      return result.data.text;
    },
    dispose: async () => {
      await worker.terminate();
    },
  };
}


export interface LabOcr {
  read(image: RgbaImage, psm: PSM, whitelist: string | undefined, binarize: boolean): Promise<string>;
  dispose(): Promise<void>;
}

/** Worker do Tesseract com parâmetros livres (PSM, lista de caracteres, binarização) para experimentos. */
export async function createLabOcr(): Promise<LabOcr> {
  const require = createRequire(import.meta.url);
  const langPath = require.resolve('@tesseract.js-data/eng/package.json').replace('package.json', '4.0.0_best_int');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: 'none' });
  return {
    async read(image, psm, whitelist, binarize) {
      await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist ?? '', user_defined_dpi: '150' });
      const result = await worker.recognize(encodePng(prepareForOcr(image, 96, binarize)));
      return result.data.text;
    },
    dispose: async () => {
      await worker.terminate();
    },
  };
}

export { PSM };
