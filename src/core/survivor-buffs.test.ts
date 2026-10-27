import { describe, expect, it } from 'vitest';
import { applyUpgrade, createSurvivorState, stepSurvivor, SURVIVOR_UPGRADES } from './survivor';
import type { SurvivorEnemy, SurvivorState } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import type { MoveCategory, SurvivorMove } from './survivor-moves';
import type { PokemonType } from './pokemon-data';

/** Golpe de um elemento numa forma escolhida (mesma base dos testes do motor). */
function as(type: PokemonType, category: MoveCategory): { move: SurvivorMove; profile: ReturnType<typeof attackProfile> } {
  const move = { ...moveFor([type], null), category, estimated: false };
  return { move, profile: attackProfile(move, null) };
}

/** Uma corrida sem nascimentos nem chefe, nem ataques do jogador, para testar um efeito isolado. */
function quiet(state: SurvivorState): SurvivorState {
  state.nextBossAtMs = Number.POSITIVE_INFINITY;
  state.spawnAccumMs = -1e9;
  state.player.attackTimerMs = 1e9;
  return state;
}

function pick(state: SurvivorState, id: string): void {
  state.pendingUpgrade = [{ id, name: '', description: '' }];
  applyUpgrade(state, id);
}

function enemy(id: number, x: number, y: number, overrides: Partial<SurvivorEnemy> = {}): SurvivorEnemy {
  return { id, kind: 0, boss: false, grade: 'comum', x, y, hp: 1000, maxHp: 1000, speed: 0, damage: 0, radius: 13, hitFlashMs: 0, ...overrides };
}

describe('novas cartas de buff', () => {
  it('oferece dez buffs de dano e dez cartas ancestrais únicas', () => {
    const damage = SURVIVOR_UPGRADES.filter((upgrade) => upgrade.id.startsWith('damage-'));
    const ancestral = SURVIVOR_UPGRADES.filter((upgrade) => upgrade.rarity === 'ancestral');
    expect(damage).toHaveLength(10);
    expect(ancestral).toHaveLength(10);
    expect(new Set(ancestral.map((upgrade) => upgrade.id)).size).toBe(10);
  });

  it('monta quatro degraus para cada forma de ataque e elemento', () => {
    const categories: MoveCategory[] = ['projetil', 'aura', 'area', 'cone', 'orbit'];
    const types: PokemonType[] = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
    for (const category of categories) {
      const tree = SURVIVOR_UPGRADES.filter((upgrade) => upgrade.id.startsWith(`attack-tree-${category}-`));
      expect(tree).toHaveLength(4);
      expect(tree.map((upgrade) => upgrade.requires)).toEqual([undefined, `attack-tree-${category}-1`, `attack-tree-${category}-2`, `attack-tree-${category}-3`]);
    }
    for (const type of types) {
      const tree = SURVIVOR_UPGRADES.filter((upgrade) => upgrade.id.startsWith(`element-tree-${type}-`));
      expect(tree).toHaveLength(4);
      expect(tree.map((upgrade) => upgrade.requires)).toEqual([undefined, `element-tree-${type}-1`, `element-tree-${type}-2`, `element-tree-${type}-3`]);
    }
  });

  it('aplica de verdade os quatro efeitos da árvore da forma de ataque', () => {
    const projectile = as('normal', 'projetil');
    const s = quiet(createSurvivorState(18, { kindCount: 1, move: projectile.move, profile: projectile.profile }));
    const before = { damage: s.player.attackDamage, range: s.player.attackRange, cooldown: s.player.attackCooldownMs, shots: s.player.shots };
    for (const id of ['attack-tree-projetil-1', 'attack-tree-projetil-2', 'attack-tree-projetil-3', 'attack-tree-projetil-4']) pick(s, id);
    expect(s.player.attackDamage).toBeGreaterThan(before.damage);
    expect(s.player.attackRange).toBeGreaterThan(before.range);
    expect(s.player.attackCooldownMs).toBeLessThan(before.cooldown);
    expect(s.player.shots).toBeGreaterThan(before.shots);
  });

  it('existem no catálogo com teto explícito', () => {
    const byId = new Map(SURVIVOR_UPGRADES.map((upgrade) => [upgrade.id, upgrade]));
    expect(byId.get('regen')?.maxLevels).toBe(2);
    expect(byId.get('thorns')?.maxLevels).toBe(2);
    expect(byId.get('second-wind')?.maxLevels).toBe(1);
    expect(byId.get('crit')?.maxLevels).toBe(3);
    expect(byId.get('artifact-luck')?.maxLevels).toBe(2);
  });

  it('regeneração soma por segundo e para no teto de cartas', () => {
    const s = quiet(createSurvivorState(41, { kindCount: 1 }));
    s.player.hp = 50;
    pick(s, 'regen');
    pick(s, 'regen');
    pick(s, 'regen');
    expect(s.player.regenPerSec).toBe(2);
    stepSurvivor(s, { dx: 0, dy: 0 }, 1000);
    expect(s.player.hp).toBeCloseTo(52, 5);
  });

  it('espinhos causam dano por segundo a quem encosta no jogador', () => {
    const s = quiet(createSurvivorState(42, { kindCount: 1 }));
    pick(s, 'thorns');
    const touching = enemy(1, s.player.x + 5, s.player.y);
    s.enemies.push(touching);
    stepSurvivor(s, { dx: 0, dy: 0 }, 1000);
    expect(touching.hp).toBeCloseTo(1000 - 6, 5);
  });

  it('segundo fôlego revive uma vez, ao cair até 25% de vida', () => {
    const s = quiet(createSurvivorState(43, { kindCount: 1 }));
    s.player.maxHp = 100;
    s.player.hp = 100;
    pick(s, 'second-wind');
    expect(s.player.secondWindReady).toBe(true);

    s.player.hp = 10;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.hp).toBe(45);
    expect(s.player.secondWindReady).toBe(false);
    expect(s.over).toBe(false);

    s.player.hp = 10;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.hp).toBe(10);
  });

  it('golpe certeiro aumenta o dano do golpe principal quando sorteia crítico', () => {
    const aura = as('normal', 'aura');
    const hitFor = (critChance: number): number => {
      const s = quiet(createSurvivorState(21, { kindCount: 1, move: aura.move, profile: aura.profile }));
      s.player.attackRadius = 100;
      s.player.attackDamage = 100;
      s.player.critChance = critChance;
      const target = enemy(1, s.player.x + 30, s.player.y);
      s.enemies.push(target);
      s.player.attackTimerMs = 0;
      stepSurvivor(s, { dx: 0, dy: 0 }, 16);
      return target.hp;
    };
    expect(hitFor(1)).toBeLessThan(hitFor(0));
  });

  it('faro de artefatos soma chance de drop e tem teto de cartas', () => {
    const s = quiet(createSurvivorState(44, { kindCount: 1 }));
    pick(s, 'artifact-luck');
    pick(s, 'artifact-luck');
    pick(s, 'artifact-luck');
    expect(s.player.artifactLuck).toBeCloseTo(0.5, 5);
  });
});

