import { RIFT_MAX_ALLIES, RIFT_SAVE_KEY, RIFT_WEAPONS, RIFT_W, RIFT_H, RIFT_TILE, type RiftState } from '../core/rift';

/** Progresso da Fenda do Mew: nível, arma, itens, Pokémon capturados e chefes vencidos. */
export interface RiftSaveV1 {
  version: 1;
  seed: number;
  player: {
    level: number;
    xp: number;
    hp: number;
    maxHp: number;
    weapon: string;
    potions: number;
    balls: number;
    x: number;
    y: number;
    unlocked: string[];
  };
  allies: { dexId: number; name: string; level: number; hp: number; maxHp: number }[];
  reserve: { dexId: number; name: string; level: number; hp: number; maxHp: number }[];
  defeated: string[];
}

const MAX_COORD_X = RIFT_W * RIFT_TILE;
const MAX_COORD_Y = RIFT_H * RIFT_TILE;
const clampInt = (value: unknown, min: number, max: number): number => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));

function validWeapon(id: unknown): string {
  return typeof id === 'string' && RIFT_WEAPONS[id] ? id : 'espada';
}

export function normalizeRiftSave(raw: unknown): RiftSaveV1 | null {
  const value = raw as Partial<RiftSaveV1> | null;
  if (!value || value.version !== 1) return null;
  const p = (value.player ?? {}) as Partial<RiftSaveV1['player']>;
  const level = clampInt(p.level, 1, 99);
  const maxHp = Math.max(20, clampInt(p.maxHp, 20, 9999));
  const unlocked = Array.isArray(p.unlocked) ? [...new Set(p.unlocked.filter((id): id is string => typeof id === 'string' && !!RIFT_WEAPONS[id]))] : [];
  if (!unlocked.includes('espada')) unlocked.push('espada');
  const weapon = validWeapon(p.weapon);
  if (!unlocked.includes(weapon)) unlocked.push(weapon);
  const allies = (Array.isArray(value.allies) ? value.allies : []).slice(0, RIFT_MAX_ALLIES).flatMap((ally) => {
    const a = ally as Partial<RiftSaveV1['allies'][number]>;
    if (!Number.isInteger(a.dexId) || typeof a.name !== 'string' || !a.name.trim()) return [];
    const allyMax = Math.max(1, clampInt(a.maxHp, 1, 9999));
    return [{ dexId: a.dexId as number, name: a.name.trim().slice(0, 24), level: clampInt(a.level, 1, 99), hp: Math.min(allyMax, clampInt(a.hp, 1, allyMax)), maxHp: allyMax }];
  });
  const reserve = (Array.isArray(value.reserve) ? value.reserve : []).slice(0, 5).flatMap((ally) => {
    const a = ally as Partial<RiftSaveV1['reserve'][number]>;
    if (!Number.isInteger(a.dexId) || typeof a.name !== 'string' || !a.name.trim()) return [];
    const allyMax = Math.max(1, clampInt(a.maxHp, 1, 9999));
    return [{ dexId: a.dexId as number, name: a.name.trim().slice(0, 24), level: clampInt(a.level, 1, 99), hp: Math.min(allyMax, clampInt(a.hp, 1, allyMax)), maxHp: allyMax }];
  });
  return {
    version: 1,
    seed: Number.isInteger(value.seed) ? (value.seed as number) : 20261123,
    player: {
      level,
      xp: clampInt(p.xp, 0, 1_000_000),
      hp: Math.min(maxHp, Math.max(1, clampInt(p.hp, 1, maxHp))),
      maxHp,
      weapon,
      potions: clampInt(p.potions, 0, 99),
      balls: clampInt(p.balls, 0, 99),
      x: Math.max(0, Math.min(MAX_COORD_X, Number(p.x) || (60 * RIFT_TILE + 16))),
      y: Math.max(0, Math.min(MAX_COORD_Y, Number(p.y) || (76 * RIFT_TILE + 16))),
      unlocked,
    },
    allies,
    reserve,
    defeated: Array.isArray(value.defeated) ? value.defeated.filter((id): id is string => id === 'ruinas' || id === 'brasa') : [],
  };
}

export function readRiftSave(): RiftSaveV1 | null {
  try {
    return normalizeRiftSave(JSON.parse(localStorage.getItem(RIFT_SAVE_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

export function writeRiftSave(save: RiftSaveV1): boolean {
  try {
    localStorage.setItem(RIFT_SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearRiftSave(): void {
  try {
    localStorage.removeItem(RIFT_SAVE_KEY);
  } catch {
    // Nada a limpar.
  }
}

export function riftSaveOf(state: RiftState): RiftSaveV1 {
  const p = state.player;
  return {
    version: 1,
    seed: state.seed,
    player: {
      level: p.level, xp: p.xp, hp: Math.max(1, Math.round(p.hp)), maxHp: p.maxHp, weapon: p.weapon,
      potions: p.potions, balls: p.balls, x: Math.round(p.x), y: Math.round(p.y), unlocked: [...p.unlocked],
    },
    allies: state.allies.map((ally) => ({ dexId: ally.dexId, name: ally.name, level: ally.level, hp: Math.max(1, Math.round(ally.hp)), maxHp: ally.maxHp })),
    reserve: state.reserve.map((ally) => ({ dexId: ally.dexId, name: ally.name, level: ally.level, hp: Math.max(1, Math.round(ally.hp)), maxHp: ally.maxHp })),
    defeated: [...state.defeated],
  };
}

export function applyRiftSave(state: RiftState, save: RiftSaveV1): void {
  const p = state.player;
  p.level = save.player.level;
  p.xp = save.player.xp;
  p.maxHp = save.player.maxHp;
  p.hp = save.player.hp;
  p.weapon = save.player.weapon;
  p.potions = save.player.potions;
  p.balls = save.player.balls;
  p.x = save.player.x;
  p.y = save.player.y;
  p.unlocked = [...save.player.unlocked];
  state.seed = save.seed;
  state.defeated = [...save.defeated];
  state.allies = save.allies.map((ally, index) => ({
    id: `a${index + 1}`, dexId: ally.dexId, name: ally.name, level: ally.level, hp: ally.hp, maxHp: ally.maxHp,
    x: p.x - 24 + index * 24, y: p.y + 30, attackMs: 0,
  }));
  state.reserve = save.reserve.map((ally, index) => ({
    id: `r${index + 1}`, dexId: ally.dexId, name: ally.name, level: ally.level, hp: ally.hp, maxHp: ally.maxHp,
    x: 0, y: 0, attackMs: 0,
  }));
}
