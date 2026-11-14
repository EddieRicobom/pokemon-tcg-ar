/** Mesa e física próprias para o minijogo da Vila. Não usa código nem recursos da ROM. */
export const PINBALL_W = 360;
export const PINBALL_H = 600;
const BALL_R = 7;
const GRAVITY = 820;
const MAX_SPEED = 1250;

export type PinballMode = 'normal' | 'capture' | 'evolution' | 'bonus';
export type PinballPhase = 'ready' | 'playing' | 'between' | 'over' | 'won';
export const PINBALL_STAGES = [
  { title: 'Trilha da Captura', objective: 'Capture acertando os alvos', mode: 'capture' },
  { title: 'Caverna da Evolução', objective: 'Evolua acertando os bumpers', mode: 'evolution' },
  { title: 'Cume do Bônus', objective: 'Conclua o desafio dos alvos', mode: 'bonus' },
] as const;
export const PINBALL_FLIPPERS = [
  { pivotX: 108, tipX: 163 }, { pivotX: 252, tipX: 197 },
] as const;
export interface PinballBall { x: number; y: number; vx: number; vy: number }
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
}
export interface PinballInput { left: boolean; right: boolean }
export type PinballEvent = 'bump' | 'flipper' | 'drain' | 'launch' | 'mode' | 'reward' | 'tilt';

export const PINBALL_BUMPERS = [
  { x: 100, y: 190, r: 24 }, { x: 180, y: 150, r: 24 }, { x: 260, y: 190, r: 24 },
  { x: 102, y: 315, r: 17 }, { x: 258, y: 315, r: 17 },
] as const;
export const PINBALL_TARGETS = [
  { x: 76, y: 110, r: 12 }, { x: 180, y: 76, r: 12 }, { x: 284, y: 110, r: 12 },
] as const;
export function pinballMissionGoal(mode: PinballMode): number { return mode === 'evolution' ? 7 : mode === 'bonus' ? 4 : 3; }

export function createPinballState(best = 0): PinballState {
  return {
    phase: 'ready', stage: 0, ball: { x: 316, y: 515, vx: 0, vy: 0 }, score: 0, best: Math.max(0, best), balls: 3,
    mode: 'normal', modeMs: 0, progress: 0, charge: 0, caught: 0, evolved: 0,
    multiplier: 1, ballLevel: 1, bumperHits: 0, kickback: false, saverMs: 0,
    tiltHeat: 0, tiltLockMs: 0, message: 'Etapa 1/3: lance a Pokébola!', messageMs: 0,
    hitCooldown: Array(PINBALL_BUMPERS.length + PINBALL_TARGETS.length).fill(0),
    flipperCooldownMs: [0, 0], laneCooldownMs: 0, laneHits: 0, combo: 0, comboMs: 0, skillShot: false,
  };
}

function announce(s: PinballState, message: string): void { s.message = message; s.messageMs = 2400; }
function score(s: PinballState, points: number): void {
  s.score += points * s.multiplier * s.ballLevel;
  s.best = Math.max(s.best, s.score);
}

export function launchPinball(s: PinballState): boolean {
  if (s.phase !== 'ready' && s.phase !== 'between') return false;
  s.phase = 'playing';
  s.ball = { x: 316, y: 515, vx: -24, vy: -960 };
  s.saverMs = 7000;
  s.skillShot = true;
  announce(s, 'Bola em jogo!');
  return true;
}

/** Uma sacudida salva a bola, mas três seguidas travam os flippers por um instante. */
export function nudgePinball(s: PinballState, direction: -1 | 1): PinballEvent[] {
  if (s.phase !== 'playing') return [];
  s.ball.vx += direction * 125;
  s.ball.vy -= 95;
  s.tiltHeat += 1;
  if (s.tiltHeat >= 3) {
    s.tiltHeat = 0;
    s.tiltLockMs = 2200;
    announce(s, 'TILT! Flippers travados.');
    return ['tilt'];
  }
  return [];
}

function reflectCircle(s: PinballState, x: number, y: number, radius: number, kick: number): boolean {
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
  if (toward < 0) { b.vx += nx * kick; b.vy += ny * kick; }
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
  return { hit: true, position: projection };
}

