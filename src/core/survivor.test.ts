import { describe, expect, it } from 'vitest';
import {
  applyUpgrade,
  ARENA_H,
  ARENA_W,
  BALANCE,
  createSurvivorState,
  ENEMY_BEHAVIOR_LIMITS,
  PLAYER_RADIUS,
  rollUpgrades,
  stepSurvivor,
  survivorCoins,
  survivorScore,
  SURVIVOR_UPGRADES,
  xpForLevel,
} from './survivor';
import type { SurvivorEnemy, SurvivorState } from './survivor';
import { seededRng } from './battle';
import { attackProfile, moveFor } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';
import type { PokemonType } from './pokemon-data';

/** Golpe de um elemento numa forma escolhida (com os números de stats médios). */
function as(type: PokemonType, category: MoveCategory) {
  const move = { ...moveFor([type], null), category, estimated: false };
  return { move, profile: attackProfile(move, null) };
}

/** Uma corrida sem nascimentos nem chefe, para testar o golpe num inimigo posto à mão. */
function quiet(state: SurvivorState): SurvivorState {
  state.nextBossAtMs = Number.POSITIVE_INFINITY;
  state.spawnAccumMs = -1e9;
  return state;
}
function dummy(id: number, x: number, y: number, hp = 1000): SurvivorEnemy {
  return { id, kind: 0, boss: false, grade: 'comum', x, y, hp, maxHp: hp, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
}

function run(seed: number, kindCount = 4) {
  return createSurvivorState(seed, { kindCount });
}

describe('stepSurvivor', () => {
  it('anda na direção do analógico e fica preso dentro da arena', () => {
    const s = run(1);
    const before = { x: s.player.x, y: s.player.y };
    stepSurvivor(s, { dx: 1, dy: 0 }, 200);
    expect(s.player.x).toBeGreaterThan(before.x);
    expect(s.player.y).toBeCloseTo(before.y, 5);

    // Empurra pro canto por muito tempo: não escapa da arena.
    for (let i = 0; i < 500; i++) stepSurvivor(s, { dx: -1, dy: -1 }, 100);
    expect(s.player.x).toBeGreaterThanOrEqual(PLAYER_RADIUS - 0.01);
    expect(s.player.y).toBeGreaterThanOrEqual(PLAYER_RADIUS - 0.01);
  });

  it('fica parado se não há direção (0,0)', () => {
    const s = run(2);
    const before = { x: s.player.x, y: s.player.y };
    stepSurvivor(s, { dx: 0, dy: 0 }, 500);
    expect(s.player.x).toBe(before.x);
    expect(s.player.y).toBe(before.y);
  });

  it('nasce inimigo fora da arena (nunca em cima do jogador) e ele persegue', () => {
    const s = run(3);
    // Passos pequenos: pega o inimigo no quadro em que ele acabou de nascer, antes de andar muito.
    let justSpawned: { x: number; y: number } | null = null;
    for (let i = 0; i < Math.ceil((BALANCE.spawnStartMs + 100) / 20) && !justSpawned; i++) {
      stepSurvivor(s, { dx: 0, dy: 0 }, 20);
      if (s.enemies.length > 0) justSpawned = { x: s.enemies[0]!.x, y: s.enemies[0]!.y };
    }
    expect(justSpawned).not.toBeNull();
    const inside = justSpawned!.x >= 0 && justSpawned!.x <= ARENA_W && justSpawned!.y >= 0 && justSpawned!.y <= ARENA_H;
    expect(inside).toBe(false); // ainda não entrou quando nasceu
    const d0 = Math.hypot(s.enemies[0]!.x - s.player.x, s.enemies[0]!.y - s.player.y);
    stepSurvivor(s, { dx: 0, dy: 0 }, 500);
    const d1 = Math.hypot(s.enemies[0]!.x - s.player.x, s.enemies[0]!.y - s.player.y);
    expect(d1).toBeLessThan(d0); // perseguindo
  });

  it('autoataque derruba um inimigo parado ao alcance e dá XP (orbe coletado)', () => {
    const s = run(4);
    // Coloca um inimigo fraco bem perto, já dentro da arena, sem esperar nascimento.
    s.enemies.push({ id: 999, kind: 0, boss: false, grade: 'comum', x: s.player.x + 40, y: s.player.y, hp: 5, maxHp: 5, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 });
    let gotKill = false;
    for (let i = 0; i < 40 && !gotKill; i++) {
      stepSurvivor(s, { dx: 0, dy: 0 }, 100);
      if (s.kills > 0) gotKill = true;
    }
    expect(gotKill).toBe(true);
    expect(s.enemies.some((e) => e.id === 999)).toBe(false);
    // O orbe nasce na posição do inimigo morto, bem perto do jogador: é coletado logo em seguida.
    expect(s.player.xp).toBeGreaterThan(0);
  });

  it('sobe de nível, abre escolha de upgrade e pausa o avanço até escolher', () => {
    const s = run(5);
    s.player.xp = s.player.xpToNext - 1;
    const events = stepSurvivor(s, { dx: 0, dy: 0 }, 16); // 1 de dano/orbe não entra aqui; força via xp direto
    // Sem orbe real, o xp não passa sozinho: soma manualmente para simular a coleta e roda de novo.
    s.player.xp = s.player.xpToNext;
    const events2 = stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(events2.some((e) => e.type === 'levelup')).toBe(true);
    expect(s.pendingUpgrade).not.toBeNull();
    expect(s.pendingUpgrade).toHaveLength(3);

    const before = { x: s.player.x };
    stepSurvivor(s, { dx: 1, dy: 0 }, 1000); // com upgrade pendente, o jogo não avança
    expect(s.player.x).toBe(before.x);

    applyUpgrade(s, s.pendingUpgrade![0]!.id);
    expect(s.pendingUpgrade).toBeNull();
    stepSurvivor(s, { dx: 1, dy: 0 }, 100);
    expect(s.player.x).not.toBe(before.x); // voltou a andar
    void events;
  });

  it('upgrade desconhecido não quebra nada (não aplica, só libera)', () => {
    const s = run(6);
    s.pendingUpgrade = [{ id: 'nao-existe', name: '', description: '' }];
    const before = { ...s.player };
    applyUpgrade(s, 'nao-existe');
    expect(s.pendingUpgrade).toBeNull();
    expect(s.player).toEqual(before);
  });

  it('upgrade comum fora da oferta não aplica', () => {
    const s = run(6.5);
    s.pendingUpgrade = [{ id: 'legs', name: '', description: '' }];
    const before = s.player.speed;
    applyUpgrade(s, 'power');
    expect(s.player.speed).toBe(before);
    expect(s.pendingUpgrade).toBeNull();
  });

  it('perde HP ao encostar em inimigo e fica brevemente invencível (não toma dano em cada quadro)', () => {
    const s = run(7);
    s.enemies.push({ id: 1, kind: 0, boss: false, grade: 'comum', x: s.player.x, y: s.player.y, hp: 999, maxHp: 999, speed: 0, damage: 10, radius: 13, hitFlashMs: 0 });
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    const hpAfterFirstHit = s.player.hp;
    expect(hpAfterFirstHit).toBe(90);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16); // ainda dentro da janela de invencibilidade
    expect(s.player.hp).toBe(hpAfterFirstHit);
  });

  it('termina o jogo quando o HP chega a zero, com o resumo da corrida', () => {
    const s = run(8);
    s.player.hp = 1;
    s.enemies.push({ id: 1, kind: 0, boss: false, grade: 'comum', x: s.player.x, y: s.player.y, hp: 999, maxHp: 999, speed: 0, damage: 50, radius: 13, hitFlashMs: 0 });
    s.hostileProjectiles.push({ id: 20, x: s.player.x + 100, y: s.player.y, vx: 0, vy: 0, damage: 1, lifeMs: 500, size: 4 });
    const events = stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.over).toBe(true);
    expect(s.hostileProjectiles).toHaveLength(0);
    const over = events.find((e) => e.type === 'gameover');
    expect(over).toBeTruthy();
    if (over?.type === 'gameover') {
      expect(over.summary.level).toBe(1);
      expect(over.summary.kills).toBe(0);
    }
    // Depois de "over", stepSurvivor não faz mais nada (não finge que o jogo continua).
    const before = { x: s.player.x, hp: s.player.hp };
    stepSurvivor(s, { dx: 1, dy: 1 }, 1000);
    expect(s.player.x).toBe(before.x);
    expect(s.player.hp).toBe(before.hp);
  });

  it('chefe nasce depois de 60s, maior e mais forte que um inimigo comum', () => {
    // HP e dano bem acima do normal: o teste é sobre o temporizador do chefe, não sobre balanceamento de combate
    // (parado sem reagir, um jogador comum não sobreviveria a uma onda crescente por 60s de verdade).
    const s = run(9);
    s.player.maxHp = 100_000;
    s.player.hp = 100_000;
    s.player.attackDamage = 500;
    s.player.attackRange = 400;
    let bossSeen = false;
    for (let i = 0; i < 620 && !bossSeen; i++) {
      const events = stepSurvivor(s, { dx: 0, dy: 0 }, 100);
      if (events.some((e) => e.type === 'bossSpawn')) bossSeen = true;
      if (s.pendingUpgrade) applyUpgrade(s, s.pendingUpgrade[0]!.id); // não deixa upgrades travarem o teste
    }
    expect(bossSeen).toBe(true);
    const boss = s.enemies.find((e) => e.boss);
    expect(boss).toBeTruthy();
    expect(boss!.kind).toBe(s.kindCount);
    expect(boss!.maxHp).toBeGreaterThan(100);
  });

  it('xpForLevel cresce com o nível (upgrades ficam mais caros)', () => {
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(5));
  });

  it('rollUpgrades nunca repete upgrade na mesma leva e usa só ids do catálogo', () => {
    const rng = seededRng(42);
    const picks = rollUpgrades(rng, 5);
    expect(picks).toHaveLength(5);
    expect(new Set(picks.map((p) => p.id)).size).toBe(5);
    for (const p of picks) expect(SURVIVOR_UPGRADES.some((u) => u.id === p.id)).toBe(true);
  });

  it('é determinístico: a mesma semente produz a mesma corrida', () => {
    const a = run(123);
    const b = run(123);
    for (let i = 0; i < 300; i++) {
      stepSurvivor(a, { dx: 0.5, dy: 0.2 }, 50);
      stepSurvivor(b, { dx: 0.5, dy: 0.2 }, 50);
      if (a.pendingUpgrade) applyUpgrade(a, a.pendingUpgrade[0]!.id);
      if (b.pendingUpgrade) applyUpgrade(b, b.pendingUpgrade[0]!.id);
    }
    expect(a.player.x).toBeCloseTo(b.player.x, 6);
    expect(a.player.y).toBeCloseTo(b.player.y, 6);
    expect(a.kills).toBe(b.kills);
    expect(a.enemies.length).toBe(b.enemies.length);
  });

  it('golpe perfurante atravessa o inimigo sem acertar o MESMO de novo a cada quadro', () => {
    const s = createSurvivorState(1, { kindCount: 1 });
    s.nextBossAtMs = Number.POSITIVE_INFINITY;
    s.spawnAccumMs = -1e9; // sem inimigos novos
    s.player.pierce = 3;
    s.player.attackDamage = 5;
    // Um inimigo parado, grande e bem resistente, no caminho do disparo.
    s.enemies.push({ id: 999, kind: 0, boss: false, grade: 'comum', x: s.player.x + 60, y: s.player.y, hp: 1000, maxHp: 1000, speed: 0, damage: 0, radius: 40, hitFlashMs: 0 });
    s.player.attackCooldownMs = 1e9; // um disparo só
    for (let i = 0; i < 40; i++) stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    // Um projétil, um acerto: 5 de dano (antes acertava em vários quadros seguidos enquanto passava por dentro).
    expect(s.enemies.find((e) => e.id === 999)!.hp).toBe(995);
  });

  it('subir dois níveis de uma vez dá duas escolhas de upgrade, uma depois da outra', () => {
    const s = createSurvivorState(1, { kindCount: 1 });
    s.player.xp = xpForLevel(1) + xpForLevel(2); // XP de dois níveis (ex.: orbe de chefe)
    s.spawnAccumMs = -1e9;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.level).toBe(3);
    expect(s.pendingUpgrade).not.toBeNull();
    applyUpgrade(s, s.pendingUpgrade![0]!.id);
    expect(s.pendingUpgrade).not.toBeNull(); // a segunda escolha
    applyUpgrade(s, s.pendingUpgrade![0]!.id);
    expect(s.pendingUpgrade).toBeNull();
    expect(s.upgradesOwed).toBe(0);
  });
});

