import { describe, expect, it } from 'vitest';
import { createArenaBot } from './arena-bot';
import { ARENA_LEVEL_UPS, ARENA_TEAM_SIZE, arenaIdleUpgrades, arenaRivalTeam, arenaSpecOf, autoFinishArenaPrep, bestArenaCard, createArenaPrep, pickArenaCard } from './arena-prep';
import { aliveCount, applyArenaSnapshot, createArena, NO_INPUT, snapshotArena, stepArena } from './survivor-pvp';
import { parseSurvivalMessage } from '../pvp/survival-wire';
import type { ArenaState, SvAttackForm, SvMonSpec } from './survivor-pvp';
import type { MoveCategory } from './survivor-moves';

const charizard = { id: 'a', name: 'Charizard', dexId: 6, shiny: false };
const pikachu = { id: 'b', name: 'Pikachu', dexId: 25, shiny: false };

function run(state: ArenaState, bot?: ReturnType<typeof createArenaBot>, ms = 40_000): void {
  for (let t = 0; t < ms && state.winner === null; t += 33) stepArena(state, [NO_INPUT, bot?.(state, 33)], 33);
}

const dummy = (id: string, over: Partial<SvMonSpec> = {}): SvMonSpec => ({
  id, name: id, dexId: 25, shiny: false, types: ['normal'], attackType: 'normal', maxHp: 1000, power: 20, speed: 120, fireMs: 500, score: 0, estimated: false, ...over,
});

const FORMS: readonly MoveCategory[] = ['projetil', 'aura', 'area', 'cone', 'orbit', 'foco', 'rapido', 'teleporte', 'trilha'];

const form = (moveCategory: MoveCategory): SvAttackForm => ({
  attackType: 'normal', power: 20, fireMs: 500, moveName: moveCategory, moveCategory, moveEffect: 'nenhum', projectileSpeed: 300, projectileSize: 6, shots: 1, pierce: 0, attackRange: 200, attackRadius: 60, critChance: 0,
});

describe('10 níveis antes da luta', () => {
  it('cada carta escolhida sobe um nível, até 10', () => {
    const prep = createArenaPrep(charizard, 7);
    expect(prep.offer.length).toBeGreaterThan(0);
    const level = prep.state.player.level;
    for (let i = 0; i < ARENA_LEVEL_UPS; i++) expect(pickArenaCard(prep, bestArenaCard(prep)!)).toBe(true);
    expect(prep.picked).toHaveLength(ARENA_LEVEL_UPS);
    expect(prep.state.player.level).toBe(level + ARENA_LEVEL_UPS);
    expect(prep.offer).toEqual([]);
  });

  it('recusa carta que não foi oferecida', () => {
    const prep = createArenaPrep(charizard, 7);
    expect(pickArenaCard(prep, 'carta-inventada')).toBe(false);
    expect(prep.picked).toEqual([]);
  });

  it('só oferece carta que muda a luta', () => {
    const prep = createArenaPrep(pikachu, 3);
    const idle = arenaIdleUpgrades(prep.state.player);
    expect(idle.length).toBeGreaterThan(0);
    for (let i = 0; i < ARENA_LEVEL_UPS; i++) {
      for (const option of prep.offer) expect(idle).not.toContain(option.id);
      pickArenaCard(prep, prep.offer[0]!.id);
    }
  });

  it('as cartas deixam o Pokémon mais forte que no começo', () => {
    const before = arenaSpecOf(createArenaPrep(charizard, 11));
    const prep = createArenaPrep(charizard, 11);
    autoFinishArenaPrep(prep);
    const after = arenaSpecOf(prep);
    expect(after.buffs!.length).toBeGreaterThan(0);
    const score = (s: SvMonSpec): number => s.maxHp * s.power * (s.attackRange ?? 1) * (s.attackRadius ?? 1) * (s.shots ?? 1) * s.speed / s.fireMs;
    expect(score(after)).toBeGreaterThan(score(before));
  });
});

describe('ataque principal e secundário', () => {
  it('quem tem dois tipos alterna para o outro tipo', () => {
    const spec = arenaSpecOf(createArenaPrep(charizard, 1));
    expect(spec.types).toContain(spec.attackType);
    expect(spec.types).toContain(spec.alt?.attackType);
    expect(spec.alt?.attackType).not.toBe(spec.attackType);
  });

  it('quem tem um tipo só alterna para outra forma de ataque do mesmo tipo', () => {
    const spec = arenaSpecOf(createArenaPrep(pikachu, 1));
    expect(spec.alt?.attackType).toBe('electric');
    expect(spec.alt?.moveCategory).not.toBe(spec.moveCategory);
  });

  it('o botão troca o ataque, tem recarga e volta ao principal', () => {
    const state = createArena([dummy('a', { alt: { ...form('cone'), attackType: 'fire' } })], [dummy('b')]);
    state.countdownMs = 0;
    const swap = { ...NO_INPUT, swapAttack: true };
    expect(stepArena(state, [swap, NO_INPUT], 16).some((e) => e.k === 'attack')).toBe(true);
    const mon = state.sides[0].mons[0]!;
    expect(mon.attackType).toBe('fire');
    expect(mon.altOn).toBe(true);
    expect(stepArena(state, [swap, NO_INPUT], 16).some((e) => e.k === 'attack')).toBe(false);
    state.sides[0].attackSwapCdMs = 0;
    stepArena(state, [swap, NO_INPUT], 16);
    expect(mon.attackType).toBe('normal');
    expect(mon.altOn).toBe(false);
  });

  it('cada Pokémon guarda o próprio ataque ao sair de campo', () => {
    const state = createArena([dummy('a', { alt: { ...form('cone'), attackType: 'fire' } }), dummy('b')], [dummy('c')]);
    state.countdownMs = 0;
    stepArena(state, [{ ...NO_INPUT, swapAttack: true }, NO_INPUT], 16);
    stepArena(state, [{ ...NO_INPUT, switchTo: 1 }, NO_INPUT], 16);
    expect(state.sides[0].mons[0]!.attackType).toBe('fire');
    expect(state.sides[0].mons[1]!.attackType).toBe('normal');
  });
});

