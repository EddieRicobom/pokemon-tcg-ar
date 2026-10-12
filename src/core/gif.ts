import { decompressFrames, parseGIF, type ParsedFrame } from 'gifuct-js';

/** Quadro já composto: imagem RGBA completa (largura × altura × 4). */
export interface GifFrame {
  rgba: Uint8ClampedArray;
  delayMs: number;
}

export interface DecodedGif {
  width: number;
  height: number;
  frames: GifFrame[];
  durationMs: number;
}

/** Campos do quadro do gifuct-js que a composição realmente usa. */
export type PatchFrame = Pick<ParsedFrame, 'dims' | 'patch' | 'delay' | 'disposalType'>;

const MIN_DELAY_MS = 20;
const FALLBACK_DELAY_MS = 100;

/** Navegadores tratam atrasos muito curtos (≤ 10 ms) como 100 ms; fazemos o mesmo. */
export function normalizeDelay(delayMs: number): number {
  return delayMs < MIN_DELAY_MS ? FALLBACK_DELAY_MS : delayMs;
}

function drawPatch(
  canvas: Uint8ClampedArray,
  frame: PatchFrame,
  width: number,
  height: number,
): void {
  const { left, top, width: patchWidth, height: patchHeight } = frame.dims;
  for (let y = 0; y < patchHeight; y++) {
    const targetY = top + y;
    if (targetY < 0 || targetY >= height) continue;
    for (let x = 0; x < patchWidth; x++) {
      const targetX = left + x;
      if (targetX < 0 || targetX >= width) continue;
      const source = (y * patchWidth + x) * 4;
      // Transparência de GIF é binária: pixel transparente deixa passar o que já estava.
      if (frame.patch[source + 3] === 0) continue;
      const target = (targetY * width + targetX) * 4;
      canvas[target] = frame.patch[source] ?? 0;
      canvas[target + 1] = frame.patch[source + 1] ?? 0;
      canvas[target + 2] = frame.patch[source + 2] ?? 0;
      canvas[target + 3] = frame.patch[source + 3] ?? 0;
    }
  }
}

function clearRect(
  canvas: Uint8ClampedArray,
  dims: PatchFrame['dims'],
  width: number,
  height: number,
): void {
  for (let y = 0; y < dims.height; y++) {
    const targetY = dims.top + y;
    if (targetY < 0 || targetY >= height) continue;
    for (let x = 0; x < dims.width; x++) {
      const targetX = dims.left + x;
      if (targetX < 0 || targetX >= width) continue;
      const target = (targetY * width + targetX) * 4;
      canvas[target] = 0;
      canvas[target + 1] = 0;
      canvas[target + 2] = 0;
      canvas[target + 3] = 0;
    }
  }
}

/**
 * Compõe os quadros parciais de um GIF em imagens completas, respeitando o
 * método de descarte (0/1 = manter, 2 = limpar a área, 3 = restaurar o estado anterior).
 */
export function composeFrames(
  frames: readonly PatchFrame[],
  width: number,
  height: number,
): GifFrame[] {
  const canvas = new Uint8ClampedArray(width * height * 4);
  const composed: GifFrame[] = [];
  let previous: { frame: PatchFrame; restoreTo: Uint8ClampedArray | null } | null = null;

  for (const frame of frames) {
    if (previous) {
      if (previous.frame.disposalType === 2) {
        clearRect(canvas, previous.frame.dims, width, height);
      } else if (previous.frame.disposalType === 3 && previous.restoreTo) {
        canvas.set(previous.restoreTo);
      }
    }

    const restoreTo = frame.disposalType === 3 ? canvas.slice() : null;
    drawPatch(canvas, frame, width, height);
    composed.push({ rgba: canvas.slice(), delayMs: normalizeDelay(frame.delay) });
    previous = { frame, restoreTo };
  }

  return composed;
}

export function decodeGif(data: ArrayBuffer): DecodedGif {
  const parsed = parseGIF(data);
  const patches = decompressFrames(parsed, true);
  if (patches.length === 0) {
    throw new Error('O arquivo GIF não contém quadros.');
  }

  const { width, height } = parsed.lsd;
  const frames = composeFrames(patches, width, height);
  const durationMs = frames.reduce((total, frame) => total + frame.delayMs, 0);
  return { width, height, frames, durationMs };
}

/** Índice do quadro que deve estar na tela `timeMs` milissegundos após o início (em laço). */
export function frameIndexAt(gif: Pick<DecodedGif, 'frames' | 'durationMs'>, timeMs: number): number {
  const { frames, durationMs } = gif;
  if (frames.length <= 1 || durationMs <= 0) return 0;

  let remaining = ((timeMs % durationMs) + durationMs) % durationMs;
  for (let index = 0; index < frames.length; index++) {
    remaining -= frames[index]?.delayMs ?? 0;
    if (remaining < 0) return index;
  }
  return frames.length - 1;
}

export class GifDownloadError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Falha ao baixar o GIF (HTTP ${status}).`);
    this.name = 'GifDownloadError';
    this.status = status;
  }
}

/** Mensagem em português para o erro de baixar ou decodificar um GIF. */
export function describeGifError(error: unknown): string {
  if (error instanceof GifDownloadError) {
    return error.status === 404
      ? 'Este Pokémon não tem GIF animado no PokeAPI/sprites (nem todos têm).'
      : `O servidor respondeu com erro ${error.status} ao baixar o GIF.`;
  }
  if (error instanceof TypeError) {
    return 'Não foi possível baixar o GIF: a rede falhou ou o servidor dos sprites não respondeu (CORS ou conexão). Use "Carregar GIF do aparelho".';
  }
  return 'O arquivo não é um GIF válido.';
}

/** Baixa e decodifica um GIF. Em falha de rede/CORS o `fetch` lança TypeError. */
export async function fetchGif(url: string, signal?: AbortSignal): Promise<DecodedGif> {
  const response = await fetch(url, { mode: 'cors', signal });
  if (!response.ok) throw new GifDownloadError(response.status);
  return decodeGif(await response.arrayBuffer());
}