describe('golpes por tipo', () => {
  it('aura (Veneno) acerta todos em volta, mesmo sem mirar, e queima', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1, ...as('poison', 'aura') }));
    s.enemies.push(dummy(1, s.player.x + 30, s.player.y), dummy(2, s.player.x - 30, s.player.y), dummy(3, s.player.x + 300, s.player.y));
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.enemies[0]!.hp).toBeLessThan(1000);
    expect(s.enemies[1]!.hp).toBeLessThan(1000);
    expect(s.enemies[2]!.hp).toBe(1000); // longe demais
    expect(s.enemies[0]!.burnMs).toBeGreaterThan(0);
    expect(s.fx.some((f) => f.kind === 'pulse')).toBe(true);
    const afterHit = s.enemies[0]!.hp;
    s.player.attackTimerMs = 1e9; // sem novos pulsos: só a queimadura
    stepSurvivor(s, { dx: 0, dy: 0 }, 500);
    expect(s.enemies[0]!.hp).toBeLessThan(afterHit);
  });

  it('área (Terra) explode no inimigo mais próximo, acerta quem está colado nele e atordoa', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1, ...as('ground', 'area') }));
    const near = dummy(1, s.player.x + 100, s.player.y);
    const glued = dummy(2, s.player.x + 120, s.player.y);
    const far = dummy(3, s.player.x - 160, s.player.y);
    s.enemies.push(near, glued, far);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(near.hp).toBeLessThan(1000);
    expect(glued.hp).toBeLessThan(1000);
    expect(far.hp).toBe(1000);
    expect(near.stunMs).toBeGreaterThan(0);
    expect(s.fx.some((f) => f.kind === 'blast')).toBe(true);
  });

  it('área sem ninguém no alcance não gasta a recarga', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1, ...as('normal', 'area') }));
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.attackTimerMs).toBe(0);
  });

  it('projétil Elétrico salta para mais um inimigo com menos dano', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1, ...as('electric', 'projetil') }));
    s.player.attackCooldownMs = 1e9;
    const first = dummy(1, s.player.x + 60, s.player.y);
    const second = dummy(2, s.player.x + 60, s.player.y + 70);
    s.enemies.push(first, second);
    for (let i = 0; i < 60; i++) stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(first.hp).toBeLessThan(1000);
    expect(second.hp).toBeGreaterThan(first.hp); // o salto acerta, mas com menos dano que o alvo principal
  });

  it('Gelo deixa lento e Água empurra', () => {
    const ice = quiet(createSurvivorState(1, { kindCount: 1, ...as('ice', 'projetil') }));
    const slowed = dummy(1, ice.player.x + 50, ice.player.y);
    ice.enemies.push(slowed);
    for (let i = 0; i < 20; i++) stepSurvivor(ice, { dx: 0, dy: 0 }, 16);
    expect(slowed.slowMs).toBeGreaterThan(0);

    const water = quiet(createSurvivorState(1, { kindCount: 1, ...as('water', 'projetil') }));
    const pushed = dummy(1, water.player.x + 50, water.player.y);
    water.enemies.push(pushed);
    for (let i = 0; i < 20; i++) stepSurvivor(water, { dx: 0, dy: 0 }, 16);
    expect(pushed.x).toBeGreaterThan(water.player.x + 60);
  });

  it('Água marca o alvo e o próximo golpe Elétrico consome a sinergia', () => {
    const water = quiet(createSurvivorState(1, { kindCount: 1, ...as('water', 'aura') }));
    const electric = as('electric', 'aura');
    const target = dummy(1, water.player.x + 30, water.player.y);
    water.player.attackRadius = 100;
    water.player.attackDamage = 100;
    water.enemies.push(target);
    stepSurvivor(water, { dx: 0, dy: 0 }, 16);
    expect(target.wetMs).toBeGreaterThan(0);
    water.player.move = electric.move;
    water.player.attackTimerMs = 0;
    stepSurvivor(water, { dx: 0, dy: 0 }, 16);
    expect(target.hp).toBeLessThan(980);
    expect(target.wetMs).toBe(0);
  });

  it('os upgrades sorteados combinam com o golpe e falam dele', () => {
    const aura = as('grass', 'aura').move;
    for (let seed = 1; seed < 30; seed++) {
      const picks = rollUpgrades(seededRng(seed), 3, aura);
      for (const p of picks) expect(['multishot', 'pierce', 'range']).not.toContain(p.id);
    }
    const all = rollUpgrades(seededRng(3), 6, aura);
    expect(all.find((p) => p.id === 'power')?.description).toBe('Folhas cortantes: +20% de dano, até 60.');
  });

  it('oferece especializações só para o tipo principal e não repete as já escolhidas', () => {
    const ghost = as('ghost', 'projetil').move;
    const state = quiet(createSurvivorState(9, { kindCount: 1, move: ghost, profile: attackProfile(ghost, null) }));
    const ids = new Set(Array.from({ length: 12 }, (_, seed) => rollUpgrades(seededRng(seed + 30), 12, ghost, state.player).map((pick) => pick.id)).flat());
    expect(ids.has('ghost-haunt')).toBe(true);
    expect(ids.has('bug-formation')).toBe(false);
    state.pendingUpgrade = [{ id: 'ghost-haunt', name: '', description: '' }];
    applyUpgrade(state, 'ghost-haunt');
    const later = Array.from({ length: 12 }, (_, seed) => rollUpgrades(seededRng(seed + 50), 12, ghost, state.player).map((pick) => pick.id)).flat();
    expect(later).not.toContain('ghost-haunt');
  });

  it('limita o acúmulo dos upgrades ofensivos sem enfraquecer stats iniciais mais altos', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1 }));
    for (let i = 0; i < 30; i++) {
      for (const id of ['power', 'haste', 'multishot', 'pierce']) {
        s.pendingUpgrade = [{ id, name: '', description: '' }];
        applyUpgrade(s, id);
      }
    }
    expect(s.player.attackDamage).toBe(60);
    expect(s.player.attackCooldownMs).toBe(240);
    expect(s.player.shots).toBe(5);
    expect(s.player.pierce).toBe(4);

    s.player.attackDamage = 75;
    s.player.attackCooldownMs = 180;
    s.pendingUpgrade = [{ id: 'power', name: '', description: '' }];
    applyUpgrade(s, 'power');
    s.pendingUpgrade = [{ id: 'haste', name: '', description: '' }];
    applyUpgrade(s, 'haste');
    expect(s.player.attackDamage).toBe(75);
    expect(s.player.attackCooldownMs).toBe(180);
  });
});

