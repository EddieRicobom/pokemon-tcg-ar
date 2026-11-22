import { describe, expect, it } from 'vitest';
import { killStreakLayout } from './survivor-cinema-art';

/**
 * O contador de abates é desenhado no canvas, abaixo da camada do HUD. O palco estica a view lógica,
 * então a posição precisa ser convertida para pixels CSS: assim ele não fica atrás do mapa/controles
 * nem gigante no celular.
 */
describe('posição do contador de abates da Torre', () => {
  it('no retrato, fica à direita e abaixo da coluna de mapa e controles', () => {
    // Palco 390x520, view lógica 240x320 (fitSurvivorViewport).
    const ratio = 520 / 320;
    const layout = killStreakLayout(240, 320, ratio);
    expect(layout.align).toBe('right');
    expect(layout.x * ratio).toBeCloseTo(390 - 14, 5);
    expect(layout.top * ratio).toBeCloseTo(186, 5);
    expect(layout.size * ratio).toBeCloseTo(30, 5);
    expect(layout.labelSize * ratio).toBeCloseTo(11, 5);
    // O menu da direita termina em ~168 px; o topo do número (186 - 15) começa abaixo dele.
    expect(186 - 15).toBeGreaterThan(168);
  });

  it('na paisagem, usa o topo central livre entre o HUD e o mapa', () => {
    // Palco 844x390, view lógica 519x240.
    const ratio = 390 / 240;
    const ratioX = 844 / 519;
    const layout = killStreakLayout(519, 240, ratio);
    expect(layout.align).toBe('center');
    expect(layout.x * ratioX).toBeCloseTo(844 / 2, 3);
    expect(layout.top * ratio).toBeCloseTo(58, 5);
    expect(layout.size * ratio).toBeCloseTo(30, 5);
    // Fica dentro do palco e longe dos botões de baixo.
    expect(58 - 15).toBeGreaterThan(0);
    expect(58 + 30).toBeLessThan(189);
  });

  it('sem escala válida, usa unidades lógicas como pixels CSS', () => {
    const layout = killStreakLayout(320, 480, 0);
    expect(layout.top).toBe(186);
    expect(layout.size).toBe(30);
    expect(layout.labelSize).toBe(11);
  });
});
