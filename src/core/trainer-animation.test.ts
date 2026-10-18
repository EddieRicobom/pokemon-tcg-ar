import { describe, expect, it } from 'vitest';
import { TRAINER_ATLAS_ROWS, trainerAtlasBounds, trainerAtlasFrame, validTrainerAtlas } from './trainer-animation';

describe('animação dos treinadores', () => {
  it('recusa dimensões inválidas e aceita células retangulares', () => {
    for (const [w, h] of [[0, 0], [255, 256], [256, 255], [Infinity, 256], [256.5, 256]]) expect(validTrainerAtlas(w!, h!)).toBe(false);
    expect(validTrainerAtlas(256, 384)).toBe(true);
  });

  it('seleciona a direção real sem espelhar e fica parado na primeira coluna', () => {
    TRAINER_ATLAS_ROWS.forEach((dir, row) => expect(trainerAtlasFrame(256, 384, dir, false, 7, 0.8)).toEqual({ x: 0, y: row * 96, width: 64, height: 96 }));
    expect(trainerAtlasFrame(255, 256, 'up', false, 0, 0)).toBeNull();
  });

  it('percorre as quatro poses ao longo de dois passos', () => {
    const columns = [[0, 0], [0, 0.7], [1, 0], [1, 0.7], [2, 0]].map(([steps, progress]) => trainerAtlasFrame(256, 384, 'down', true, steps!, progress!)!.x / 64);
    expect(columns).toEqual([0, 1, 2, 3, 0]);
    expect(trainerAtlasFrame(256, 384, 'down', true, NaN, NaN)?.x).toBe(0);
    expect(trainerAtlasFrame(256, 384, 'down', true, -1, 1)?.x).toBe(64);
  });

  it('anima o repouso com a segunda pose desenhada sem usar os quadros de caminhada', () => {
    expect([0, 1500, 2100, 2400].map((time) => trainerAtlasFrame(256, 320, 'down', false, 0, 0, time)?.x)).toEqual([0, 128, 0, 0]);
    expect(trainerAtlasFrame(256, 320, 'down', false, 0, 0, NaN)?.x).toBe(0);
  });

  it('usa o mesmo recorte em todas as poses para evitar variação de tamanho', () => {
    const pixels = new Uint8ClampedArray(32 * 32 * 4);
    pixels[(2 * 32 + 3) * 4 + 3] = 255;
    pixels[(30 * 32 + 29) * 4 + 3] = 255;
    expect(trainerAtlasBounds(pixels, 32, 32)).toEqual({ x: 3, y: 2, width: 3, height: 5 });
    expect(trainerAtlasBounds(new Uint8ClampedArray(32 * 32 * 4), 32, 32)).toBeNull();
    expect(trainerAtlasBounds(pixels, 31, 32)).toBeNull();
  });
});
