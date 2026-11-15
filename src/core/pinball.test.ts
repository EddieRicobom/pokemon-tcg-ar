import { describe, expect, it } from 'vitest';
import { activatePinballAbility, createPinballState, launchPinball, nudgePinball, pinballPartnerSkill, PINBALL_BOSS_CORE, PINBALL_BUMPERS, PINBALL_TARGETS, stepPinball } from './pinball';
import type { PinballState } from './pinball';

function hitTarget(s: PinballState, index = 1): void {
  const target = PINBALL_TARGETS[index]!;
  s.ball = { x: target.x, y: target.y, vx: 0, vy: 0 };
  s.hitCooldown.fill(0);
  stepPinball(s, { left: false, right: false }, 16);
}
function hitCore(s: PinballState): void {
  s.ball = { x: PINBALL_BOSS_CORE.x, y: PINBALL_BOSS_CORE.y, vx: 0, vy: 0 };
  s.bossCooldownMs = 0;
  stepPinball(s, { left: false, right: false }, 16);
}
function hitBumper(s: PinballState): void {
  const bumper = PINBALL_BUMPERS[1]!;
  s.ball = { x: bumper.x, y: bumper.y, vx: 0, vy: 0 };
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
    s.ball = { x: 150, y: 490, vx: 0, vy: 120 };
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
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.caught).toBe(1);
    expect(s.mode).toBe('normal');
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.mode).toBe('evolution');
    for (let i = 0; i < 7; i++) hitBumper(s);
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

  it('três etapas avançam em ordem e o desafio final concede vitória', () => {
    const s = createPinballState();
    launchPinball(s);
    for (let i = 0; i < 6; i++) hitTarget(s);
    expect(s.stage).toBe(1);
    expect(s.caught).toBe(1);
    for (let i = 0; i < 3; i++) hitTarget(s);
    for (let i = 0; i < 7; i++) hitBumper(s);
    expect(s.stage).toBe(2);
    expect(s.evolved).toBe(1);
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(s.mode).toBe('bonus');
    for (let i = 0; i < 5; i++) hitBumper(s);
    expect(s.bossPhase).toBe(1);
    hitTarget(s, 0);
    hitTarget(s, 0);
    expect(s.progress).toBe(1);
    hitTarget(s, 1);
    expect(s.bossPhase).toBe(2);
    hitCore(s);
    expect(s.phase).toBe('playing');
    hitCore(s);
    expect(s.phase).toBe('won');
    expect(s.stage).toBe(3);
    expect(s.multiplier).toBe(2);
    expect(launchPinball(s)).toBe(false);
  });

  it('tempo esgotado permite tentar novamente a etapa atual', () => {
    const s = createPinballState();
    launchPinball(s);
    s.stage = 1;
    s.mode = 'capture';
    s.modeMs = 1;
    s.progress = 2;
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.mode).toBe('normal');
    expect(s.stage).toBe(1);
    expect(s.balls).toBe(3);
  });

  it('o tipo real define a habilidade e ausência de dado não cria tipo', () => {
    expect(pinballPartnerSkill(25)).toMatchObject({ type: 'electric', ability: 'impulse', label: 'Impulso' });
    expect(pinballPartnerSkill(7)).toMatchObject({ type: 'water', ability: 'guard' });
    expect(pinballPartnerSkill(445)).toMatchObject({ type: 'dragon', ability: 'power' });
    expect(pinballPartnerSkill(133)).toMatchObject({ type: 'normal', ability: 'focus' });
    expect(pinballPartnerSkill(-1)).toBeNull();
  });

  it('habilidade usa uma carga por bola e a proteção não gasta bola salva', () => {
    const s = createPinballState();
    expect(activatePinballAbility(s, 'guard')).toBe(false);
    launchPinball(s);
    expect(activatePinballAbility(s, 'guard')).toBe(true);
    expect(s.kickback).toBe(true);
    expect(s.saverMs).toBeGreaterThanOrEqual(7000);
    expect(activatePinballAbility(s, 'guard')).toBe(false);
    s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.phase).toBe('playing');
    expect(s.abilityUses).toBe(0);
    s.saverMs = 0;
    s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.phase).toBe('between');
    launchPinball(s);
    expect(s.abilityUses).toBe(1);
  });

  it('precisão acelera captura, mas não pula os alvos distintos do chefe', () => {
    const s = createPinballState();
    launchPinball(s);
    for (let i = 0; i < 3; i++) hitTarget(s);
    expect(activatePinballAbility(s, 'focus')).toBe(true);
    hitTarget(s);
    expect(s.progress).toBe(2);
    hitTarget(s);
    expect(s.caught).toBe(1);
    s.stage = 2; s.mode = 'bonus'; s.modeMs = 100_000; s.bossPhase = 1; s.bossMask = 0; s.progress = 0;
    hitTarget(s, 0);
    hitTarget(s, 0);
    expect(s.progress).toBe(1);
  });

  it('impulso direciona a bola; impacto dobra os pontos dos bumpers', () => {
    const baseline = createPinballState();
    const powered = createPinballState();
    launchPinball(baseline); launchPinball(powered);
    powered.ball = { x: 270, y: 410, vx: 80, vy: 240 };
    expect(activatePinballAbility(powered, 'impulse')).toBe(true);
    expect(powered.ball.vy).toBe(-880);
    expect(powered.ball.vx).toBeLessThan(0);
    expect(activatePinballAbility(powered, 'power')).toBe(false);
    powered.abilityUses = 1;
    expect(activatePinballAbility(powered, 'power')).toBe(true);
    hitBumper(baseline); hitBumper(powered);
    expect(powered.score).toBe(baseline.score * 2);
    stepPinball(powered, { left: false, right: false }, 50);
    expect(powered.abilityMs).toBeLessThan(12_000);
  });

  it('deixa a bola cair pelo vão central com os dois flippers pressionados', () => {
    const s = createPinballState();
    launchPinball(s);
    s.saverMs = 0;
    s.ball = { x: 180, y: 475, vx: 0, vy: 100 };
    let flipperHits = 0;
    for (let i = 0; i < 90 && s.phase === 'playing'; i++) {
      flipperHits += stepPinball(s, { left: true, right: true }, 16).filter(event => event === 'flipper').length;
    }
    expect(flipperHits).toBe(0);
    expect(s.phase).toBe('between');
    expect(s.balls).toBe(2);
  });

  it('lançamento alcança a mesa, faz pontos e não fica preso na canaleta', () => {
    const s = createPinballState();
    launchPinball(s);
    let highest = s.ball.y;
    for (let i = 0; i < 220; i++) {
      stepPinball(s, { left: false, right: false }, 16);
      highest = Math.min(highest, s.ball.y);
    }
    expect(highest).toBeLessThan(150);
    expect(s.score).toBeGreaterThan(0);
    expect(s.laneHits).toBeGreaterThan(0);
  });

  it('mantém o progresso da missão depois de perder uma bola', () => {
    const s = createPinballState();
    launchPinball(s);
    for (let i = 0; i < 4; i++) hitTarget(s);
    expect(s.mode).toBe('capture');
    expect(s.progress).toBe(1);
    s.saverMs = 0;
    s.ball = { x: 180, y: 610, vx: 0, vy: 200 };
    stepPinball(s, { left: false, right: false }, 16);
    expect(s.phase).toBe('between');
    expect(s.mode).toBe('capture');
    expect(s.progress).toBe(1);
    launchPinball(s);
    for (let i = 0; i < 2; i++) hitTarget(s);
    expect(s.caught).toBe(1);
  });

  it('partida guiada atravessa os encontros e vence as três fases do chefe', () => {
    const s = createPinballState();
    launchPinball(s);
    let frames = 0;
    while (s.phase !== 'over' && s.phase !== 'won' && frames < 5000) {
      stepPinball(s, { left: s.ball.x < 180 && s.ball.y > 460, right: s.ball.x >= 180 && s.ball.y > 460 }, 16);
      if (s.phase === 'between') launchPinball(s);
      expect(Number.isFinite(s.ball.x) && Number.isFinite(s.ball.y)).toBe(true);
      frames++;
    }
    expect(s.phase).toBe('won');
    expect(frames).toBeGreaterThan(1000);
    expect(s.caught).toBeGreaterThanOrEqual(1);
    expect(s.evolved).toBeGreaterThanOrEqual(1);
    expect(s.bossPhase).toBe(2);
    expect(s.score).toBeGreaterThan(10000);
  });
});