function flipper(s: PinballState, left: boolean, pressed: boolean, events: PinballEvent[]): void {
  const index = left ? 0 : 1;
  const { pivotX: ax, tipX: bx } = PINBALL_FLIPPERS[index]!;
  const by = pressed ? 497 : 542;
  const beforeVy = s.ball.vy;
  const projected = Math.max(0, Math.min(1, (s.ball.x - ax) / (bx - ax)));
  const upperFace = 525 + (by - 525) * projected;
  const fromAbove = s.ball.y <= upperFace + 1;
  const hit = reflectSegment(s, ax, 525, bx, by, 7, pressed ? 0.9 : 0.42);
  if (!hit.hit || !pressed || !fromAbove || beforeVy < -160 || (s.flipperCooldownMs[index] ?? 0) > 0) return;
  const aim = hit.position;
  s.ball.y = 525 + (by - 525) * aim - BALL_R - 8;
  s.ball.vy = -690 - 230 * aim;
  s.ball.vx = (left ? 1 : -1) * (115 + 310 * aim) + s.ball.vx * 0.14;
  s.flipperCooldownMs[index] = 110;
  events.push('flipper');
}

function enterMode(s: PinballState, mode: Exclude<PinballMode, 'normal'>, events: PinballEvent[]): void {
  s.mode = mode;
  s.modeMs = mode === 'bonus' ? 50_000 : 60_000;
  s.progress = 0;
  s.charge = 0;
  announce(s, mode === 'capture' ? 'Captura! Acerte 3 alvos.' : mode === 'evolution' ? 'Evolução! Acerte 7 bumpers.' : 'Final! Acerte 4 alvos.');
  events.push('mode');
}

function completeMode(s: PinballState, events: PinballEvent[]): void {
  const completedMode = s.mode;
  if (completedMode === 'capture') { s.caught += 1; score(s, 5000); announce(s, 'Captura na mesa concluída!'); }
  else if (completedMode === 'evolution') { s.evolved += 1; score(s, 7000); announce(s, 'Evolução na mesa concluída!'); }
  else if (completedMode === 'bonus') { s.multiplier = Math.min(5, s.multiplier + 1); score(s, 10000); announce(s, `Bônus! Multiplicador ×${s.multiplier}`); }
  s.stage += 1;
  s.mode = 'normal'; s.modeMs = 0; s.progress = 0; s.charge = 0;
  if (s.stage === 2) s.ballLevel = 2;
  if (s.stage >= PINBALL_STAGES.length) {
    s.phase = 'won';
    announce(s, 'Aventura concluída! Vitória!');
  } else {
    s.saverMs = Math.max(s.saverMs, 5000);
    announce(s, `Etapa ${s.stage + 1}/3: ${PINBALL_STAGES[s.stage]!.title}!`);
  }
  events.push('reward');
}

function onTarget(s: PinballState, events: PinballEvent[]): void {
  if (s.skillShot) {
    score(s, 2500);
    s.skillShot = false;
    announce(s, 'Tiro de habilidade! +2.500');
  }
  score(s, s.mode === 'bonus' ? 1000 : 300);
  if (s.mode === 'normal') {
    s.charge += 1;
    if (s.charge >= 3) enterMode(s, PINBALL_STAGES[s.stage]!.mode, events);
    else announce(s, `${s.charge}/3 alvos para iniciar ${PINBALL_STAGES[s.stage]!.title}`);
  } else if (s.mode !== 'evolution') {
    s.progress += 1;
    if (s.progress >= pinballMissionGoal(s.mode)) completeMode(s, events);
  }
}

