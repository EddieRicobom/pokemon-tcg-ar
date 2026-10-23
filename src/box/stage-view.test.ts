import { describe, expect, it } from 'vitest';
import { visibleVerticalFov } from './orientation';
import { backdropAspect, stageVerticalFov, VIRTUAL_MAX_HALF_M, VIRTUAL_YAW_RAD, virtualHalfSize, virtualPitchRad } from './stage-view';
import { minBoxDistance } from './floor';
import { Vector3 } from 'three';
import { ARENA_MAX_DISTANCE } from './arena';
import { DEFAULT_PHONE_HEIGHT_M, intersectFloor } from './floor';
import { lookQuaternion } from './orientation';

describe('palco da Caixa com e sem vídeo', () => {
  it('com vídeo, a proporção do fundo é a do vídeo', () => {
    expect(backdropAspect(390, 844, { videoWidth: 1280, videoHeight: 720 })).toBeCloseTo(16 / 9, 6);
  });

  it('sem vídeo, ou com o vídeo ainda sem tamanho, a proporção é a do palco', () => {
    expect(backdropAspect(400, 800)).toBe(0.5);
    expect(backdropAspect(400, 800, null)).toBe(0.5);
    expect(backdropAspect(400, 800, { videoWidth: 0, videoHeight: 0 })).toBe(0.5);
    expect(backdropAspect(400, 800, { videoWidth: 640, videoHeight: 0 })).toBe(0.5);
  });

  it('sem vídeo o campo de visão é o próprio campo pedido (nada é cortado)', () => {
    for (const [w, h] of [[390, 844], [844, 390], [800, 800]] as const) expect(stageVerticalFov(w, h, 63)).toBeCloseTo(63, 6);
  });

  it('com vídeo, o campo visível é o de antes: o mesmo cálculo do "cover"', () => {
    const video = { videoWidth: 640, videoHeight: 480 };
    // Palco mais largo que o vídeo: sobe e desce são cortados e o campo vertical diminui.
    expect(stageVerticalFov(900, 400, 63, video)).toBeCloseTo(visibleVerticalFov(63, 640 / 480, 900 / 400), 9);
    expect(stageVerticalFov(900, 400, 63, video)).toBeLessThan(63);
    // Palco mais estreito que o vídeo: nada cortado em cima e embaixo.
    expect(stageVerticalFov(390, 844, 63, video)).toBeCloseTo(63, 6);
  });

  it('antes de o vídeo carregar, o campo é o mesmo de não ter vídeo', () => {
    expect(stageVerticalFov(900, 400, 63, { videoWidth: 0, videoHeight: 0 })).toBe(stageVerticalFov(900, 400, 63));
  });
});

describe('câmera do palco virtual', () => {
  it('olha para baixo para o centro da tela encontrar o chão onde a arena da batalha é posta', () => {
    const pitch = virtualPitchRad(DEFAULT_PHONE_HEIGHT_M, ARENA_MAX_DISTANCE);
    expect(pitch).toBeLessThan(0);
    const forward = new Vector3(0, 0, -1).applyQuaternion(lookQuaternion(VIRTUAL_YAW_RAD, pitch));
    const hit = intersectFloor(forward, DEFAULT_PHONE_HEIGHT_M);
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      expect(Math.hypot(hit.point.x, hit.point.z)).toBeCloseTo(ARENA_MAX_DISTANCE, 6);
      expect(hit.point.x).toBeCloseTo(0, 9);
      expect(hit.point.z).toBeLessThan(0);
    }
  });

  it('uma câmera mais alta olha mais para baixo para chegar ao mesmo ponto', () => {
    expect(virtualPitchRad(2, 3.2)).toBeLessThan(virtualPitchRad(1, 3.2));
  });
});

describe('tamanho da caixa no palco virtual', () => {
  it('uma caixa grande demais é limitada para a caixa nunca ser afastada além da arena', () => {
    expect(virtualHalfSize(3)).toBe(VIRTUAL_MAX_HALF_M);
    expect(minBoxDistance(virtualHalfSize(3))).toBeLessThanOrEqual(ARENA_MAX_DISTANCE + 1e-9);
    expect(virtualHalfSize(1.2)).toBe(1.2);
  });

  it('o tamanho padrão (2,4 m de lado) cabe sem ser limitado', () => {
    expect(2.4 / 2).toBeLessThan(VIRTUAL_MAX_HALF_M);
  });
});
