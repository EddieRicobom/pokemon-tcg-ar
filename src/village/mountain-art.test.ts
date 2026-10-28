import { describe, expect, it } from 'vitest';
import { MEW_STATUE_GLOW, MEW_STATUE_H, MEW_STATUE_W, paintMewStatue } from './mountain-art';
import type { PixelBuf } from '../box/ground-art';

const alpha = (b: PixelBuf, x: number, y: number) => b.data[(y * b.w + x) * 4 + 3]!;

describe('estátua do Mew', () => {
  const art = paintMewStatue();

  it('tem o tamanho anunciado, fundo transparente e desenho de verdade', () => {
    expect([art.w, art.h]).toEqual([MEW_STATUE_W, MEW_STATUE_H]);
    let opaque = 0;
    for (let i = 3; i < art.data.length; i += 4) if (art.data[i]! > 0) opaque++;
    expect(opaque).toBeGreaterThan(art.w * art.h * 0.35);
    expect(opaque).toBeLessThan(art.w * art.h);
    expect(alpha(art, 0, 0)).toBe(0);
  });

  it('pisa no chão: o degrau do pedestal ocupa a última linha', () => {
    let bottom = 0;
    for (let x = 0; x < art.w; x++) if (alpha(art, x, art.h - 1) > 0) bottom++;
    expect(bottom).toBeGreaterThan(art.w * 0.75);
  });

  it('a cauda sobe acima da cabeça, à direita (silhueta do Mew)', () => {
    let tailTop = art.h;
    for (let y = 0; y < art.h && tailTop === art.h; y++) for (let x = 23; x < art.w; x++) if (alpha(art, x, y) > 0) { tailTop = y; break; }
    expect(tailTop).toBeLessThanOrEqual(2);
  });

  it('é de pedra: nenhuma cor viva', () => {
    for (let i = 0; i < art.data.length; i += 4) {
      if (!art.data[i + 3]) continue;
      const r = art.data[i]!, g = art.data[i + 1]!, b = art.data[i + 2]!;
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(48);
    }
  });

  it('a luz da noite (os olhos) cai dentro do desenho, em cima de pedra', () => {
    const g = MEW_STATUE_GLOW;
    expect(g.x + g.w).toBeLessThanOrEqual(art.w);
    expect(g.y + g.h).toBeLessThanOrEqual(art.h);
    expect(g.w * g.h).toBeLessThanOrEqual(24);
    expect(alpha(art, g.x, g.y)).toBe(255);
  });

  it('é sempre o mesmo desenho (sem sorteio)', () => {
    expect(paintMewStatue().data).toEqual(art.data);
  });
});
