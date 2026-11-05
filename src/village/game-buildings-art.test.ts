import { describe, expect, it } from 'vitest';
import { GAME_BUILDINGS, paintDigitalTower } from './game-buildings-art';

describe('prédios dos modos de jogo', () => {
  it('cada prédio tem desenho próprio, e os baixos têm o mesmo tamanho', () => {
    const arts = Object.values(GAME_BUILDINGS).map((art) => art.paint());
    expect(new Set(arts.map((buf) => Buffer.from(buf.data).toString('base64'))).size).toBe(arts.length);
    for (const kind of ['arcade', 'pins', 'masmorra']) {
      const buf = GAME_BUILDINGS[kind]!.paint();
      expect([buf.w, buf.h]).toEqual([80, 72]);
    }
  });

  it('a Torre é bem mais alta que larga', () => {
    const tower = paintDigitalTower();
    expect(tower.h).toBeGreaterThan(tower.w * 1.8);
  });

  it('as janelas que acendem à noite ficam dentro do desenho', () => {
    for (const art of Object.values(GAME_BUILDINGS)) {
      const buf = art.paint();
      for (const [x, y, w, h] of art.windows) {
        expect(x + w).toBeLessThanOrEqual(buf.w);
        expect(y + h).toBeLessThanOrEqual(buf.h);
      }
    }
  });

  it('o prédio chega ao chão: a última linha tem pixels', () => {
    for (const art of Object.values(GAME_BUILDINGS)) {
      const buf = art.paint();
      let opaque = 0;
      for (let x = 0; x < buf.w; x++) if (buf.data[((buf.h - 1) * buf.w + x) * 4 + 3]! > 0) opaque++;
      expect(opaque).toBeGreaterThan(buf.w / 3);
    }
  });
});
