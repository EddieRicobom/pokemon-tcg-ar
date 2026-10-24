import { describe, expect, it } from 'vitest';
import { createSurvivorState } from './survivor';
import { bonkJumpsRemaining, createBonkPhysics, projectBonkPoint, resolveBonkPosition, stepBonkPhysics, tryBonkJump } from './survivor-bonk';

function player() {
  return createSurvivorState(7, { kindCount: 1, bonk: true }).player;
}

describe('física do modo BONK', () => {
  it('salta, cai pela gravidade e restaura o salto ao pousar', () => {
    const p = player();
    const physics = createBonkPhysics();
    expect(tryBonkJump(physics, p)).toBe(true);
    stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 0 }, 16);
    expect(physics.z).toBeGreaterThan(0);
    expect(physics.grounded).toBe(false);

    for (let frame = 0; frame < 180; frame += 1) stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 0 }, 16);
    expect(physics.z).toBe(0);
    expect(physics.grounded).toBe(true);
    expect(bonkJumpsRemaining(physics, p)).toBe(1);
  });

  it('libera um salto extra no ar com o buff', () => {
    const p = player();
    const physics = createBonkPhysics();
    expect(tryBonkJump(physics, p)).toBe(true);
    expect(tryBonkJump(physics, p)).toBe(false);
    p.bonkAirJumps = 1;
    expect(tryBonkJump(physics, p)).toBe(true);
    expect(bonkJumpsRemaining(physics, p)).toBe(0);
  });

  it('bloqueia pedra no chão, mas permite pular por cima de obstáculo baixo', () => {
    const physics = createBonkPhysics();
    const stone = physics.obstacles.find((obstacle) => obstacle.id === 'stone-1')!;
    const blocked = resolveBonkPosition(physics, stone.x + stone.w / 2, stone.y + stone.h / 2);
    expect(blocked.collided).toBe(true);

    physics.z = 120;
    const jumped = resolveBonkPosition(physics, stone.x + stone.w / 2, stone.y + stone.h / 2);
    expect(jumped.collided).toBe(false);
  });

  it('gira a câmera atrás da direção do movimento e projeta o mundo à frente', () => {
    const p = player();
    const physics = createBonkPhysics(0);
    stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 1 }, 300);
    expect(physics.cameraYaw).toBeGreaterThan(0.5);
    const point = projectBonkPoint(physics, p, {
      x: p.x + Math.cos(physics.cameraYaw) * 500,
      y: p.y + Math.sin(physics.cameraYaw) * 500,
    }, { width: 600, height: 420 });
    expect(point).not.toBeNull();
    expect(point!.x).toBeGreaterThan(150);
    expect(point!.x).toBeLessThan(450);
  });
});
