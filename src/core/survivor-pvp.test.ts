import { describe, expect, it } from 'vitest';
import {
  aliveCount, applyArenaSnapshot, canSwitch, createArena, NO_INPUT, SV_ARENA_H, SV_ARENA_W, SV_COUNTDOWN_MS, SV_ENTRY_SHIELD_MS, SV_MAX_MS,
  SV_SUDDEN_DEATH_MS, SV_SWITCH_COOLDOWN_MS, snapshotArena, stepArena, svMonFromRun, svRunScore, switchBlockReason,
} from './survivor-pvp';
import type { ArenaInput, ArenaState, SvMonSpec, SvRunResult } from './survivor-pvp';

const run = (extra: Partial<SvRunResult> = {}): SvRunResult => ({
  id: 'c1', dexId: 25, name: 'Pikachu', shiny: false, types: ['electric'], attackType: 'electric', survivedMs: 120_000, kills: 40, level: 6, defeated: false, ...extra,
});

const mon = (id: string, extra: Partial<SvMonSpec> = {}): SvMonSpec => ({
  id, name: id, dexId: 25, shiny: false, types: ['normal'], attackType: 'normal', maxHp: 100, power: 20, speed: 100, fireMs: 500, score: 50, estimated: false, ...extra,
});

/** Passa o tempo da contagem inicial. */
function begin(state: ArenaState): void {
  for (let i = 0; i < SV_COUNTDOWN_MS / 50 + 1; i++) stepArena(state, [NO_INPUT, NO_INPUT], 50);
}

const run60 = (state: ArenaState, ms: number, a: ArenaInput = NO_INPUT, b: ArenaInput = NO_INPUT): void => {
  for (let t = 0; t < ms && state.winner === null; t += 20) stepArena(state, [a, b], 20);
};

describe('survival pvp: da run para o Pokémon', () => {
  it('a nota sobe com tempo, vitórias e nível e fica entre 0 e 100', () => {
    const base = svRunScore({ survivedMs: 30_000, kills: 5, level: 2 });
    expect(svRunScore({ survivedMs: 60_000, kills: 5, level: 2 })).toBeGreaterThan(base);
    expect(svRunScore({ survivedMs: 30_000, kills: 25, level: 2 })).toBeGreaterThan(base);
    expect(svRunScore({ survivedMs: 30_000, kills: 5, level: 9 })).toBeGreaterThan(base);
    expect(svRunScore({ survivedMs: 0, kills: 0, level: 0 })).toBe(0);
    expect(svRunScore({ survivedMs: 10_000_000, kills: 9999, level: 99 })).toBe(100);
  });

  it('usa os stats reais da espécie e marca quando só há números médios', () => {
    const real = svMonFromRun(run(), 'a');
    expect(real.estimated).toBe(false);
    expect(real.maxHp).toBeGreaterThan(100);
    const unknown = svMonFromRun(run({ dexId: 999999 }), 'b');
    expect(unknown.estimated).toBe(true);
  });

  it('uma run melhor rende um Pokémon mais forte (até +30%)', () => {
    const weak = svMonFromRun(run({ survivedMs: 5_000, kills: 0, level: 1 }), 'a');
    const strong = svMonFromRun(run(), 'b');
    expect(strong.maxHp).toBeGreaterThan(weak.maxHp);
    expect(strong.power).toBeGreaterThanOrEqual(weak.power);
    expect(strong.maxHp / weak.maxHp).toBeLessThanOrEqual(1.31);
  });

  it('leva os buffs e a forma real do golpe para a arena', () => {
    const fromRun = svMonFromRun(run({
      combat: {
        moveName: 'Nuvem tóxica', category: 'area', effect: 'queimar', maxHp: 420, power: 84, speed: 160,
        cooldownMs: 480, projectileSpeed: 510, projectileSize: 12, shots: 3, pierce: 2, attackRange: 230,
        attackRadius: 92, critChance: 0.2, buffs: ['power', 'multishot', 'pierce'],
      },
    }), 'a');
    expect(fromRun).toMatchObject({ maxHp: 420, power: 84, moveCategory: 'area', moveEffect: 'queimar', shots: 3, pierce: 2 });
    expect(fromRun.speed).toBeGreaterThan(160);
    expect(fromRun.buffs).toEqual(['power', 'multishot', 'pierce']);
  });
});