function loseBall(s: PinballState, events: PinballEvent[]): void {
  if (s.saverMs > 0) {
    s.ball = { x: 316, y: 515, vx: -20, vy: -900 };
    s.skillShot = true;
    announce(s, 'Bola salva!');
    return;
  }
  s.balls -= 1;
  events.push('drain');
  if (s.balls <= 0) { s.phase = 'over'; announce(s, `Aventura encerrada na etapa ${s.stage + 1}/3.`); return; }
  s.phase = 'between';
  s.ball = { x: 316, y: 515, vx: 0, vy: 0 };
  s.combo = 0; s.comboMs = 0;
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
  if (s.mode !== 'normal') {
    s.modeMs = Math.max(0, s.modeMs - elapsed);
    if (s.modeMs === 0) { s.mode = 'normal'; s.progress = 0; s.charge = 0; announce(s, 'Tempo encerrado.'); }
  }
  for (let index = 0; index < s.hitCooldown.length; index++) s.hitCooldown[index] = Math.max(0, (s.hitCooldown[index] ?? 0) - elapsed);
  for (let index = 0; index < s.flipperCooldownMs.length; index++) s.flipperCooldownMs[index] = Math.max(0, (s.flipperCooldownMs[index] ?? 0) - elapsed);
  s.laneCooldownMs = Math.max(0, s.laneCooldownMs - elapsed);
  const count = Math.max(1, Math.ceil(elapsed / 6));
  const dt = elapsed / count / 1000;
  for (let substep = 0; substep < count; substep++) {
    const b = s.ball;
    b.vy += GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= 0.999;
    if (b.x < 25 + BALL_R) { b.x = 25 + BALL_R; b.vx = Math.abs(b.vx) * 0.86; }
    if (b.x > 335 - BALL_R) { b.x = 335 - BALL_R; b.vx = -Math.abs(b.vx) * 0.86; }
    if (b.y < 33 + BALL_R) { b.y = 33 + BALL_R; b.vy = Math.abs(b.vy) * 0.86; }
    // A canaleta do lançador só se abre no topo, levando a bola para a mesa.
    if (b.x > 300 + BALL_R && b.y < 155 && b.vy < 0) b.vx = Math.min(b.vx, -270);
    if (b.y > 165 && b.y < 520 && b.x > 300 - BALL_R && b.x < 300 + BALL_R) {
      if (b.vx > 0) { b.x = 300 - BALL_R; b.vx = -Math.abs(b.vx) * 0.78; }
      else if (b.vx < 0) { b.x = 300 + BALL_R; b.vx = Math.abs(b.vx) * 0.78; }
    }
    // Guias internas devolvem as bolas dos cantos aos flippers.
    if (b.y > 452 && b.y < 540 && b.x < 104 && b.x > 65) {
      const rail = reflectSegment(s, 74, 458, 100, 522, 3, 0.58);
      if (rail.hit && b.vy > 0) b.vx += 35;
    }
    if (b.y > 452 && b.y < 540 && b.x > 256 && b.x < 295) {
      const rail = reflectSegment(s, 286, 458, 260, 522, 3, 0.58);
      if (rail.hit && b.vy > 0) b.vx -= 35;
    }
    // Slingshots abaixo dos bumpers mantêm a bola em movimento.
    if (reflectSegment(s, 76, 389, 119, 428, 5, 0.92).hit && b.vy > 0) { b.vx += 75; b.vy -= 90; }
    if (reflectSegment(s, 284, 389, 241, 428, 5, 0.92).hit && b.vy > 0) { b.vx -= 75; b.vy -= 90; }
    for (let i = 0; i < PINBALL_BUMPERS.length; i++) {
      const bumper = PINBALL_BUMPERS[i]!;
      const hit = reflectCircle(s, bumper.x, bumper.y, bumper.r, 70);
      if ((s.hitCooldown[i] ?? 0) === 0 && hit) {
        s.hitCooldown[i] = 110;
        s.bumperHits += 1;
        s.combo = s.comboMs > 0 ? Math.min(5, s.combo + 1) : 1;
        s.comboMs = 2200;
        score(s, (i < 3 ? 150 : 90) * s.combo);
      if (s.bumperHits % 10 === 0) { s.kickback = true; announce(s, 'Resgate lateral carregado!'); }
      if (s.mode === 'evolution') {
        s.progress += 1;
        if (s.progress >= pinballMissionGoal(s.mode)) completeMode(s, events);
      }
        events.push('bump');
      }
    }
    for (let i = 0; i < PINBALL_TARGETS.length; i++) {
      const target = PINBALL_TARGETS[i]!;
      const slot = PINBALL_BUMPERS.length + i;
      const hit = reflectCircle(s, target.x, target.y, target.r, 70);
      if ((s.hitCooldown[slot] ?? 0) === 0 && hit) {
        s.hitCooldown[slot] = 150;
        onTarget(s, events);
        events.push('bump');
        if (s.stage >= PINBALL_STAGES.length) break;
      }
    }
    if (s.stage >= PINBALL_STAGES.length) break;
    // Passagem no topo: acender três vezes recarrega a proteção lateral.
    if (b.y < 145 && b.vy < 0 && b.x > 294 && s.laneCooldownMs === 0) {
      s.laneCooldownMs = 700;
      s.laneHits += 1;
      score(s, 350);
      if (s.laneHits % 3 === 0) { s.kickback = true; announce(s, 'Resgate lateral carregado!'); }
    }
    if (s.tiltLockMs === 0) {
      flipper(s, true, input.left, events);
      flipper(s, false, input.right, events);
    }
    if (b.y > 542 && (b.x < 84 || b.x > 276) && s.kickback) {
      s.kickback = false;
      b.vx = b.x < 180 ? 170 : -170;
      b.vy = -640;
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
