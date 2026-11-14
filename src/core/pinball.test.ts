import { describe, expect, it } from 'vitest';
import { createPinballState, launchPinball, nudgePinball, PINBALL_TARGETS, stepPinball } from './pinball';
import type { PinballState } from './pinball';

function hitTarget(s: PinballState): void {
  const target = PINBALL_TARGETS[1]!;
  s.ball = { x: target.x, y: target.y, vx: 0, vy: 0 };
  s.hitCooldown.fill(0);
  stepPinball(s, { left: false, right: false }, 16);
}

describe('pinball da Vila', () => {
  it('lança, usa física estável e guarda o recorde', () => {
    const s = createPinballState(500);
    expect(s.phase).toBe('ready');
    expect(s.balls).toBe(3);
    expect(launchPinball(s)).toBe(true);
    expect(launchPinball(s)).toBe(false);
    for (let i = 0; i < 200; i++) {
      stepPinball(s, { left: i % 2 === 0, right: i % 3 === 0 }, 16);
      expect(Number.isFinite(s.ball.x) && Number.isFinite(s.ball.y)).toBe(true);
      if (s.phase === 'between') launchPinball(s);
    }
    expect(s.best).toBeGreaterThanOrEqual(500);
  });

  it('flipper esquerdo rebate a bola para cima', () => {
    const s = createPinballState();
    launchPinball(s);
    s.ball = { x: 150, y: 513, vx: 0, vy: 120 };
    const events = stepPinball(s, { left: true, right: false }, 16);
    expect(events).toContain('flipper');
    expect(s.ball.vy).toBeLessThan(0);
    expect(s.ball.vx).toBeGreaterThan(0);
  });

  it('alvos iniciam captura, evolução e dão progresso e pontuação', () => {
    const s = createPinballState();
    launchPinball(s);
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.mode).toBe('capture');
    for (let i = 0; i < 5; i++) hitTarget(s);
    expect(s.caught).toBe(1);
    expect(s.mode).toBe('normal');
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.mode).toBe('evolution');
    for (let i = 0; i < 4; i++) hitTarget(s);
    expect(s.evolved).toBe(1);
    expect(s.ballLevel).toBe(2);
    expect(s.score).toBeGreaterThan(10000);
    expect(s.best).toBe(s.score);
  });

  it('bola salva não gasta tentativa, mas três perdas terminam a partida', () => {
    const s = createPinballState();
    launchPinball(s);
    s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.balls).toBe(3);
    expect(s.phase).toBe('playing');
    s.saverMs = 0;
    for (let i = 0; i < 3; i++) {
      s.saverMs = 0;
      s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
      stepPinball(s, { left: false, right: false }, 16);
      if (s.phase === 'between') launchPinball(s);
    }
    expect(s.balls).toBe(0);
    expect(s.phase).toBe('over');
    expect(launchPinball(s)).toBe(false);
  });

  it('sacudir ajuda, mas três sacudidas travam os flippers temporariamente', () => {
    const s = createPinballState();
    expect(nudgePinball(s, 1)).toEqual([]);
    launchPinball(s);
    const vx = s.ball.vx;
    nudgePinball(s, 1);
    expect(s.ball.vx).toBe(vx + 125);
    nudgePinball(s, -1);
    expect(nudgePinball(s, 1)).toContain('tilt');
    expect(s.tiltLockMs).toBe(2200);
    stepPinball(s, { left: true, right: true }, 16);
    expect(s.tiltLockMs).toBeLessThan(2200);
  });

  it('a terceira missão abre bônus uma vez e conclui com multiplicador', () => {
    const s = createPinballState();
    launchPinball(s);
    s.caught = 2;
    s.mode = 'capture';
    s.modeMs = 30_000;
    s.progress = 4;
    hitTarget(s);
    expect(s.caught).toBe(3);
    expect(s.mode).toBe('bonus');
    for (let i = 0; i < 6; i++) hitTarget(s);
    expect(s.multiplier).toBe(2);
    expect(s.mode).toBe('normal');
  });
});
