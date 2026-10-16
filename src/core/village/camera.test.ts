import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W } from './map';
import { villageScale } from './camera';

const tilesAcross = (w: number, dpr: number) => (w * dpr) / (16 * villageScale(w, 760, dpr));

describe('zoom da câmera da Vila', () => {
  it('no celular em pé continua igual a antes (uns 11 blocos na largura)', () => {
    // Fórmula antiga: round(largura × dpr / (16 × 11)).
    for (const [w, dpr] of [[390, 3], [360, 2], [412, 2.625]] as const) {
      expect(villageScale(w, 700, dpr)).toBe(Math.max(2, Math.round((w * dpr) / (16 * 11))));
    }
  });

  it('no desktop a câmera fica mais afastada: bem mais que 11 blocos na largura', () => {
    expect(tilesAcross(1280, 1)).toBeGreaterThanOrEqual(18);
    expect(tilesAcross(1920, 1)).toBeGreaterThanOrEqual(18);
    expect(tilesAcross(1440, 2)).toBeGreaterThanOrEqual(18);
  });

  it('nunca mostra mais que o mapa inteiro', () => {
    const w = 4000;
    const h = 2400;
    const scale = villageScale(w, h, 1);
    expect(w / (16 * scale)).toBeLessThanOrEqual(MAP_W);
    expect(h / (16 * scale)).toBeLessThanOrEqual(MAP_H);
  });

  it('a escala é sempre inteira (pixel art nítida) e pelo menos 2', () => {
    const s = villageScale(200, 150, 1);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(2);
  });
});
