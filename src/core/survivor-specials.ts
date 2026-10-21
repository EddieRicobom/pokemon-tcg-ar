import type { PokemonType } from './pokemon-data';
import type { SurvivorInput, SurvivorState } from './survivor';

export type SurvivorSpecialId = 'dash' | 'shield' | 'teleport';
export const SPECIAL_UNLOCK_MS = 180_000;
export const SPECIAL_ARRIVAL_MS = 1800;
export const SURVIVOR_SPECIALS = {
  dash: { name: 'Investida elemental', icon: '➤', cooldownMs: 6500, durationMs: 300, description: 'Avance na última direção válida, protegido durante a investida. Recarga: 6,5 s.' },
  shield: { name: 'Bastião elemental', icon: '⬡', cooldownMs: 12_000, durationMs: 3000, description: 'Bloqueie todo dano durante 3 s. Recarga: 12 s.' },
  teleport: { name: 'Salto de execução', icon: '✧', cooldownMs: 25_000, durationMs: 0, description: 'Teleporte na direção do movimento e elimine até 4 selvagens próximos ao destino. Não afeta chefes ou equipes de treinadores. Recarga: 25 s.' },
} as const;

/** Guardiões da tipagem do golpe escolhido; Genesect é identificado como mítico. */
export const SPECIAL_GUARDIANS: Record<PokemonType, { dexId: number; name: string; mythical?: boolean }> = {
  normal: { dexId: 486, name: 'Regigigas' }, fire: { dexId: 244, name: 'Entei' }, water: { dexId: 245, name: 'Suicune' },
  electric: { dexId: 243, name: 'Raikou' }, grass: { dexId: 640, name: 'Virizion' }, ice: { dexId: 144, name: 'Articuno' },
  fighting: { dexId: 639, name: 'Terrakion' }, poison: { dexId: 890, name: 'Eternatus' }, ground: { dexId: 383, name: 'Groudon' },
  flying: { dexId: 641, name: 'Tornadus' }, psychic: { dexId: 488, name: 'Cresselia' }, bug: { dexId: 649, name: 'Genesect', mythical: true },
  rock: { dexId: 377, name: 'Regirock' }, ghost: { dexId: 487, name: 'Giratina' }, dragon: { dexId: 384, name: 'Rayquaza' },
  dark: { dexId: 717, name: 'Yveltal' }, steel: { dexId: 483, name: 'Dialga' }, fairy: { dexId: 716, name: 'Xerneas' },
};
export interface SpecialPoint { x: number; y: number }
export interface SurvivorSpecialState {
  type: PokemonType;
  phase: 'locked' | 'arrival' | 'choice' | 'ready';
  selected: SurvivorSpecialId | null;
  arrivalMs: number;
  cooldownMs: number;
  activeMs: number;
  fxMs: number;
  direction: SpecialPoint;
  from: SpecialPoint;
  to: SpecialPoint;
  targets: SpecialPoint[];
}
export function createSurvivorSpecial(type: PokemonType): SurvivorSpecialState {
  return { type, phase: 'locked', selected: null, arrivalMs: 0, cooldownMs: 0, activeMs: 0, fxMs: 0,
    direction: { x: 1, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, targets: [] };
}
export function chooseSurvivorSpecial(state: SurvivorState, id: SurvivorSpecialId): boolean {
  if (state.over || state.special.phase !== 'choice' || !Object.hasOwn(SURVIVOR_SPECIALS, id)) return false;
  state.special.selected = id;
  state.special.phase = 'ready';
  return true;
}
/** O encontro só avança em tempo de jogo, uma vez por corrida. A escolha não tem prazo. */
export function advanceSpecialEncounter(state: SurvivorState, dtMs: number): boolean {
  const special = state.special;
  if (special.phase === 'locked' && state.elapsedMs >= SPECIAL_UNLOCK_MS && state.player.hp > 0) special.phase = 'arrival';
  if (special.phase === 'arrival') {
    special.arrivalMs = Math.min(SPECIAL_ARRIVAL_MS, special.arrivalMs + dtMs);
    if (special.arrivalMs >= SPECIAL_ARRIVAL_MS) special.phase = 'choice';
    return true;
  }
  return special.phase === 'choice';
}
export function specialProtects(state: SurvivorState): boolean {
  return state.special.activeMs > 0 && (state.special.selected === 'shield' || state.special.selected === 'dash');
}
export function stepSurvivorSpecial(state: SurvivorState, input: SurvivorInput, dtMs: number, width: number, height: number, margin: number): void {
  const special = state.special;
  let activeStepMs = Math.min(dtMs, special.activeMs);
  special.cooldownMs = Math.max(0, special.cooldownMs - dtMs);
  special.fxMs = Math.max(0, special.fxMs - dtMs);
  special.activeMs = Math.max(0, special.activeMs - dtMs);
  const length = Math.hypot(input.dx, input.dy);
  if (length > 0.001 && !activeStepMs) special.direction = { x: input.dx / length, y: input.dy / length };
  const destination = (distance: number) => ({
    x: Math.max(margin, Math.min(width - margin, state.player.x + special.direction.x * distance)),
    y: Math.max(margin, Math.min(height - margin, state.player.y + special.direction.y * distance)),
  });
  if (input.special && special.phase === 'ready' && special.selected && special.cooldownMs === 0) {
    const definition = SURVIVOR_SPECIALS[special.selected];
    special.cooldownMs = definition.cooldownMs;
    special.activeMs = definition.durationMs;
    activeStepMs = Math.min(dtMs, special.activeMs);
    special.activeMs = Math.max(0, special.activeMs - dtMs);
    special.fxMs = special.selected === 'shield' ? 3000 : 650;
    special.from = { x: state.player.x, y: state.player.y };
    special.targets = [];
    if (special.selected === 'teleport') {
      Object.assign(state.player, destination(150));
      const targets = state.enemies.filter((enemy) => enemy.hp > 0 && !enemy.boss && enemy.grade === 'comum' && enemy.trainerId === undefined)
        .sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y) || a.id - b.id).slice(0, 4);
      for (const target of targets) { target.hp = 0; special.targets.push({ x: target.x, y: target.y }); }
      // A resolução normal de derrotas gera XP e contagem uma única vez neste mesmo frame.
    }
    special.to = { x: state.player.x, y: state.player.y };
  }
  if (special.selected === 'dash' && activeStepMs > 0) {
    Object.assign(state.player, destination(800 * activeStepMs / 1000));
    special.to = { x: state.player.x, y: state.player.y };
  }
}
