import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES } from './pokemon-data';
import { HYPOTHETICAL_TYPE_EFFECTS, hypotheticalSecondaryTypeFor } from './survivor-type-mix';

describe('mistura hipotética de tipos', () => {
  it('tabela todos os tipos com efeito, bônus e explicação', () => {
    expect(Object.keys(HYPOTHETICAL_TYPE_EFFECTS)).toHaveLength(POKEMON_TYPES.length);
    for (const type of POKEMON_TYPES) {
      const rule = HYPOTHETICAL_TYPE_EFFECTS[type];
      expect(rule.damageBonus).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(8);
    }
  });

  it('sorteia de forma estável um segundo tipo diferente do principal', () => {
    for (const type of POKEMON_TYPES) {
      expect(hypotheticalSecondaryTypeFor(type, 123)).not.toBe(type);
      expect(hypotheticalSecondaryTypeFor(type, 123)).toBe(hypotheticalSecondaryTypeFor(type, 123));
    }
  });
});
