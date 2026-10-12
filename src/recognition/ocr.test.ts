import { describe, expect, it } from 'vitest';
import { prepareForOcr } from './ocr';
import type { RgbaImage } from './types';

function strip(width: number, height: number, background: number, ink: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const isInk = y > height * 0.4 && y < height * 0.6 && x % 8 < 3;
      const v = isInk ? ink : background;
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('prepareForOcr', () => {
  it('amplia faixas baixas e mantém o proporção', () => {
    const out = prepareForOcr(strip(630, 88, 220, 40));
    expect(out.height).toBeGreaterThanOrEqual(96);
    expect(out.width / out.height).toBeCloseTo(630 / 88, 1);
  });

  it('texto claro sobre fundo escuro é invertido para escuro sobre claro', () => {
    const out = prepareForOcr(strip(200, 100, 20, 235));
    // Fundo vira claro: pixel de canto é ~255.
    expect(out.data[0]).toBeGreaterThan(240);
  });

  it('texto escuro sobre fundo claro permanece', () => {
    const out = prepareForOcr(strip(200, 100, 230, 30));
    expect(out.data[0]).toBeGreaterThan(240);
  });

  it('estica o contraste', () => {
    const out = prepareForOcr(strip(200, 100, 150, 120));
    const values = new Set<number>();
    for (let i = 0; i < out.data.length; i += 4) values.add(out.data[i] ?? 0);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(200);
  });

  it('binariza em preto e branco puros', () => {
    const out = prepareForOcr(strip(200, 100, 200, 60), 96, true);
    const values = new Set<number>();
    for (let i = 0; i < out.data.length; i += 4) values.add(out.data[i] ?? 0);
    expect([...values].sort()).toEqual([0, 255]);
    expect(out.data[0]).toBe(255);
  });
});
