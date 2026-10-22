import type { PokemonType } from './pokemon-data';
import type { SurvivorInput, SurvivorState } from './survivor';

export type SurvivorSpecialId = 'dash' | 'shield' | 'teleport';
export type SurvivorSpecialBranchId = 'dash-clone' | 'dash-triple' | 'shield-permanent' | 'shield-heal' | 'teleport-infinite' | 'teleport-vacuum';
export const SPECIAL_UNLOCK_MS = 180_000;
export const SPECIAL_BRANCH_UNLOCK_MS = 420_000;
/** Tempo da entrada do guardião. A escolha só abre depois da animação completa. */
export const SPECIAL_ARRIVAL_MS = 4200;
export const SPECIAL_BRANCH_ARRIVAL_MS = 3000;
export const SURVIVOR_SPECIALS = {
  dash: { name: 'Investida elemental', icon: '➤', cooldownMs: 6500, durationMs: 300, description: 'Avance na última direção válida, protegido durante a investida. Recarga: 6,5 s.' },
  shield: { name: 'Bastião elemental', icon: '⬡', cooldownMs: 12_000, durationMs: 3000, description: 'Bloqueie todo dano durante 3 s. Recarga: 12 s.' },
  teleport: { name: 'Salto de execução', icon: '✧', cooldownMs: 25_000, durationMs: 0, description: 'Teleporte na direção do movimento e elimine até 4 selvagens próximos ao destino. Não afeta chefes ou equipes de treinadores. Recarga: 25 s.' },
} as const;
export const SURVIVOR_SPECIAL_BRANCHES: Record<SurvivorSpecialId, readonly { id: SurvivorSpecialBranchId; name: string; icon: string; description: string }[]> = {
  dash: [
    { id: 'dash-clone', name: 'Eco evasivo', icon: '👥', description: 'Cria um clone que dispara para longe da direção dos inimigos por 3 s.' },
    { id: 'dash-triple', name: 'Tríplice investida', icon: '➤➤➤', description: 'Permite 3 investidas seguidas; depois, a recarga sobe para 10 s.' },
  ],
  shield: [
    { id: 'shield-permanent', name: 'Muralha permanente', icon: '⬡', description: 'O escudo fica ativo até um inimigo encostar em você.' },
    { id: 'shield-heal', name: 'Ruptura restauradora', icon: '♥', description: 'O escudo dura 3 s; quando quebra, cura 25% da vida máxima.' },
  ],
  teleport: [
    { id: 'teleport-infinite', name: 'Salto sem horizonte', icon: '∞', description: 'O teleporte alcança a borda da arena e elimina até 7 selvagens.' },
    { id: 'teleport-vacuum', name: 'Vácuo de experiência', icon: '✦', description: 'O teleporte puxa todos os orbes de experiência do mapa.' },
  ],
};

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
export interface SurvivorSpecialClone extends SpecialPoint { dx: number; dy: number; activeMs: number }
export interface SurvivorSpecialState {
  type: PokemonType;
  phase: 'locked' | 'arrival' | 'choice' | 'ready' | 'branch-arrival' | 'branch-choice';
  selected: SurvivorSpecialId | null;
  branch: SurvivorSpecialBranchId | null;
  arrivalMs: number;
  cooldownMs: number;
  activeMs: number;
  fxMs: number;
  direction: SpecialPoint;
  from: SpecialPoint;
  to: SpecialPoint;
  targets: SpecialPoint[];
  dashCharges: number;
  shieldBroken: boolean;
  clone: SurvivorSpecialClone | null;
}
export function createSurvivorSpecial(type: PokemonType): SurvivorSpecialState {
  return { type, phase: 'locked', selected: null, arrivalMs: 0, cooldownMs: 0, activeMs: 0, fxMs: 0,
    direction: { x: 1, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, targets: [], branch: null, dashCharges: 0, shieldBroken: false, clone: null };
}
export function chooseSurvivorSpecial(state: SurvivorState, id: SurvivorSpecialId): boolean {
  if (state.over || state.special.phase !== 'choice' || !Object.hasOwn(SURVIVOR_SPECIALS, id)) return false;
  state.special.selected = id;
  state.special.phase = 'ready';
  return true;
}
export function chooseSurvivorSpecialBranch(state: SurvivorState, id: SurvivorSpecialBranchId): boolean {
  if (state.over || state.special.phase !== 'branch-choice' || !state.special.selected) return false;
  const option = SURVIVOR_SPECIAL_BRANCHES[state.special.selected].find((entry) => entry.id === id);
  if (!option) return false;
  state.special.branch = id;
  state.special.phase = 'ready';
  state.special.arrivalMs = SPECIAL_BRANCH_ARRIVAL_MS;
  if (id === 'dash-triple') state.special.dashCharges = 3;
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
  if (special.phase === 'ready' && special.selected && !special.branch && state.elapsedMs >= SPECIAL_BRANCH_UNLOCK_MS) {
    special.phase = 'branch-arrival';
    special.arrivalMs = 0;
  }
  if (special.phase === 'branch-arrival') {
    special.arrivalMs = Math.min(SPECIAL_BRANCH_ARRIVAL_MS, special.arrivalMs + dtMs);
    if (special.arrivalMs >= SPECIAL_BRANCH_ARRIVAL_MS) special.phase = 'branch-choice';
    return true;
  }
  if (special.phase === 'branch-choice') return true;
  return special.phase === 'choice';
}
export function specialProtects(state: SurvivorState): boolean {
  return state.special.activeMs > 0 && (state.special.selected === 'shield' || state.special.selected === 'dash');
}
function shieldBreaksOnContact(state: SurvivorState): boolean {
  return state.special.selected === 'shield' && (state.special.branch === 'shield-permanent' || state.special.branch === 'shield-heal');
}
export function breakSurvivorShield(state: SurvivorState): boolean {
  if (!shieldBreaksOnContact(state) || state.special.activeMs <= 0) return false;
  state.special.activeMs = 0;
  state.special.shieldBroken = true;
  if (state.special.branch === 'shield-heal') state.player.hp = Math.min(state.player.maxHp, state.player.hp + Math.max(1, Math.round(state.player.maxHp * 0.25)));
  state.special.fxMs = 800;
  return true;
}
export function stepSurvivorSpecial(state: SurvivorState, input: SurvivorInput, dtMs: number, width: number, height: number, margin: number): void {
  const special = state.special;
  const wasShieldActive = special.activeMs > 0;
  let activeStepMs = Math.min(dtMs, special.activeMs);
  special.cooldownMs = Math.max(0, special.cooldownMs - dtMs);
  special.fxMs = Math.max(0, special.fxMs - dtMs);
  special.activeMs = Math.max(0, special.activeMs - dtMs);
  if (wasShieldActive && special.activeMs === 0 && special.branch === 'shield-heal' && !special.shieldBroken) {
    special.shieldBroken = true;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + Math.max(1, Math.round(state.player.maxHp * 0.25)));
    special.fxMs = 800;
  }
  if (special.clone) {
    special.clone.activeMs = Math.max(0, special.clone.activeMs - dtMs);
    special.clone.x = Math.max(margin, Math.min(width - margin, special.clone.x + special.clone.dx * 280 * dtMs / 1000));
    special.clone.y = Math.max(margin, Math.min(height - margin, special.clone.y + special.clone.dy * 280 * dtMs / 1000));
    if (special.clone.activeMs === 0) special.clone = null;
  }
  const length = Math.hypot(input.dx, input.dy);
  if (length > 0.001 && !activeStepMs) special.direction = { x: input.dx / length, y: input.dy / length };
  const destination = (distance: number) => ({
    x: Math.max(margin, Math.min(width - margin, state.player.x + special.direction.x * distance)),
    y: Math.max(margin, Math.min(height - margin, state.player.y + special.direction.y * distance)),
  });
  if (input.special && special.phase === 'ready' && special.selected && special.cooldownMs === 0) {
    const definition = SURVIVOR_SPECIALS[special.selected];
    const isTripleDash = special.selected === 'dash' && special.branch === 'dash-triple';
    if (isTripleDash && special.dashCharges <= 0) special.dashCharges = 3;
    const consumesLastDash = isTripleDash && special.dashCharges <= 1;
    if (isTripleDash) special.dashCharges = Math.max(0, special.dashCharges - 1);
    special.cooldownMs = isTripleDash ? (consumesLastDash ? 10_000 : 0) : definition.cooldownMs;
    special.activeMs = definition.durationMs;
    activeStepMs = Math.min(dtMs, special.activeMs);
    special.activeMs = Math.max(0, special.activeMs - dtMs);
    special.fxMs = special.selected === 'shield' ? 3000 : 650;
    special.shieldBroken = false;
    special.from = { x: state.player.x, y: state.player.y };
    special.targets = [];
    if (special.selected === 'dash' && special.branch === 'dash-clone') {
      const nearest = state.enemies.filter((enemy) => enemy.hp > 0).sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
      const dx = nearest ? state.player.x - nearest.x : -special.direction.x;
      const dy = nearest ? state.player.y - nearest.y : -special.direction.y;
      const distance = Math.hypot(dx, dy) || 1;
      special.clone = { x: state.player.x, y: state.player.y, dx: dx / distance, dy: dy / distance, activeMs: 3000 };
    }
    if (special.selected === 'shield' && special.branch === 'shield-permanent') special.activeMs = Number.POSITIVE_INFINITY;
    if (special.selected === 'teleport') {
      const teleportDistance = special.branch === 'teleport-infinite' ? Math.max(width, height) * 2 : 150;
      Object.assign(state.player, destination(teleportDistance));
      const targetCount = special.branch === 'teleport-infinite' ? 7 : 4;
      const targets = state.enemies.filter((enemy) => enemy.hp > 0 && !enemy.boss && enemy.grade === 'comum' && enemy.trainerId === undefined)
        .sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y) || a.id - b.id).slice(0, targetCount);
      for (const target of targets) { target.hp = 0; special.targets.push({ x: target.x, y: target.y }); }
      if (special.branch === 'teleport-vacuum') for (const orb of state.orbs) { orb.x = state.player.x; orb.y = state.player.y; }
      // A resolução normal de derrotas gera XP e contagem uma única vez neste mesmo frame.
    }
    special.to = { x: state.player.x, y: state.player.y };
  }
  if (special.selected === 'dash' && activeStepMs > 0) {
    Object.assign(state.player, destination(800 * activeStepMs / 1000));
    special.to = { x: state.player.x, y: state.player.y };
  }
}
