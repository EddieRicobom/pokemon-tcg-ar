import { describe, expect, it } from 'vitest';
import { hourOf, skyFor } from './sky';

const channels = (css: string) => css.match(/\d+/g)!.map(Number);
const brightness = (css: string) => channels(css).reduce((sum, v) => sum + v, 0);

describe('skyFor', () => {
  it('o meio-dia é claro e sem estrelas; a meia-noite é escura e estrelada', () => {
    const noon = skyFor(13);
    const midnight = skyFor(0);
    expect(brightness(noon.top)).toBeGreaterThan(brightness(midnight.top));
    expect(noon.stars).toBe(0);
    expect(noon.night).toBe(0);
    expect(midnight.stars).toBe(1);
    expect(midnight.night).toBe(1);
    expect(midnight.ambient[0]).toBeLessThan(noon.ambient[0]);
  });

  it('não dá salto na virada do dia nem entre as faixas', () => {
    for (let h = 0; h < 24; h += 0.1) {
      const a = skyFor(h).ambient;
      const b = skyFor(h + 0.1).ambient;
      for (let c = 0; c < 3; c++) expect(Math.abs(a[c]! - b[c]!)).toBeLessThan(0.08);
    }
    expect(skyFor(24).top).toBe(skyFor(0).top);
  });

  it('a luz nunca apaga os Pokémon nem estoura', () => {
    for (let h = 0; h < 24; h += 0.25) {
      for (const v of skyFor(h).ambient) {
        expect(v).toBeGreaterThan(0.55);
        expect(v).toBeLessThan(1.1);
      }
    }
  });

  it('nuvem acinzenta, chuva escurece e céu fechado esconde as estrelas', () => {
    const [r, , b] = channels(skyFor(13, 1, 0).top);
    const [cr, , cb] = channels(skyFor(13, 0, 0).top);
    expect(Math.abs(r! - b!)).toBeLessThan(Math.abs(cr! - cb!));
    expect(brightness(skyFor(13, 1, 1).mid)).toBeLessThan(brightness(skyFor(13, 1, 0).mid));
    expect(skyFor(0, 1, 0).stars).toBe(0);
    expect(skyFor(0, 1, 0).night).toBe(1);
  });

  it('aceita hora fora da faixa e inválida sem quebrar', () => {
    expect(skyFor(-1).top).toBe(skyFor(23).top);
    expect(skyFor(Number.NaN).top).toBe(skyFor(12).top);
    expect(hourOf(new Date(2026, 0, 1, 18, 30))).toBe(18.5);
  });
});