describe('arquétipos de inimigos', () => {
  function enemy(id: number, archetype: 'perseguidor' | 'flanqueador' | 'atirador' | 'protetor' | 'suporte', x: number, y: number, hp = 100): SurvivorEnemy {
    return { id, kind: 0, boss: false, grade: 'comum', archetype, specialTimerMs: 0, x, y, hp, maxHp: hp, speed: 60, damage: 10, radius: 13, hitFlashMs: 0 };
  }

  it('atirador dispara, mantém alcance e o projétil sai ao atingir ou ultrapassar a arena', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1 }));
    const shooter = enemy(1, 'atirador', s.player.x + 300, s.player.y);
    s.enemies.push(shooter);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.hostileProjectiles).toHaveLength(1);
    expect(Math.hypot(s.hostileProjectiles[0]!.vx, s.hostileProjectiles[0]!.vy)).toBeCloseTo(BALANCE.hostileProjectileSpeed);
    s.hostileProjectiles[0]!.x = ARENA_W + 100;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.hostileProjectiles).toHaveLength(0);
  });

  it('atirador se desloca com metade da velocidade normal', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1 }));
    const shooter = enemy(1, 'atirador', s.player.x + 300, s.player.y);
    shooter.specialTimerMs = 1000;
    s.enemies.push(shooter);
    const before = shooter.x;
    stepSurvivor(s, { dx: 0, dy: 0 }, 100);
    expect(Math.abs(shooter.x - before)).toBeCloseTo(shooter.speed * BALANCE.rangedEnemySpeedMultiplier * 0.1);
  });

  it('flanqueador usa uma aproximação lateral sem velocidade infinita', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1 }));
    const flanker = enemy(2, 'flanqueador', s.player.x + 240, s.player.y);
    s.enemies.push(flanker);
    const before = { x: flanker.x, y: flanker.y };
    stepSurvivor(s, { dx: 0, dy: 0 }, 100);
    expect(Math.hypot(flanker.x - before.x, flanker.y - before.y)).toBeLessThanOrEqual(7);
    expect(flanker.y).not.toBe(before.y);
  });

  it('protetor e suporte têm recarga e atuam em aliados válidos', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1 }));
    const protectedAlly = enemy(3, 'perseguidor', s.player.x + 90, s.player.y, 100);
    protectedAlly.hp = 40;
    const protector = enemy(4, 'protetor', s.player.x + 80, s.player.y + 30, 100);
    const support = enemy(5, 'suporte', s.player.x + 70, s.player.y - 30, 100);
    s.enemies.push(protectedAlly, protector, support);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(protectedAlly.hp).toBeGreaterThan(40);
    expect(protectedAlly.protectedMs).toBeGreaterThan(0);
  });

  it('limita projéteis hostis mesmo com muitos atiradores', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1 }));
    for (let i = 0; i < ENEMY_BEHAVIOR_LIMITS.hostileProjectiles * 2; i++) {
      const e = enemy(i + 1, 'atirador', s.player.x + 300, s.player.y + (i % 4) * 2);
      s.enemies.push(e);
    }
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.hostileProjectiles.length).toBeLessThanOrEqual(ENEMY_BEHAVIOR_LIMITS.hostileProjectiles);
  });
});

