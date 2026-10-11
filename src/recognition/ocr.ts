import { resizeAverage, toGray } from './image';
import type { RgbaImage } from './types';

/** Tipo de região lida: a faixa inferior (número, código do set) ou a faixa do nome. */
export type OcrRegion = 'bottom' | 'name';

export interface OcrEngine {
  recognize(image: RgbaImage, region: OcrRegion): Promise<string>;
  dispose(): Promise<void>;
}

/**
 * Prepara a região para o Tesseract: tons de cinza, escala mínima, contraste esticado e polaridade
 * corrigida (texto escuro sobre fundo claro; cartas escuras são invertidas). Pura e testável.
 */
export function prepareForOcr(image: RgbaImage, minHeight = 96): RgbaImage {
  const scale = Math.max(1, Math.ceil(minHeight / image.height));
  const scaled = scale > 1 ? upscale(image, scale) : image;
  const gray = toGray(scaled);
  let min = 255;
  let max = 0;
  let sum = 0;
  for (const value of gray) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  const range = Math.max(1, max - min);
  const mean = (sum / gray.length - min) / range;
  const invert = mean < 0.4;
  const data = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0; i < gray.length; i++) {
    let value = ((gray[i] ?? 0) - min) / range;
    if (invert) value = 1 - value;
    const byte = Math.round(value * 255);
    data[i * 4] = byte;
    data[i * 4 + 1] = byte;
    data[i * 4 + 2] = byte;
    data[i * 4 + 3] = 255;
  }
  return { width: scaled.width, height: scaled.height, data };
}

function upscale(image: RgbaImage, factor: number): RgbaImage {
  // resizeAverage só reduz bem; para ampliar, o laço acima de caixa vira "vizinho mais próximo".
  return resizeAverage(image, image.width * factor, image.height * factor);
}

export interface TesseractEngineOptions {
  /** Pasta (URL) com `worker.min.js`, `core/` e `lang/`; veja `scripts/copy-ocr-assets.mjs`. */
  assetsBaseUrl: string;
  toCanvas: (image: RgbaImage) => HTMLCanvasElement | OffscreenCanvas;
  onProgress?: (status: string, progress: number) => void;
}

/**
 * OCR com Tesseract.js (WASM) servido pelos próprios arquivos do app, nada de CDN. O motor é carregado
 * sob demanda (import dinâmico): sem OCR, o app inicial não paga o custo.
 */
export async function createTesseractEngine(options: TesseractEngineOptions): Promise<OcrEngine> {
  const Tesseract = await import('tesseract.js');
  const base = options.assetsBaseUrl.replace(/\/$/, '');
  const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    gzip: true,
    logger: (message) => options.onProgress?.(message.status, message.progress),
  });
  return {
    async recognize(image, region) {
      await worker.setParameters({
        tessedit_pageseg_mode: region === 'name' ? Tesseract.PSM.SINGLE_LINE : Tesseract.PSM.SINGLE_BLOCK,
        user_defined_dpi: '150',
      });
      const result = await worker.recognize(options.toCanvas(prepareForOcr(image)));
      return result.data.text;
    },
    async dispose() {
      await worker.terminate();
    },
  };
}
