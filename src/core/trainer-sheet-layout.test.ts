import { describe, expect, it } from 'vitest';
import { sheetCuts } from './trainer-sheet-layout';

function profile(length: number, intervals: readonly (readonly [number, number])[]): number[] {
  return Array.from({ length }, (_, index) => intervals.some(([start, end]) => index >= start && index < end) ? 12 : 0);
}

describe('recortes de folhas por transparência', () => {
  it('corrige divisões nominais que atravessam pés ou cabelo', () => {
    const histogram = profile(400, [[5, 105], [115, 205], [215, 315], [325, 395]]);
    expect(sheetCuts(histogram)).toEqual([0, 110, 210, 320, 400]);
  });

  it('mantém cada pixel opaco na sua banda sem recortar a personagem', () => {
    const intervals = [[4, 112], [122, 208], [218, 309], [319, 397]] as const;
    const histogram = profile(400, intervals);
    const cuts = sheetCuts(histogram)!;
    for (let band = 0; band < intervals.length; band++) {
      const [first, end] = intervals[band]!;
      expect(cuts[band]).toBeLessThanOrEqual(first);
      expect(cuts[band + 1]).toBeGreaterThanOrEqual(end);
      if (band > 0) expect(histogram[cuts[band]!]).toBe(0);
    }
  });

  it('ignora um sulco transparente de um pixel dentro da personagem', () => {
    const histogram = profile(400, [[4, 90], [110, 190], [210, 290], [310, 396]]);
    histogram[98] = 0;
    histogram[150] = 0;
    expect(sheetCuts(histogram)).toEqual([0, 100, 200, 300, 400]);
  });

  it('rejeita bandas encostadas, ausência de corredor e divisões distantes', () => {
    expect(sheetCuts(Array(400).fill(12))).toBeNull();
    expect(sheetCuts(profile(400, [[5, 100], [101, 200], [201, 300], [301, 395]]))).toBeNull();
    expect(sheetCuts(profile(400, [[5, 150], [160, 240], [250, 330], [340, 395]]))).toBeNull();
  });

  it('rejeita perfis vazios, valores inválidos e número de bandas inválido', () => {
    for (const histogram of [[], [0, 0, 0, 0], [1, NaN, 0, 1], [1, Infinity], [1, -1]]) {
      expect(sheetCuts(histogram)).toBeNull();
    }
    expect(sheetCuts([1, 0, 0, 1], 0)).toBeNull();
    expect(sheetCuts([1, 0, 0, 1], 1.5)).toBeNull();
  });

  it('funciona com outro número de bandas e retorna limites exclusivos', () => {
    expect(sheetCuts(profile(60, [[3, 25], [35, 57]]), 2)).toEqual([0, 30, 60]);
    expect(sheetCuts([0, 2, 2, 0], 1)).toEqual([0, 4]);
  });
});