describe('novos tipos de inimigo', () => {
  it('investida para, avisa e depois avança rápido em direção ao jogador', () => {
    const s = quiet(createSurvivorState(51, { kindCount: 1 }));
    const charger = enemy(1, s.player.x + 200, s.player.y, { archetype: 'investida', specialTimerMs: 0, speed: 60 });
    s.enemies.push(charger);

    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(charger.chargeMs).toBe(500);
    expect(charger.x).toBe(s.player.x + 200);

    for (let i = 0; i < 5; i++) stepSurvivor(s, { dx: 0, dy: 0 }, 100);
    expect(charger.chargeMs).toBe(0);
    expect(charger.dashMs).toBeGreaterThan(0);

    const before = Math.hypot(charger.x - s.player.x, charger.y - s.player.y);
    stepSurvivor(s, { dx: 0, dy: 0 }, 100);
    const after = Math.hypot(charger.x - s.player.x, charger.y - s.player.y);
    expect(before - after).toBeGreaterThan(60 * 0.1 * 2);
  });

  it('explosivo ao cair fere o jogador quando está perto', () => {
    const s = quiet(createSurvivorState(52, { kindCount: 1 }));
    // Sem coleta: um artefato de cura que caísse do inimigo devolveria a vida no mesmo quadro.
    s.player.pickupRadius = 0;
    s.player.hp = 100;
    s.enemies.push(enemy(1, s.player.x + 10, s.player.y, { archetype: 'explosivo', hp: 0, damage: 20 }));
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.hp).toBe(84);
    expect(s.fx.some((fx) => fx.kind === 'blast' && fx.color === '#ff8c3a')).toBe(true);
  });

  it('explosivo ao cair não fere o jogador quando está longe', () => {
    const s = quiet(createSurvivorState(53, { kindCount: 1 }));
    s.player.hp = 100;
    s.enemies.push(enemy(1, s.player.x + 300, s.player.y, { archetype: 'explosivo', hp: 0, damage: 20 }));
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(s.player.hp).toBe(100);
  });

  it('a rotação padrão de arquétipos sorteia os dois tipos novos', () => {
    const s = quiet(createSurvivorState(54, { kindCount: 1 }));
    s.spawnAccumMs = 600_000;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    const seen = new Set(s.enemies.map((item) => item.archetype));
    expect(seen.has('investida')).toBe(true);
    expect(seen.has('explosivo')).toBe(true);
  });
});
