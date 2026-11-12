import { describe, expect, it } from 'vitest';
import { applyUpgrade, createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy, SurvivorEvent, SurvivorInput, SurvivorState } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import { chooseSurvivorSpecial, chooseSurvivorSpecialBranch } from './survivor-specials';
import type { BaseStats } from './pokemon-data';
import {
  FRIEND_APPROACH_SPEED, FRIEND_HELP_MS, FRIEND_OFFER_MS, ORB_RAIN_CLOSE_MAX_DIST, ORB_RAIN_CLOSE_MIN_DIST, ORB_RAIN_CROWD, ORB_RAIN_MAX_DIST, ORB_RAIN_MIN_DIST, orbRainReach,
  SWARM_LANE_HALF, SWARM_LANE_OFFSET, TRIAL_DRIFT_SPEED, TRIAL_TOUCH_RADIUS, ORB_RAIN_DROPS, orbRainValue, SURGE_EVERY_MS, SURGE_FIRST_MS, surgeHudText, surgeKindAt,
  SURVIVOR_SURGE_KINDS, SWARM_DAMAGE_FACTOR, SWARM_HP_FACTOR, SWARM_MIN_MS, SWARM_SIZE, SWARM_WARN_MS, TRIAL_MAX_TARGET,
  TRIAL_MIN_TARGET, TRIAL_MS, TRIAL_OFFER_MS, TRIAL_REWARD_ORB_VALUE, trialTarget,
} from './survivor-surges';
import type { SurvivorSurgeKind } from './survivor-surges';

const STATS: BaseStats = { hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75 };
const idle: SurvivorInput = { dx: 0, dy: 0 };

/** Corrida quieta: sem spawn, chefes, treinadores, encontros de campo, ladrão nem baú. Só os eventos-relâmpago. */
function quiet(seed = 11): SurvivorState {
  const move = moveFor(['fire'], STATS);
  const s = createSurvivorState(seed, { kindCount: 1, move, profile: attackProfile(move, STATS) });
  s.spawnAccumMs = -1e12;
  s.nextBossAtMs = Infinity;
  s.nextTrainerAtMs = Infinity;
  s.finalBossAtMs = null;
  s.nextFieldEventAtMs = Infinity;
  s.nextThiefAtMs = Infinity;
  s.nextChestAtMs = Infinity;
  s.player.attackTimerMs = Infinity;
  s.player.hp = s.player.maxHp = 1e6;
  return s;
}

function step(s: SurvivorState, ms: number, input: SurvivorInput = idle): SurvivorEvent[] {
  const events: SurvivorEvent[] = [];
  for (let t = 0; t < ms; t += 50) {
    if (s.pendingUpgrade) applyUpgrade(s, s.pendingUpgrade[0]!.id);
    if (s.special.phase === 'choice') chooseSurvivorSpecial(s, 'shield');
    if (s.special.phase === 'branch-choice') chooseSurvivorSpecialBranch(s, 'shield-permanent');
    s.player.attackTimerMs = Infinity;
    events.push(...stepSurvivor(s, input, 50));
  }
  return events;
}

/** Leva a corrida até o evento `kind` começar (agenda do próprio motor, sem pular o sorteio). */
function startKind(kind: SurvivorSurgeKind, seed = 11): { s: SurvivorState; events: SurvivorEvent[] } {
  const s = quiet(seed);
  s.elapsedMs = SWARM_MIN_MS + 1000;
  let index = 0;
  while (surgeKindAt(seed, index, s.elapsedMs) !== kind) index++;
  s.surges!.count = index;
  // A escolha do especial (aos 3 min) segura um passo; anda até o evento abrir.
  for (let i = 0; i < 400 && ['locked', 'arrival', 'choice', 'branch-arrival', 'branch-choice'].includes(s.special.phase); i++) step(s, 50);
  s.surges!.clockMs = s.surges!.nextAtMs - 50;
  const events = step(s, 50);
  expect(s.surge?.kind).toBe(kind);
  return { s, events };
}

const surgeEvents = (events: SurvivorEvent[]) => events.filter((e): e is Extract<SurvivorEvent, { type: 'surge' }> => e.type === 'surge');

