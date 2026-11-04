import { describe, expect, it } from 'vitest';
import { survivorAttackOf, survivorSupportMove } from './survivor-loadout';
import { attackProfile, moveFor, rankedCategories } from './survivor-moves';
import { typesOfDex } from './species-filter';
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

describe('golpe de apoio', () => {
  it('nunca entrega Teleporte a um apoio: troca pelo golpe alternativo da espécie', () => {
    const teleport = { ...moveFor(typesOfDex(25), statsOfDex(25)), category: 'teleporte' as const };
    const swapped = survivorSupportMove(25, teleport);
    expect(swapped.category).not.toBe('teleporte');
    expect(swapped.category).toBe(rankedCategories(teleport.type, statsOfDex(25)).find((c) => c !== 'teleporte'));
  });

  it('mantém qualquer outro golpe como está', () => {
    const move = moveFor(typesOfDex(1), statsOfDex(1));
    expect(survivorSupportMove(1, move)).toBe(move);
  });
});