describe('efeitos defensivos de golpes próximos', () => {
  it('a aura desacelera projéteis dentro do raio em 20%', () => {
    const aura = as('psychic', 'aura');
    const s = quiet(createSurvivorState(5, { kindCount: 1, move: aura.move, profile: aura.profile }));
    const nearX = s.player.x + 35;
    const farX = s.player.x + s.player.attackRadius + 30;
    s.hostileProjectiles.push(
      { id: 20, x: nearX, y: s.player.y + 20, vx: 100, vy: 0, damage: 1, lifeMs: 1000, size: 4 },
      { id: 21, x: farX, y: s.player.y + 20, vx: 100, vy: 0, damage: 1, lifeMs: 1000, size: 4 },
    );
    stepSurvivor(s, { dx: 0, dy: 0 }, 100);
    expect(s.hostileProjectiles.find((projectile) => projectile.id === 20)?.x).toBeCloseTo(nearX + 10 * BALANCE.auraProjectileSpeedMultiplier);
    expect(s.hostileProjectiles.find((projectile) => projectile.id === 21)?.x).toBeCloseTo(farX + 10);
  });

  it('órbita e cone apararam no máximo um projétil por ataque', () => {
    for (const category of ['orbit', 'cone'] as const) {
      const profile = as(category === 'orbit' ? 'grass' : 'fighting', category);
      const s = quiet(createSurvivorState(6, { kindCount: 1, move: profile.move, profile: profile.profile }));
      s.hostileProjectiles.push(
        { id: 30, x: s.player.x + 45, y: s.player.y, vx: 0, vy: 0, damage: 1, lifeMs: 1000, size: 4 },
        { id: 31, x: s.player.x + 48, y: s.player.y, vx: 0, vy: 0, damage: 1, lifeMs: 1000, size: 4 },
      );
      stepSurvivor(s, { dx: 0, dy: 0 }, 16);
      expect(s.hostileProjectiles.map((projectile) => projectile.id)).toEqual([31]);
    }
  });
});

