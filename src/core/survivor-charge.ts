import type { BaseStats } from './survivor-moves';

/**
 * Golpes de carga da Torre (pedido do dono): uma barra que só enche com ações do jogador e que, ao apertar o botão
 * de carga, solta um ataque mais forte quanto mais cheia ela estiver.
 *
 * - **Foco**: Pokémon lento com um dos ataques alto. O golpe normal é um disparo largo e lento em linha reta.
 *   Segurar o botão enche a barra (devagar) e deixa o Pokémon lento; soltar dispara um feixe que atravessa
 *   todos os inimigos na linha. Cheio, vira um canhão enorme que cruza a arena.
 * - **Rápido**: Pokémon cuja Velocidade é o maior stat, com ataques baixos. Dispara tiros pequenos e rápidos de
 *   alcance médio e recebe mais dano quanto mais rápido se move. Andar enche a barra; com ela a partir da metade,
 *   apertar o botão troca o golpe por teleportes de dano altíssimo, cada um com 2 s sem levar dano. A troca dura
 *   10 s com a barra cheia, e cartas podem dobrar isso.
 *
 * Aqui ficam só regras e números; o motor (`core/survivor.ts`) aplica o dano e o movimento.
 */
export type ChargeStyle = 'foco' | 'rapido';

export interface SurvivorChargeState {
  /** Quanto a barra está cheia, de 0 a 1. */
  level: number;
  /** O botão de carga estava apertado no passo anterior (para saber quando foi apertado e quando foi solto). */
  holding: boolean;
  /** Rápido: tempo restante dos teleportes e a duração total desta ativação (para a barra da tela). */
  rushMs: number;
  rushTotalMs: number;
  /** Velocidade real do último passo dividida pela velocidade de referência (0 = parado). */
  moveRatio: number;
  /** Nível do último feixe do Foco (para o desenho e o aviso). */
  lastRelease: number;
}

export function createSurvivorCharge(): SurvivorChargeState {
  return { level: 0, holding: false, rushMs: 0, rushTotalMs: 0, moveRatio: 0, lastRelease: 0 };
}

/** Foco: segurar o botão enche ~30% por segundo (pouco mais de 3 s até o máximo). */
export const FOCUS_CHARGE_PER_SEC = 0.3;
/** Foco: cada acerto do disparo normal adianta um pouco a carga. */
export const FOCUS_HIT_CHARGE = 0.02;
/** Foco: velocidade do Pokémon enquanto segura a carga. */
export const FOCUS_SLOW_MULTIPLIER = 0.45;
/** Foco: abaixo disso, soltar o botão não dispara (a carga fica guardada). */
export const FOCUS_MIN_RELEASE = 0.15;
/** Foco: disparo normal mais largo e mais lento que um projétil comum. */
export const FOCUS_SHOT_SIZE_MULTIPLIER = 2.4;
export const FOCUS_SHOT_SPEED_MULTIPLIER = 0.5;
export const FOCUS_SHOT_PIERCE = 2;

/** Rápido: distância andada (px do jogo) para encher a barra do zero. */
export const RUSH_FILL_DISTANCE = 1500;
/** Rápido: a troca só ativa com a barra a partir da metade. */
export const RUSH_MIN_RELEASE = 0.5;
export const RUSH_BASE_MS = 10_000;
/** Rápido: cada nível da carta de duração soma 25%; quatro níveis dobram o tempo. */
export const RUSH_BONUS_PER_LEVEL = 0.25;
export const RUSH_MAX_BONUS_LEVELS = 4;
export const RUSH_TELEPORT_EVERY_MS = 850;
export const RUSH_TELEPORT_RANGE = 320;
export const RUSH_TELEPORT_DAMAGE_MULTIPLIER = 5;
export const RUSH_HIT_RADIUS = 64;
export const RUSH_INVULN_MS = 2000;
/** Rápido: velocidade de referência (px/s) e quanto dano a mais se recebe por velocidade de referência. */
export const RUSH_REFERENCE_SPEED = 150;
export const RUSH_DAMAGE_PER_SPEED = 0.5;
export const RUSH_MAX_DAMAGE_TAKEN = 2;

/**
 * O estilo de carga pelos stats reais, ou `null` (golpe comum).
 * Foco: Velocidade até 60 e Ataque ou Ataque Especial a partir de 100.
 * Rápido: Velocidade a partir de 100, pelo menos 15 acima de todo outro stat, e os dois ataques até 90.
 */
