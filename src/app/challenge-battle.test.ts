import { describe, expect, it } from 'vitest';
import { buildFighter } from '../core/battle';
import { GYMS } from '../core/league';
import type { BattleLoader } from './battle-setup';
import { challengePlan, isArenaCreature, isLeaderCreature, leaderCreatureId, leaderFighter, leaderLoader, loadArenaEntries, loadLeaderEntries } from './challenge-battle';

const roark = GYMS[0]!;

describe('desafio de Ginásio na Caixa', () => {
  it('carrega a onda contínua com ids próprios e informa qualquer sprite que falte', async () => {
    const out = await loadArenaEntries(2, 'Operador Pixel', [6, 9, 3, 149, 376, 445], {
      fetchSprite: async (dex) => (dex === 149 ? null : { kind: 'gif', url: `u/${dex}`, blob: new Blob([]) }),
      decode: async (s) => `src:${s.url}`,
    });
    expect(out.entries).toHaveLength(5);
    expect(out.entries.every((entry) => isArenaCreature(entry.info.id))).toBe(true);
    expect(out.failed).toEqual(['Dragonite']);
  });

  it('carrega a equipe do líder; quem falhar fica de fora com o nome', async () => {
    const out = await loadLeaderEntries(roark, {
      fetchSprite: async (dex) => (dex === 95 ? null : { kind: 'gif', url: `u/${dex}`, blob: new Blob([]) }),
      decode: async (s) => `src:${s.url}`,
    });
    expect(out.entries.map((e) => e.info.name)).toEqual(['Geodude', 'Graveler', 'Golem', 'Cranidos', 'Rampardos']);
    expect(out.failed).toEqual(['Onix']);
    expect(out.entries.every((e) => isLeaderCreature(e.info.id))).toBe(true);
    expect(leaderCreatureId(roark, 2)).toBe('lider:gym-0:2');
  });

  it('o líder fica mais forte conforme o desafio, e não reclama de carta', () => {
    const base = buildFighter({ id: 'l', name: 'Onix', profile: { dexId: 95, types: ['rock', 'ground'], stats: { hp: 35, attack: 45, defense: 160, spAttack: 30, spDefense: 45, speed: 70 } }, card: null, gameMoves: [] });
    expect(base.notes.some((n) => n.includes('carta'))).toBe(true);
    const strong = leaderFighter(base, 1.5);
    expect(strong.maxHp).toBeGreaterThan(base.maxHp);
    expect(strong.defense).toBe(Math.round(base.defense * 1.5));
    expect(strong.notes.some((n) => n.includes('ataques da carta'))).toBe(false);
  });

  it('o carregador do líder não consulta carta; o seu continua igual', async () => {
    const asked: string[] = [];
    const base: BattleLoader = async (cardId, _dex, onPart) => {
      asked.push(cardId);
      onPart('card', { state: 'ok', value: { attacks: [] } as never });
    };
    const parts: string[] = [];
    await leaderLoader(base)('lider:gym-0:0', 74, (part, r) => parts.push(`${part}:${r.state}`));
    expect(parts).toEqual(['card:error']);
    const mine: string[] = [];
    await leaderLoader(base)('base1-58', 25, (part, r) => mine.push(`${part}:${r.state}`));
    expect(mine).toEqual(['card:ok']);
  });

  it('plano: você contra o líder, em revezamento, com nomes e faixa', () => {
    const plan = challengePlan(4, 3, roark, 'Eddie');
    expect(plan.picks).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(plan.teams).toEqual([0, 0, 0, 0, 1, 1, 1]);
    expect(plan.relay).toBe(true);
    expect(plan.teamNames).toEqual(['Eddie', 'Roark']);
    expect(plan.banner.text).toContain('Roark');
  });
});
