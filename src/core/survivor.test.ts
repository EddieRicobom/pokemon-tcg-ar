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
import { seededRng } from './battle';

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
