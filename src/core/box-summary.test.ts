import { describe, expect, it } from 'vitest';
import { boxSummary, MOVE_FORM_LABELS } from './box-summary';

describe('ficha do Pokémon na seleção', () => {
  it('traz tipos, atributos reais e os dois ataques', () => {
    const summary = boxSummary(6);
    expect(summary.types.map((t) => t.type)).toEqual(['fire', 'flying']);
    expect(summary.stats?.map((s) => s.label)).toEqual(['PS', 'Ataque', 'Defesa', 'At. esp.', 'Def. esp.', 'Veloc.']);
    expect(summary.stats?.[3]?.value).toBe(109);
    expect(summary.total).toBe(534);
    expect(summary.main.typeLabel).not.toBe(summary.second.typeLabel);
    expect(Object.values(MOVE_FORM_LABELS)).toContain(summary.main.form);
  });

  it('as barras ficam entre 0 e 100', () => {
    for (const stat of boxSummary(113).stats ?? []) {
      expect(stat.pct).toBeGreaterThan(0);
      expect(stat.pct).toBeLessThanOrEqual(100);
    }
  });

  it('sem dados da espécie, a ficha diz que eles faltam', () => {
    const summary = boxSummary(99999);
    expect(summary.stats).toBeNull();
    expect(summary.total).toBeNull();
  });
});
