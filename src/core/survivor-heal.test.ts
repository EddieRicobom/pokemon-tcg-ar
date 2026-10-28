import { describe, expect, it } from 'vitest';
import { healersReaching, healShare, SUPPORT_HEAL_FRACTION } from './survivor-heal';

describe('cura dos suportes inimigos', () => {
  it('um curador sozinho cura a fração cheia da vida máxima', () => {
    expect(healShare(200, 1)).toBe(Math.round(200 * SUPPORT_HEAL_FRACTION));
  });

  it('a cura total que um alvo recebe não cresce com o número de curadores em volta', () => {
    const maxHp = 400;
    const full = healShare(maxHp, 1);
    for (let n = 2; n <= 8; n++) {
      const total = healShare(maxHp, n) * n;
      expect(total, `${n} curadores`).toBeLessThanOrEqual(full + n);
    }
  });

  it('cada curador cura menos quando há mais curadores juntos', () => {
    expect(healShare(300, 4)).toBeLessThan(healShare(300, 2));
    expect(healShare(300, 2)).toBeLessThan(healShare(300, 1));
  });

  it('nunca cura zero (mínimo de 1 de vida)', () => {
    expect(healShare(5, 50)).toBe(1);
  });

  it('conta só os curadores vivos dentro do raio do alvo', () => {
    const target = { x: 0, y: 0 };
    // (80, 80) fica a ~113 px, fora do raio de 110; (200, 0) também.
    const healers = [{ x: 10, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 0 }, { x: 80, y: 80 }];
    expect(healersReaching(target, healers)).toBe(2);
    expect(healersReaching(target, [])).toBe(0);
  });
});
