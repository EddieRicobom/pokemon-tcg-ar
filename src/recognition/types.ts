/** Imagem RGBA em memória (mesmo formato do ImageData, mas sem depender do DOM). */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Point {
  x: number;
  y: number;
}

/** Quadrilátero da carta: topo-esq, topo-dir, baixo-dir, baixo-esq (sentido horário). */
export type Quad = [Point, Point, Point, Point];

/** Tamanho canônico da carta retificada (63 × 88 mm), como no pokeum. */
export const CARD_WIDTH_PX = 630;
export const CARD_HEIGHT_PX = 880;

/** Caixa fracionária (esquerda, topo, direita, base), cada valor em [0, 1]. */
export type FractionBox = readonly [number, number, number, number];
