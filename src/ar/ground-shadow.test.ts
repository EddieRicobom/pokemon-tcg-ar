import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT } from './anchor';
import { groundGlowAlpha, groundShadowAlpha, groundShadowSize, SHADOW_OPACITY } from './ground-shadow';

describe('sombra do Pokémon no chão', () => {
  it('é mais escura no centro, some suavemente e vale 0 na borda e fora dela', () => {
    expect(groundShadowAlpha(0, 0)).toBeCloseTo(1, 9);
    const steps = [0, 0.25, 0.5, 0.75, 0.95].map((r) => groundShadowAlpha(r, 0));
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeLessThan(steps[i - 1]!);
    expect(groundShadowAlpha(1, 0)).toBe(0);
    expect(groundShadowAlpha(0.8, 0.8)).toBe(0);
    // Borda borrada: a transição não é um degrau.
    expect(groundShadowAlpha(0.6, 0)).toBeGreaterThan(0.05);
    expect(groundShadowAlpha(0.6, 0)).toBeLessThan(0.5);
  });

  it('o brilho é um anel fino: fraco no centro, forte perto de 0,78, zero fora', () => {
    expect(groundGlowAlpha(0, 0)).toBeLessThan(0.01);
    expect(groundGlowAlpha(0.78, 0)).toBeGreaterThan(0.8);
    expect(groundGlowAlpha(0, -0.78)).toBeCloseTo(groundGlowAlpha(0.78, 0), 9);
    expect(groundGlowAlpha(1.2, 0)).toBe(0);
  });

  it('acompanha a largura do sprite e a pegada da inclinação', () => {
    const base = groundShadowSize({ ...DEFAULT_LAYOUT, heightRatio: 0.7 }, 1);
    const wide = groundShadowSize({ ...DEFAULT_LAYOUT, heightRatio: 0.7 }, 2);
    expect(wide.width).toBeCloseTo(base.width * 2, 9);
    const standing = groundShadowSize({ ...DEFAULT_LAYOUT, heightRatio: 0.7, tiltDeg: 0 }, 1);
    expect(base.depth).toBeGreaterThan(standing.depth);
    expect(base.opacity).toBeCloseTo(SHADOW_OPACITY, 9);
  });

  it('limita o tamanho e a proporção inválida, e enfraquece quando o Pokémon sobe', () => {
    expect(groundShadowSize({ ...DEFAULT_LAYOUT, heightRatio: 1.6 }, 10).width).toBe(1.6);
    expect(groundShadowSize({ ...DEFAULT_LAYOUT, heightRatio: 0.15 }, 0.1).width).toBeGreaterThanOrEqual(0.2);
    expect(groundShadowSize(DEFAULT_LAYOUT, Number.NaN).width).toBeGreaterThan(0);
    const high = groundShadowSize({ ...DEFAULT_LAYOUT, lift: 1 }, 1);
    expect(high.opacity).toBeLessThan(SHADOW_OPACITY * 0.5);
    expect(high.opacity).toBeGreaterThan(0);
  });
});
