import type { RgbaImage } from './types';

/**
 * Cola com o navegador (canvas, createImageBitmap): fica fora dos testes unitários porque o
 * happy-dom não tem canvas real. É validada nos testes de ponta a ponta com Chromium.
 */
function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
  if (!context) throw new Error('Canvas 2D indisponível neste navegador.');
  return context as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

export function rgbaToCanvas(image: RgbaImage): HTMLCanvasElement | OffscreenCanvas {
  const canvas = createCanvas(image.width, image.height);
  const data = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  context2d(canvas).putImageData(data, 0, 0);
  return canvas;
}

export function frameFromSource(source: CanvasImageSource, width: number, height: number): RgbaImage {
  const canvas = createCanvas(width, height);
  const context = context2d(canvas);
  context.drawImage(source, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data };
}

/** Quadro atual do vídeo, com o lado maior limitado (o reconhecimento não ganha nada com 12 MP). */
export function frameFromVideo(video: HTMLVideoElement, maxSide = 1280): RgbaImage | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, maxSide / Math.max(vw, vh));
  return frameFromSource(video, Math.round(vw * scale), Math.round(vh * scale));
}

export interface LoadedImage {
  image: RgbaImage;
  bytes: number;
}

/** Baixa uma imagem (precisa de CORS) e devolve os pixels no tamanho pedido. */
export async function loadImageRgba(url: string, width: number, height: number, fetchImpl: typeof fetch = fetch): Promise<LoadedImage> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar ${url}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    return { image: frameFromSource(bitmap, width, height), bytes: blob.size };
  } finally {
    bitmap.close();
  }
}

export async function canvasToBlob(image: RgbaImage, type = 'image/webp', quality = 0.8): Promise<Blob> {
  const canvas = rgbaToCanvas(image);
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob falhou'))), type, quality);
  });
}