describe('segundo golpe', () => {
  it('chama um apoio real, que mantém o próprio perfil e ataca a partir do jogador', () => {
    const supportMove = as('dark', 'projetil').move;
    const supportProfile = attackProfile(supportMove, null);
    const s = quiet(createSurvivorState(1, { kindCount: 1, supportCandidate: { dexId: 197, name: 'Umbreon', move: supportMove, profile: supportProfile } }));
    s.player.level = 5;
    s.player.xp = s.player.xpToNext;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    const card = s.pendingUpgrade?.find((option) => option.id === 'second-attack');
    expect(card).toBeTruthy();
    const events = applyUpgrade(s, 'second-attack');
    expect(events).toEqual([{ type: 'secondAttack', name: 'Umbreon' }]);
    expect(s.player.secondMove).toBeTruthy();
    expect(s.support?.name).toBe('Umbreon');
    const frozenDamage = s.support!.profile.damage;
    s.pendingUpgrade = [{ id: 'power', name: '', description: '' }];
    applyUpgrade(s, 'power');
    expect(s.support!.profile.damage).toBe(frozenDamage);
    s.player.attackCooldownMs = 1e9;
    s.support!.attackTimerMs = 0;
    s.support!.x = 1;
    s.support!.y = 1;
    s.enemies.push(dummy(10, s.player.x + 60, s.player.y, 1000));
    const origin = { x: s.player.x, y: s.player.y };
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.projectiles.some((projectile) => projectile.move?.name === s.player.secondMove?.name)).toBe(true);
    const projectile = s.projectiles.find((item) => item.source === 'support');
    expect(projectile?.x).toBeGreaterThan(origin.x - 1);
    expect(projectile?.x).toBeLessThan(origin.x + 10);
    expect(projectile?.y).toBeCloseTo(origin.y, 0);
  });

  it('atribui o roubo de vida ao golpe do apoio, não ao golpe principal', () => {
    const supportMove = as('dark', 'aura').move;
    const s = quiet(createSurvivorState(2, { kindCount: 1, supportCandidate: { dexId: 197, name: 'Umbreon', move: supportMove, profile: attackProfile(supportMove, null) } }));
    s.player.level = 6;
    s.pendingUpgrade = [{ id: 'second-attack', name: '', description: '' }];
    applyUpgrade(s, 'second-attack');
    s.player.hp = s.player.maxHp - 10;
    s.player.attackTimerMs = 1e9;
    s.support!.attackTimerMs = 0;
    s.enemies.push(dummy(10, s.player.x + 20, s.player.y, 1000));
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.hp).toBeGreaterThan(s.player.maxHp - 10);
  });

  it('gelo congela por pouco tempo e inseto aplica apenas um eco de dano por impacto', () => {
    const ice = as('ice', 'projetil');
    const cold = quiet(createSurvivorState(3, { kindCount: 1, move: ice.move, profile: ice.profile }));
    const frozen = dummy(1, cold.player.x + 20, cold.player.y, 1000);
    cold.enemies.push(frozen);
    for (let i = 0; i < 3; i++) { cold.player.attackTimerMs = 0; stepSurvivor(cold, { dx: 0, dy: 0 }, 16); }
    expect(frozen.frostImmuneMs).toBeGreaterThan(0);
    expect(frozen.stunMs).toBeGreaterThan(0);

    const bug = as('bug', 'projetil');
    const swarm = quiet(createSurvivorState(4, { kindCount: 1, move: bug.move, profile: bug.profile }));
    const target = dummy(2, swarm.player.x + 20, swarm.player.y, 1000);
    swarm.enemies.push(target);
    stepSurvivor(swarm, { dx: 0, dy: 0 }, 16);
    expect(target.hp).toBeLessThan(1000 - swarm.player.attackDamage);
    expect(swarm.fx.some((fx) => fx.kind === 'echo')).toBe(true);
  });
});