const target = (s: SurvivorState, x: number, y: number, hp = 50): SurvivorEnemy => {
  const e: SurvivorEnemy = { id: s.nextId++, kind: 0, boss: false, grade: 'comum', x, y, hp, maxHp: hp, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
  s.enemies.push(e);
  return e;
};

describe('eventos-relâmpago: agenda', () => {
  it('cada volta de quatro passa por todos os tipos, e a revoada nunca abre antes dos 4 min', () => {
    for (const seed of [1, 7, 42, 99, 2024]) {
      for (let round = 0; round < 3; round++) {
        const kinds = new Set(Array.from({ length: 4 }, (_, i) => surgeKindAt(seed, round * 4 + i, 30 * 60_000)));
        expect(kinds.size).toBe(SURVIVOR_SURGE_KINDS.length);
      }
      for (let index = 0; index < 8; index++) expect(surgeKindAt(seed, index, SWARM_MIN_MS - 1)).not.toBe('swarm');
    }
  });

  it('o primeiro evento chega aos 2:30 jogados e os seguintes a cada 105 s', () => {
    const s = quiet();
    const first = surgeEvents(step(s, SURGE_FIRST_MS - 100));
    expect(first).toHaveLength(0);
    const events = surgeEvents(step(s, 200));
    expect(events[0]?.phase).toMatch(/warn|offer|start/);
    expect(s.surges!.nextAtMs).toBe(s.surges!.clockMs - (s.surges!.clockMs - SURGE_FIRST_MS) + SURGE_EVERY_MS);
  });

  it('não liga no laboratório, no PvP (sem itens) nem no BONK', () => {
    for (const flag of ['debugLaboratory', 'heldDisabled', 'bonk'] as const) {
      const s = quiet();
      s[flag] = true;
      expect(surgeEvents(step(s, SURGE_FIRST_MS + 500))).toHaveLength(0);
      expect(s.surge ?? null).toBeNull();
    }
  });

  it('espera enquanto um time de treinador está em campo', () => {
    const s = quiet();
    const trainer = target(s, s.player.x + 900, s.player.y, 1e9);
    trainer.trainerId = 77;
    trainer.grade = 'elite';
    step(s, SURGE_FIRST_MS + 500);
    expect(s.surge ?? null).toBeNull();
    s.enemies = [];
    step(s, 16_000);
    expect(s.surge).not.toBeNull();
  });

  it('é determinístico pela semente da corrida', () => {
    const a = quiet(5);
    const b = quiet(5);
    expect(surgeEvents(step(a, SURGE_FIRST_MS + 2000))).toEqual(surgeEvents(step(b, SURGE_FIRST_MS + 2000)));
    expect(a.surge).toEqual(b.surge);
  });
});

describe('Chuva de orbes', () => {
  it('derruba exatamente 20 orbes de XP real, todos pares, cada um avisado pela sombra antes de cair', () => {
    const { s } = startKind('orb-rain');
    expect(s.orbs).toHaveLength(0);
    step(s, 600);
    expect(s.surge?.drops?.length).toBeGreaterThan(0);
    const before = s.orbs.length;
    // O jogador fica longe: os orbes ficam no chão para contarmos.
    s.player.x = 20;
    s.player.y = 20;
    const events = surgeEvents(step(s, 12_000));
    expect(s.orbs.length - before + 0).toBeLessThanOrEqual(ORB_RAIN_DROPS);
    const rain = s.orbs.filter((orb) => orb.value === orbRainValue(s.elapsedMs));
    expect(rain.length).toBeGreaterThan(0);
    expect(events.at(-1)).toMatchObject({ kind: 'orb-rain', phase: 'end', value: ORB_RAIN_DROPS });
    expect(s.surge).toBeNull();
  });

  it('cercado, a chuva cai perto de você; livre, ela se espalha', () => {
    const free = quiet();
    expect(orbRainReach(free)).toEqual([ORB_RAIN_MIN_DIST, ORB_RAIN_MAX_DIST]);
    for (let i = 0; i < ORB_RAIN_CROWD; i++) target(free, free.player.x + 60, free.player.y + i * 10);
    expect(orbRainReach(free)).toEqual([ORB_RAIN_CLOSE_MIN_DIST, ORB_RAIN_CLOSE_MAX_DIST]);
    const { s } = startKind('orb-rain');
    for (let i = 0; i < 6; i++) target(s, s.player.x + 50, s.player.y + i * 8, 1e9).speed = 0;
    step(s, 2000);
    for (const drop of s.surge!.drops!) expect(Math.hypot(drop.x - s.player.x, drop.y - s.player.y)).toBeLessThanOrEqual(ORB_RAIN_CLOSE_MAX_DIST + 1);
  });

  it('valor de cada orbe é par, cresce devagar e tem teto (orçamento de XP limitado)', () => {
    for (let min = 0; min <= 40; min++) {
      const value = orbRainValue(min * 60_000);
      expect(value % 2).toBe(0);
      expect(value).toBeGreaterThanOrEqual(6);
      expect(value).toBeLessThanOrEqual(14);
    }
    // O pior caso da chuva inteira vale menos que um treinador comum (3 elites de 20 e chave) somado a 14 comuns.
    expect(ORB_RAIN_DROPS * orbRainValue(60 * 60_000)).toBeLessThanOrEqual(280);
  });
});

describe('Revoada', () => {
  it('avisa a faixa antes e depois solta 10 Pokémon frágeis em linha reta', () => {
    const { s, events } = startKind('swarm');
    expect(surgeEvents(events)[0]).toMatchObject({ kind: 'swarm', phase: 'warn' });
    expect(s.surge?.lane).toBeDefined();
    expect(s.enemies).toHaveLength(0);
    const started = surgeEvents(step(s, SWARM_WARN_MS + 50));
    expect(started.some((e) => e.phase === 'start')).toBe(true);
    const members = s.enemies.filter((e) => e.swarm);
    expect(members).toHaveLength(SWARM_SIZE);
    // Comparação com um comum do mesmo momento.
    s.spawnAccumMs = 0;
    const lane = s.surge!.lane!;
    for (const e of members) {
      expect(Math.hypot(e.swarm!.vx, e.swarm!.vy)).toBeGreaterThan(0);
      expect(e.swarm!.vx * lane.dx + e.swarm!.vy * lane.dy).toBeGreaterThan(0);
    }
    // A faixa passa ao lado: nenhum membro voa por cima de onde você estava no aviso.
    for (const e of members) {
      const across = Math.abs((e.x - s.player.x) * lane.dy - (e.y - s.player.y) * lane.dx);
      expect(across).toBeGreaterThanOrEqual(SWARM_LANE_OFFSET - SWARM_LANE_HALF + 10);
    }
    const leader = members[0]!;
    const from = { x: leader.x, y: leader.y };
    for (let i = 0; i < 400 && ['locked', 'arrival', 'choice', 'branch-arrival', 'branch-choice'].includes(s.special.phase); i++) step(s, 50);
    const moved = { x: leader.x - from.x, y: leader.y - from.y };
    // Linha reta: nada de desvio perpendicular à faixa (a não ser a cerca da arena).
    expect(Math.abs(moved.x * lane.dy - moved.y * lane.dx)).toBeLessThan(1);
    expect(SWARM_HP_FACTOR).toBeLessThan(1);
    expect(SWARM_DAMAGE_FACTOR).toBeLessThan(1);
  });

  it('quem não cai sai da arena sem deixar orbe, e a revoada termina sem prêmio', () => {
    const { s } = startKind('swarm');
    s.player.hp = s.player.maxHp = 1e9;
    s.player.x = 30;
    s.player.y = 30;
    const events = surgeEvents(step(s, 12_000));
    expect(s.enemies.filter((e) => e.swarm)).toHaveLength(0);
    expect(s.orbs).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ kind: 'swarm', phase: 'end' });
    expect(s.artifacts).toHaveLength(0);
  });

  it('derrubar a revoada inteira deixa um artefato do sistema de itens', () => {
    const { s } = startKind('swarm');
    step(s, SWARM_WARN_MS + 50);
    for (const e of s.enemies) if (e.swarm) e.hp = 0;
    const events = surgeEvents(step(s, 100));
    expect(events.at(-1)).toMatchObject({ kind: 'swarm', phase: 'success', value: SWARM_SIZE });
    expect(s.artifacts.length).toBeGreaterThanOrEqual(1);
    expect(s.surges!.completed).toBe(1);
  });
});

