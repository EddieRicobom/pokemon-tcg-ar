import { describe, expect, it } from 'vitest';
import {
  adaptiveTarget, applyLevelBonus, SURVIVOR_THIEF_FIRST_MS, SURVIVOR_THIEF_LIFE_MS, damageRanking, emptyRunStats, recordDamage, sampleTimeline, stepAdaptive, thiefFleeTarget, thiefReward, ADAPTIVE_MAX, ADAPTIVE_MIN,
} from './survivor-extras';
import type { SurvivorPlayer, SurvivorState } from './survivor-types';
import { createSurvivorState, stepSurvivor } from './survivor';
import { SURVIVOR_UPGRADES } from './survivor-upgrades';

const player = (over: Partial<SurvivorPlayer> = {}): SurvivorPlayer => ({ upgradeLevels: {}, stage: 0, hp: 100, maxHp: 100, attackDamage: 10, speed: 150, ...over } as SurvivorPlayer);

describe('ladrão de tesouro', () => {
  it('foge para longe de quem joga', () => {
    const target = thiefFleeTarget({ x: 500, y: 500 }, { x: 400, y: 500 }, { w: 2000, h: 2000 });
    expect(target.x).toBeGreaterThan(500);
  });

  it('encurralado na parede, escorrega ao longo dela', () => {
    const target = thiefFleeTarget({ x: 1950, y: 1000 }, { x: 1800, y: 1000 }, { w: 2000, h: 2000 });
    expect(Math.abs(target.y - 1000)).toBeGreaterThan(50);
    expect(target.x).toBeLessThanOrEqual(1940);
  });

  it('a recompensa cresce com o tempo e tem teto', () => {
    expect(thiefReward(240_000)).toBeGreaterThan(thiefReward(0));
    expect(thiefReward(10 * 3_600_000)).toBe(150);
  });
});

describe('desafio que se adapta', () => {
  it('começa fácil e endurece a cada carta e evolução', () => {
    const fresh = adaptiveTarget(player());
    const strong = adaptiveTarget(player({ upgradeLevels: { a: 10, b: 10, c: 10 }, stage: 2 }));
    expect(fresh).toBeLessThan(1);
    expect(strong).toBeGreaterThan(1);
    expect(strong).toBeLessThanOrEqual(ADAPTIVE_MAX);
  });

  it('com pouca vida, recua', () => {
    const fine = adaptiveTarget(player({ upgradeLevels: { a: 20 } }));
    const hurt = adaptiveTarget(player({ upgradeLevels: { a: 20 }, hp: 20 }));
    expect(hurt).toBeLessThan(fine);
    expect(hurt).toBeGreaterThanOrEqual(ADAPTIVE_MIN);
  });

  it('anda devagar até o alvo', () => {
    expect(stepAdaptive(1, 1.5, 1000)).toBeCloseTo(1.04);
    expect(stepAdaptive(1, 1.01, 1000)).toBeCloseTo(1.01);
    expect(stepAdaptive(1, 0.5, 500)).toBeCloseTo(0.98);
  });
});

describe('bônus quando acabam as cartas', () => {
  it('com vida cheia, nunca sorteia cura', () => {
    for (const roll of [0, 0.3, 0.6, 0.99]) expect(applyLevelBonus(player(), roll)).not.toBe('heal');
  });

  it('cura de verdade quando sai', () => {
    const p = player({ hp: 40 });
    expect(applyLevelBonus(p, 0)).toBe('heal');
    expect(p.hp).toBe(70);
  });

  it('o bônus de dano sobe o dano', () => {
    const p = player();
    expect(applyLevelBonus(p, 0)).toBe('damage');
    expect(p.attackDamage).toBeCloseTo(10.5);
  });
});

describe('estatísticas do resumo', () => {
  it('soma o dano por golpe e ordena do maior para o menor', () => {
    const stats = emptyRunStats();
    recordDamage(stats, 'Bola de fogo', '#f00', 30);
    recordDamage(stats, 'Apoio', '#0f0', 50);
    recordDamage(stats, 'Bola de fogo', '#f00', 40.4);
    recordDamage(stats, 'Nada', '#000', 0);
    expect(damageRanking(stats).map((r) => [r.name, r.damage])).toEqual([['Bola de fogo', 70], ['Apoio', 50]]);
  });

  it('guarda uma amostra a cada 30 s', () => {
    const stats = emptyRunStats();
    sampleTimeline(stats, 29_000, 3, 2);
    expect(stats.timeline).toHaveLength(1);
    sampleTimeline(stats, 95_000, 12, 5);
    expect(stats.timeline.map((p) => p.ms)).toEqual([0, 30_000, 60_000, 90_000]);
    expect(stats.timeline.at(-1)).toEqual({ ms: 90_000, kills: 12, level: 5 });
  });
});

