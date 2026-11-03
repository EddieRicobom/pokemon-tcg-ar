import { ARENA_H, ARENA_W, createSurvivorState, stepSurvivor, xpForLevel } from './survivor';
import type { SurvivorEnemy, SurvivorEnemyArchetype, SurvivorInput, SurvivorState } from './survivor';
import { attackProfile, moveWith } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';
import type { PokemonType } from './pokemon-data';
import { createSurvivorSpecial } from './survivor-specials';

/** Alvos estáticos identificados por grau e por comportamento. */
export const DEBUG_TARGETS: readonly { label: string; archetype?: SurvivorEnemyArchetype; supportRole?: SurvivorEnemy['supportRole']; boss?: boolean; shadowBoss?: boolean; digitalThreat?: boolean; trainer?: boolean; grade: SurvivorEnemy['grade'] }[] = [
  { label: 'Comum', grade: 'comum', archetype: 'perseguidor' },
  { label: 'Flanqueador', grade: 'comum', archetype: 'flanqueador' },
  { label: 'Atirador', grade: 'comum', archetype: 'atirador' },
  { label: 'Protetor', grade: 'comum', archetype: 'protetor' },
  { label: 'Suporte · cura', grade: 'comum', archetype: 'suporte', supportRole: 'cura' },
  { label: 'Suporte · impulso', grade: 'comum', archetype: 'suporte', supportRole: 'impulso' },
  { label: 'Suporte · disparo', grade: 'comum', archetype: 'suporte', supportRole: 'disparo' },
  { label: 'Investida', grade: 'comum', archetype: 'investida' },
  { label: 'Explosivo', grade: 'comum', archetype: 'explosivo' },
  { label: 'Elite de treinador', grade: 'elite', trainer: true }, { label: 'Chefão de treinador', grade: 'chefao', trainer: true },
  { label: 'Ameaça digital', grade: 'elite', trainer: true, digitalThreat: true },
  { label: 'Chefe', grade: 'chefao', boss: true }, { label: 'Lendário sombrio', grade: 'chefao', boss: true, shadowBoss: true },
];
export const DEBUG_HP = 10000;
export const DEBUG_INFINITE_HP = 1_000_000_000;
export interface DebugTarget { template: SurvivorEnemy; respawnMs: number; }
export interface SurvivorDebug { state: SurvivorState; targets: DebugTarget[]; infinite: boolean; damage: number; damageElapsedMs: number; }

export function createSurvivorDebug(type: PokemonType = 'normal', category: MoveCategory = 'projetil'): SurvivorDebug {
  // attackProfile com null usa 75 em todos os atributos, sem usar os stats reais do Ditto.
  const move = moveWith(type, category, null);
  const state = createSurvivorState(314159, { kindCount: 1, dexId: 132, move, profile: attackProfile(move, null) });
  state.debugLaboratory = true;
  state.nextBossAtMs = state.nextTrainerAtMs = state.nextShadowBallAtMs = state.nextFieldEventAtMs = Infinity;
  state.finalBossAtMs = null;
  state.spawnAccumMs = -1e12;
  state.special = createSurvivorSpecial(type);
  state.special.phase = 'ready';
  const targets = DEBUG_TARGETS.map((def, index) => {
    const template: SurvivorEnemy = { id: 10000 + index, kind: 0, boss: def.boss ?? false, grade: def.grade,
      ...(def.archetype ? { archetype: def.archetype } : {}), ...(def.supportRole ? { supportRole: def.supportRole } : {}),
      ...(def.trainer ? { trainerId: 20000 + index } : {}), ...(def.shadowBoss ? { shadowBoss: true } : {}), ...(def.digitalThreat ? { digitalThreat: true } : {}), x: ARENA_W / 2 + (index % 5 - 2) * 150,
      y: ARENA_H / 2 + (Math.floor(index / 5) - 1) * 230, hp: DEBUG_HP, maxHp: DEBUG_HP,
      speed: 0, damage: 0, specialTimerMs: 1e12, radius: def.boss ? 28 : 16, hitFlashMs: 0 };
    return { template, respawnMs: 0 };
  });
  state.enemies = targets.map(({ template }) => ({ ...template, hp: DEBUG_INFINITE_HP, maxHp: DEBUG_INFINITE_HP }));
  return { state, targets, infinite: true, damage: 0, damageElapsedMs: 0 };
}

/** Calcula DPS a partir da variação real de vida; mortes finitas reaparecem depois de cinco segundos. */
export function stepSurvivorDebug(debug: SurvivorDebug, input: SurvivorInput, dtMs: number): void {
  if (!Number.isFinite(dtMs) || dtMs <= 0 || debug.state.pendingUpgrade) return;
  const s = debug.state;
  const before = new Map(s.enemies.map(e => [e.id, e.hp]));
  s.player.invulnMs = 1000;
  stepSurvivor(s, input, dtMs);
  debug.damageElapsedMs += dtMs;
  for (const target of debug.targets) {
    const enemy = s.enemies.find(e => e.id === target.template.id);
    const oldHp = before.get(target.template.id);
    if (oldHp !== undefined) {
      debug.damage += Math.max(0, oldHp - Math.max(0, enemy?.hp ?? 0));
      if (!enemy) {
        if (debug.infinite) s.enemies.push({ ...target.template, hp: DEBUG_INFINITE_HP, maxHp: DEBUG_INFINITE_HP });
        else target.respawnMs = 5000;
      } else if (debug.infinite && enemy.hp < DEBUG_HP) enemy.hp = enemy.maxHp;
    } else if (target.respawnMs > 0) {
      target.respawnMs = Math.max(0, target.respawnMs - dtMs);
      if (target.respawnMs === 0) s.enemies.push({ ...target.template, ...(debug.infinite ? { hp: DEBUG_INFINITE_HP, maxHp: DEBUG_INFINITE_HP } : {}) });
    }
  }
  // Mortes no laboratório não geram recompensas ou progresso persistente.
  s.orbs = []; s.artifacts = []; s.kills = 0;
  if ((s.player.healBlockMs ?? 0) <= 0) s.player.hp = s.player.maxHp;
}

export function debugTenLevels(debug: SurvivorDebug): void {
  const p = debug.state.player;
  let xp = -p.xp;
  for (let level = p.level; level < p.level + 10; level++) xp += xpForLevel(level);
  p.xp += xp;
}

/** Alternar o modo restaura os alvos vivos, sem alterar os que aguardam reaparecimento. */
export function setDebugInfinite(debug: SurvivorDebug, infinite: boolean): void {
  debug.infinite = infinite;
  for (const enemy of debug.state.enemies) {
    enemy.maxHp = infinite ? DEBUG_INFINITE_HP : DEBUG_HP;
    enemy.hp = enemy.maxHp;
  }
}
