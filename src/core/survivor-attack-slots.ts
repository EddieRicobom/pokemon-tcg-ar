import { createSurvivorCharge, type SurvivorChargeState } from './survivor-charge';
import type { AttackProfile, SurvivorMove } from './survivor-moves';
import type { SurvivorPlayer, SurvivorState } from './survivor-types';

const ATTACK_FIELDS = [
  'move', 'attackRadius', 'attackDamage', 'areaDamageMultiplier', 'attackRange', 'attackCooldownMs', 'attackTimerMs',
  'projectileSize', 'projectileSpeed', 'projectileDeflection', 'projectileHitRadiusFactor', 'focusBeamWidthFactor',
  'trailCharge', 'trailActiveMs', 'trailPath', 'trailMirrorPath', 'trailCadenceFactor', 'pierce', 'shots', 'orbitAngle',
  'upgradeLevels', 'terastal', 'heldPortalOrbitMs', 'heldPortalTrailMs', 'heldPowerPulses', 'heldPowerOrbitMs',
] as const satisfies readonly (keyof SurvivorPlayer)[];

export type SurvivorAttackIndex = 0 | 1;
export const SURVIVOR_SIMULTANEOUS_ATTACKS_MS = 10 * 60_000;
export type SurvivorAttackFields = Pick<SurvivorPlayer, typeof ATTACK_FIELDS[number]>;

export interface SurvivorAttackSlots {
  active: SurvivorAttackIndex;
  loaded: SurvivorAttackIndex;
  stored: SurvivorAttackFields;
  storedProfile: AttackProfile | null;
  storedCharge: SurvivorChargeState;
  deferred?: SurvivorAttackIndex;
  pending?: SurvivorAttackIndex;
}

export function createSurvivorAttackSlots(stored: SurvivorAttackFields, profile: AttackProfile): SurvivorAttackSlots {
  return { active: 0, loaded: 0, stored, storedProfile: profile, storedCharge: createSurvivorCharge() };
}

export const otherSurvivorAttack = (attack: SurvivorAttackIndex): SurvivorAttackIndex => attack === 0 ? 1 : 0;

export function survivorAttacksSimultaneous(state: Pick<SurvivorState, 'elapsedMs'>): boolean {
  return state.elapsedMs >= SURVIVOR_SIMULTANEOUS_ATTACKS_MS;
}

/** O motor reaproveita o mesmo jogador e carrega apenas os campos do golpe em execução. */
export function loadSurvivorAttack(state: SurvivorState, index: SurvivorAttackIndex): void {
  const slots = state.attackSlots;
  if (!slots || slots.loaded === index) return;
  const player: SurvivorAttackFields = state.player;
  function exchange<K extends keyof SurvivorAttackFields>(field: K): void {
    const value = player[field];
    player[field] = slots!.stored[field];
    slots!.stored[field] = value;
  }
  for (const field of ATTACK_FIELDS) exchange(field);
  [state.profile, slots.storedProfile] = [slots.storedProfile, state.profile];
  [state.charge, slots.storedCharge] = [slots.storedCharge, state.charge];
  slots.loaded = index;
}

/** Equipamento altera os dois golpes, mas a parte de vida, crítico e defesa é aplicada uma vez. */
export function applyStoredAttackStats(state: SurvivorState, apply: (player: SurvivorPlayer) => void): void {
  const slots = state.attackSlots;
  if (!slots) return;
  const other = storedPlayer(state.player, slots.stored);
  apply(other);
  function update<K extends keyof SurvivorAttackFields>(field: K): void {
    slots!.stored[field] = other[field];
  }
  for (const field of ATTACK_FIELDS) update(field);
}

function storedPlayer(player: SurvivorPlayer, attack: SurvivorAttackFields): SurvivorPlayer {
  const copy = { ...player };
  const fields: SurvivorAttackFields = copy;
  function assign<K extends keyof SurvivorAttackFields>(field: K): void {
    fields[field] = attack[field];
  }
  for (const field of ATTACK_FIELDS) assign(field);
  return copy;
}

export function survivorPlayerAttacks(state: SurvivorState): {
  active: SurvivorAttackIndex;
  simultaneous: boolean;
  moves: readonly [SurvivorMove, SurvivorMove];
  players: readonly [Readonly<SurvivorPlayer>, Readonly<SurvivorPlayer>];
  charges: readonly [Readonly<SurvivorChargeState>, Readonly<SurvivorChargeState>];
} | null {
  const slots = state.attackSlots;
  if (!slots) return null;
  const other = storedPlayer(state.player, slots.stored);
  const players = slots.loaded === 0 ? [state.player, other] as const : [other, state.player] as const;
  const charges = slots.loaded === 0 ? [state.charge, slots.storedCharge] as const : [slots.storedCharge, state.charge] as const;
  return { active: slots.active, simultaneous: survivorAttacksSimultaneous(state), moves: [players[0].move, players[1].move], players, charges };
}
