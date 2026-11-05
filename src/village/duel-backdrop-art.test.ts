import { describe, expect, it } from 'vitest';
import { BACKDROP_H, BACKDROP_W, DUEL_THEMES, duelTheme, paintDuelBackdrop, paintDuelPad } from './duel-backdrop-art';

describe('cenário do duelo', () => {
  it('o mesmo oponente sempre cai no mesmo tema', () => {
    expect(duelTheme('Líder Pedra')).toBe(duelTheme('Líder Pedra'));
    expect(DUEL_THEMES).toContain(duelTheme(''));
  });

  it('o cenário cobre o quadro inteiro, e cada tema é diferente', () => {
    const arts = DUEL_THEMES.map(paintDuelBackdrop);
    for (const art of arts) {
      expect([art.w, art.h]).toEqual([BACKDROP_W, BACKDROP_H]);
      for (let i = 3; i < art.data.length; i += 4) expect(art.data[i]).toBe(255);
    }
    expect(new Set(arts.map((art) => art.data.join())).size).toBe(arts.length);
  });

  it('o tablado tem cantos vazios, para não virar um retângulo', () => {
    const pad = paintDuelPad('campo');
    expect(pad.data[3]).toBe(0);
    expect(pad.data[((pad.h >> 1) * pad.w + (pad.w >> 1)) * 4 + 3]).toBe(255);
  });
});
