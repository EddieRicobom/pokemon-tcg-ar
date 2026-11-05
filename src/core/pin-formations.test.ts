import { describe, expect, it } from 'vitest';
import { FORMATION_IDS, formationSlots, isFormationId } from './pin-formations';

describe('formações do Pin Mode', () => {
  it('são 5, e todas cabem no campo sem pins encostados', () => {
    expect(FORMATION_IDS).toHaveLength(5);
    for (const id of FORMATION_IDS) {
      const slots = formationSlots(id, 10);
      expect(slots).toHaveLength(10);
      slots.forEach((slot, i) => {
        expect(Math.hypot(slot.x, slot.y)).toBeLessThan(0.95);
        expect(slot.y).toBeGreaterThan(0);
        for (const other of slots.slice(i + 1)) expect(Math.hypot(slot.x - other.x, slot.y - other.y)).toBeGreaterThan(0.08);
      });
    }
  });

  it('as formações mudam de verdade onde a equipe começa', () => {
    const fronts = FORMATION_IDS.map((id) => formationSlots(id, 3).map((slot) => `${slot.x},${slot.y}`).join('|'));
    expect(new Set(fronts).size).toBe(5);
  });

  it('reconhece só as formações que existem', () => {
    expect(isFormationId('cunha')).toBe(true);
    expect(isFormationId('4-4-2')).toBe(false);
  });
});
