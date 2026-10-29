import type { FrameQuality } from './stability';
import type { RgbaImage } from './types';
import type { CardDetection } from './detect-card';

export interface CapturedFrame {
  frame: RgbaImage;
  quality: FrameQuality;
  /** Contorno calculado para esta foto exata; nunca se mistura com o de outro quadro. */
  detection?: CardDetection;
  /** Momento monotônico em que a câmera entregou o quadro. */
  at: number;
}

export interface BestFrameOptions {
  /** Não congela uma imagem escura, mesmo que tenha bordas com bastante contraste. */
  minBrightness?: number;
  /** Ganho relativo de nitidez exigido para substituir uma foto já boa. */
  replaceSharpnessGain?: number;
  /** Depois desta janela a foto perde a validade: a carta pode ter sido trocada. */
  maxAgeMs?: number;
}

const DEFAULT_MIN_BRIGHTNESS = 45;
const DEFAULT_REPLACE_GAIN = 0.08;
const DEFAULT_MAX_AGE_MS = 1_500;

/**
 * Mantém uma única foto candidata durante a estabilização. É propositalmente pequeno e puro de DOM: o controlador
 * pode decidir quando consumir `take`, sem recapturar nem reexecutar OCR para cada oscilação da câmera.
 */
export class BestFrameCapture {
  private best: CapturedFrame | null = null;
  private readonly minBrightness: number;
  private readonly replaceGain: number;
  private readonly maxAgeMs: number;

  constructor(options: BestFrameOptions = {}) {
    this.minBrightness = options.minBrightness ?? DEFAULT_MIN_BRIGHTNESS;
    this.replaceGain = options.replaceSharpnessGain ?? DEFAULT_REPLACE_GAIN;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  }

  consider(candidate: CapturedFrame): boolean {
    if (candidate.quality.brightness < this.minBrightness) return false;
    if (!this.best || candidate.quality.sharpness >= this.best.quality.sharpness * (1 + this.replaceGain)) {
      this.best = candidate;
      return true;
    }
    return false;
  }

  /** A foto só vale perto da captura; evita reconhecer uma carta que já saiu da câmera. */
  peek(now: number): CapturedFrame | null {
    if (!this.best || now - this.best.at > this.maxAgeMs) return null;
    return this.best;
  }

  /** Entrega e limpa a melhor foto atual, para cada tentativa ter uma origem explícita. */
  take(now: number): CapturedFrame | null {
    const best = this.peek(now);
    this.best = null;
    return best;
  }

  clear(): void {
    this.best = null;
  }
}