describe('na corrida de verdade', () => {
  const calm = (s: SurvivorState): SurvivorState => {
    s.nextBossAtMs = Number.POSITIVE_INFINITY;
    s.nextTrainerAtMs = Number.POSITIVE_INFINITY;
    s.finalBossAtMs = null;
    s.spawnAccumMs = -1e9;
    s.special.phase = 'ready';
    return s;
  };

  it('o ladrão aparece depois de 4 min jogados, foge e paga moedas quando cai', () => {
    const s = calm(createSurvivorState(5, { kindCount: 1 }));
    s.thiefClockMs = SURVIVOR_THIEF_FIRST_MS - 10;
    const spawn = stepSurvivor(s, { dx: 0, dy: 0 }, 20);
    expect(spawn).toContainEqual(expect.objectContaining({ type: 'thiefSpawn' }));
    const thief = s.enemies.find((e) => e.thief)!;
    expect(thief.dexId).toBe(52);
    expect(thief.grade).toBe('comum');
    const before = Math.hypot(thief.x - s.player.x, thief.y - s.player.y);
    thief.hp = thief.maxHp = 1e9;
    for (let i = 0; i < 20; i++) stepSurvivor(s, { dx: 0, dy: 0 }, 50);
    expect(Math.hypot(thief.x - s.player.x, thief.y - s.player.y)).toBeGreaterThan(before);
    thief.hp = 0;
    const caught = stepSurvivor(s, { dx: 0, dy: 0 }, 20);
    expect(caught).toContainEqual(expect.objectContaining({ type: 'thiefCaught' }));
    expect(s.player.bonusCoins).toBeGreaterThan(0);
    expect(s.thief).toBeNull();
  });

  it('se ninguém pega, o ladrão some', () => {
    const s = calm(createSurvivorState(6, { kindCount: 1 }));
    s.thiefClockMs = SURVIVOR_THIEF_FIRST_MS;
    stepSurvivor(s, { dx: 0, dy: 0 }, 20);
    const thief = s.enemies.find((e) => e.thief)!;
    const events: string[] = [];
    for (let t = 0; t < SURVIVOR_THIEF_LIFE_MS + 500; t += 100) {
      thief.hp = 1e9;
      events.push(...stepSurvivor(s, { dx: 0, dy: 0 }, 100).map((e) => e.type));
    }
    expect(events).toContain('thiefEscaped');
    expect(s.enemies.some((e) => e.thief)).toBe(false);
  });

  it('sem nenhuma carta para escolher, o nível dá um bônus em vez de abrir a tela', () => {
    const s = calm(createSurvivorState(7, { kindCount: 1 }));
    s.bannedUpgradeIds = SURVIVOR_UPGRADES.map((u) => u.id);
    s.player.xp = s.player.xpToNext;
    const events = stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(events).toContainEqual(expect.objectContaining({ type: 'levelBonus' }));
    expect(s.pendingUpgrade).toBeNull();
  });

  it('com o desafio adaptável, um Pokémon novo enfrenta inimigos mais fracos', () => {
    const normal = createSurvivorState(8, { kindCount: 1 });
    const easy = createSurvivorState(8, { kindCount: 1, adaptive: true });
    for (const s of [normal, easy]) {
      s.special.phase = 'ready';
      s.spawnAccumMs = 1e6;
      stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    }
    expect(easy.adaptive?.value).toBeLessThan(1);
    expect(easy.enemies[0]!.maxHp).toBeLessThan(normal.enemies[0]!.maxHp);
    expect(normal.adaptive).toBeNull();
  });

  it('o resumo traz o dano por golpe e a linha do tempo', () => {
    const s = calm(createSurvivorState(9, { kindCount: 1 }));
    s.enemies = [{ id: 1, kind: 0, boss: false, grade: 'comum', x: s.player.x + 30, y: s.player.y, hp: 500, maxHp: 500, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 }];
    for (let i = 0; i < 40; i++) stepSurvivor(s, { dx: 0, dy: 0 }, 100);
    s.player.hp = 0;
    const over = stepSurvivor(s, { dx: 0, dy: 0 }, 16).find((e) => e.type === 'gameover');
    const summary = over?.type === 'gameover' ? over.summary : null;
    expect(summary?.damageBySource?.[0]?.name).toBe(s.player.move.name);
    expect(summary?.damageBySource?.[0]?.damage).toBeGreaterThan(0);
    expect(summary?.timeline?.at(-1)?.ms).toBe(s.elapsedMs);
  });
});
