import type { PixelBuf } from '../box/ground-art';
import { put, rect } from './village-art';

/**
 * Estilo comum dos prédios desenhados por código (Coliseu, Dojô, estátua do Mew), copiado do jeito das casas do atlas
 * ('Apathy Houses', 'Brick House Tiles', 'Sinnoh Tile Dump', estilo Ekat/Gen 4): contorno de 1 px em azul-marinho
 * escurecido com a cor vizinha (nunca preto puro), sombreado em 3–4 tons com luz vindo de cima-esquerda, telhado visto
 * de cima em 3/4 e janelas com o mesmo vidro azul-claro e moldura clara das casas.
 *
 * O vidro (`GLASS`) é a ÚNICA coisa azul-clara desses desenhos: o jogo procura esse azul para acender janelas à noite.
 */

/** Contorno das casas do atlas (#353d5d) e o tom mais fundo (#272d47). */
export const INK = 0x353d5d;
export const INK_DEEP = 0x272d47;

/** Vidro e moldura das janelas das casas do atlas (cores medidas em 'Apathy Houses.png'). */
export const GLASS = { light: 0xd0e0f8, mid: 0xa8c8f8, deep: 0x8cb6f6, shine: 0xf8f8f8 } as const;
export const FRAME = { light: 0xf0f0e8, mid: 0xd8d8d0, dark: 0xa8a898 } as const;

export const mix = (rgb: number, k: number): number => {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (c((rgb >> 16) & 255) << 16) | (c((rgb >> 8) & 255) << 8) | c(rgb & 255);
};

export const blend = (a: number, b: number, t: number): number => {
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};

const rgbAt = (b: PixelBuf, x: number, y: number): number => {
  const i = (y * b.w + x) * 4;
  return (b.data[i]! << 16) | (b.data[i + 1]! << 8) | b.data[i + 2]!;
};
const solid = (b: PixelBuf, x: number, y: number): boolean => x >= 0 && y >= 0 && x < b.w && y < b.h && b.data[(y * b.w + x) * 4 + 3]! > 0;

/**
 * Contorno de 1 px por fora do desenho, no tom da cor vizinha escurecida e puxada para o azul-marinho das casas (como
 * no Gen 4: o contorno do telhado vermelho é vinho, o da pedra é cinza-azulado).
 */
export function inkOutline(b: PixelBuf): void {
  const marks: [number, number, number][] = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (solid(b, x, y)) continue;
    // Vizinho preferido: o de baixo (o contorno de cima puxa a cor do telhado), depois os lados.
    const n = ([[0, 1], [-1, 0], [1, 0], [0, -1]] as const).find(([dx, dy]) => solid(b, x + dx, y + dy));
    if (n) marks.push([x, y, blend(mix(rgbAt(b, x + n[0], y + n[1]), 0.42), INK_DEEP, 0.55)]);
  }
  for (const [x, y, c] of marks) put(b, x, y, c);
}

/** Linha de cima mais clara e de baixo mais escura num retângulo (relevo com luz de cima). */
export function bevel(b: PixelBuf, x: number, y: number, w: number, h: number, rgb: number): void {
  rect(b, x, y, w, h, rgb);
  rect(b, x, y, w, 1, mix(rgb, 1.12));
  rect(b, x, y + h - 1, w, 1, mix(rgb, 0.78));
}

/**
 * Janela das casas do atlas: moldura clara, vidro azul-claro em dois tons com o brilho diagonal e o peitoril escuro.
 * `arch` (a cor da parede em volta) arredonda o alto. Devolve o retângulo do vidro (para a lista de luzes da noite).
 */
export function glassWindow(b: PixelBuf, x: number, y: number, w: number, h: number, opts: { arch?: number; frame?: number; mullion?: boolean } = {}): [number, number, number, number] {
  const frame = opts.frame ?? FRAME.light;
  rect(b, x - 1, y - 1, w + 2, h + 2, mix(frame, 0.62));
  rect(b, x, y, w, h, frame);
  const gx = x + 1, gy = y + 1, gw = w - 2, gh = h - 2;
  rect(b, gx, gy, gw, gh, GLASS.mid);
  rect(b, gx, gy, gw, Math.max(1, Math.floor(gh / 2)), GLASS.light);
  for (let i = 0; i < Math.min(gw, gh) - 1; i++) put(b, gx + 1 + i, gy + gh - 2 - i, GLASS.shine);
  rect(b, gx, gy + gh - 1, gw, 1, GLASS.deep);
  if (opts.mullion && gw >= 5) rect(b, gx + Math.floor(gw / 2), gy, 1, gh, frame);
  if (opts.arch !== undefined) {
    put(b, x - 1, y - 1, opts.arch);
    put(b, x + w, y - 1, opts.arch);
    put(b, x, y, mix(frame, 0.62));
    put(b, x + w - 1, y, mix(frame, 0.62));
  }
  rect(b, x - 1, y + h, w + 2, 1, mix(frame, 0.5));
  return [gx, gy, gw, gh];
}
