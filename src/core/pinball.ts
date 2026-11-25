/** Mesa e física próprias para o minijogo da Vila. Não usa código nem recursos da ROM. */
import { TYPE_LABELS_PT } from './pokemon-data';
import type { PokemonType } from './pokemon-data';
import { typesOfDex } from './species-filter';
import { speciesName } from './survivor-evolution';
export const PINBALL_W = 360;
export const PINBALL_H = 600;
const BALL_R = 7;
/** Moldura visível da mesa (a mesma recortada no canvas). */
export const PINBALL_FRAME = { x: 22, y: 33, w: 316, h: 536 } as const;
/**
 * Enquadramento fixo: a mesa inteira fica no quadro, sem seguir a bola. O zoom de 2% só tira
 * a borda decorativa; alvos C-A-T (y≈59), flippers erguidos e o ralo (y≈565) continuam visíveis.
 */
export const PINBALL_VIEW = { scale: 1.02, x: 180, y: 303 } as const;
/** Retângulo do projeto que aparece dentro da moldura, para o teste impedir recorte de área útil. */
export function pinballVisibleRect(view: { scale: number; x: number; y: number } = PINBALL_VIEW): { left: number; right: number; top: number; bottom: number } {
  const cx = PINBALL_W / 2;
  const cy = PINBALL_H / 2;
  return {
    left: view.x + (PINBALL_FRAME.x - cx) / view.scale,
    right: view.x + (PINBALL_FRAME.x + PINBALL_FRAME.w - cx) / view.scale,
    top: view.y + (PINBALL_FRAME.y - cy) / view.scale,
    bottom: view.y + (PINBALL_FRAME.y + PINBALL_FRAME.h - cy) / view.scale,
  };
}
/** Passo fixo da simulação (250 Hz): a bola nunca anda mais que ~5 px por passo, então não atravessa paredes. */
const SUBSTEP_MS = 4;
/**
 * Ritmo global da mesa. A 0,6 a bola e a física andam a 60% da velocidade original: velocidades e giros
 * caem por este fator e acelerações pelo quadrado dele. As trajetórias continuam idênticas — a mesa só
 * fica mais lenta para ler, não mais fácil de atravessar.
 */
export const PINBALL_TIME_SCALE = 0.6;
const SPEED = PINBALL_TIME_SCALE;
const ACCEL = SPEED * SPEED;
/**
 * Janelas de jogo (bola salva, habilidade, missão, bônus, combo, C-A-T) são medidas em tempo de jogo:
 * com a mesa a 60%, elas duram 1/0,6 em tempo real para cobrir a mesma jogada. Avisos e recargas de spam
 * continuam em tempo real.
 */
export const PINBALL_TIMER_SCALE = 1 / SPEED;
const TIMER = PINBALL_TIMER_SCALE;
/** Janelas citadas nos textos: o número exibido é o tempo real que o jogador vê no chip. */
export const PINBALL_SAVER_MS = 7000 * TIMER;
export const PINBALL_ABILITY_MS = 12_000 * TIMER;
export const PINBALL_BONUS_MS = 10_000 * TIMER;
export function pinballSeconds(ms: number): number { return Math.round(Math.max(0, ms) / 1000); }
/** Cada volta completa nas seis etapas escritas à mão fecha um marco da campanha. */
export const PINBALL_CAMPAIGN_STAGES = 6;
export function pinballCampaignWins(stage: number): number {
  return Math.floor(Math.max(0, Math.floor(stage) || 0) / PINBALL_CAMPAIGN_STAGES);
}
export function pinballModeWindowMs(mode: PinballMode): number {
  return mode === 'normal' ? 0 : (mode === 'bonus' ? 100_000 : 60_000) * TIMER;
}
/** Últimos 10 s reais do desafio: a barra e o chip ficam vermelhos. */
export function pinballModeUrgent(state: Pick<PinballState, 'mode' | 'modeMs'>): boolean {
  return state.mode !== 'normal' && state.modeMs > 0 && state.modeMs <= 10_000;
}
const GRAVITY = 680 * ACCEL;
const MAX_SPEED = 950 * SPEED;
const ROLL_DRAG = 0.12 * SPEED;
const SPIN_CURVE = 58 * SPEED;
const MAX_SPIN = 1;
const BUMPER_MIN_KICK = 360 * SPEED;
const TARGET_MIN_KICK = 230 * SPEED;
const CRITTER_MIN_KICK = 220 * SPEED;
const CORE_MIN_KICK = 290 * SPEED;
export const PINBALL_FLIPPER_LENGTH = 58;
const FLIPPER_RADIUS = 6;
const FLIPPER_UP_SPEED = 20 * SPEED;
const FLIPPER_DOWN_SPEED = 12 * SPEED;
const FLIPPER_REST_ANGLE = [0.30, Math.PI - 0.30] as const;
const FLIPPER_UP_ANGLE = [-0.47, Math.PI + 0.47] as const;
const MAX_EXTRA_BALLS = 9;
export const PINBALL_DEX_MAX = 1025;
export type PinballBonusKind = 'fire' | 'spark';
const BONUS_CYCLE = ['fire', 'spark', 'shield'] as const;

