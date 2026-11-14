/** Mesa e física próprias para o minijogo da Vila. Não usa código nem recursos da ROM. */
export const PINBALL_W = 360;
export const PINBALL_H = 600;
const BALL_R = 7;
const GRAVITY = 680;
const MAX_SPEED = 1050;

export type PinballMode = 'normal' | 'capture' | 'evolution' | 'bonus';
export type PinballPhase = 'ready' | 'playing' | 'between' | 'over';
export interface PinballBall { x: number; y: number; vx: number; vy: number }
export interface PinballState {
  phase: PinballPhase;
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
}
export interface PinballInput { left: boolean; right: boolean }
export type PinballEvent = 'bump' | 'flipper' | 'drain' | 'launch' | 'mode' | 'reward' | 'tilt';

export const PINBALL_BUMPERS = [
  { x: 100, y: 190, r: 24 }, { x: 180, y: 150, r: 24 }, { x: 260, y: 190, r: 24 },
  { x: 102, y: 315, r: 17 }, { x: 258, y: 315, r: 17 },
] as const;
export const PINBALL_TARGETS = [
  { x: 72, y: 102, r: 12 }, { x: 180, y: 82, r: 12 }, { x: 288, y: 102, r: 12 },
] as const;

export function createPinballState(best = 0): PinballState {
  return {
    phase: 'ready', ball: { x: 316, y: 515, vx: 0, vy: 0 }, score: 0, best: Math.max(0, best), balls: 3,
    mode: 'normal', modeMs: 0, progress: 0, charge: 0, caught: 0, evolved: 0,
    multiplier: 1, ballLevel: 1, bumperHits: 0, kickback: false, saverMs: 0,
    tiltHeat: 0, tiltLockMs: 0, message: 'Lance a Pokébola!', messageMs: 0,
    hitCooldown: Array(PINBALL_BUMPERS.length + PINBALL_TARGETS.length).fill(0),
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
  s.ball = { x: 316, y: 515, vx: -145, vy: -850 };
  s.saverMs = 7000;
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
  b.vx += nx * kick;
  b.vy += ny * kick;
  return true;
}

function flipper(s: PinballState, left: boolean, pressed: boolean, events: PinballEvent[]): void {
  if (!pressed) return;
  const b = s.ball;
  const ax = left ? 119 : 241;
  const ay = 529;
  const bx = left ? 183 : 177;
  const by = pressed ? 496 : 544;
  const dx = bx - ax;
  const dy = by - ay;
  const projection = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + dx * projection;
  const cy = ay + dy * projection;
  const distance = Math.hypot(b.x - cx, b.y - cy);
  if (distance >= BALL_R + 7 || b.vy < -180) return;
  b.y = Math.min(b.y, cy - BALL_R - 7);
  b.vy = -850;
  b.vx = (left ? 1 : -1) * (180 + projection * 150);
  events.push('flipper');
}

function enterMode(s: PinballState, mode: Exclude<PinballMode, 'normal'>, events: PinballEvent[]): void {
  s.mode = mode;
  s.modeMs = mode === 'bonus' ? 22_000 : 30_000;
  s.progress = 0;
  s.charge = 0;
  announce(s, mode === 'capture' ? 'Captura! Acerte 5 alvos.' : mode === 'evolution' ? 'Evolução! Acerte 4 alvos.' : 'Bônus! Acerte os alvos.');
  events.push('mode');
}

function onTarget(s: PinballState, events: PinballEvent[]): void {
  score(s, s.mode === 'bonus' ? 1000 : 300);
  if (s.mode === 'normal') {
    s.charge += 1;
    if (s.charge >= 3) enterMode(s, s.caught > s.evolved ? 'evolution' : 'capture', events);
    else announce(s, `${s.charge}/3 alvos para ${s.caught > s.evolved ? 'evoluir' : 'capturar'}`);
  } else {
    const completedMode = s.mode;
    s.progress += 1;
    const needed = s.mode === 'capture' ? 5 : s.mode === 'evolution' ? 4 : 6;
    if (s.progress < needed) return;
    if (s.mode === 'capture') { s.caught += 1; score(s, 5000); announce(s, 'Captura na mesa concluída!'); }
    else if (s.mode === 'evolution') { s.evolved += 1; score(s, 7000); announce(s, 'Evolução na mesa concluída!'); }
    else { s.multiplier = Math.min(5, s.multiplier + 1); score(s, 10000); announce(s, `Bônus! Multiplicador ×${s.multiplier}`); }
    const completed = s.caught + s.evolved;
    s.mode = 'normal'; s.modeMs = 0; s.progress = 0; s.charge = 0;
    if (completedMode !== 'bonus' && completed > 0 && completed % 3 === 0) enterMode(s, 'bonus', events);
    if (completedMode !== 'bonus' && completed > 0 && completed % 2 === 0) s.ballLevel = Math.min(3, s.ballLevel + 1);
    events.push('reward');
  }
}

function loseBall(s: PinballState, events: PinballEvent[]): void {
  if (s.saverMs > 0) {
    s.ball = { x: 316, y: 515, vx: -120, vy: -780 };
    announce(s, 'Bola salva!');
    return;
  }
  s.balls -= 1;
  events.push('drain');
  if (s.balls <= 0) { s.phase = 'over'; announce(s, 'Fim da partida!'); return; }
  s.phase = 'between';
  s.ball = { x: 316, y: 515, vx: 0, vy: 0 };
  s.mode = 'normal'; s.modeMs = 0; s.progress = 0; s.charge = 0;
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
  if (s.mode !== 'normal') {
    s.modeMs = Math.max(0, s.modeMs - elapsed);
    if (s.modeMs === 0) { s.mode = 'normal'; s.progress = 0; s.charge = 0; announce(s, 'Tempo encerrado.'); }
  }
  for (let index = 0; index < s.hitCooldown.length; index++) s.hitCooldown[index] = Math.max(0, (s.hitCooldown[index] ?? 0) - elapsed);
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
    for (let i = 0; i < PINBALL_BUMPERS.length; i++) {
      const bumper = PINBALL_BUMPERS[i]!;
      if ((s.hitCooldown[i] ?? 0) === 0 && reflectCircle(s, bumper.x, bumper.y, bumper.r, 70)) {
        s.hitCooldown[i] = 110;
        s.bumperHits += 1;
        score(s, i < 3 ? 150 : 90);
        if (s.bumperHits % 10 === 0) { s.kickback = true; announce(s, 'Resgate lateral carregado!'); }
        events.push('bump');
      }
    }
    for (let i = 0; i < PINBALL_TARGETS.length; i++) {
      const target = PINBALL_TARGETS[i]!;
      const slot = PINBALL_BUMPERS.length + i;
      if ((s.hitCooldown[slot] ?? 0) === 0 && reflectCircle(s, target.x, target.y, target.r, 70)) {
        s.hitCooldown[slot] = 150;
        onTarget(s, events);
        events.push('bump');
      }
    }
    if (s.tiltLockMs === 0) {
      flipper(s, true, input.left, events);
      flipper(s, false, input.right, events);
    }
    if (b.y > 548 && (b.x < 86 || b.x > 274) && s.kickback) {
      s.kickback = false;
      b.vx = b.x < 180 ? 170 : -170;
      b.vy = -640;
      announce(s, 'Resgate lateral!');
      events.push('reward');
    }
    if (b.y > PINBALL_H + BALL_R) { loseBall(s, events); break; }
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) { b.vx *= MAX_SPEED / speed; b.vy *= MAX_SPEED / speed; }
  }
  return events;
}