describe('evolução na corrida', () => {
  const chain = (dexId: number) => (dexId === 4 ? [{ dexId: 5, name: 'Charmeleon' }] : dexId === 5 ? [{ dexId: 6, name: 'Charizard' }] : []);

  function levelTo(s: SurvivorState, level: number): void {
    s.player.level = level - 1;
    s.player.xp = s.player.xpToNext;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
  }

  it('a carta "Evoluir" aparece a partir do nível 8 e troca a espécie, com mais vida e golpe mais forte', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1, ...as('fire', 'projetil'), dexId: 4, evolutions: chain }));
    levelTo(s, 7);
    expect(s.pendingUpgrade!.some((o) => o.id.startsWith('evolve:'))).toBe(false);
    applyUpgrade(s, s.pendingUpgrade![0]!.id);
    levelTo(s, 8);
    const card = s.pendingUpgrade!.find((o) => o.id.startsWith('evolve:'));
    expect(card?.name).toBe('Evoluir para Charmeleon');
    const before = { maxHp: s.player.maxHp, dmg: s.player.attackDamage };
    const events = applyUpgrade(s, card!.id);
    expect(events).toEqual([{ type: 'evolve', dexId: 5, name: 'Charmeleon' }]);
    expect(s.player.dexId).toBe(5);
    expect(s.player.stage).toBe(1);
    expect(s.player.maxHp).toBe(before.maxHp + 30);
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(s.player.attackDamage).toBeGreaterThan(before.dmg);
    expect(s.player.move.name).toBe('Bola de fogo'); // o golpe é o mesmo, só mais forte
  });

  it('a 2ª evolução só a partir do nível 16; forma final ou sem dado nunca mostra a carta', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1, dexId: 5, evolutions: chain }));
    s.player.stage = 1;
    levelTo(s, 12);
    expect(s.pendingUpgrade!.some((o) => o.id.startsWith('evolve:'))).toBe(false);
    applyUpgrade(s, s.pendingUpgrade![0]!.id);
    levelTo(s, 16);
    expect(s.pendingUpgrade!.some((o) => o.id === 'evolve:6')).toBe(true);

    const final = quiet(createSurvivorState(1, { kindCount: 1, dexId: 6, evolutions: chain }));
    levelTo(final, 10);
    expect(final.pendingUpgrade!.some((o) => o.id.startsWith('evolve:'))).toBe(false);
  });

  it('não evolui para uma forma que não foi oferecida', () => {
    const s = quiet(createSurvivorState(1, { kindCount: 1, dexId: 4, evolutions: chain }));
    levelTo(s, 3);
    applyUpgrade(s, 'evolve:5');
    expect(s.player.dexId).toBe(4);
  });
});

