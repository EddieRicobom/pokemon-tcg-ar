/** Matemática do brilho do Pokémon shiny (halo dourado e estrelinhas), sem nada de Three.js, para testar. */

/** Opacidade do halo a `r` do centro (0 = centro, 1 = borda do quadrado): forte perto do Pokémon e some até a borda. */
export function haloAlpha(r: number): number {
  if (!(r < 1)) return 0;
  const clamped = Math.max(0, r);
  return Math.pow(1 - clamped, 1.7) * 0.95;
}

/** Opacidade de uma estrela de quatro pontas no quadrado [-1, 1]² (pontas longas e finas, miolo claro). */
export function starAlpha(x: number, y: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax >= 1 || ay >= 1) return 0;
  // Astroide: |x|^p + |y|^p = 1 com p < 1 desenha pontas finas.
  const p = 0.55;
  const d = Math.pow(ax, p) + Math.pow(ay, p);
  if (d >= 1) return 0;
  return Math.pow(1 - d, 1.2);
}

export interface Sparkle {
  /** Posição no plano do Pokémon (−0,5…0,5 é a largura/altura do sprite). */
  x: number;
  y: number;
  /** Tamanho (fração da largura do sprite). */
  size: number;
  /** 0…1: a estrela pisca. */
  alpha: number;
}

/** Estrelinha `i` de `count` no instante `seconds`: gira devagar em volta do Pokémon e pisca em tempos diferentes. */
export function sparkleAt(i: number, count: number, seconds: number): Sparkle {
  const turn = (i / Math.max(1, count)) * Math.PI * 2 + seconds * 0.55;
  const radius = 0.56 + 0.07 * Math.sin(seconds * 1.3 + i * 2.1);
  const twinkle = Math.pow(Math.max(0, Math.sin(seconds * 3.1 + i * 1.9)), 2);
  return { x: Math.cos(turn) * radius * 0.95, y: Math.sin(turn) * radius, size: 0.1 + 0.13 * twinkle, alpha: twinkle };
}

/** Pulsação suave do halo (0,75…1). */
export function haloPulse(seconds: number): number {
  return 0.875 + 0.125 * Math.sin(seconds * 2.2);
}
