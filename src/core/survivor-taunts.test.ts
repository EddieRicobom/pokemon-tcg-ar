import { describe, expect, it } from 'vitest';
import { acceptTaunt, isRareBuff, isTauntId, TAUNT_ACCEPT_MS, TAUNT_COOLDOWN_MS, TAUNTS, tauntCooldownLeft, tauntLabel } from './survivor-taunts';

describe('provocações do PvP do Survival', () => {
  it('há de 4 a 6 frases fixas, com id único', () => {
    expect(TAUNTS.length).toBeGreaterThanOrEqual(4);
    expect(TAUNTS.length).toBeLessThanOrEqual(6);
    expect(new Set(TAUNTS.map((t) => t.id)).size).toBe(TAUNTS.length);
    expect(tauntLabel('boa-sorte')).toBe('Boa sorte!');
  });

  it('só aceita ids da lista', () => {
    expect(isTauntId('vem')).toBe(true);
    expect(isTauntId('texto livre')).toBe(false);
    expect(isTauntId(3)).toBe(false);
  });

  it('a recarga de envio dura 3 s e a de recebimento barra inundação', () => {
    expect(tauntCooldownLeft(1000, 1000)).toBe(TAUNT_COOLDOWN_MS);
    expect(tauntCooldownLeft(1000, 2500)).toBe(TAUNT_COOLDOWN_MS - 1500);
    expect(tauntCooldownLeft(1000, 1000 + TAUNT_COOLDOWN_MS)).toBe(0);
    expect(tauntCooldownLeft(-Infinity, 0)).toBe(0);
    expect(acceptTaunt(0, TAUNT_ACCEPT_MS - 1)).toBe(false);
    expect(acceptTaunt(0, TAUNT_ACCEPT_MS)).toBe(true);
  });

  it('buff raro é tudo acima de normal', () => {
    expect(isRareBuff('normal')).toBe(false);
    expect(isRareBuff('raro')).toBe(true);
    expect(isRareBuff('ancestral')).toBe(true);
  });
});