export type PinballMode = 'normal' | 'capture' | 'evolution' | 'bonus';
export type PinballPhase = 'ready' | 'playing' | 'between' | 'over' | 'won';
export type PinballAbility = 'impulse' | 'guard' | 'power' | 'focus';
export interface PinballPartnerSkill { type: PokemonType; typeLabel: string; ability: PinballAbility; label: string; description: string }
const ABILITIES: Record<PinballAbility, { label: string; description: string }> = {
  impulse: { label: 'Impulso', description: 'Rebate a bola em direção ao topo.' },
  guard: { label: 'Proteção', description: `Ativa resgate lateral e mais ${pinballSeconds(PINBALL_SAVER_MS)} s de proteção.` },
  power: { label: 'Impacto', description: `Bumpers valem o dobro por ${pinballSeconds(PINBALL_ABILITY_MS)} s.` },
  focus: { label: 'Precisão', description: `Alvos pontuam em dobro; captura avança 2 por ${pinballSeconds(PINBALL_ABILITY_MS)} s.` },
};
/** A habilidade vem do primeiro tipo conhecido da espécie; dados ausentes não recebem tipo inventado. */
export function pinballPartnerSkill(dexId: number): PinballPartnerSkill | null {
  const type = typesOfDex(dexId)[0];
  if (!type) return null;
  const ability: PinballAbility = ['fire', 'electric', 'fighting'].includes(type) ? 'impulse'
    : ['water', 'grass', 'ice', 'steel', 'rock'].includes(type) ? 'guard'
      : ['ground', 'poison', 'bug', 'dragon'].includes(type) ? 'power' : 'focus';
  return { type, typeLabel: TYPE_LABELS_PT[type], ability, ...ABILITIES[ability] };
}
export type PinballStageMode = Exclude<PinballMode, 'normal'>;
export interface PinballStage {
  title: string;
  encounter: string;
  species: string;
  dexId: number;
  objective: string;
  mode: PinballStageMode;
  tint: string;
}
/**
 * As seis primeiras etapas são escritas à mão; da sétima em diante a aventura continua sozinha e percorre a
 * Pokédex nacional inteira (1..1025) numa permutação sem repetição. O nome vem do mesmo dado local da Torre
 * (`pokemon-evolutions.json`), então nenhuma espécie é inventada — e o sprite cai num círculo neutro se faltar.
 */
export const PINBALL_STAGES: readonly PinballStage[] = [
  { title: 'Trilha da Captura', encounter: 'Treinadora Lia · Eevee', species: 'Eevee', dexId: 133, objective: 'Acerte 3 alvos ou o Eevee para iniciar; depois, capture 3 vezes.', mode: 'capture', tint: '#65dca6' },
  { title: 'Caverna da Evolução', encounter: 'Pesquisador Davi · Riolu', species: 'Riolu', dexId: 447, objective: 'Acerte 3 alvos ou o Riolu para iniciar; depois, 7 bumpers.', mode: 'evolution', tint: '#b08cff' },
  { title: 'Cume do Bônus', encounter: 'Campeã Selene · Gengar', species: 'Gengar', dexId: 94, objective: 'Chefe: escudo, dois alvos e núcleo.', mode: 'bonus', tint: '#ff8a8a' },
  { title: 'Ruínas do Tempo', encounter: 'Guardião Ébano · Sableye', species: 'Sableye', dexId: 302, objective: 'Acerte 3 alvos ou o Sableye para iniciar; depois, capture 3 vezes.', mode: 'capture', tint: '#8fd3c7' },
  { title: 'Forja de Ferro', encounter: 'Mestre Bruno · Lucario', species: 'Lucario', dexId: 448, objective: 'Acerte 3 alvos ou o Lucario para iniciar; depois, 7 bumpers.', mode: 'evolution', tint: '#f0b86a' },
  { title: 'Coroa do Campeão', encounter: 'Campeão Theo · Dragapult', species: 'Dragapult', dexId: 887, objective: 'Chefe final: escudo, dois alvos e núcleo.', mode: 'bonus', tint: '#ffe066' },
];
const ENDLESS_STAGE_TEMPLATES: readonly { title: string; mode: PinballStageMode; tint: string }[] = [
  { title: 'Trilha Selvagem', mode: 'capture', tint: '#65dca6' },
  { title: 'Caverna Profunda', mode: 'evolution', tint: '#b08cff' },
  { title: 'Pico do Bônus', mode: 'bonus', tint: '#ff8a8a' },
  { title: 'Ruínas Perdidas', mode: 'capture', tint: '#8fd3c7' },
  { title: 'Forja Antiga', mode: 'evolution', tint: '#f0b86a' },
  { title: 'Coroa Eterna', mode: 'bonus', tint: '#ffe066' },
];
const ENDLESS_TRAINERS = ['Treinadora Iara', 'Pesquisador Nilo', 'Campeã Vera', 'Guardião Rui', 'Mestre Alba', 'Campeão Ciro', 'Treinador Bento', 'Pesquisadora Lume'] as const;

export function pinballStage(index: number): PinballStage {
  const safe = Math.max(0, Math.floor(index) || 0);
  if (safe < PINBALL_STAGES.length) return PINBALL_STAGES[safe]!;
  const step = safe - PINBALL_STAGES.length;
  const base = ENDLESS_STAGE_TEMPLATES[safe % ENDLESS_STAGE_TEMPLATES.length]!;
  // 137 é coprimo de 1025, então o passo percorre a Pokédex inteira sem repetir nenhuma espécie.
  const dexId = (step * 137) % PINBALL_DEX_MAX + 1;
  const species = speciesName(dexId) || `Pokémon #${dexId}`;
  const trainer = ENDLESS_TRAINERS[(step * 5 + 2) % ENDLESS_TRAINERS.length]!;
  const objective = base.mode === 'capture'
    ? `Acerte 3 alvos ou o ${species} para iniciar; depois, capture 3 vezes.`
    : base.mode === 'evolution'
      ? `Acerte 3 alvos ou o ${species} para iniciar; depois, 7 bumpers.`
      : 'Chefe: escudo, dois alvos e núcleo.';
  return {
    title: `${base.title} ${Math.floor(step / ENDLESS_STAGE_TEMPLATES.length) + 2}`,
    encounter: `${trainer} · ${species}`,
    species, dexId, objective, mode: base.mode, tint: base.tint,
  };
}

