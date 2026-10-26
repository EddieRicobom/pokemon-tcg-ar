import { describe, expect, it } from 'vitest';
import { survivorAttackOf } from './survivor-loadout';
import { attackProfile, moveFor } from './survivor-moves';
import { statsOfDex } from './survivor-stats';

describe('golpes escolhidos para a Torre', () => {
  it('usa o primeiro tipo e oferece o segundo, preservando os atributos', () => {
    const result = survivorAttackOf(1);
    expect(result.types).toEqual(['grass', 'poison']);
    expect(result.move).toEqual(moveFor(['grass', 'poison'], statsOfDex(1)));
    expect(result.profile).toEqual(attackProfile(result.move, statsOfDex(1)));
    expect(result.secondMove?.type).toBe('poison');
  });
  it('inverte os golpes quando o jogador escolhe o segundo tipo', () => {
    const result = survivorAttackOf(1, 'poison');
    expect(result.move.type).toBe('poison');
    expect(result.secondMove?.type).toBe('grass');
  });
  it('não inventa segundo tipo para espécies de um único tipo ou dados ausentes', () => {
    expect(survivorAttackOf(25).secondMove).toBeUndefined();
    const missing = survivorAttackOf(999999);
    expect(missing.types).toEqual([]);
    expect(missing.move.type).toBe('normal');
    expect(missing.move.estimated).toBe(true);
    expect(missing.secondMove).toBeUndefined();
  });
});
