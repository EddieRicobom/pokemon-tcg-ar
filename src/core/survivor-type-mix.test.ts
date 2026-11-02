import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES } from './pokemon-data';
import { HYPOTHETICAL_TYPE_EFFECTS, hypotheticalSecondaryTypeFor, hypotheticalTypeRuleFor, isTypeExaltation, REPEATED_TYPE_EXALTATIONS } from './survivor-type-mix';

describe('mistura hipotética de tipos', () => {
  it('tabela todos os tipos com efeito, bônus e explicação', () => {
    expect(Object.keys(HYPOTHETICAL_TYPE_EFFECTS)).toHaveLength(POKEMON_TYPES.length);
    for (const type of POKEMON_TYPES) {
      const rule = HYPOTHETICAL_TYPE_EFFECTS[type];
      expect(rule.damageBonus).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(8);
    }
  });

  it('sorteia de forma estável uma mistura ou exaltação quando há repetição', () => {
    let sawExaltation = false;
    for (const type of POKEMON_TYPES) {
      expect(hypotheticalSecondaryTypeFor(type, 123)).toBe(hypotheticalSecondaryTypeFor(type, 123));
      for (let seed = 0; seed < 100; seed++) {
        const secondary = hypotheticalSecondaryTypeFor(type, seed);
        if (!isTypeExaltation(type, secondary)) continue;
        sawExaltation = true;
        expect(hypotheticalTypeRuleFor(type, secondary)).toEqual(REPEATED_TYPE_EXALTATIONS[type]);
      }
    }
    expect(sawExaltation).toBe(true);
  });
});