/** Junta as capturas da aventura à Pokédex do Pinball, sem duplicar e só com ids válidos. */
export function mergePinballDex(ids: readonly number[], captured: readonly Pick<PinballCaptured, 'dexId'>[]): number[] {
  const seen = new Set<number>();
  for (const id of ids) if (Number.isInteger(id) && id >= 1 && id <= PINBALL_DEX_MAX) seen.add(id);
  for (const entry of captured) if (Number.isInteger(entry.dexId) && entry.dexId >= 1 && entry.dexId <= PINBALL_DEX_MAX) seen.add(entry.dexId);
  return [...seen].sort((a, b) => a - b);
}
export const PINBALL_BOSS_CORE = { x: 180, y: 366, r: 21 } as const;
export const PINBALL_BOSS_PHASES = [
  { label: 'Escudo', objective: 'Acerte 5 bumpers.' },
  { label: 'Selos', objective: 'Acerte 2 alvos diferentes.' },
  { label: 'Núcleo', objective: 'Acerte o núcleo 2 vezes.' },
] as const;
export const PINBALL_FLIPPERS = [
  { pivotX: 108 }, { pivotX: 252 },
] as const;
export interface PinballBall { x: number; y: number; vx: number; vy: number }
/** Pontos flutuantes na mesa: só desenho, com o delta real de placar já multiplicado. */
export interface PinballPopup { x: number; y: number; text: string; ms: number }
export const PINBALL_POPUP_MS = 700;
const POPUP_MS = PINBALL_POPUP_MS;
const MAX_POPUPS = 8;
export const PINBALL_FLASH_MS = 220;
const FLASH_MS = PINBALL_FLASH_MS;
export interface PinballState {
  phase: PinballPhase;
  stage: number;
  ball: PinballBall;
  score: number;
  best: number;
  balls: number;
  mode: PinballMode;
  modeMs: number;
  progress: number;
  charge: number;
  caught: number;
  evolved: number;
  multiplier: number;
  ballLevel: number;
  bumperHits: number;
  kickback: boolean;
  saverMs: number;
  tiltHeat: number;
  tiltLockMs: number;
  message: string;
  messageMs: number;
  hitCooldown: number[];
  flipperCooldownMs: number[];
  laneCooldownMs: number;
  laneHits: number;
  combo: number;
  comboMs: number;
  skillShot: boolean;
  bossPhase: number;
  bossMask: number;
  bossCooldownMs: number;
  abilityUses: number;
  abilityKind: PinballAbility | null;
  abilityMs: number;
  /** Pokémon do encontro que passeiam pela mesa; trocam junto com a etapa. */
  critters: PinballCritter[];
  /** Capturados nesta aventura: ficam no placar até começar outra, sem colisão nem efeito na mesa. */
  captured: PinballCaptured[];
  /** Efeito de curva da bola (−1 a 1), vindo dos flippers e das paredes. */
  spin: number;
  /** Ângulo físico dos flippers em radianos (esquerdo e direito). */
  flipperAngle: [number, number];
  /** Bumper inferior iluminado nesta rodada e o tempo até trocar de lado. */
  bonusSpot: number;
  bonusSpotMs: number;
  /** Efeito temporário da bola vindo dos bônus (fogo/faísca). */
  bonusKind: PinballBonusKind | null;
  bonusMs: number;
  bonusAwards: number;
  /** Sequência C→A→T dos alvos e a janela para completá-la. */
  letterStep: number;
  letterMs: number;
  /** Flash visual de bumpers/alvos (mesmo índice de `hitCooldown`), slingshots e núcleo do chefe. */
  hitFlash: number[];
  slingFlashMs: [number, number];
  coreFlashMs: number;
  /** Pontos flutuantes recentes; o mais antigo sai quando passa de 8. */
  popups: PinballPopup[];
}
export interface PinballCaptured { dexId: number; name: string; stage: number }
export interface PinballInput { left: boolean; right: boolean }
export type PinballEvent = 'bump' | 'target' | 'core' | 'flipper' | 'drain' | 'launch' | 'mode' | 'reward' | 'tilt';

/**
 * Moedas pagas ao fim de uma aventura. Vitória vale mais e as capturas/evoluções do encontro somam;
 * a derrota paga pouco e só pelo placar, para não transformar repetição em fonte de renda.
 */
export function pinballReward(state: Pick<PinballState, 'phase' | 'score' | 'caught' | 'evolved' | 'stage'>): number {
  if (state.phase !== 'won' && state.phase !== 'over') return 0;
  const score = Math.max(0, Math.floor(state.score) || 0);
  if (state.phase === 'over') {
    const progress = pinballCampaignWins(state.stage) * 4 + Math.max(0, state.caught) * 2 + Math.max(0, state.evolved) * 3;
    return Math.min(120, Math.floor(score / 800) + progress);
  }
  const bonus = Math.max(0, state.caught) * 2 + Math.max(0, state.evolved) * 3;
  const chapter = Math.max(0, Math.floor(state.stage) || 0);
  return Math.min(120, 25 + chapter * 8 + Math.min(25, Math.floor(score / 400)) + bonus);
}

export const PINBALL_BUMPERS = [
  { x: 100, y: 190, r: 24 }, { x: 180, y: 150, r: 24 }, { x: 260, y: 190, r: 24 },
  { x: 102, y: 315, r: 17 }, { x: 258, y: 315, r: 17 },
] as const;
export const PINBALL_TARGETS = [
  { x: 76, y: 110, r: 12 }, { x: 180, y: 76, r: 12 }, { x: 284, y: 110, r: 12 },
] as const;
/**
 * O Pokémon do encontro passeia pela faixa livre entre os bumpers e o painel da missão. Ele é sólido: a bola
 * quica nele e ele se assusta; no desafio de captura, cada toque conta como uma captura parcial.
 */
export const PINBALL_CRITTER_LANE = { y: 232, minX: 66, maxX: 292, r: 13 } as const;
export interface PinballCritter {
  dexId: number;
  name: string;
  x: number;
  y: number;
  vx: number;
  r: number;
  /** Enquanto escondido (assustado ou capturado), não colide nem é desenhado. */
  hiddenMs: number;
  /** Intervalo entre dois toques válidos no mesmo Pokémon. */
  cooldownMs: number;
  /** Marca visual curta no corpo ao ser atingido. */
  flashMs: number;
}

export function pinballMissionGoal(mode: PinballMode, bossPhase = 0): number { return mode === 'evolution' ? 7 : mode === 'bonus' ? [5, 2, 2][bossPhase] ?? 2 : 3; }

export interface PinballObjective { label: string; counter: string; hint: string }
/**
 * Uma única fonte para o objetivo mostrado no painel da mesa, na barra da etapa e nos avisos.
 * Durante o desafio o texto descreve o que falta agora, nunca a instrução de "para iniciar".
 */
