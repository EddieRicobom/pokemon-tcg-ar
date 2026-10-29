import { describe, expect, it } from 'vitest';
import { HD2D_AUTO_FPS, HD2D_GROUND_TILT, HD2D_MAX_DPR, hd2dDepthStyle, hd2dFrameRate, hd2dGroundProjection, hd2dNeedsCanvasFilter, hd2dPixelRatio } from './hd2d';

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
    expect(hd2dNeedsCanvasFilter(style)).toBe(true);
  });

  it('reduz a resolução de renderização só quando o estilo 2D-HD está ativo', () => {
    expect(hd2dPixelRatio(3, false)).toBe(2);
    expect(hd2dPixelRatio(3, true)).toBe(HD2D_MAX_DPR);
    expect(hd2dPixelRatio(1, true)).toBe(1);
  });

  it('mantém 60 FPS no automático, mas respeita o limite que a pessoa escolheu', () => {
    expect(hd2dFrameRate(0, true)).toBe(HD2D_AUTO_FPS);
    expect(hd2dFrameRate(30, true)).toBe(30);
    expect(hd2dFrameRate(0, false)).toBe(0);
  });

  it('inclina o chão e conserva o caminho inverso do toque até o mapa', () => {
    const projection = hd2dGroundProjection(100);
    expect(HD2D_GROUND_TILT).toBeLessThan(1);
    expect(projection.screenY).toBeCloseTo(28, 6);
    expect(projection.mapY).toBeCloseTo(357.1429, 3);
    expect(hd2dGroundProjection(projection.screenY).mapY).toBeCloseTo(100, 6);
  });
});