describe('moedas da Torre', () => {
  it('metade da pontuação, de 5 a 50; nada se saiu logo sem derrotar ninguém', () => {
    expect(survivorCoins({ survivedMs: 5000, kills: 0, level: 1, trainersBeaten: 0, bossesBeaten: 0 })).toBe(0);
    expect(survivorCoins({ survivedMs: 25_000, kills: 0, level: 1, trainersBeaten: 0, bossesBeaten: 0 })).toBe(15);
    expect(survivorCoins({ survivedMs: 3000, kills: 1, level: 1, trainersBeaten: 0, bossesBeaten: 0 })).toBe(5);
    expect(survivorCoins({ survivedMs: 600_000, kills: 400, level: 30, trainersBeaten: 0, bossesBeaten: 0 })).toBe(50);
    expect(survivorScore({ survivedMs: 60_000, kills: 10, level: 4 })).toBe(100);
  });
});

describe('efeitos ambientais dos biomas', () => {
  it('reduz o passo dentro de uma zona de Kanto sem bloquear a arena', () => {
    const slow = quiet(createSurvivorState(11, { kindCount: 1, player: { x: 100, y: 120 } }));
    const open = quiet(createSurvivorState(11, { kindCount: 1, player: { x: 480, y: 320 } }));
    stepSurvivor(slow, { dx: 1, dy: 0 }, 1000);
    stepSurvivor(open, { dx: 1, dy: 0 }, 1000);
    expect(slow.player.x - 100).toBeCloseTo((open.player.x - 480) * 0.88, 3);
    expect(slow.player.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
  });

  it('amplifica um golpe Elétrico dentro de uma poça de Hoenn', () => {
    const electric = as('electric', 'area');
    const s = quiet(createSurvivorState(12, { kindCount: 1, move: electric.move, profile: electric.profile, player: { x: 140, y: 450 } }));
    s.elapsedMs = 2 * 135_000;
    s.special.phase = 'ready'; // O encontro já passou neste cenário de combate.
    s.player.attackDamage = 100;
    s.player.attackRadius = 50;
    s.player.attackRange = 100;
    const enemy = dummy(1, 160, 450, 1000);
    s.enemies = [enemy];
    stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    expect(enemy.hp).toBeCloseTo(880, 5);
  });
});

describe('treinadores e chefão final', () => {
  it('aos 5 min aparece um treinador com 3 Pokémon elite, e aos 20 min o chefão com 6', () => {
    const s = createSurvivorState(42, { kindCount: 4 });
    const timeline: string[] = [];
    s.special.phase = 'ready';
    // Pula para quase os 5 min; os eventos aparecem no quadro de dentro.
    s.elapsedMs = 300_000 - 200;
    const ev1 = stepSurvivor(s, { dx: 0, dy: 0 }, 400);
    for (const e of ev1) if (e.type === 'trainerSpawn') timeline.push(`t:${e.count}:${e.final}`);
    expect(timeline).toContain('t:3:false');
    expect(s.enemies.filter((e) => e.grade === 'elite').length).toBe(3);
    // Pula para quase 20 min.
    s.elapsedMs = 1_200_000 - 200;
    const ev2 = stepSurvivor(s, { dx: 0, dy: 0 }, 400);
    for (const e of ev2) if (e.type === 'trainerSpawn') timeline.push(`t:${e.count}:${e.final}`);
    expect(timeline).toContain('t:6:true');
    expect(s.enemies.filter((e) => e.grade === 'chefao').length).toBe(6);
    const after = (() => { for (const e of s.enemies) e.hp = 0; return stepSurvivor(s, { dx: 0, dy: 0 }, 1); })();
    expect(s.finalBossBeaten).toBe(true);
    expect(s.trainersBeaten).toBeGreaterThanOrEqual(1);
    expect(s.bossesBeaten).toBeGreaterThanOrEqual(1);
    // Modo normal: a corrida termina em vitória assim que o chefão final cai (abre o resumo, destrava o infinito).
    expect(s.over).toBe(true);
    const over = after.find((e) => e.type === 'gameover');
    expect(over?.summary.finalBossBeaten).toBe(true);
    expect(over?.summary.infinite).toBe(false);
  });

  it('modo infinito: derrotar o chefão não termina a corrida (segue até morrer)', () => {
    const s = createSurvivorState(42, { kindCount: 4, infinite: true });
    s.special.phase = 'ready';
    s.elapsedMs = 1_200_000 - 200;
    stepSurvivor(s, { dx: 0, dy: 0 }, 400);
    for (const e of s.enemies) e.hp = 0;
    stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    expect(s.over).toBe(false);
    expect(s.bossesBeaten).toBeGreaterThanOrEqual(1);
  });

  it('modo infinito começa mais difícil (escala 1,25) e cresce a cada minuto', () => {
    const s = createSurvivorState(7, { kindCount: 2, infinite: true });
    s.special.phase = 'ready';
    expect(s.infinite).toBe(true);
    expect(s.infiniteScale).toBeCloseTo(1.25, 3);
    s.elapsedMs = 10 * 60_000;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.infiniteScale).toBeGreaterThan(2);
  });

  it('moedas: +40 por treinador, +80 por chefão (além da pontuação)', () => {
    expect(survivorCoins({ survivedMs: 60_000, kills: 10, level: 4, trainersBeaten: 2, bossesBeaten: 1 })).toBe(50 + 40 + 80);
    expect(survivorCoins({ survivedMs: 60_000, kills: 10, level: 4, trainersBeaten: 0, bossesBeaten: 0 })).toBe(50);
  });
});