export function pinballObjective(state: Pick<PinballState, 'mode' | 'stage' | 'bossPhase' | 'progress' | 'charge'>): PinballObjective {
  const info = pinballStage(state.stage);
  if (state.mode === 'capture') {
    return { label: 'CAPTURA', counter: `${state.progress}/${pinballMissionGoal('capture')} capturas`, hint: `Acerte alvos ou capture o ${info.species}` };
  }
  if (state.mode === 'evolution') {
    return { label: 'EVOLUÇÃO', counter: `${state.progress}/${pinballMissionGoal('evolution')} bumpers`, hint: 'Acerte os bumpers para evoluir' };
  }
  if (state.mode === 'bonus') {
    const phase = PINBALL_BOSS_PHASES[state.bossPhase] ?? PINBALL_BOSS_PHASES[0];
    const unit = state.bossPhase === 1 ? 'alvos diferentes' : state.bossPhase === 2 ? 'no núcleo' : 'bumpers';
    return { label: phase.label.toUpperCase(), counter: `${state.progress}/${pinballMissionGoal('bonus', state.bossPhase)} ${unit}`, hint: phase.objective };
  }
  return { label: 'MISSÃO', counter: `${state.charge}/3 toques`, hint: `Acerte alvos ou o ${info.species} para iniciar` };
}

export function createPinballState(best = 0): PinballState {
  const state: PinballState = {
    phase: 'ready', stage: 0, ball: { x: 316, y: 515, vx: 0, vy: 0 }, score: 0, best: Math.max(0, best), balls: 3,
    mode: 'normal', modeMs: 0, progress: 0, charge: 0, caught: 0, evolved: 0,
    multiplier: 1, ballLevel: 1, bumperHits: 0, kickback: false, saverMs: 0,
    tiltHeat: 0, tiltLockMs: 0, message: 'Etapa 1: lance a Pokébola!', messageMs: 0,
    hitCooldown: Array(PINBALL_BUMPERS.length + PINBALL_TARGETS.length).fill(0),
    flipperCooldownMs: [0, 0], laneCooldownMs: 0, laneHits: 0, combo: 0, comboMs: 0, skillShot: false,
    bossPhase: 0, bossMask: 0, bossCooldownMs: 0, abilityUses: 1, abilityKind: null, abilityMs: 0,
    critters: [], captured: [],
    spin: 0, flipperAngle: [...FLIPPER_REST_ANGLE],
    bonusSpot: 3, bonusSpotMs: 7000 * TIMER, bonusKind: null, bonusMs: 0, bonusAwards: 0, letterStep: 0, letterMs: 0,
    hitFlash: Array(PINBALL_BUMPERS.length + PINBALL_TARGETS.length).fill(0), slingFlashMs: [0, 0], coreFlashMs: 0, popups: [],
  };
  syncCritters(state);
  return state;
}

function announce(s: PinballState, message: string): void { s.message = message; s.messageMs = 2400; }
function score(s: PinballState, points: number): void {
  s.score += points * s.multiplier * s.ballLevel;
  s.best = Math.max(s.best, s.score);
}
/** Pontua e mostra na mesa o delta real (multiplicador e nível já aplicados). */
function scoreAt(s: PinballState, points: number, x: number, y: number): void {
  const before = s.score;
  score(s, points);
  const delta = Math.round(s.score - before);
  if (delta <= 0) return;
  s.popups.push({ x, y, text: `+${delta.toLocaleString('pt-BR')}`, ms: POPUP_MS });
  if (s.popups.length > MAX_POPUPS) s.popups.shift();
}

export function launchPinball(s: PinballState): boolean {
  if (s.phase !== 'ready' && s.phase !== 'between') return false;
  s.phase = 'playing';
  s.ball = { x: 316, y: 515, vx: -24 * SPEED, vy: -820 * SPEED };
  s.saverMs = PINBALL_SAVER_MS;
  s.skillShot = true;
  s.abilityUses = 1;
  s.abilityKind = null;
  s.abilityMs = 0;
  announce(s, 'Bola em jogo!');
  return true;
}

/** Uma ativação por bola. A mesma Pokébola salva não recarrega a habilidade. */
export function activatePinballAbility(s: PinballState, ability: PinballAbility): boolean {
  if (s.phase !== 'playing' || s.abilityUses <= 0 || s.tiltLockMs > 0) return false;
  s.abilityUses--;
  if (ability === 'impulse') {
    s.ball.vx = (180 - s.ball.x) * 1.3 * SPEED;
    s.ball.vy = -880 * SPEED;
  } else if (ability === 'guard') {
    s.kickback = true;
    s.saverMs = Math.max(s.saverMs, PINBALL_SAVER_MS);
  } else {
    s.abilityKind = ability;
    s.abilityMs = PINBALL_ABILITY_MS;
  }
  announce(s, `${ABILITIES[ability].label} ativado!`);
  return true;
}

/** Uma sacudida salva a bola, mas três seguidas travam os flippers por um instante. */
export function nudgePinball(s: PinballState, direction: -1 | 1): PinballEvent[] {
  if (s.phase !== 'playing') return [];
  s.ball.vx += direction * 125 * SPEED;
  s.ball.vy -= 95 * SPEED;
  s.tiltHeat += 1;
  if (s.tiltHeat >= 3) {
    s.tiltHeat = 0;
    s.tiltLockMs = 2200;
    announce(s, 'TILT! Flippers travados.');
    return ['tilt'];
  }
  return [];
}

function reflectCircle(s: PinballState, x: number, y: number, radius: number, kick: number, minBounce = 0): boolean {
  const b = s.ball;
  const dx = b.x - x;
  const dy = b.y - y;
  const distance = Math.hypot(dx, dy);
  const limit = radius + BALL_R;
  if (distance >= limit) return false;
  const nx = distance > 0.001 ? dx / distance : 0;
  const ny = distance > 0.001 ? dy / distance : -1;
  b.x = x + nx * limit;
  b.y = y + ny * limit;
  const toward = b.vx * nx + b.vy * ny;
  if (toward < 0) { b.vx -= 1.8 * toward * nx; b.vy -= 1.8 * toward * ny; }
  if (toward < 0) { b.vx += nx * kick * SPEED; b.vy += ny * kick * SPEED; }
  if (minBounce > 0) {
    const out = b.vx * nx + b.vy * ny;
    if (out < minBounce) { b.vx += nx * (minBounce - out); b.vy += ny * (minBounce - out); }
  }
  return true;
}

