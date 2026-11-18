import { healSurvivor } from './survivor-healing';
import type { PokemonType } from './pokemon-data';
import type { SurvivorEnemy, SurvivorInput, SurvivorState } from './survivor';

export type SurvivorSpecialId = 'dash' | 'shield' | 'teleport' | 'stasis' | 'gravity' | 'pulse' | 'mark';
export type SurvivorSpecialBranchId = 'dash-clone' | 'dash-triple' | 'dash-long' | 'shield-permanent' | 'shield-heal' | 'shield-quick' | 'teleport-infinite' | 'teleport-vacuum' | 'teleport-mend' | 'stasis-mend' | 'stasis-collapse' | 'stasis-cycle' | 'gravity-repel' | 'gravity-vacuum' | 'gravity-long' | 'pulse-wide' | 'pulse-stun' | 'pulse-drain' | 'mark-chain' | 'mark-execute' | 'mark-harvest';
export const SPECIAL_UNLOCK_MS = 180_000;
export const SPECIAL_BRANCH_UNLOCK_MS = 420_000;
/** A investida atravessa inimigos e usa este múltiplo do dano atual do golpe principal. */
export const DASH_DAMAGE_MULTIPLIER = 2;
/** A trilha Tríplice abre três cargas e torna cada atravessada ainda mais perigosa. */
export const DASH_TRIPLE_DAMAGE_MULTIPLIER = 3;
export const DASH_CLONE_DURATION_MS = 6000;
/** Tempo da entrada do guardião. A escolha só abre depois da animação completa. */
export const SPECIAL_ARRIVAL_MS = 4200;
export const SPECIAL_BRANCH_ARRIVAL_MS = 3000;
export const SURVIVOR_SPECIALS = {
  dash: { name: 'Investida elemental', icon: '➤', cooldownMs: 6500, durationMs: 300, description: 'Avance na última direção válida, protegido durante a investida e cause 2× o dano do golpe aos inimigos atravessados. Recarga: 6,5 s.' },
  shield: { name: 'Bastião elemental', icon: '⬡', cooldownMs: 12_000, durationMs: 3000, description: 'Bloqueie todo dano durante 3 s. Recarga: 12 s.' },
  teleport: { name: 'Salto de execução', icon: '✧', cooldownMs: 25_000, durationMs: 0, description: 'Teleporte na direção do movimento e elimine até 4 selvagens próximos ao destino. Não afeta chefes ou equipes de treinadores. Recarga: 25 s.' },
  stasis: { name: 'Relógio parado', icon: '◷', cooldownMs: 18_000, durationMs: 3500, description: 'Para todos os inimigos por 3,5 s, sem interromper seus próprios ataques. Recarga: 18 s.' },
  gravity: { name: 'Núcleo gravitacional', icon: '◉', cooldownMs: 16_000, durationMs: 4000, description: 'Dobra o campo: puxa inimigos para perto por 4 s. Recarga: 16 s.' },
  pulse: { name: 'Pulso elemental', icon: '✺', cooldownMs: 14_000, durationMs: 0, description: 'Emite uma onda que causa 2× o dano do golpe a até 12 inimigos em 170 de alcance. Dano limitado contra elites e chefes. Recarga: 14 s.' },
  mark: { name: 'Marca predatória', icon: '◎', cooldownMs: 13_000, durationMs: 0, description: 'Marca o inimigo mais próximo em 260 de alcance, causa 3× o dano do golpe e cura 10% do dano causado. Dano limitado contra elites e chefes. Recarga: 13 s.' },
} as const;
export const SURVIVOR_SPECIAL_BRANCHES: Record<SurvivorSpecialId, readonly { id: SurvivorSpecialBranchId; name: string; icon: string; description: string }[]> = {
  dash: [
    { id: 'dash-clone', name: 'Eco evasivo', icon: '👥', description: 'Cria um clone que dispara para longe da direção dos inimigos por 6 s.' },
    { id: 'dash-triple', name: 'Tríplice investida', icon: '➤➤➤', description: 'Permite 3 investidas seguidas, cada uma causando 3× o dano do golpe; depois, a recarga sobe para 10 s.' },
    { id: 'dash-long', name: 'Investida longa', icon: '➟', description: 'A investida dura 50% mais e atravessa uma distância maior.' },
  ],
  shield: [
    { id: 'shield-permanent', name: 'Muralha permanente', icon: '⬡', description: 'O escudo fica ativo até um inimigo encostar em você.' },
    { id: 'shield-heal', name: 'Ruptura restauradora', icon: '♥', description: 'O escudo dura 3 s; quando quebra, cura 25% da vida máxima.' },
    { id: 'shield-quick', name: 'Guarda ágil', icon: '◈', description: 'Protege por 1,5 s e recarrega em apenas 7 s.' },
  ],
  teleport: [
    { id: 'teleport-infinite', name: 'Salto sem horizonte', icon: '∞', description: 'O teleporte alcança a borda da arena e elimina até 7 selvagens.' },
    { id: 'teleport-vacuum', name: 'Vácuo de experiência', icon: '✦', description: 'O teleporte puxa todos os orbes de experiência do mapa.' },
    { id: 'teleport-mend', name: 'Salto restaurador', icon: '♥', description: 'Ao teleportar, recupera 15% da vida máxima.' },
  ],
  stasis: [
    { id: 'stasis-mend', name: 'Intervalo vital', icon: '♥', description: 'Ao parar o tempo, recupera 25% da vida máxima.' },
    { id: 'stasis-collapse', name: 'Colapso temporal', icon: '⌛', description: 'A parada dura 5 s e, ao começar, atordoa os inimigos por mais 1 s.' },
    { id: 'stasis-cycle', name: 'Ciclo rápido', icon: '◴', description: 'A parada dura 2 s, mas recarrega em apenas 10 s.' },
  ],
  gravity: [
    { id: 'gravity-repel', name: 'Inversão polar', icon: '↗', description: 'O núcleo repele inimigos em vez de puxá-los, abrindo espaço ao redor.' },
    { id: 'gravity-vacuum', name: 'Coleta orbital', icon: '✦', description: 'Enquanto ativo, traz todos os orbes de XP para você.' },
    { id: 'gravity-long', name: 'Órbita duradoura', icon: '◉', description: 'O núcleo permanece ativo por 6 s.' },
  ],
  pulse: [
    { id: 'pulse-wide', name: 'Onda expansiva', icon: '✺', description: 'Aumenta o alcance do pulso de 170 para 240.' },
    { id: 'pulse-stun', name: 'Choque paralisante', icon: '✦', description: 'Atordoa os inimigos atingidos por 1,5 s (chefes: 0,3 s).' },
    { id: 'pulse-drain', name: 'Pulso vital', icon: '♥', description: 'Cura 3 de vida por inimigo atingido, até 36.' },
  ],
  mark: [
    { id: 'mark-chain', name: 'Caçada em cadeia', icon: '◎', description: 'Marca até 3 inimigos próximos, causando 2× o dano do golpe a cada um.' },
    { id: 'mark-execute', name: 'Presa enfraquecida', icon: '✹', description: 'Causa 5× o dano do golpe se o alvo estiver com menos da metade da vida.' },
    { id: 'mark-harvest', name: 'Colheita vital', icon: '♥', description: 'Aumenta a cura da marca de 10% para 25% do dano causado.' },
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
export interface SurvivorDashPath { from: SpecialPoint; to: SpecialPoint }
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
  /** IDs já atingidos pela investida atual; atravessar o mesmo alvo não o acerta todo quadro. */
  dashHitEnemyIds: number[];
  dashCharges: number;
  shieldBroken: boolean;
  clone: SurvivorSpecialClone | null;
}
export function createSurvivorSpecial(type: PokemonType): SurvivorSpecialState {
  return { type, phase: 'locked', selected: null, arrivalMs: 0, cooldownMs: 0, activeMs: 0, fxMs: 0,
    direction: { x: 1, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, targets: [], dashHitEnemyIds: [], branch: null, dashCharges: 0, shieldBroken: false, clone: null };
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
  if (state.special.branch === 'shield-heal') healSurvivor(state.player, Math.max(1, Math.round(state.player.maxHp * 0.25)));
  state.special.fxMs = 800;
  return true;
}
export function stepSurvivorSpecial(state: SurvivorState, input: SurvivorInput, dtMs: number, width: number, height: number, margin: number, onDamage?: (id: SurvivorSpecialId, damage: number, target: SurvivorEnemy) => void, damageMultiplier?: (target: SurvivorEnemy) => number): SurvivorDashPath | null {
  const special = state.special;
  let dashPath: SurvivorDashPath | null = null;
  const wasShieldActive = special.activeMs > 0;
  let activeStepMs = Math.min(dtMs, special.activeMs);
  special.cooldownMs = Math.max(0, special.cooldownMs - dtMs);
  special.fxMs = Math.max(0, special.fxMs - dtMs);
  special.activeMs = Math.max(0, special.activeMs - dtMs);
  if (wasShieldActive && special.activeMs === 0 && special.branch === 'shield-heal' && !special.shieldBroken) {
    special.shieldBroken = true;
    healSurvivor(state.player, Math.max(1, Math.round(state.player.maxHp * 0.25)));
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
    special.cooldownMs = isTripleDash ? (consumesLastDash ? 10_000 : 0)
      : special.branch === 'shield-quick' ? 7000
      : special.branch === 'stasis-cycle' ? 10_000 : definition.cooldownMs;
    special.activeMs = special.branch === 'dash-long' ? 450
      : special.branch === 'shield-quick' ? 1500
      : special.branch === 'stasis-cycle' ? 2000
      : special.branch === 'gravity-long' ? 6000 : definition.durationMs;
    activeStepMs = Math.min(dtMs, special.activeMs);
    special.activeMs = Math.max(0, special.activeMs - dtMs);
    special.fxMs = special.selected === 'shield' ? special.activeMs : 650;
    special.shieldBroken = false;
    special.from = { x: state.player.x, y: state.player.y };
    special.targets = [];
    special.dashHitEnemyIds = [];
    if (special.selected === 'dash' && special.branch === 'dash-clone') {
      const nearest = state.enemies.filter((enemy) => enemy.hp > 0).sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
      const dx = nearest ? state.player.x - nearest.x : -special.direction.x;
      const dy = nearest ? state.player.y - nearest.y : -special.direction.y;
      const distance = Math.hypot(dx, dy) || 1;
      special.clone = { x: state.player.x, y: state.player.y, dx: dx / distance, dy: dy / distance, activeMs: DASH_CLONE_DURATION_MS };
    }
    if (special.selected === 'shield' && special.branch === 'shield-permanent') special.activeMs = Number.POSITIVE_INFINITY;
    if (special.selected === 'stasis' && special.branch === 'stasis-mend') healSurvivor(state.player, Math.round(state.player.maxHp * 0.25));
    if (special.selected === 'stasis' && special.branch === 'stasis-collapse') {
      special.activeMs = 5000;
      for (const enemy of state.enemies) enemy.stunMs = Math.max(enemy.stunMs ?? 0, 1000);
    }
    if (special.selected === 'teleport') {
      const teleportDistance = special.branch === 'teleport-infinite' ? Math.max(width, height) * 2 : 150;
      Object.assign(state.player, destination(teleportDistance));
      const targetCount = special.branch === 'teleport-infinite' ? 7 : 4;
      const targets = state.enemies.filter((enemy) => enemy.hp > 0 && !enemy.boss && enemy.grade === 'comum' && enemy.trainerId === undefined)
        .sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y) || a.id - b.id).slice(0, targetCount);
      for (const target of targets) {
        const damage = target.hp;
        target.hp = 0;
        special.targets.push({ x: target.x, y: target.y });
        if (state.player.terastal) onDamage?.('teleport', damage, target);
      }
      if (special.branch === 'teleport-vacuum') for (const orb of state.orbs) { orb.x = state.player.x; orb.y = state.player.y; }
      if (special.branch === 'teleport-mend') healSurvivor(state.player, Math.round(state.player.maxHp * 0.15));
      // A resolução normal de derrotas gera XP e contagem uma única vez neste mesmo frame.
    }
    if (special.selected === 'pulse' || special.selected === 'mark') {
      const pulse = special.selected === 'pulse';
      const radius = pulse ? (special.branch === 'pulse-wide' ? 240 : 170) : 260;
      if (pulse) state.vegetationImpact?.({ kind: 'area', x: state.player.x, y: state.player.y, radius });
      const limit = pulse ? 12 : special.branch === 'mark-chain' ? 3 : 1;
      const targets = state.enemies.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) <= radius + enemy.radius)
        .sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y) || a.id - b.id)
        .slice(0, limit);
      let totalDamage = 0;
      for (const target of targets) {
        const multiplier = pulse ? 2 : special.branch === 'mark-chain' ? 2 : special.branch === 'mark-execute' && target.hp < target.maxHp / 2 ? 5 : 3;
        const rawDamage = state.player.attackDamage * multiplier * (damageMultiplier?.(target) ?? 1);
        // Um único uso não apaga chefes nem elites mesmo em builds de ataque extremo.
        const boss = target.boss || target.grade === 'chefao' || target.shadowBoss === true;
        const protectedTarget = (target.protectedMs ?? 0) > 0 && state.player.terastal?.type !== 'steel';
        const damage = Math.min(rawDamage, target.maxHp * (boss ? pulse ? 0.08 : 0.15 : target.grade === 'elite' ? pulse ? 0.3 : 0.4 : 1))
          * (protectedTarget ? 0.75 : 1);
        const actualDamage = Math.min(target.hp, damage);
        totalDamage += actualDamage;
        target.hp -= damage;
        target.hitFlashMs = 90;
        if (special.branch === 'pulse-stun') target.stunMs = Math.max(target.stunMs ?? 0, boss ? 300 : 1500);
        special.targets.push({ x: target.x, y: target.y });
        onDamage?.(special.selected, actualDamage, target);
      }
      if (special.branch === 'pulse-drain') healSurvivor(state.player, targets.length * 3);
      if (!pulse && totalDamage > 0) healSurvivor(state.player, Math.round(totalDamage * (special.branch === 'mark-harvest' ? 0.25 : 0.1)));
    }
    special.to = { x: state.player.x, y: state.player.y };
  }
  if (special.selected === 'dash' && activeStepMs > 0) {
    const from = { x: state.player.x, y: state.player.y };
    Object.assign(state.player, destination(800 * activeStepMs / 1000));
    special.to = { x: state.player.x, y: state.player.y };
    dashPath = { from, to: { ...special.to } };
  }
  return dashPath;
}
