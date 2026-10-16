import type { Quad, RgbaImage } from './types';

/**
 * Estabilidade e qualidade do quadro, ANTES do OCR (que custa segundos no celular). A detecção do contorno é
 * barata e roda em todo quadro; o OCR só roda quando a carta está parada há pelo menos um par de quadros — uma
 * leitura de um quadro tremido quase sempre falha e só atrasa a próxima. Não elimina a confirmação temporal:
 * ela continua exigindo leituras de OCR repetidas (ver `temporal.ts`).
 */

/** Deslocamento médio dos 4 cantos entre dois quadros, como fração da diagonal da carta. */
export function quadMotion(a: Quad, b: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y);
  const diag = Math.max(1, (Math.hypot(b[0].x - b[2].x, b[0].y - b[2].y) + Math.hypot(b[1].x - b[3].x, b[1].y - b[3].y)) / 2);
  return sum / 4 / diag;
}

/** Abaixo disso (fração da diagonal por quadro), a carta conta como parada. ~2% ≈ 1 mm numa carta de 88 mm. */
export const STABLE_MOTION = 0.02;

export type StabilityKind = 'searching' | 'moving' | 'stable';

export interface StabilityState {
  kind: StabilityKind;
  /** Movimento do último par de quadros (fração da diagonal); null sem par. */
  motion: number | null;
  /** Quadros seguidos com a carta parada. */
  stableFrames: number;
}

export class StabilityTracker {
  private last: Quad | null = null;
  private stableFrames = 0;

  /** `need`: quadros parados seguidos para liberar o OCR (1 = basta um par de quadros sem movimento). */
  constructor(private readonly need = 1, private readonly threshold = STABLE_MOTION) {}

  push(quad: Quad | null): StabilityState {
    if (!quad) {
      this.last = null;
      this.stableFrames = 0;
      return { kind: 'searching', motion: null, stableFrames: 0 };
    }
    const motion = this.last ? quadMotion(this.last, quad) : null;
    this.last = quad;
    if (motion !== null && motion <= this.threshold) this.stableFrames++;
    else this.stableFrames = 0;
    return { kind: this.stableFrames >= this.need ? 'stable' : 'moving', motion, stableFrames: this.stableFrames };
  }

  reset(): void {
    this.last = null;
    this.stableFrames = 0;
  }
}

export interface FrameQuality {
  /** Luminância média dentro da carta (0–255). */
  brightness: number;
  /** Nitidez: média do |laplaciano| em pixels da carta (maior = mais nítido). Heurística, não calibrada em celular. */
  sharpness: number;
}

/** Abaixo disso o app avisa "pouca luz". */
export const DARK_BRIGHTNESS = 45;
/**
 * Abaixo disso o app avisa que a imagem PODE estar desfocada. Medido só em fotos de exemplo e imagens sintéticas
 * (o foco do celular de verdade não foi medido); por isso é só aviso — nunca bloqueia a leitura.
 */
export const BLURRY_SHARPNESS = 2.5;

function lumaAt(image: RgbaImage, x: number, y: number): number {
  const i = (y * image.width + x) * 4;
  return 0.299 * (image.data[i] ?? 0) + 0.587 * (image.data[i + 1] ?? 0) + 0.114 * (image.data[i + 2] ?? 0);
}

/** Brilho e nitidez numa grade de até ~64×64 pontos dentro da caixa do quadrilátero (barato: não retifica nada). */
export function frameQuality(image: RgbaImage, quad: Quad): FrameQuality {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const left = Math.max(1, Math.floor(Math.min(...xs)));
  const right = Math.min(image.width - 2, Math.ceil(Math.max(...xs)));
  const top = Math.max(1, Math.floor(Math.min(...ys)));
  const bottom = Math.min(image.height - 2, Math.ceil(Math.max(...ys)));
  if (right <= left || bottom <= top) return { brightness: 0, sharpness: 0 };
  // Margem de 15% para dentro: as bordas da carta (contraste forte com o fundo) não contam como "nitidez".
  const mx = Math.round((right - left) * 0.15);
  const my = Math.round((bottom - top) * 0.15);
  const x0 = left + mx;
  const x1 = right - mx;
  const y0 = top + my;
  const y1 = bottom - my;
  const stepX = Math.max(1, Math.floor((x1 - x0) / 64));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 64));
  let lum = 0;
  let lap = 0;
  let n = 0;
  for (let y = y0; y <= y1; y += stepY) {
    for (let x = x0; x <= x1; x += stepX) {
      const c = lumaAt(image, x, y);
      lum += c;
      lap += Math.abs(4 * c - lumaAt(image, x - 1, y) - lumaAt(image, x + 1, y) - lumaAt(image, x, y - 1) - lumaAt(image, x, y + 1));
      n++;
    }
  }
  return n === 0 ? { brightness: 0, sharpness: 0 } : { brightness: lum / n, sharpness: lap / n };
}

/** Aviso honesto sobre a qualidade (ou null se nada a dizer). */
export function qualityWarning(q: FrameQuality): string | null {
  if (q.brightness < DARK_BRIGHTNESS) return 'Pouca luz sobre a carta: aproxime de uma luz ou acenda a lanterna.';
  if (q.sharpness < BLURRY_SHARPNESS) return 'A imagem pode estar desfocada: afaste um pouco o celular e espere o foco.';
  return null;
}