function reflectSegment(s: PinballState, ax: number, ay: number, bx: number, by: number, radius: number, bounce: number): { hit: boolean; position: number } {
  const b = s.ball;
  const dx = bx - ax;
  const dy = by - ay;
  const projection = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + dx * projection;
  const cy = ay + dy * projection;
  const distance = Math.hypot(b.x - cx, b.y - cy);
  const limit = BALL_R + radius;
  if (distance >= limit) return { hit: false, position: projection };
  let nx = distance > 0.001 ? (b.x - cx) / distance : -dy / Math.hypot(dx, dy);
  let ny = distance > 0.001 ? (b.y - cy) / distance : dx / Math.hypot(dx, dy);
  if (distance < 0.001 && ny > 0) { nx = -nx; ny = -ny; }
  b.x = cx + nx * limit;
  b.y = cy + ny * limit;
  const toward = b.vx * nx + b.vy * ny;
  if (toward < 0) {
    b.vx -= (1 + bounce) * toward * nx;
    b.vy -= (1 + bounce) * toward * ny;
  }
  const tangent = b.vx * -ny + b.vy * nx;
  s.spin = clampSpin(s.spin * 0.78 + tangent * 0.001);
  return { hit: true, position: projection };
}

function flipperContact(s: PinballState, index: number, omega: number, pressed: boolean, events: PinballEvent[]): void {
  const b = s.ball;
  const pivotX = PINBALL_FLIPPERS[index]!.pivotX;
  const pivotY = 525;
  const angle = s.flipperAngle[index]!;
  const tipX = pivotX + Math.cos(angle) * PINBALL_FLIPPER_LENGTH;
  const tipY = pivotY + Math.sin(angle) * PINBALL_FLIPPER_LENGTH;
  const dx = tipX - pivotX;
  const dy = tipY - pivotY;
  const projection = Math.max(0, Math.min(1, ((b.x - pivotX) * dx + (b.y - pivotY) * dy) / (dx * dx + dy * dy)));
  const cx = pivotX + dx * projection;
  const cy = pivotY + dy * projection;
  const distance = Math.hypot(b.x - cx, b.y - cy);
  const limit = BALL_R + FLIPPER_RADIUS;
  if (distance >= limit) return;
  let nx = distance > 0.001 ? (b.x - cx) / distance : -dy / Math.hypot(dx, dy);
  let ny = distance > 0.001 ? (b.y - cy) / distance : dx / Math.hypot(dx, dy);
  if (distance < 0.001 && ny > 0) { nx = -nx; ny = -ny; }
  b.x = cx + nx * limit;
  b.y = cy + ny * limit;
  // O flipper é uma barra girando: a velocidade do ponto de contato entra na conta (ω × r).
  const rx = cx - pivotX;
  const ry = cy - pivotY;
  const contactVx = -omega * ry;
  const contactVy = omega * rx;
  const relX = b.vx - contactVx;
  const relY = b.vy - contactVy;
  const vn = relX * nx + relY * ny;
  if (vn >= 0) return;
  const bounce = pressed ? (Math.abs(omega) > 1 ? 0.5 : 0.05) : 0.05;
  b.vx -= (1 + bounce) * vn * nx;
  b.vy -= (1 + bounce) * vn * ny;
  if (pressed && Math.abs(omega) > 1) {
    // Um toque fraco ainda sobe: o mínimo evita que a bola morra em cima do flipper erguido.
    const out = b.vx * nx + b.vy * ny;
    if (out < 190 * SPEED) { b.vx += nx * (190 * SPEED - out); b.vy += ny * (190 * SPEED - out); }
  }
  const tangent = b.vx * -ny + b.vy * nx;
  s.spin = clampSpin(s.spin * 0.6 + tangent * 0.0015);
  if ((s.flipperCooldownMs[index] ?? 0) === 0) {
    s.flipperCooldownMs[index] = 110;
    events.push('flipper');
  }
}

function updateFlippers(s: PinballState, input: PinballInput, dt: number, events: PinballEvent[]): void {
  for (let index = 0; index < 2; index++) {
    const pressed = (index === 0 ? input.left : input.right) && s.tiltLockMs === 0;
    const target = pressed ? FLIPPER_UP_ANGLE[index]! : FLIPPER_REST_ANGLE[index]!;
    const previous = s.flipperAngle[index]!;
    const maxStep = (pressed ? FLIPPER_UP_SPEED : FLIPPER_DOWN_SPEED) * dt;
    const delta = target - previous;
    const angle = Math.abs(delta) <= maxStep ? target : previous + Math.sign(delta) * maxStep;
    s.flipperAngle[index] = angle;
    const omega = dt > 0 ? (angle - previous) / dt : 0;
    flipperContact(s, index, omega, pressed, events);
  }
}

function clampSpin(value: number): number {
  return Math.max(-MAX_SPIN, Math.min(MAX_SPIN, value));
}

/** Bônus dos locais especiais: fogo (pontos em dobro), faísca (+300 por bumper) ou proteção (resgate). */
function awardBonus(s: PinballState, events: PinballEvent[]): void {
  const kind = BONUS_CYCLE[s.bonusAwards % BONUS_CYCLE.length]!;
  s.bonusAwards += 1;
  score(s, 2000);
  if (kind === 'shield') {
    s.saverMs = Math.max(s.saverMs, PINBALL_BONUS_MS);
    s.kickback = true;
    announce(s, `Bônus: Proteção! Resgate por ${pinballSeconds(PINBALL_BONUS_MS)} s.`);
  } else {
    s.bonusKind = kind;
    s.bonusMs = PINBALL_BONUS_MS;
    announce(s, kind === 'fire' ? `Bônus: bola em chamas! Pontos em dobro por ${pinballSeconds(PINBALL_BONUS_MS)} s.` : `Bônus: bola elétrica! +300 por bumper por ${pinballSeconds(PINBALL_BONUS_MS)} s.`);
  }
  events.push('reward');
}

/** Captura concluída dá uma bola extra; no limite, paga pontos como no Pokémon Pinball original. */
function addExtraBall(s: PinballState): boolean {
  if (s.balls < MAX_EXTRA_BALLS) { s.balls += 1; return true; }
  score(s, 10_000);
  return false;
}