describe('survival pvp: a arena', () => {
  it('a contagem trava tudo e começa com as equipes cheias', () => {
    const s = createArena([mon('a'), mon('b'), mon('c')], [mon('x'), mon('y'), mon('z')]);
    stepArena(s, [{ dx: 1, dy: 0, switchTo: -1 }, NO_INPUT], 50);
    expect(s.countdownMs).toBeLessThan(SV_COUNTDOWN_MS);
    expect(s.sides[0].x).toBe(SV_ARENA_W / 2);
    expect(s.shots).toHaveLength(0);
    expect(aliveCount(s.sides[0])).toBe(3);
    begin(s);
    expect(s.countdownMs).toBe(0);
  });

  it('anda na direção da entrada, sem sair da arena e sem correr mais na diagonal', () => {
    const s = createArena([mon('a')], [mon('x')]);
    begin(s);
    stepArena(s, [{ dx: 1, dy: 0, switchTo: -1 }, NO_INPUT], 50);
    const straight = s.sides[0].x - SV_ARENA_W / 2;
    const d = createArena([mon('a')], [mon('x')]);
    begin(d);
    stepArena(d, [{ dx: 1, dy: 1, switchTo: -1 }, NO_INPUT], 50);
    expect(Math.hypot(d.sides[0].x - SV_ARENA_W / 2, d.sides[0].y - (SV_ARENA_H - 90))).toBeCloseTo(straight, 6);
    run60(s, 10_000, { dx: 1, dy: 0, switchTo: -1 });
    expect(s.sides[0].x).toBeLessThanOrEqual(SV_ARENA_W);
  });

  it('é determinística: as mesmas entradas dão o mesmo resultado', () => {
    const play = (): string => {
      const s = createArena([mon('a'), mon('b'), mon('c')], [mon('x'), mon('y'), mon('z')]);
      begin(s);
      for (let i = 0; i < 400; i++) stepArena(s, [{ dx: Math.sin(i / 20), dy: 0, switchTo: i === 100 ? 1 : -1 }, { dx: Math.cos(i / 15), dy: 0, switchTo: -1 }], 20);
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });

  it('o golpe acerta, tira vida e respeita a vantagem de tipo', () => {
    const neutral = createArena([mon('a')], [mon('x', { types: ['normal'] })]);
    const weak = createArena([mon('a', { attackType: 'fire' })], [mon('x', { types: ['grass'] })]);
    const immune = createArena([mon('a', { attackType: 'normal' })], [mon('x', { types: ['ghost'] })]);
    for (const s of [neutral, weak, immune]) {
      begin(s);
      run60(s, 3000);
    }
    const lost = (s: ArenaState): number => s.sides[1].mons[0]!.maxHp - s.sides[1].mons[0]!.hp;
    expect(lost(neutral)).toBeGreaterThan(0);
    expect(lost(weak)).toBeGreaterThan(lost(neutral));
    expect(lost(immune)).toBe(0);
  });

  it('avisa a área por 1,5 s e deixa o alvo sair antes do dano', () => {
    const s = createArena(
      [mon('a', { fireMs: 250, power: 40, moveCategory: 'area', attackRadius: 80 })],
      [mon('x', { fireMs: 2000 })],
    );
    begin(s);
    const warning = Array.from({ length: 13 }, () => stepArena(s, [NO_INPUT, NO_INPUT], 50)).flat();
    expect(warning.some((event) => event.k === 'telegraph')).toBe(true);
    expect(s.markers).toHaveLength(1);
    const hp = s.sides[1].mons[0]!.hp;
    run60(s, 1000);
    expect(s.sides[1].mons[0]!.hp).toBe(hp);
    run60(s, 600);
    expect(s.sides[1].mons[0]!.hp).toBeLessThan(hp);

    const dodge = createArena(
      [mon('a', { fireMs: 250, power: 40, moveCategory: 'area', attackRadius: 80 })],
      [mon('x', { fireMs: 2000 })],
    );
    begin(dodge);
    run60(dodge, 650);
    run60(dodge, 1400, NO_INPUT, { dx: 1, dy: 0, switchTo: -1 });
    stepArena(dodge, [NO_INPUT, { dx: 1, dy: 0, switchTo: -1 }], 120);
    expect(dodge.sides[1].mons[0]!.hp).toBe(dodge.sides[1].mons[0]!.maxHp);
  });

  it('a vida de cada Pokémon se mantém entre trocas', () => {
    const s = createArena([mon('a', { fireMs: 2000 }), mon('b')], [mon('x', { power: 10 }), mon('y')]);
    begin(s);
    run60(s, 3000);
    const hurt = s.sides[0].mons[0]!.hp;
    expect(hurt).toBeLessThan(100);
    stepArena(s, [{ dx: 0, dy: 0, switchTo: 1 }, NO_INPUT], 20);
    expect(s.sides[0].active).toBe(1);
    expect(s.sides[0].mons[0]!.hp).toBe(hurt);
    run60(s, SV_SWITCH_COOLDOWN_MS + 200);
    stepArena(s, [{ dx: 0, dy: 0, switchTo: 0 }, NO_INPUT], 20);
    expect(s.sides[0].active).toBe(0);
    expect(s.sides[0].mons[0]!.hp).toBeLessThanOrEqual(hurt);
  });

  it('a troca tem recarga, não vale para o mesmo Pokémon nem para um caído', () => {
    const s = createArena([mon('a'), mon('b'), mon('c')], [mon('x'), mon('y')]);
    expect(canSwitch(s, 0, 1)).toBe(false);
    expect(switchBlockReason(s, 0, 1)).toMatch(/não começou/);
    begin(s);
    expect(canSwitch(s, 0, 0)).toBe(false);
    expect(switchBlockReason(s, 0, 0)).toMatch(/em campo/);
    expect(switchBlockReason(s, 0, 7)).not.toBeNull();
    expect(canSwitch(s, 0, 1)).toBe(true);
    stepArena(s, [{ dx: 0, dy: 0, switchTo: 1 }, NO_INPUT], 20);
    expect(s.sides[0].active).toBe(1);
    expect(s.sides[0].switchCdMs).toBeGreaterThan(SV_SWITCH_COOLDOWN_MS - 100);
    stepArena(s, [{ dx: 0, dy: 0, switchTo: 2 }, NO_INPUT], 20);
    expect(s.sides[0].active).toBe(1);
    expect(switchBlockReason(s, 0, 2)).toMatch(/Troca em/);
    s.sides[0].switchCdMs = 0;
    s.sides[0].mons[2]!.hp = 0;
    expect(canSwitch(s, 0, 2)).toBe(false);
    expect(switchBlockReason(s, 0, 2)).toMatch(/fora de combate/);
  });

  it('quem entra fica protegido por um instante', () => {
    const make = (): ArenaState => {
      const s = createArena([mon('a'), mon('b')], [mon('x', { fireMs: 450, power: 30 })]);
      s.sides[1].y = s.sides[0].y - 50; // colados: o golpe chega quase na hora
      begin(s);
      return s;
    };
    const shielded = make();
    stepArena(shielded, [{ dx: 0, dy: 0, switchTo: 1 }, NO_INPUT], 20);
    expect(shielded.sides[0].shieldMs).toBeGreaterThan(SV_ENTRY_SHIELD_MS - 100);
    run60(shielded, 800);
    expect(shielded.sides[0].mons[1]!.hp).toBe(100);
    const control = make();
    run60(control, 800);
    expect(control.sides[0].mons[0]!.hp).toBeLessThan(100);
  });

  it('quem desmaia é trocado na hora pelo próximo de pé, sem recarga', () => {
    const s = createArena([mon('a', { maxHp: 20 }), mon('b'), mon('c')], [mon('x', { power: 60, maxHp: 500 })]);
    begin(s);
    run60(s, 4000);
    expect(s.sides[0].mons[0]!.hp).toBe(0);
    expect(s.sides[0].active).not.toBe(0);
    expect(s.sides[0].mons[s.sides[0].active]!.hp).toBeGreaterThan(0);
    expect(s.sides[0].switchCdMs).toBe(0);
  });

  it('vence quem deixa a equipe do outro sem ninguém de pé', () => {
    const s = createArena([mon('a', { power: 120, fireMs: 450, maxHp: 400 })], [mon('x', { maxHp: 20 }), mon('y', { maxHp: 20 })]);
    begin(s);
    run60(s, 20_000);
    expect(aliveCount(s.sides[1])).toBe(0);
    expect(s.winner).toBe(0);
  });

  it('a morte súbita faz toda luta terminar', () => {
    const s = createArena([mon('a', { power: 1, maxHp: 400, fireMs: 2000 })], [mon('x', { power: 1, maxHp: 300, fireMs: 2000 })]);
    begin(s);
    // Golpes fracos e raros, cantos opostos: sem a morte súbita a luta levaria uma eternidade.
    s.sides[0].x = 18;
    s.sides[0].y = SV_ARENA_H - 18;
    s.sides[1].x = SV_ARENA_W - 18;
    s.sides[1].y = 18;
    for (let t = 0; t < SV_MAX_MS + 5000 && s.winner === null; t += 50) stepArena(s, [NO_INPUT, NO_INPUT], 50);
    expect(s.winner).not.toBeNull();
    expect(s.timeMs).toBeGreaterThan(SV_SUDDEN_DEATH_MS);
  });

  it('ignora entradas inválidas', () => {
    const s = createArena([mon('a')], [mon('x')]);
    begin(s);
    stepArena(s, [{ dx: Number.NaN, dy: 999, switchTo: 1.5 }, undefined], 20);
    expect(Number.isFinite(s.sides[0].x)).toBe(true);
    expect(s.sides[0].x).toBe(SV_ARENA_W / 2);
  });
});

describe('survival pvp: instantâneo', () => {
  it('o convidado adota exatamente o estado do anfitrião', () => {
    const team = [mon('a'), mon('b')];
    const host = createArena(team, [mon('x'), mon('y')]);
    const guest = createArena(team, [mon('x'), mon('y')]);
    begin(host);
    run60(host, 2500, { dx: 0.4, dy: -0.2, switchTo: -1 });
    expect(applyArenaSnapshot(guest, JSON.parse(JSON.stringify(snapshotArena(host, 1))))).toBe(true);
    expect(guest.sides.map((t) => t.mons.map((m) => m.hp))).toEqual(host.sides.map((t) => t.mons.map((m) => Math.round(m.hp))));
    expect(guest.shots).toHaveLength(host.shots.length);
    expect(guest.sides[0].x).toBeCloseTo(host.sides[0].x, 0);
  });

  it('recusa um instantâneo que não casa com as equipes', () => {
    const host = createArena([mon('a'), mon('b')], [mon('x')]);
    const guest = createArena([mon('a')], [mon('x')]);
    const before = JSON.stringify(guest);
    expect(applyArenaSnapshot(guest, snapshotArena(host, 1))).toBe(false);
    expect(JSON.stringify(guest)).toBe(before);
  });
});
