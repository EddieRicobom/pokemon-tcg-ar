import { describe, expect, it } from 'vitest';
import { buildFighter, seededRng, simulateBattle } from '../core/battle';
import type { BaseStats } from '../core/pokemon-data';
import { boxPvpBattle, parseFighter, sideSizes } from './box-wire';
import type { BoxPvpTeam } from './box-wire';
import { encodeMessage, parseMessage } from './wire';

const stats = (o: Partial<BaseStats> = {}): BaseStats => ({ hp: 70, attack: 80, defense: 70, spAttack: 60, spDefense: 70, speed: 75, ...o });
const fighter = (id: string, type: 'fire' | 'water' | 'grass' = 'fire') => buildFighter({ id, name: id, profile: { dexId: 4, types: [type], stats: stats() }, card: null, gameMoves: [{ name: 'brasa', type, power: 40, accuracy: 100, pp: 25, damageClass: 'special' }] });
const team = (name: string, n: number, type: 'fire' | 'water' = 'fire'): BoxPvpTeam => ({
  name, trainer: 'lucas', mons: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Mon${i}`, sprite: 4 + i, shiny: i === 0, fighter: fighter(`c${i}`, type) })),
});

describe('PvP da Caixa: mensagens', () => {
  it('a equipe vai e volta pelo fio sem perder nada', () => {
    const msg = { t: 'cx-team' as const, team: team('Ana', 3), placed: true };
    const back = parseMessage(encodeMessage(msg));
    expect(back).toEqual(msg);
  });

  it('recusa lutador com números absurdos ou campos estranhos', () => {
    const f = fighter('x');
    expect(parseFighter(f)).toEqual(f);
    expect(parseFighter({ ...f, attack: 99999 })).toBeNull();
    expect(parseFighter({ ...f, types: ['laser'] })).toBeNull();
    expect(parseFighter({ ...f, moves: [] })).toBeNull();
    expect(parseFighter({ ...f, personality: 'malvado' })).toBeNull();
    expect(parseMessage(encodeMessage({ t: 'cx-team', team: { ...team('A', 7) }, placed: false }))).toBeNull();
  });

  it('início: modo, semente e tamanhos válidos', () => {
    expect(parseMessage(JSON.stringify({ t: 'cx-start', mode: '3x3', seed: 123, host: 3, guest: 2 }))).toEqual({ t: 'cx-start', mode: '3x3', seed: 123, host: 3, guest: 2 });
    expect(parseMessage(JSON.stringify({ t: 'cx-start', mode: '9x9', seed: 1, host: 1, guest: 1 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'cx-start', mode: '1x1', seed: -4, host: 1, guest: 1 }))).toBeNull();
  });
});

describe('PvP da Caixa: a mesma luta nos dois celulares', () => {
  it('tamanho de cada lado pelo modo e pelo que cada um tem', () => {
    expect(sideSizes('1x1', 6, 6)).toEqual({ host: 1, guest: 1 });
    expect(sideSizes('3x3', 6, 2)).toEqual({ host: 3, guest: 2 });
    expect(sideSizes('6x6', 4, 6)).toEqual({ host: 4, guest: 6 });
  });

  it('mesmos dados e mesma semente → resultado idêntico (anfitrião e convidado simulam igual)', () => {
    const host = team('Ana', 6, 'fire');
    const guest = team('Bia', 6, 'water');
    // O convidado recebe a equipe do anfitrião pelo fio, e vice-versa.
    const hostView = boxPvpBattle(host, parseMessage(encodeMessage({ t: 'cx-team', team: guest, placed: true }))!.t === 'cx-team' ? guest : guest, { host: 6, guest: 6 });
    const guestSideHost = (parseMessage(encodeMessage({ t: 'cx-team', team: host, placed: true })) as { team: BoxPvpTeam }).team;
    const guestView = boxPvpBattle(guestSideHost, guest, { host: 6, guest: 6 });
    const a = simulateBattle(hostView.fighters, seededRng(777), { teams: hostView.plan.teams, relay: true });
    const b = simulateBattle(guestView.fighters, seededRng(777), { teams: guestView.plan.teams, relay: true });
    expect(b).toEqual(a);
    expect(a.winningTeam).toBe(1); // água vence fogo
  });

  it('ids únicos mesmo com a mesma carta dos dois lados; nomes dos treinadores no plano', () => {
    const battle = boxPvpBattle(team('Ana', 2), team('Bia', 2), { host: 2, guest: 1 });
    expect(new Set(battle.fighters.map((f) => f.id)).size).toBe(3);
    expect(battle.plan.teams).toEqual([0, 0, 1]);
    expect(battle.plan.teamNames).toEqual(['Ana', 'Bia']);
    expect(battle.plan.banner.text).toBe('Ana contra Bia!');
  });
});
