import { describe, expect, it } from 'vitest';
import { emptyDigital, grantStarter, summon } from '../core/village/digital';
import { dataCardIdFor, digitalBoxRows, digitalCandidates } from './digital-members';
import { resolveTeam } from './team';

function state() {
  let d = grantStarter(emptyDigital(), { dexId: 1, name: 'Bulbasaur', cardId: 'det1-1' }, '2026-10-16T10:00:00.000Z')!;
  d = summon(d, 600, { dexId: 4, name: 'Charmander', cardId: 'sm7.5-1' }, '2026-10-16T12:00:00.000Z')!.state;
  return d;
}

describe('Digital Pokémon na equipe e na Box', () => {
  it('viram candidatos da equipe (com sprite) e entram na equipe automática pelos mais recentes', () => {
    const d = state();
    const cands = digitalCandidates(d);
    expect(cands.map((c) => c.sprite.state)).toEqual(['ok', 'ok']);
    const card = { id: 'base1-58', lastSeenAt: Date.parse('2026-10-16T11:00:00.000Z'), sprite: { state: 'ok' } };
    const team = resolveTeam([], [card, ...cands]);
    expect(team.ids[0]).toBe(d.instances[1]!.instanceId); // Charmander, o mais recente
    expect(team.ids).toContain('base1-58');
  });

  it('uma equipe escolhida com Digital Pokémon continua valendo (o id não some na limpeza)', () => {
    const d = state();
    const id = d.instances[0]!.instanceId;
    expect(resolveTeam([id], digitalCandidates(d)).ids).toEqual([id]);
    // Sem os candidatos digitais (ex.: o modo Várias, só cartas), o Digital Pokémon fica de fora — sem AR.
    expect(resolveTeam([id], []).ids).toEqual([]);
  });

  it('dados de batalha vêm da carta real de origem; cartas usam o próprio id', () => {
    const d = state();
    expect(dataCardIdFor(d.instances[0]!.instanceId, d)).toBe('det1-1');
    expect(dataCardIdFor('base1-58', d)).toBe('base1-58');
  });

  it('linhas da Box marcadas como digitais, sem referência nem alvo de AR', () => {
    const rows = digitalBoxRows(state());
    expect(rows.map((r) => [r.name, r.digital, r.target.state, r.setName])).toEqual([
      ['Bulbasaur', true, 'unavailable', 'Digital Pokémon'],
      ['Charmander', true, 'unavailable', 'Digital Pokémon'],
    ]);
  });
});