function enterMode(s: PinballState, mode: Exclude<PinballMode, 'normal'>, events: PinballEvent[]): void {
  s.mode = mode;
  s.modeMs = pinballModeWindowMs(mode);
  s.progress = 0;
  s.charge = 0;
  s.bossPhase = 0;
  s.bossMask = 0;
  announce(s, mode === 'capture' ? 'Desafio de captura: acerte 3 alvos ou capture o Pokémon.' : mode === 'evolution' ? 'Desafio de evolução: acerte 7 bumpers.' : 'Chefe: quebre o escudo com 5 bumpers.');
  events.push('mode');
}

/** Um toque em alvo (ou no Pokémon que passeia) abre o desafio da etapa depois de três. */
function chargeChallenge(s: PinballState, events: PinballEvent[]): void {
  s.charge += 1;
  const info = pinballStage(s.stage);
  if (s.charge >= 3) enterMode(s, info.mode, events);
  else announce(s, `${s.charge}/3 toques para abrir ${info.title}`);
}

/** Avanço de captura do desafio; a Precisão vale em dobro, como nos alvos. */
function captureProgress(s: PinballState, events: PinballEvent[], amount = 1): void {
  s.progress += amount * (s.abilityKind === 'focus' && s.abilityMs > 0 ? 2 : 1);
  if (s.progress >= pinballMissionGoal('capture')) completeMode(s, events);
}

/** Cria o elenco do encontro quando a etapa muda; dois Pokémon iguais para a mesa não ficar parada. */
function syncCritters(s: PinballState): void {
  const info = pinballStage(s.stage);
  if (s.critters.length > 0 && s.critters[0]!.dexId === info.dexId) return;
  const lane = PINBALL_CRITTER_LANE;
  s.critters = [
    { dexId: info.dexId, name: info.species, x: lane.minX + 18, y: lane.y, vx: 34 * SPEED, r: lane.r, hiddenMs: 0, cooldownMs: 0, flashMs: 0 },
    { dexId: info.dexId, name: info.species, x: lane.maxX - 18, y: lane.y, vx: -28 * SPEED, r: lane.r, hiddenMs: 0, cooldownMs: 0, flashMs: 0 },
  ];
}

/**
 * A bola acertou um Pokémon do encontro: ele quica, se assusta e some por um instante. No desafio de captura o
 * toque vale como captura parcial; fora dele, só pontua e atrapalha o caminho (a colisão continua valendo).
 */
function onCritter(s: PinballState, critter: PinballCritter, events: PinballEvent[]): void {
  critter.cooldownMs = 350;
  critter.flashMs = 320;
  score(s, 400);
  if (s.mode === 'capture') {
    critter.hiddenMs = 1600;
    s.captured.push({ dexId: critter.dexId, name: critter.name, stage: s.stage });
    announce(s, `${critter.name} capturado!`);
    captureProgress(s, events);
  } else if (s.mode === 'normal') {
    critter.hiddenMs = 1100;
    announce(s, `${critter.name} assustado! +400`);
    chargeChallenge(s, events);
  } else {
    critter.hiddenMs = 1100;
    announce(s, `${critter.name} fugiu! +400`);
  }
  events.push('bump');
}


function completeMode(s: PinballState, events: PinballEvent[]): void {
  const completedMode = s.mode;
  let extraBall = false;
  if (completedMode === 'capture') {
    s.caught += 1;
    // Terminar pelos alvos também conta como captura do encontro; os toques no Pokémon já anotaram a espécie.
    if (!s.captured.some((entry) => entry.stage === s.stage)) {
      const info = pinballStage(s.stage);
      s.captured.push({ dexId: info.dexId, name: info.species, stage: s.stage });
    }
    extraBall = addExtraBall(s);
    score(s, 5000); announce(s, 'Captura na mesa concluída!');
  } else if (completedMode === 'evolution') { s.evolved += 1; score(s, 7000); announce(s, 'Evolução na mesa concluída!'); }
  else if (completedMode === 'bonus') { s.multiplier = Math.min(5, s.multiplier + 1); score(s, 10000); announce(s, `Bônus! Multiplicador ×${s.multiplier}`); }
  s.stage += 1;
  s.mode = 'normal'; s.modeMs = 0; s.progress = 0; s.charge = 0;
  if (s.stage === 2) s.ballLevel = 2;
  if (s.stage === 4) s.ballLevel = 3;
  s.saverMs = Math.max(s.saverMs, 5000 * TIMER);
  const next = pinballStage(s.stage);
  announce(s, `Etapa ${s.stage + 1}: ${next.title}!${extraBall ? ' Bola extra!' : ''}`);
  events.push('reward');
}

function bossProgress(s: PinballState, amount: number, events: PinballEvent[]): void {
  s.progress = Math.min(pinballMissionGoal('bonus', s.bossPhase), s.progress + amount);
  if (s.progress < pinballMissionGoal('bonus', s.bossPhase)) return;
  if (s.bossPhase === 2) { completeMode(s, events); return; }
  s.bossPhase++;
  s.progress = 0;
  score(s, 2500);
  s.saverMs = Math.max(s.saverMs, 12_000 * TIMER);
  announce(s, s.bossPhase === 1 ? 'Escudo quebrado! Acerte 2 selos diferentes.' : 'Selos abertos! Acerte o núcleo 2 vezes.');
  events.push('mode');
}

function onTarget(s: PinballState, index: number, events: PinballEvent[]): void {
  const target = PINBALL_TARGETS[index]!;
  const slot = PINBALL_BUMPERS.length + index;
  s.hitFlash[slot] = FLASH_MS;
  let points = 0;
  if (s.skillShot) {
    points += 2500;
    s.skillShot = false;
    announce(s, 'Tiro de habilidade! +2.500');
  }
  const fire = s.bonusKind === 'fire' ? 2 : 1;
  points += (s.mode === 'bonus' ? 1000 : 300) * fire * (s.abilityKind === 'focus' && s.abilityMs > 0 ? 2 : 1);
  scoreAt(s, points, target.x, target.y);
  events.push('target');
  // Letras C→A→T em ordem acendem um bônus; errar a ordem recomeça do C.
  if (index === s.letterStep) {
    s.letterStep += 1;
    s.letterMs = 4000 * TIMER;
    if (s.letterStep >= 3) {
      s.letterStep = 0;
      s.letterMs = 0;
      announce(s, 'C-A-T completo! Bônus na mesa!');
      awardBonus(s, events);
    }
  } else {
    s.letterStep = index === 0 ? 1 : 0;
    s.letterMs = index === 0 ? 4000 * TIMER : 0;
  }
  if (s.mode === 'normal') {
    chargeChallenge(s, events);
  } else if (s.mode === 'capture') {
    captureProgress(s, events);
  } else if (s.mode === 'bonus' && s.bossPhase === 1) {
    const bit = 1 << index;
    if ((s.bossMask & bit) === 0) {
      s.bossMask |= bit;
      bossProgress(s, 1, events);
    }
  }
}

