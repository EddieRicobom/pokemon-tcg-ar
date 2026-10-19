import { describe, expect, it } from 'vitest';
import { fitSurvivorViewport } from './survivor-camera';

describe('câmera da Torre', () => {
  it('aproxima cerca de 50% e preserva a proporção do aparelho', () => {
    const portrait = fitSurvivorViewport(360, 800, 960, 640);
    const landscape = fitSurvivorViewport(1100, 700, 960, 640);
    expect(portrait).toEqual({ w: 240, h: 533 });
    expect(landscape).toEqual({ w: 377, h: 240 });
    expect(landscape.w / landscape.h).toBeCloseTo(1100 / 700, 1);
  });

  it('não mostra além da arena e trata dimensões inválidas com segurança', () => {
    expect(fitSurvivorViewport(2000, 2000, 960, 640)).toEqual({ w: 240, h: 240 });
    expect(fitSurvivorViewport(0, 800, 960, 640)).toEqual({ w: 0, h: 0 });
  });
});
