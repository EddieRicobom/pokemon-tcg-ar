import { describe, expect, it } from 'vitest';
import { lookDirection, lookQuaternion, orientationQuaternion, orientationSmoothingAlpha, visibleVerticalFov } from './orientation';

describe('orientação do celular', () => {
  it('celular de pé (beta 90) olha para a frente, na horizontal', () => {
    const d = lookDirection(orientationQuaternion(0, 90, 0));
    expect(d.y).toBeCloseTo(0, 5);
    expect(d.z).toBeCloseTo(-1, 5);
  });

  it('celular deitado com a tela para cima (beta 0) olha para baixo', () => {
    expect(lookDirection(orientationQuaternion(0, 0, 0)).y).toBeCloseTo(-1, 5);
  });

  it('inclinar o celular para baixo a partir da vertical faz a câmera olhar para baixo', () => {
    expect(lookDirection(orientationQuaternion(0, 60, 0)).y).toBeLessThan(-0.3);
    expect(lookDirection(orientationQuaternion(0, 120, 0)).y).toBeGreaterThan(0.3);
  });

  it('o giro da tela (paisagem) não muda para onde a câmera aponta', () => {
    const a = lookDirection(orientationQuaternion(30, 70, 0, 0));
    const b = lookDirection(orientationQuaternion(30, 70, 0, 90));
    expect(b.distanceTo(a)).toBeLessThan(1e-6);
  });

  it('lookQuaternion: guinada gira no plano horizontal e inclinação positiva olha para cima', () => {
    expect(lookDirection(lookQuaternion(0, 0)).z).toBeCloseTo(-1, 6);
    expect(lookDirection(lookQuaternion(Math.PI / 2, 0)).x).toBeCloseTo(-1, 6);
    expect(lookDirection(lookQuaternion(0, 0.5)).y).toBeGreaterThan(0.4);
  });
});

describe('campo de visão visível', () => {
  it('sem corte quando o contêiner é mais estreito que o vídeo', () => {
    expect(visibleVerticalFov(63, 16 / 9, 9 / 16)).toBeCloseTo(63, 6);
  });
  it('contêiner mais largo que o vídeo corta o alto e o baixo', () => {
    const fov = visibleVerticalFov(63, 1, 2);
    expect(fov).toBeLessThan(63);
    expect(fov).toBeGreaterThan(30);
  });
  it('entradas inválidas devolvem o campo original', () => {
    expect(visibleVerticalFov(63, 0, 1)).toBe(63);
    expect(visibleVerticalFov(63, 1, NaN)).toBe(63);
  });
});

describe('suavização da orientação', () => {
  it('parado filtra bastante e girando acompanha por inteiro', () => {
    expect(orientationSmoothingAlpha(0)).toBeCloseTo(0.18, 9);
    expect(orientationSmoothingAlpha(0.002)).toBeLessThan(0.25);
    expect(orientationSmoothingAlpha(0.2)).toBe(1);
  });
  it('é monótona e fica entre 0,18 e 1', () => {
    let last = 0;
    for (const step of [0, 0.001, 0.01, 0.05, 0.09, 0.5]) {
      const a = orientationSmoothingAlpha(step);
      expect(a).toBeGreaterThanOrEqual(last);
      expect(a).toBeLessThanOrEqual(1);
      last = a;
    }
    expect(orientationSmoothingAlpha(-1)).toBeCloseTo(0.18, 9);
  });
});