describe('todas as formas de ataque funcionam na luta', () => {
  it.each(FORMS)('%s causa dano como ataque principal', (category) => {
    const state = createArena([dummy('alvo', { speed: 40 })], [dummy('rival', { ...form(category) })]);
    run(state, createArenaBot(1, 1), 15_000);
    expect(state.sides[0].mons[0]!.hp).toBeLessThan(1000);
  });

  it.each(FORMS)('%s causa dano como ataque secundário', (category) => {
    const state = createArena([dummy('alvo', { speed: 40 })], [dummy('rival', { alt: form(category) })]);
    state.countdownMs = 0;
    stepArena(state, [NO_INPUT, { ...NO_INPUT, swapAttack: true }], 16);
    expect(state.sides[1].mons[0]!.moveCategory).toBe(category);
    state.sides[0].mons[0]!.hp = 1000;
    state.shots = [];
    run(state, createArenaBot(1, 1), 15_000);
    expect(state.sides[0].mons[0]!.hp).toBeLessThan(1000);
  });

  it('os ataques das espécies reais batem em quem fica parado, nos dois modos', () => {
    for (const dexId of [6, 25, 94, 130, 143, 150, 248, 282, 445, 448]) {
      const prep = createArenaPrep({ id: 'r', name: 'r', dexId, shiny: false }, dexId);
      autoFinishArenaPrep(prep);
      const spec = arenaSpecOf(prep);
      for (const swapped of [false, true]) {
        const state = createArena([dummy('alvo', { maxHp: 1500 })], [spec]);
        state.countdownMs = 0;
        if (swapped) stepArena(state, [NO_INPUT, { ...NO_INPUT, swapAttack: true }], 16);
        run(state, createArenaBot(1, 1), 15_000);
        expect(state.sides[0].mons[0]!.hp, `${dexId} ${state.sides[1].mons[0]!.moveCategory}`).toBeLessThan(1500);
      }
    }
  });
});

describe('rival', () => {
  it('monta 6 Pokémon mesmo quando o líder tem menos', () => {
    const team = arenaRivalTeam([74, 95], 1, 5);
    expect(team).toHaveLength(ARENA_TEAM_SIZE);
    expect(new Set(team.map((m) => m.id)).size).toBe(ARENA_TEAM_SIZE);
    expect(team.map((m) => m.dexId)).toEqual([74, 95, 74, 95, 74, 95]);
  });

  it('todo rival recebe os mesmos 10 níveis, em qualquer dificuldade', () => {
    // A nota da preparação é 2 pontos por nível: nível 1 + 10 cartas = 22.
    for (const power of [0.8, 1, 1.72]) {
      for (const mon of arenaRivalTeam([3, 25, 94, 130, 143, 445], power, 13)) expect(mon.score).toBe(2 * (1 + ARENA_LEVEL_UPS));
    }
  });

  it('a dificuldade do desafio aumenta vida e dano', () => {
    const [easy] = arenaRivalTeam([74], 1, 5);
    const [hard] = arenaRivalTeam([74], 1.5, 5);
    expect(hard!.maxHp).toBeGreaterThan(easy!.maxHp);
    expect(hard!.power).toBeGreaterThan(easy!.power);
  });

  it('a luta 6x6 sempre termina, mesmo com quem joga parado', () => {
    const state = createArena(arenaRivalTeam([6, 25, 94, 130, 143, 445], 1, 2), arenaRivalTeam([3, 9, 65, 68, 149, 248], 1, 3));
    run(state, createArenaBot(1, 0.5), state.maxMs + 5000);
    expect(state.winner).not.toBeNull();
    expect(aliveCount(state.sides[1])).toBeGreaterThan(0);
  });

  it('não pede nada antes da contagem acabar', () => {
    const state = createArena([dummy('a')], [dummy('b')]);
    expect(createArenaBot(1, 1)(state, 16)).toEqual(NO_INPUT);
  });
});

describe('luta contra um amigo', () => {
  it('a equipe de 6, com o segundo ataque, passa pelo fio', () => {
    const team = arenaRivalTeam([6, 25, 94, 130, 143, 445], 1, 9);
    const msg = parseSurvivalMessage(JSON.parse(JSON.stringify({ t: 'sv-team', name: 'Ash', team })) as Record<string, unknown>);
    expect(msg?.t === 'sv-team' ? msg.team.map((m) => m.alt?.attackType) : null).toEqual(team.map((m) => m.alt?.attackType));
  });

  it('a troca de ataque do anfitrião chega ao convidado pelo instantâneo', () => {
    const team = arenaRivalTeam([6, 25, 94, 130, 143, 445], 1, 9);
    const host = createArena(team, team);
    const guest = createArena(team, team);
    host.countdownMs = 0;
    stepArena(host, [{ ...NO_INPUT, swapAttack: true }, NO_INPUT], 16);
    const snap = JSON.parse(JSON.stringify(snapshotArena(host, 1))) as ReturnType<typeof snapshotArena>;
    const parsed = parseSurvivalMessage({ t: 'sv-snap', snap, events: [] });
    expect(parsed?.t).toBe('sv-snap');
    expect(applyArenaSnapshot(guest, snap)).toBe(true);
    expect(guest.sides[0].mons[0]!.attackType).toBe(host.sides[0].mons[0]!.attackType);
    expect(guest.sides[0].mons[0]!.altOn).toBe(true);
  });
});
