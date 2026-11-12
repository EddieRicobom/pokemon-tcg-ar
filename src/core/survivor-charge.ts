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
/**
 * `rapido` é a Rajada: três disparos automáticos e uma pausa curta.
 * `teleporte` é o golpe de hold; ele nunca começa sozinho ao andar.
 */
export type ChargeStyle = 'foco' | 'rapido' | 'teleporte';

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
  /** Teleporte: tempo contínuo segurando o botão nesta tentativa. */
  teleportHoldMs: number;
  /** Teleporte: recarga iniciada apenas depois de uma soltura válida. */
  teleportCooldownMs: number;
  /** Rajada: disparos ainda pendentes nesta onda e tempo até o próximo. */
  rapidShotsPending: number;
  rapidShotDelayMs: number;
}

export function createSurvivorCharge(): SurvivorChargeState {
  return { level: 0, holding: false, rushMs: 0, rushTotalMs: 0, moveRatio: 0, lastRelease: 0, teleportHoldMs: 0, teleportCooldownMs: 0, rapidShotsPending: 0, rapidShotDelayMs: 0 };
}

/**
 * Foco: segurar o botão enche ~31% por segundo (pouco mais de 3 s até o máximo). Era 27%: com o Golpe Supremo o Foco ficou
 * como a forma que menos vive (1,81× atrás da melhor); ver a seção de 12/11/2026 em `docs/SURVIVOR_BALANCE_PRINCIPLES.md`.
 */
export const FOCUS_CHARGE_PER_SEC = 0.31;
/** Foco: cada acerto do disparo normal adianta um pouco a carga. */
export const FOCUS_HIT_CHARGE = 0.02;
/**
 * Foco: escala do dano do feixe. Medido com stats iguais, o feixe cheio fazia 7 a 9 vezes o dano por segundo de um projétil
 * (alvo único e multidão) e, nas corridas, vivia 15% a 30% mais que a média das formas com mais de 1.000 abates; com a escala
 * (e a carga um pouco mais lenta) a sobrevivência fica no grupo e o golpe segue pesado e lento (ver `docs/SURVIVOR_BALANCE_PRINCIPLES.md`).
 */
export const FOCUS_BEAM_DAMAGE_SCALE = 0.22;
/** Foco: velocidade do Pokémon enquanto segura a carga (era 0,45: carregar quase parado era a causa das mortes do Foco). */
export const FOCUS_SLOW_MULTIPLIER = 0.6;
/** Foco: abaixo disso, soltar o botão não dispara (a carga fica guardada). */
export const FOCUS_MIN_RELEASE = 0.15;
/** Foco: disparo normal mais largo e mais lento que um projétil comum. */
export const FOCUS_SHOT_SIZE_MULTIPLIER = 2.4;
export const FOCUS_SHOT_SPEED_MULTIPLIER = 0.5;
export const FOCUS_SHOT_PIERCE = 2;

/** Rápido: distância andada (px do jogo) para encher a barra do zero. */
export const RUSH_FILL_DISTANCE = 15_000;
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

/** Rajada: três tiros em 180 ms e 600 ms de respiro até a próxima onda. */
export const RAPID_BURST_SHOTS = 3;
export const RAPID_BURST_SHOT_INTERVAL_MS = 90;
export const RAPID_BURST_CYCLE_MS = 780;
/** Nem a maior cadência encurta o ciclo a ponto de apagar a pausa (180 ms de tiros + 180 ms de respiro). */
export const RAPID_BURST_MIN_CYCLE_MS = 360;
/** Abertura do leque de cada instante quando cartas de disparo múltiplo aumentam `shots`. */
export const RAPID_BURST_SPREAD = 0.2;