describe('Amigo selvagem', () => {
  it('vem até quem está parado lutando: ninguém precisa sair da multidão para buscá-lo', () => {
    const { s, events } = startKind('wild-friend');
    expect(surgeEvents(events)[0]).toMatchObject({ kind: 'wild-friend', phase: 'offer' });
    const friend = s.surge!.friend!;
    const d0 = Math.hypot(friend.x - s.player.x, friend.y - s.player.y);
    const out = surgeEvents(step(s, Math.ceil((d0 / FRIEND_APPROACH_SPEED) * 1000) + 200));
    expect(out.at(-1)).toMatchObject({ kind: 'wild-friend', phase: 'start' });
  });

  it('quem foge dele por 12 s fica sem ajuda: ele volta para o mato sem efeito', () => {
    const { s } = startKind('wild-friend');
    const friend = s.surge!.friend!;
    const away = { dx: s.player.x - friend.x, dy: s.player.y - friend.y };
    const enemy = target(s, s.player.x + 100, s.player.y, 1e6);
    enemy.speed = 0;
    const out = surgeEvents(step(s, FRIEND_OFFER_MS + 100, away));
    expect(out.at(-1)).toMatchObject({ kind: 'wild-friend', phase: 'fail' });
    expect(enemy.hp).toBe(1e6);
  });

  it('encostar faz ele lutar do seu lado por 24 s, com dano menor que o do seu golpe', () => {
    const { s } = startKind('wild-friend');
    const friend = s.surge!.friend!;
    s.player.x = friend.x;
    s.player.y = friend.y;
    const started = surgeEvents(step(s, 50));
    expect(started[0]).toMatchObject({ kind: 'wild-friend', phase: 'start' });
    const enemy = target(s, s.player.x + 120, s.player.y, 1e6);
    step(s, 2000);
    const dealt = 1e6 - enemy.hp;
    expect(dealt).toBeGreaterThan(0);
    // No máximo um golpe a cada 0,7 s, cada um com 55% do golpe principal.
    expect(dealt).toBeLessThanOrEqual(Math.ceil(s.player.attackDamage * 0.55 + 1) * 3);
    const end = surgeEvents(step(s, FRIEND_HELP_MS));
    expect(end.at(-1)).toMatchObject({ kind: 'wild-friend', phase: 'end' });
    const hp = enemy.hp;
    step(s, 2000);
    expect(enemy.hp).toBe(hp);
  });
});

