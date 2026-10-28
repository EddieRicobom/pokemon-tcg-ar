import { west } from './west';

/** Terraço e mesas do Café no quadro antigo do gerador (ver `west.ts`); o jogo usa `CAFE_TERRACE` e `CAFE_TABLES`. */
export const BASE_CAFE_TERRACE = { x: 63, y: 26, w: 13, h: 8, counter: { x: 67, y: 25 } } as const;
/** Dois assentos em cada uma das seis mesas, olhando para o tampo ao sul. */
export const BASE_CAFE_TABLES = [
  { id: 'cafe-1', x: 64, y: 27 }, { id: 'cafe-2', x: 68, y: 27 }, { id: 'cafe-3', x: 72, y: 27 },
  { id: 'cafe-4', x: 64, y: 31 }, { id: 'cafe-5', x: 68, y: 31 }, { id: 'cafe-6', x: 72, y: 31 },
] as const;
export const CAFE_TERRACE = { ...west(BASE_CAFE_TERRACE), counter: west(BASE_CAFE_TERRACE.counter) } as const;
export const CAFE_TABLES = BASE_CAFE_TABLES.map(west);
