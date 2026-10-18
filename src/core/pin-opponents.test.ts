import { describe, expect, it } from 'vitest';
import { randomOpponents, pinStrength } from './pin-opponents';
import { seededRng } from './battle';
import type { PinSpec } from './pins';

const spec = (id: string, stat = 70): PinSpec => ({ id, name: id, types: [], weightKg: 20, stats: { hp: stat, attack: stat, defense: stat, spAttack: stat, spDefense: stat, speed: stat } });
describe('adversários sorteados', () => {
  it('funciona com só um Pokémon, sem repetir e respeitando o limite', () => {
    const p = spec('a');
    expect(randomOpponents([p], [p, p], 'normal', seededRng(1))).toEqual([p]);
    expect(randomOpponents([], [p], 'normal', seededRng(1))).toEqual([]);
    expect(randomOpponents([p], [], 'normal', seededRng(1))).toEqual([]);
  });
  it('no difícil procura força próxima sem alterar os atributos', () => {
    const mine = [spec('a'), spec('b'), spec('c')];
    const pool = Array.from({ length: 15 }, (_, i) => spec(`p${i}`));
    const enemy = randomOpponents(mine, pool, 'dificil', seededRng(5));
    expect(enemy).toHaveLength(3);
    expect(enemy.reduce((n, p) => n + pinStrength(p), 0)).toBeCloseTo(mine.reduce((n, p) => n + pinStrength(p), 0));
    expect(new Set(enemy.map((p) => p.id)).size).toBe(enemy.length);
    expect(enemy.every((p) => pool.includes(p))).toBe(true);
    expect(randomOpponents(mine, pool, 'normal', seededRng(1))).not.toEqual(randomOpponents(mine, pool, 'normal', seededRng(2)));
  });
});