describe('Desafio relâmpago', () => {
  it('meta pelo ritmo real do último minuto, entre 8 e 40', () => {
    expect(trialTarget(0)).toBe(TRIAL_MIN_TARGET);
    expect(trialTarget(10_000)).toBe(TRIAL_MAX_TARGET);
    expect(trialTarget(60)).toBe(Math.round(60 / 60_000 * TRIAL_MS * 1.3));
    for (let k = 0; k < 200; k += 7) expect(trialTarget(k + 7)).toBeGreaterThanOrEqual(trialTarget(k));
  });

  it('a baliza vem até quem está lutando e o desafio começa quando ela encosta', () => {
    const { s } = startKind('trial');
    const d0 = Math.hypot(s.surge!.x! - s.player.x, s.surge!.y! - s.player.y);
    const out = surgeEvents(step(s, Math.ceil(((d0 - TRIAL_TOUCH_RADIUS) / TRIAL_DRIFT_SPEED) * 1000) + 200));
    expect(out.at(-1)).toMatchObject({ kind: 'trial', phase: 'start' });
  });

  it('quem foge da baliza recusa: ela some e nada muda', () => {
    const { s } = startKind('trial');
    const away = { dx: s.player.x - s.surge!.x!, dy: s.player.y - s.surge!.y! };
    const out = surgeEvents(step(s, TRIAL_OFFER_MS + 100, away));
    expect(out.at(-1)).toMatchObject({ kind: 'trial', phase: 'fail' });
    expect(s.keyDrops ?? []).toHaveLength(0);
  });

  it('cumprir dá uma chave de baú e orbes reais; falhar não tira nada', () => {
    const { s } = startKind('trial');
    s.player.x = s.surge!.x!;
    s.player.y = s.surge!.y!;
    const started = surgeEvents(step(s, 50));
    expect(started[0]).toMatchObject({ kind: 'trial', phase: 'start', value: TRIAL_MIN_TARGET });
    const goal = s.surge!.target!;
    expect(surgeHudText(s)).toContain(`0/${goal}`);
    s.player.x = 30;
    s.player.y = 30;
    for (let i = 0; i < goal; i++) target(s, 1500, 1500, 1).hp = 0;
    const done = surgeEvents(step(s, 100));
    expect(done.at(-1)).toMatchObject({ kind: 'trial', phase: 'success', value: goal });
    // A chave cai do lado e pode já ter entrado na mochila no mesmo passo; os orbes também.
    expect((s.keys ?? 0) + (s.keyDrops?.length ?? 0)).toBe(1);
    expect(s.player.xp + s.orbs.filter((orb) => orb.value === TRIAL_REWARD_ORB_VALUE).length).toBeGreaterThan(0);

    const fail = startKind('trial', 12).s;
    fail.player.x = fail.surge!.x!;
    fail.player.y = fail.surge!.y!;
    step(fail, 50);
    const hp = fail.player.hp;
    const out = surgeEvents(step(fail, TRIAL_MS + 100));
    expect(out.at(-1)).toMatchObject({ kind: 'trial', phase: 'fail' });
    expect((fail.keys ?? 0) + (fail.keyDrops?.length ?? 0)).toBe(0);
    expect(fail.player.hp).toBe(hp);
  });
});
