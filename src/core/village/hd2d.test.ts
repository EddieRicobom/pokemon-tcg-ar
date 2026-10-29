import { describe, expect, it } from 'vitest';
import { hd2dDepthBand, hd2dPerspectiveBounds, hd2dPerspectiveScale } from './hd2d';
import { HD2D_AUTO_FPS, HD2D_GROUND_TILT, HD2D_MAX_DPR, hd2dDepthStyle, hd2dFrameRate, hd2dGroundProjection, hd2dOccludes, hd2dOcclusionOpacity, hd2dPixelRatio } from './hd2d';

describe('acabamento 2D-HD da Vila', () => {
  it('diminui o fundo e aumenta o primeiro plano continuamente', () => {
    expect(hd2dPerspectiveScale(0, 800)).toBeCloseTo(0.58);
    expect(hd2dPerspectiveScale(400, 800)).toBeCloseTo(1.05);
    expect(hd2dPerspectiveScale(800, 800)).toBeCloseTo(1.52);
    expect(hd2dPerspectiveScale(-1000, 800)).toBeCloseTo(0.58);
    expect(hd2dPerspectiveScale(9000, 800)).toBeCloseTo(1.52);
    expect(hd2dPerspectiveScale(1, 0)).toBe(1);
  });

  it('conserva os pés e o centro horizontal ao aumentar a fachada', () => {
    const bounds = hd2dPerspectiveBounds({ x: 40, y: 30, w: 20, h: 70 }, 100, 1.5);
    expect(bounds).toEqual({ x: 35, y: -5, w: 30, h: 105 });
    expect(bounds.y + bounds.h).toBe(100);
  });
  it('preserva o foco e limita o acabamento a duas variantes distantes', () => {
    expect(hd2dDepthBand(12, 12)).toBe(0);
    expect(hd2dDepthBand(18, 12)).toBe(0);
    expect(hd2dDepthBand(20, 12)).toBe(1);
    expect(hd2dDepthBand(4, 12)).toBe(1);
    expect(hd2dDepthBand(40, 12)).toBe(2);
  });
  it('mantém o objeto no plano de foco nítido e iluminado', () => {
    expect(hd2dDepthStyle(12, 12)).toEqual({ opacity: 1 });
  });

  it('dá profundidade aos objetos distantes usando apenas opacidade', () => {
    const style = hd2dDepthStyle(26, 12);
    expect(style.opacity).toBeLessThan(1);
    expect(style.opacity).toBeGreaterThanOrEqual(0.78);
  });

  it('revela o treinador só quando a fachada está à frente e cruza sua silhueta', () => {
    const player = { x: 50, y: 80, w: 16, h: 24 };
    expect(hd2dOccludes({ x: 40, y: 50, w: 60, h: 100 }, player, 150)).toBe(true);
    expect(hd2dOccludes({ x: 40, y: 50, w: 60, h: 100 }, player, 100)).toBe(false);
    expect(hd2dOccludes({ x: 100, y: 50, w: 60, h: 100 }, player, 150)).toBe(false);
    expect(hd2dOccludes({ x: 40, y: 110, w: 60, h: 100 }, player, 210)).toBe(false);
  });

  it('limita a cobertura acumulada a 32% mesmo com várias camadas', () => {
    expect(hd2dOcclusionOpacity(0)).toBe(1);
    for (const layers of [1, 2, 5, 20]) {
      const alpha = hd2dOcclusionOpacity(layers);
      expect(1 - (1 - alpha) ** layers).toBeCloseTo(0.32);
    }
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
