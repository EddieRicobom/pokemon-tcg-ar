import { createBuf } from '../../box/ground-art';
import type { PixelBuf } from '../../box/ground-art';
import { Q } from './items';
import { Pen, render } from './pen';
import type { Palette } from './pen';

/**
 * Móveis no estilo dos tilesets de interior da 3ª geração: perspectiva 3/4 (o tampo aparece claro e a frente mais
 * escura), luz de cima à esquerda, cores suaves e contorno no tom escuro da própria cor. Cada móvel é um mapa de
 * pixels (no máximo 14×14, ou 14×30 nos altos) apoiado na linha de baixo do bloco, com espaço para o contorno.
 *
 * Animação: `frames` são mapas do mesmo tamanho que se sobrepõem à base (`.` mantém o pixel de baixo). Luz: à noite
 * entram `litRows` (sobreposição) e `litPal` (cores trocadas).
 */

export interface Furn {
  rows: string;
  pal: Palette;
  frames?: string[];
  litRows?: string;
  litPal?: Palette;
}

/** Cores fixas a mais dos móveis: vidro, pedra, metal. */
const FURN_FIX: Palette = { G: 0xa8dcf8, S: 0xc4c0b8, X: 0x8c94a4, H: 0x545a6c, E: 0xf8f0d8 };

/** Paleta dos móveis: a–d principal (madeira por padrão), e–h segunda, i/j/m/n terceira, maiúsculas fixas. */
export function FP(main = WOOD, second = main, third = second, extra: Palette = {}): Palette {
  return { ...Q(main, second, third), ...FURN_FIX, ...extra };
}

export const WOOD = 0xc89058;
export const furn = (rows: string, pal: Palette, opt: Omit<Furn, 'rows' | 'pal'> = {}): Furn => ({ rows, pal, ...opt });

const lines = (rows: string): string[] => rows.split('\n').filter((l) => l.trim().length > 0);

/** Desenha o móvel num quadro 16×16 (ou 16×32 nos altos), apoiado no chão. */
export function paintFurn(f: Furn, lit: boolean, frame: number, h: number): PixelBuf {
  const base = lines(f.rows);
  const w = Math.max(...base.map((l) => l.length));
  const x0 = Math.max(1, Math.floor((16 - w) / 2));
  const y0 = Math.max(1, h - 1 - base.length);
  const pal = lit && f.litPal ? { ...f.pal, ...f.litPal } : f.pal;
  const overlays = [f.frames && f.frames.length > 0 ? f.frames[frame % f.frames.length]! : '', lit ? f.litRows ?? '' : ''];
  return render((p: Pen) => {
    p.map(x0, y0, base.join('\n'), pal);
    for (const o of overlays) if (o) p.map(x0, y0, o, pal);
  }, 16, h, { shade: 'none', outline: 'sel' });
}

export const blank = (h: number): PixelBuf => createBuf(16, h);
