import type { Dir } from './village/actors';

export const TRAINER_ATLAS_ROWS: readonly Dir[] = ['down', 'left', 'right', 'up'];
export const TRAINER_ATLAS_COLUMNS = 4;
export interface TrainerAtlasFrame { x: number; y: number; width: number; height: number }

/** Recusa folhas incompletas, com células fracionárias ou sem tamanho. */
export function validTrainerAtlas(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 4 && height >= 4 && width % 4 === 0 && height % 4 === 0;
}

/** Passada completa: repouso → esquerda → repouso alternativo → direita. */
export function trainerAtlasFrame(width: number, height: number, dir: Dir, walking: boolean, steps: number, progress: number, idleMs = 0): TrainerAtlasFrame | null {
  if (!validTrainerAtlas(width, height)) return null;
  const row = TRAINER_ATLAS_ROWS.indexOf(dir);
  if (row < 0) return null;
  const phase = Number.isFinite(progress) ? Math.min(0.999999, Math.max(0, progress)) : 0;
  const completedSteps = Number.isFinite(steps) ? Math.max(0, Math.floor(steps)) : 0;
  const idlePhase = Number.isFinite(idleMs) ? Math.max(0, idleMs) % 2400 : 0;
  const column = walking ? (completedSteps % 2) * 2 + Math.floor(phase * 2) : idlePhase >= 1500 && idlePhase < 2100 ? 2 : 0;
  return { x: column * width / 4, y: row * height / 4, width: width / 4, height: height / 4 };
}

/** Recorte comum às poses: remove margens transparentes sem mudar a escala durante a passada. */
export function trainerAtlasBounds(pixels: Uint8ClampedArray, width: number, height: number): TrainerAtlasFrame | null {
  if (!validTrainerAtlas(width, height) || pixels.length !== width * height * 4) return null;
  const fw = width / 4;
  const fh = height / 4;
  let left = fw;
  let top = fh;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if ((pixels[(y * width + x) * 4 + 3] ?? 0) < 8) continue;
    left = Math.min(left, x % fw);
    top = Math.min(top, y % fh);
    right = Math.max(right, x % fw);
    bottom = Math.max(bottom, y % fh);
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
