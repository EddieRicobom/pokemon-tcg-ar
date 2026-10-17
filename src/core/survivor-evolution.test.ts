import { describe, expect, it } from 'vitest';
import { nextEvolutions, speciesName } from './survivor-evolution';

describe('cadeia de evolução real (PokéAPI)', () => {
  it('segue a cadeia de verdade, inclusive com ramos', () => {
    expect(nextEvolutions(4)).toEqual([5]);
    expect(nextEvolutions(5)).toEqual([6]);
    expect(nextEvolutions(25)).toEqual([26]);
    expect(nextEvolutions(133)).toEqual(expect.arrayContaining([134, 135, 136, 196, 197]));
  });

  it('forma final, número inválido ou sem dado não evoluem (nada inventado)', () => {
    expect(nextEvolutions(6)).toEqual([]);
    expect(nextEvolutions(143)).toEqual([]);
    expect(nextEvolutions(0)).toEqual([]);
    expect(nextEvolutions(99999)).toEqual([]);
  });

  it('dá o nome da espécie', () => {
    expect(speciesName(5)).toBe('Charmeleon');
    expect(speciesName(26)).toBe('Raichu');
    expect(speciesName(99999)).toBe('');
  });
});

describe('stats reais (PokéAPI)', () => {
  it('lê os 6 stats na ordem certa e não inventa quando falta', async () => {
    const { statsOfDex } = await import('./survivor-stats');
    expect(statsOfDex(25)).toEqual({ hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90 });
    expect(statsOfDex(0)).toBeNull();
    expect(statsOfDex(99999)).toBeNull();
  });
});
