import { describe, expect, it } from 'vitest';
import { hd2dDepthStyle } from './hd2d';

describe('acabamento 2D-HD da Vila', () => {
  it('mantém o objeto no plano de foco nítido e iluminado', () => {
    expect(hd2dDepthStyle(12, 12)).toEqual({ blurPx: 0, opacity: 1, brightness: 1 });
  });

  it('desfoca cada objeto distante sem esconder a sua profundidade', () => {
    const style = hd2dDepthStyle(26, 12);
    expect(style.blurPx).toBeGreaterThan(0);
    expect(style.opacity).toBeLessThan(1);
    expect(style.opacity).toBeGreaterThanOrEqual(0.78);
    expect(style.brightness).toBeLessThan(1);
  });
});
