import { describe, expect, it } from 'vitest';
import {
  applyUpgrade,
  ARENA_H,
  ARENA_W,
  createSurvivorState,
  PLAYER_RADIUS,
  rollUpgrades,
  stepSurvivor,
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
  return { id, kind: 0, boss: false, x, y, hp, maxHp: hp, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
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
    for (let i = 0; i < 100 && !justSpawned; i++) {
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
    s.enemies.push({ id: 999, kind: 0, boss: false, x: s.player.x + 40, y: s.player.y, hp: 5, maxHp: 5, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 });
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

  it('perde HP ao encostar em inimigo e fica brevemente invencível (não toma dano em cada quadro)', () => {
    const s = run(7);
    s.enemies.push({ id: 1, kind: 0, boss: false, x: s.player.x, y: s.player.y, hp: 999, maxHp: 999, speed: 0, damage: 10, radius: 13, hitFlashMs: 0 });
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    const hpAfterFirstHit = s.player.hp;
    expect(hpAfterFirstHit).toBe(90);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16); // ainda dentro da janela de invencibilidade
    expect(s.player.hp).toBe(hpAfterFirstHit);
  });

  it('termina o jogo quando o HP chega a zero, com o resumo da corrida', () => {
    const s = run(8);
    s.player.hp = 1;
    s.enemies.push({ id: 1, kind: 0, boss: false, x: s.player.x, y: s.player.y, hp: 999, maxHp: 999, speed: 0, damage: 50, radius: 13, hitFlashMs: 0 });
    const events = stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.over).toBe(true);
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
    s.enemies.push({ id: 999, kind: 0, boss: false, x: s.player.x + 60, y: s.player.y, hp: 1000, maxHp: 1000, speed: 0, damage: 0, radius: 40, hitFlashMs: 0 });
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
    expect(first.hp).toBe(990);
    expect(second.hp).toBe(993);
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

  it('os upgrades sorteados combinam com o golpe e falam dele', () => {
    const aura = as('grass', 'aura').move;
    for (let seed = 1; seed < 30; seed++) {
      const picks = rollUpgrades(seededRng(seed), 3, aura);
      for (const p of picks) expect(['multishot', 'pierce', 'range']).not.toContain(p.id);
    }
    const all = rollUpgrades(seededRng(3), 6, aura);
    expect(all.find((p) => p.id === 'power')?.description).toBe('Folhas cortantes: +20% de dano.');
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
