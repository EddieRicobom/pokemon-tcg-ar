import { describe, expect, it } from 'vitest';
import { visibleVerticalFov } from './orientation';
import { backdropAspect, stageVerticalFov } from './stage-view';

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