export function chargeStyleFor(s: BaseStats | null): ChargeStyle | null {
  if (!s) return null;
  if (s.speed <= 60 && Math.max(s.attack, s.spAttack) >= 100) return 'foco';
  const others = Math.max(s.hp, s.attack, s.defense, s.spAttack, s.spDefense);
  if (s.speed >= 100 && s.speed >= others + 15 && Math.max(s.attack, s.spAttack) <= 90) return 'rapido';
  return null;
}

export interface FocusBeam {
  tier: 1 | 2 | 3;
  name: string;
  /** Múltiplo do dano atual do golpe. */
  damageMultiplier: number;
  /** Meia largura do feixe (px do jogo). */
  halfWidth: number;
  length: number;
  /** Tempo de atordoamento e de lentidão aplicados a quem o feixe atravessa. */
  stunMs: number;
  slowMs: number;
}

/** O feixe do Foco conforme a barra: curto e fino com pouca carga; cheio, um canhão que cruza a arena. */
export function focusBeam(level: number, range: number): FocusBeam {
  const l = Math.max(0, Math.min(1, level));
  if (l >= 1) return { tier: 3, name: 'Canhão total', damageMultiplier: 12, halfWidth: 46, length: 2400, stunMs: 900, slowMs: 2500 };
  if (l >= 0.5) return { tier: 2, name: 'Feixe pesado', damageMultiplier: round1(3 + 5 * l), halfWidth: 28, length: round1(range * 2.2), stunMs: 0, slowMs: 1500 };
  return { tier: 1, name: 'Raio curto', damageMultiplier: round1(1.5 + 3 * l), halfWidth: 16, length: round1(range * 1.5), stunMs: 0, slowMs: 0 };
}

/** Duração dos teleportes do Rápido: proporcional à barra (metade = 5 s) e aumentada pelas cartas até o dobro. */
export function rushDurationMs(level: number, bonusLevels: number): number {
  const l = Math.max(0, Math.min(1, level));
  if (l < RUSH_MIN_RELEASE) return 0;
  const bonus = Math.max(0, Math.min(RUSH_MAX_BONUS_LEVELS, bonusLevels)) * RUSH_BONUS_PER_LEVEL;
  return Math.round(RUSH_BASE_MS * l * (1 + bonus));
}

/** Rápido: parado recebe o dano normal; correndo na velocidade de referência, +50%; nunca mais que o dobro. */
export function rushDamageTakenMultiplier(moveRatio: number): number {
  const ratio = Number.isFinite(moveRatio) ? Math.max(0, moveRatio) : 0;
  return Math.min(RUSH_MAX_DAMAGE_TAKEN, 1 + ratio * RUSH_DAMAGE_PER_SPEED);
}

export type ChargeAction = { kind: 'focus-release'; level: number } | { kind: 'rush-start'; level: number; durationMs: number } | null;

/**
 * Um passo da barra. `held` é o botão de carga agora; `movedPx`, quanto o Pokémon andou neste passo.
 * Foco: segurar enche, soltar dispara (com carga mínima) e zera. Rápido: andar enche (não durante os teleportes);
 * apertar com a barra a partir da metade inicia os teleportes e zera.
 */
export function stepChargeMeter(c: SurvivorChargeState, style: ChargeStyle | null, held: boolean, movedPx: number, dtMs: number, bonusLevels = 0): ChargeAction {
  const pressed = held && !c.holding;
  const released = !held && c.holding;
  c.holding = held;
  if (style === 'foco') {
    if (held) c.level = Math.min(1, c.level + FOCUS_CHARGE_PER_SEC * (1 + 0.25 * Math.max(0, bonusLevels)) * dtMs / 1000);
    if (released && c.level >= FOCUS_MIN_RELEASE) {
      const level = c.level;
      c.level = 0;
      c.lastRelease = level;
      return { kind: 'focus-release', level };
    }
    return null;
  }
  if (style === 'rapido') {
    if (c.rushMs > 0) {
      c.rushMs = Math.max(0, c.rushMs - dtMs);
      return null;
    }
    if (Number.isFinite(movedPx) && movedPx > 0) c.level = Math.min(1, c.level + movedPx / RUSH_FILL_DISTANCE);
    if (pressed && c.level >= RUSH_MIN_RELEASE) {
      const level = c.level;
      const durationMs = rushDurationMs(level, bonusLevels);
      c.level = 0;
      c.rushMs = durationMs;
      c.rushTotalMs = durationMs;
      return { kind: 'rush-start', level, durationMs };
    }
  }
  return null;
}

/** Distância de um ponto ao segmento de reta (o feixe do Foco). */
export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
