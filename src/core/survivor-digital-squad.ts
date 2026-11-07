/**
 * O grupo do Perigo digital joga como um time de liga: cada um tem um papel, eles cercam você em vez de correr em fila,
 * desviam dos seus golpes, atiram onde você vai estar e entram todos juntos quando há uma brecha. Continua legível:
 * toda arrancada tem um aviso curto (o mesmo vermelho da investida) e os tiros saem do mesmo jeito que os outros.
 * Lógica pura; `survivor.ts` chama `digitalSquadPlan` no lugar do comportamento comum desses três.
 */

/** 0 = linha de frente (encara), 1 = atirador (mantém distância), 2 = assassino (vai pelas costas). */
export type DigitalRole = 0 | 1 | 2;

/** Distância de cada papel até você enquanto o time se posiciona. */
export const DIGITAL_SLOT_DISTANCE: Record<DigitalRole, number> = { 0: 120, 1: 240, 2: 150 };
/** Ângulo de cada papel em volta de você, a partir da frente da linha de frente: um triângulo, nunca uma fila. */
const SLOT_ANGLE: Record<DigitalRole, number> = { 0: 0, 1: (2 * Math.PI) / 3, 2: -(2 * Math.PI) / 3 };
/** De quanto em quanto tempo o time tenta entrar junto, e quanto dura o aviso antes da arrancada. */
export const DIGITAL_ENGAGE_EVERY_MS = 4200;
export const DIGITAL_TELEGRAPH_MS = 260;
export const DIGITAL_DASH_MS = 420;
/** Atirador: intervalo entre tiros e quanto ele "lê" o seu movimento para mirar à frente. */
export const DIGITAL_SHOT_EVERY_MS = 1500;
/** Distância em que eles começam a sair do caminho de um golpe seu. */
export const DIGITAL_DODGE_RANGE = 140;

export interface Vec {
  x: number;
  y: number;
}

/** Onde mirar para acertar quem se move: a posição dele quando o tiro chegaria (sem passar de 1,2 s à frente). */
export function leadTarget(from: Vec, target: Vec, velocity: Vec, shotSpeed: number): Vec {
  const d = Math.hypot(target.x - from.x, target.y - from.y);
  const t = Math.min(1.2, d / Math.max(1, shotSpeed));
  return { x: target.x + velocity.x * t, y: target.y + velocity.y * t };
}

/** A vaga do papel em volta de você. `facing` é a direção de você até a linha de frente: o triângulo gira junto. */
export function slotTarget(player: Vec, facing: number, role: DigitalRole): Vec {
  const angle = facing + SLOT_ANGLE[role];
  const r = DIGITAL_SLOT_DISTANCE[role];
  return { x: player.x + Math.cos(angle) * r, y: player.y + Math.sin(angle) * r };
}

export interface IncomingShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

/**
 * Passo de desvio: entre os seus golpes que vêm na direção do inimigo e vão acertá-lo, o mais perto decide; ele sai
 * para o lado da linha em que já está. Sem golpe perigoso, null.
 */
export function dodgeStep(enemy: Vec & { radius: number }, shots: readonly IncomingShot[], range = DIGITAL_DODGE_RANGE): Vec | null {
  let best: Vec | null = null;
  let bestDist = Infinity;
  for (const shot of shots) {
    const speed = Math.hypot(shot.vx, shot.vy);
    if (speed < 1) continue;
    const rx = enemy.x - shot.x;
    const ry = enemy.y - shot.y;
    const d = Math.hypot(rx, ry);
    if (d > range || rx * shot.vx + ry * shot.vy <= 0) continue;
    const cross = (rx * shot.vy - ry * shot.vx) / speed;
    if (Math.abs(cross) > enemy.radius + shot.size + 4 || d >= bestDist) continue;
    bestDist = d;
    const away = cross >= 0 ? -1 : 1;
    best = { x: (-shot.vy / speed) * away, y: (shot.vx / speed) * away };
  }
  return best;
}

export interface SquadMember extends Vec {
  role: DigitalRole;
  hp: number;
  maxHp: number;
}

export type SquadIntent = 'position' | 'engage' | 'retreat' | 'kite';

/**
 * O que um membro faz agora. Machucado (menos de 30%), recua para trás do atirador. O time entra junto quando a janela
 * abre (a cada `DIGITAL_ENGAGE_EVERY_MS`) ou quando você está com pouca vida; fora disso, cada um vai para a sua vaga, e o
 * atirador nunca deixa você chegar perto.
 */
export function squadIntent(member: SquadMember, player: Vec & { hpRatio: number }, timeMs: number): SquadIntent {
  if (member.hp < member.maxHp * 0.3) return 'retreat';
  const d = Math.hypot(member.x - player.x, member.y - player.y);
  if (member.role === 1) return d < 170 ? 'kite' : 'position';
  const window = timeMs % DIGITAL_ENGAGE_EVERY_MS < 900;
  return window || player.hpRatio < 0.4 ? 'engage' : 'position';
}