/** Teleporte: só uma soltura deliberada ativa o golpe. */
export const TELEPORT_MIN_HOLD_MS = 150;
export const TELEPORT_FULL_HOLD_MS = 1200;
export const TELEPORT_COOLDOWN_MS = 1500;
export const TELEPORT_MIN_INVULN_MS = 180;
export const TELEPORT_MAX_INVULN_MS = 600;
export const TELEPORT_MIN_DAMAGE_MULTIPLIER = 1.5;
export const TELEPORT_MAX_DAMAGE_MULTIPLIER = 4;
export const TELEPORT_RANGE = 240;
export const TELEPORT_HIT_RADIUS = 54;
export const TELEPORT_FULL_WAVE_RADIUS = 150;
/** Teto de alcance e piso de recarga: as cartas de alcance e cadência melhoram o Teleporte sem apagar a janela vulnerável. */
export const TELEPORT_MAX_RANGE = 420;
export const TELEPORT_MIN_COOLDOWN_MS = 900;
/** Cada disparo/impacto extra (`shots`) alarga o impacto e a onda em 20%, até quatro extras. */
export const TELEPORT_SHOT_WIDEN = 0.2;

export interface TeleportReach {
  range: number;
  hitRadius: number;
  waveRadius: number;
}

/** Alcance, raio do impacto e raio da onda do Teleporte a partir dos stats e das cartas do jogador (valores inválidos caem nos padrões). */
export function teleportReach(attackRange: number, attackRadius: number, shots: number): TeleportReach {
  const widen = 1 + TELEPORT_SHOT_WIDEN * Math.max(0, Math.min(4, Number.isFinite(shots) ? shots - 1 : 0));
  const range = Number.isFinite(attackRange) && attackRange > 0 ? Math.min(TELEPORT_MAX_RANGE, attackRange) : TELEPORT_RANGE;
  const radius = Number.isFinite(attackRadius) && attackRadius > 0 ? attackRadius : TELEPORT_HIT_RADIUS;
  return { range, hitRadius: radius * widen, waveRadius: TELEPORT_FULL_WAVE_RADIUS * widen };
}

/** Recarga do Teleporte: parte da recarga do jogador (Velocidade e cartas), com as cartas de preparo e o piso. */
export function teleportCooldownMs(baseCooldownMs: number, bonusLevels: number): number {
  const base = Number.isFinite(baseCooldownMs) && baseCooldownMs > 0 ? baseCooldownMs : TELEPORT_COOLDOWN_MS;
  return Math.max(TELEPORT_MIN_COOLDOWN_MS, Math.round(base / (1 + 0.2 * Math.max(0, Math.min(3, bonusLevels)))));
}

/**
 * O estilo de carga pelos stats reais, ou `null` (golpe comum).
 * Foco: Velocidade até 60 e Ataque ou Ataque Especial a partir de 100.
 * Rápido: Velocidade a partir de 100, pelo menos 15 acima de todo outro stat, e os dois ataques até 90.
 * Entre os elegíveis, Ataque Especial maior ou igual ao Ataque recebe Rajada;
 * Ataque maior recebe Teleporte. A regra não depende de tipo nem de dados aleatórios.
 */