function loseBall(s: PinballState, events: PinballEvent[]): void {
  if (s.saverMs > 0) {
    s.ball = { x: 316, y: 515, vx: -20 * SPEED, vy: -900 * SPEED };
    s.skillShot = true;
    announce(s, 'Bola salva!');
    return;
  }
  s.balls -= 1;
  events.push('drain');
  if (s.balls <= 0) { s.phase = 'over'; announce(s, `Aventura encerrada na etapa ${s.stage + 1}.`); return; }
  s.phase = 'between';
  s.ball = { x: 316, y: 515, vx: 0, vy: 0 };
  s.combo = 0; s.comboMs = 0;
  s.abilityKind = null; s.abilityMs = 0;
  announce(s, 'Bola perdida. Lance a próxima!');
}

export function stepPinball(s: PinballState, input: PinballInput, dtMs: number): PinballEvent[] {
  const events: PinballEvent[] = [];
  if (s.phase !== 'playing' || !Number.isFinite(dtMs) || dtMs <= 0) return events;
  const elapsed = Math.min(50, dtMs);
  s.messageMs = Math.max(0, s.messageMs - elapsed);
  s.saverMs = Math.max(0, s.saverMs - elapsed);
  s.tiltLockMs = Math.max(0, s.tiltLockMs - elapsed);
  s.tiltHeat = Math.max(0, s.tiltHeat - elapsed / 1600);
  s.comboMs = Math.max(0, s.comboMs - elapsed);
  if (s.comboMs === 0) s.combo = 0;
  s.abilityMs = Math.max(0, s.abilityMs - elapsed);
  if (s.abilityMs === 0) s.abilityKind = null;
  if (s.mode !== 'normal') {
    s.modeMs = Math.max(0, s.modeMs - elapsed);
    if (s.modeMs === 0) {
      const lost = pinballObjective(s).counter;
      s.mode = 'normal'; s.progress = 0; s.charge = 2; s.bossPhase = 0; s.bossMask = 0;
      announce(s, `Tempo esgotado: ${lost}. 1 toque para reabrir.`);
    }
  }
  for (let index = 0; index < s.hitCooldown.length; index++) s.hitCooldown[index] = Math.max(0, (s.hitCooldown[index] ?? 0) - elapsed);
  for (let index = 0; index < s.hitFlash.length; index++) s.hitFlash[index] = Math.max(0, (s.hitFlash[index] ?? 0) - elapsed);
  s.slingFlashMs[0] = Math.max(0, s.slingFlashMs[0] - elapsed);
  s.slingFlashMs[1] = Math.max(0, s.slingFlashMs[1] - elapsed);
  s.coreFlashMs = Math.max(0, s.coreFlashMs - elapsed);
  for (const popup of s.popups) popup.ms = Math.max(0, popup.ms - elapsed);
  if (s.popups.some((popup) => popup.ms === 0)) s.popups = s.popups.filter((popup) => popup.ms > 0);
  for (let index = 0; index < s.flipperCooldownMs.length; index++) s.flipperCooldownMs[index] = Math.max(0, (s.flipperCooldownMs[index] ?? 0) - elapsed);
  s.laneCooldownMs = Math.max(0, s.laneCooldownMs - elapsed);
  s.bossCooldownMs = Math.max(0, s.bossCooldownMs - elapsed);
  s.bonusSpotMs = Math.max(0, s.bonusSpotMs - elapsed);
  if (s.bonusSpotMs === 0) { s.bonusSpot = s.bonusSpot === 3 ? 4 : 3; s.bonusSpotMs = 7000 * TIMER; }
  if (s.bonusMs > 0) {
    s.bonusMs = Math.max(0, s.bonusMs - elapsed);
    if (s.bonusMs === 0) s.bonusKind = null;
  }
  if (s.letterMs > 0) {
    s.letterMs = Math.max(0, s.letterMs - elapsed);
    if (s.letterMs === 0) s.letterStep = 0;
  }
  for (const critter of s.critters) {
    critter.cooldownMs = Math.max(0, critter.cooldownMs - elapsed);
    critter.flashMs = Math.max(0, critter.flashMs - elapsed);
    critter.hiddenMs = Math.max(0, critter.hiddenMs - elapsed);
  }
  syncCritters(s);
  const count = Math.max(1, Math.min(20, Math.ceil(elapsed / SUBSTEP_MS)));
  const dt = elapsed / count / 1000;
  for (let substep = 0; substep < count; substep++) {
    const b = s.ball;
    // Como no Pokémon Pinball, a gravidade "solta" quando a bola já desce rápido: o arco fica mais de fliperama.
    const gravity = GRAVITY * (b.vy > 300 * SPEED ? 0.6 : b.vy > 130 * SPEED ? 0.82 : 1);
    b.vy += gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx += s.spin * SPIN_CURVE * dt;
    const drag = Math.max(0.9, 1 - ROLL_DRAG * dt);
    b.vx *= drag;
    b.vy *= drag;
    s.spin *= Math.exp(-1.1 * SPEED * dt);
    if (b.x < 25 + BALL_R) { b.x = 25 + BALL_R; b.vx = Math.abs(b.vx) * 0.86; }
    if (b.x > 335 - BALL_R) { b.x = 335 - BALL_R; b.vx = -Math.abs(b.vx) * 0.86; }
    if (b.y < 33 + BALL_R) { b.y = 33 + BALL_R; b.vy = Math.abs(b.vy) * 0.86; s.spin *= 0.8; }
    // A canaleta do lançador só se abre no topo, levando a bola para a mesa.
    if (b.x > 300 + BALL_R && b.y < 155 && b.vy < 0) b.vx = Math.min(b.vx, -270 * SPEED);
    // Uma via de saída: a bola não volta para a canaleta nem fica presa no canto direito.
    if (b.x > 300 + BALL_R && b.y < 168) b.vx = Math.min(b.vx, -230 * SPEED);
    if (b.y > 165 && b.y < 520 && b.x > 300 - BALL_R && b.x < 300 + BALL_R) {
      if (b.vx > 0) { b.x = 300 - BALL_R; b.vx = -Math.abs(b.vx) * 0.78; }
      else if (b.vx < 0) { b.x = 300 + BALL_R; b.vx = Math.abs(b.vx) * 0.78; }
    }
    // Guias internas devolvem as bolas dos cantos aos flippers.
    if (b.y > 452 && b.y < 540 && b.x < 104 && b.x > 65) {
      const rail = reflectSegment(s, 74, 458, 100, 522, 3, 0.58);
      if (rail.hit && b.vy > 0) b.vx += 35 * SPEED;
    }
    if (b.y > 450 && b.y < 540 && b.x > 258 && b.x < 300) {
      const rail = reflectSegment(s, 274, 456, 266, 500, 3, 0.58);
      if (rail.hit && b.vy > 0) b.vx -= 35 * SPEED;
    }
    // Slingshots abaixo dos bumpers mantêm a bola em movimento.
    if (reflectSegment(s, 76, 389, 119, 428, 5, 0.92).hit && b.vy > 0) { s.slingFlashMs[0] = FLASH_MS; b.vx += 75 * SPEED; b.vy -= 90 * SPEED; }
    if (reflectSegment(s, 284, 389, 241, 428, 5, 0.92).hit && b.vy > 0) { s.slingFlashMs[1] = FLASH_MS; b.vx -= 75 * SPEED; b.vy -= 90 * SPEED; }
    for (let i = 0; i < PINBALL_BUMPERS.length; i++) {
      const bumper = PINBALL_BUMPERS[i]!;
      const hit = reflectCircle(s, bumper.x, bumper.y, bumper.r, 70, BUMPER_MIN_KICK);
      if ((s.hitCooldown[i] ?? 0) === 0 && hit) {
        s.hitCooldown[i] = 110;
        s.hitFlash[i] = FLASH_MS;
        s.bumperHits += 1;
        s.combo = s.comboMs > 0 ? Math.min(5, s.combo + 1) : 1;
        s.comboMs = 2200 * TIMER;
        let points = (i < 3 ? 150 : 90) * s.combo * (s.abilityKind === 'power' && s.abilityMs > 0 ? 2 : 1);
        if (s.bonusKind === 'fire') points *= 2;
        if (s.bonusKind === 'spark') points += 300;
        scoreAt(s, points, bumper.x, bumper.y);
        if (s.bumperHits % 10 === 0) { s.kickback = true; announce(s, 'Resgate lateral carregado!'); }
        if (i === s.bonusSpot) {
          awardBonus(s, events);
          s.bonusSpot = s.bonusSpot === 3 ? 4 : 3;
          s.bonusSpotMs = 7000 * TIMER;
        }
        if (s.mode === 'evolution') {
          s.progress += 1;
          if (s.progress >= pinballMissionGoal(s.mode)) completeMode(s, events);
        } else if (s.mode === 'bonus' && s.bossPhase === 0) bossProgress(s, 1, events);
        events.push('bump');
      }
    }
    for (let i = 0; i < PINBALL_TARGETS.length; i++) {
      const target = PINBALL_TARGETS[i]!;
      const slot = PINBALL_BUMPERS.length + i;
      const hit = reflectCircle(s, target.x, target.y, target.r, 70, TARGET_MIN_KICK);
      if ((s.hitCooldown[slot] ?? 0) === 0 && hit) {
        s.hitCooldown[slot] = 150;
        onTarget(s, i, events);
        events.push('bump');
      }
    }
    // O Pokémon do encontro caminha pela faixa do meio e é sólido: a bola quica e, na captura, conta o toque.
    const lane = PINBALL_CRITTER_LANE;
    for (const critter of s.critters) {
      if (critter.hiddenMs > 0) continue;
      critter.x += critter.vx * dt;
      if (critter.x < lane.minX) { critter.x = lane.minX; critter.vx = Math.abs(critter.vx); }
      else if (critter.x > lane.maxX) { critter.x = lane.maxX; critter.vx = -Math.abs(critter.vx); }
      if (reflectCircle(s, critter.x, critter.y, critter.r, 55, CRITTER_MIN_KICK) && critter.cooldownMs === 0) onCritter(s, critter, events);
    }
    if (s.mode === 'bonus' && s.bossPhase === 2) {
      const hitCore = reflectCircle(s, PINBALL_BOSS_CORE.x, PINBALL_BOSS_CORE.y, PINBALL_BOSS_CORE.r, 105, CORE_MIN_KICK);
      if (hitCore && s.bossCooldownMs === 0) {
        s.bossCooldownMs = 220;
        s.coreFlashMs = FLASH_MS;
        scoreAt(s, 1500, PINBALL_BOSS_CORE.x, PINBALL_BOSS_CORE.y);
        bossProgress(s, 1, events);
        events.push('core', 'bump');
      }
    }
    // Passagem no topo: acender três vezes recarrega a proteção lateral.
    if (b.y < 145 && b.vy < 0 && b.x > 294 && s.laneCooldownMs === 0) {
      s.laneCooldownMs = 700;
      s.laneHits += 1;
      score(s, 350);
      if (s.laneHits % 3 === 0) { s.kickback = true; announce(s, 'Resgate lateral carregado!'); }
    }
    updateFlippers(s, input, dt, events);
    if (b.y > 542 && (b.x < 84 || b.x > 276) && s.kickback) {
      s.kickback = false;
      b.vx = b.x < 180 ? 170 * SPEED : -170 * SPEED;
      b.vy = -640 * SPEED;
      announce(s, 'Resgate lateral!');
      events.push('reward');
    }
    if (b.y > 558 && (b.x < 76 || b.x > 284)) { loseBall(s, events); break; }
    if (b.y > PINBALL_H + BALL_R) { loseBall(s, events); break; }
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) { b.vx *= MAX_SPEED / speed; b.vy *= MAX_SPEED / speed; }
  }
  return events;
}
