import { describe, expect, it } from 'vitest';
import { metallicTint, SHEEN_PERIOD_MS, SHEEN_SWEEP_MS, sheenAt, sheenOffset } from './metallic';

describe('acabamento metálico dos Digital Pokémon', () => {
  it('não mexe no alfa nem em pixels transparentes', () => {
    const src = [200, 30, 40, 0, 200, 30, 40, 128];
    const out = metallicTint(src);
    expect(out[0]).toBe(200);
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(128);
  });

  it('é leve: puxa a cor para o aço sem apagar a cor original', () => {
    const red = [220, 40, 40, 255];
    const out = metallicTint(red);
    // Continua mais vermelho do que azul (a espécie segue reconhecível)…
    expect(out[0]!).toBeGreaterThan(out[2]!);
    // …mas menos saturado que antes.
    expect(out[0]! - out[2]!).toBeLessThan(220 - 40);
  });

  it('um cinza vira um cinza levemente frio (mais azul que vermelho)', () => {
    const out = metallicTint([128, 128, 128, 255]);
    expect(out[2]!).toBeGreaterThan(out[0]!);
  });

  it('mistura 0 devolve a imagem original', () => {
    const src = [12, 200, 99, 255];
    expect([...metallicTint(src, 0)]).toEqual(src);
  });

  it('o brilho passa por um instante e some no resto do ciclo', () => {
    expect(sheenAt(0)).toBe(0);
    expect(sheenAt(SHEEN_SWEEP_MS / 2)).toBeCloseTo(0.5);
    expect(sheenAt(SHEEN_SWEEP_MS + 1)).toBeNull();
    expect(sheenAt(SHEEN_PERIOD_MS + 10)).toBeCloseTo(10 / SHEEN_SWEEP_MS);
    expect(sheenAt(-10)).toBeNull();
  });

  it('o desencontro por id é estável e fica dentro do ciclo', () => {
    expect(sheenOffset('dp_1_25_0')).toBe(sheenOffset('dp_1_25_0'));
    expect(sheenOffset('dp_1_25_0')).toBeGreaterThanOrEqual(0);
    expect(sheenOffset('dp_1_25_0')).toBeLessThan(SHEEN_PERIOD_MS);
  });
});