export function chargeStyleFor(s: BaseStats | null): ChargeStyle | null {
  if (!s) return null;
  if (s.speed <= 60 && Math.max(s.attack, s.spAttack) >= 100) return 'foco';
  const others = Math.max(s.hp, s.attack, s.defense, s.spAttack, s.spDefense);
  if (s.speed >= 100 && s.speed >= others + 15 && Math.max(s.attack, s.spAttack) <= 90) return s.spAttack >= s.attack ? 'rapido' : 'teleporte';
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
  if (l >= 1) return { tier: 3, name: 'Canhão total', damageMultiplier: round1(12 * FOCUS_BEAM_DAMAGE_SCALE), halfWidth: 46, length: 2400, stunMs: 900, slowMs: 2500 };
  if (l >= 0.5) return { tier: 2, name: 'Feixe pesado', damageMultiplier: round1((3 + 5 * l) * FOCUS_BEAM_DAMAGE_SCALE), halfWidth: 28, length: round1(range * 2.2), stunMs: 0, slowMs: 1500 };
  return { tier: 1, name: 'Raio curto', damageMultiplier: round1((1.5 + 3 * l) * FOCUS_BEAM_DAMAGE_SCALE), halfWidth: 16, length: round1(range * 1.5), stunMs: 0, slowMs: 0 };
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

export interface TeleportRelease {
  kind: 'teleport-release';
  /** 0 no mínimo válido e 1 depois da carga completa. */
  level: number;
  invulnMs: number;
  damageMultiplier: number;
  /** Só a carga cheia emite a onda; o motor a aplica uma vez, sem dano extra. */
  wave: boolean;
}

export type ChargeAction = { kind: 'focus-release'; level: number } | TeleportRelease | null;

/** Cancela uma tentativa de teleporte sem converter a perda de foco em golpe. */
export function cancelTeleportHold(c: SurvivorChargeState): void {
  c.holding = false;
  c.teleportHoldMs = 0;
}

/** Agenda dos três tiros da Rajada no ciclo; é estável inclusive em passos grandes. */
export function rapidBurstShotsBetween(previousElapsedMs: number, dtMs: number): number[] {
  const from = Math.max(0, previousElapsedMs);
  const to = from + Math.max(0, dtMs);
  const result: number[] = [];
  const firstCycle = Math.floor(from / RAPID_BURST_CYCLE_MS);
  const lastCycle = Math.floor(Math.max(from, to - Number.EPSILON) / RAPID_BURST_CYCLE_MS);
  for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
    for (let shot = 0; shot < RAPID_BURST_SHOTS; shot++) {
      const at = cycle * RAPID_BURST_CYCLE_MS + shot * RAPID_BURST_SHOT_INTERVAL_MS;
      if (at >= from && at < to) result.push(at - from);
    }
  }
  return result;
}

/** Resultado da soltura do Teleporte já normalizado para o motor, sem posição nem alvo. */
export function teleportRelease(holdMs: number): TeleportRelease | null {
  if (!Number.isFinite(holdMs) || holdMs < TELEPORT_MIN_HOLD_MS) return null;
  const level = Math.max(0, Math.min(1, (holdMs - TELEPORT_MIN_HOLD_MS) / (TELEPORT_FULL_HOLD_MS - TELEPORT_MIN_HOLD_MS)));
  return {
    kind: 'teleport-release',
    level,
    invulnMs: Math.round(TELEPORT_MIN_INVULN_MS + (TELEPORT_MAX_INVULN_MS - TELEPORT_MIN_INVULN_MS) * level),
    damageMultiplier: round1(TELEPORT_MIN_DAMAGE_MULTIPLIER + (TELEPORT_MAX_DAMAGE_MULTIPLIER - TELEPORT_MIN_DAMAGE_MULTIPLIER) * level),
    wave: level >= 1,
  };
}

/**
 * Um passo da barra. `held` é o botão de carga agora; `movedPx`, quanto o Pokémon andou neste passo.
 * Foco: segurar enche, soltar dispara (com carga mínima) e zera. Rajada não
 * usa esta barra. Teleporte exige hold e só resolve uma vez na soltura.
 */
export function stepChargeMeter(c: SurvivorChargeState, style: ChargeStyle | null, held: boolean, movedPx: number, dtMs: number, bonusLevels = 0, cooldownMs = TELEPORT_COOLDOWN_MS): ChargeAction {
  void movedPx;
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
  if (style === 'teleporte') {
    c.teleportCooldownMs = Math.max(0, c.teleportCooldownMs - Math.max(0, dtMs));
    if (held && c.teleportCooldownMs === 0) c.teleportHoldMs = Math.min(TELEPORT_FULL_HOLD_MS, c.teleportHoldMs + Math.max(0, dtMs));
    if (released) {
      const action = c.teleportCooldownMs === 0 ? teleportRelease(c.teleportHoldMs) : null;
      c.teleportHoldMs = 0;
      if (action) c.teleportCooldownMs = teleportCooldownMs(cooldownMs, bonusLevels);
      return action;
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

/** O automático mantém o botão e o solta por um passo ao atingir a carga máxima. */
export function autoChargeHeld(style: 'foco' | 'teleporte' | 'trilha', charge: SurvivorChargeState): boolean {
  if (style === 'trilha') return true;
  return style === 'foco' ? charge.level < 1 : charge.teleportHoldMs < TELEPORT_FULL_HOLD_MS;
}
