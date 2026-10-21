import { PLAYER_SPRITES } from '../core/trainer-sprites';
import { trainerAtlasBounds, validTrainerAtlas, type TrainerAtlasFrame } from '../core/trainer-animation';
import { harmonizePlayerCanvas } from './player-filter';
export { TRAINER_ATLAS_ROWS, TRAINER_ATLAS_COLUMNS, trainerAtlasBounds, trainerAtlasFrame, validTrainerAtlas } from '../core/trainer-animation';

/** PNG transparente, quatro poses por direção; nenhum quadro é gerado ou espelhado. */
const trainerIds = new Set(PLAYER_SPRITES.map((trainer) => trainer.id));
/** Só inclui folhas já entregues em public/art/trainers. */
export const AVAILABLE_TRAINER_ATLASES: readonly string[] = PLAYER_SPRITES.map((trainer) => trainer.id);

export interface TrainerAtlas { image: HTMLImageElement; filtered: HTMLCanvasElement | null; bounds: TrainerAtlasFrame }

export function trainerAtlasUrl(trainerId: string, baseUrl = import.meta.env.BASE_URL): string | null {
  return trainerIds.has(trainerId) ? `${baseUrl}art/trainers/${trainerId}.png` : null;
}

/** Carrega só o treinador escolhido; falhas ficam explícitas como null para o chamador. */
export function loadTrainerAtlas(trainerId: string): Promise<TrainerAtlas | null> {
  const url = trainerAtlasUrl(trainerId);
  if (!url || !AVAILABLE_TRAINER_ATLASES.includes(trainerId)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    const finish = (atlas: TrainerAtlas | null) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(atlas);
    };
    const timer = setTimeout(() => finish(null), 8000);
    image.decoding = 'async';
    image.onload = () => {
      if (!validTrainerAtlas(image.naturalWidth, image.naturalHeight)) { finish(null); return; }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { finish(null); return; }
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const bounds = trainerAtlasBounds(pixels, canvas.width, canvas.height);
        finish(bounds ? { image, filtered: harmonizePlayerCanvas(image, canvas.width, canvas.height), bounds } : null);
      } catch { finish(null); }
    };
    image.onerror = () => finish(null);
    image.src = url;
  });
}
