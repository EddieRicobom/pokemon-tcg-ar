import { describe, expect, it } from 'vitest';
import { HD2D_GROUND_TILT, hd2dDepthStyle, hd2dGroundProjection } from './hd2d';

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

  it('inclina o chão e conserva o caminho inverso do toque até o mapa', () => {
    const projection = hd2dGroundProjection(100);
    expect(HD2D_GROUND_TILT).toBeLessThan(1);
    expect(projection.screenY).toBe(68);
    expect(projection.mapY).toBeCloseTo(147.0588, 3);
    expect(hd2dGroundProjection(projection.screenY).mapY).toBeCloseTo(100, 6);
  });
});
