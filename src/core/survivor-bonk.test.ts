import { describe, expect, it } from 'vitest';
import { seededRng } from './battle';
import { createSurvivorState, rollUpgrades } from './survivor';
import { BONK_LANDING_MS, BONK_STREAM, BONK_TURN_RATE, BONK_WATER_SPEED_FACTOR, bonkInputToWorld, bonkJumpsRemaining, bonkWaterAt, createBonkPhysics, projectBonkPoint, resolveBonkPosition, stepBonkPhysics, tryBonkJump } from './survivor-bonk';

function player() {
  return createSurvivorState(7, { kindCount: 1, bonk: true }).player;
}

describe('física do modo BONK', () => {
  it('mantém Normal e Infinito fora da variante e sem cartas de pulo', () => {
    for (const state of [
      createSurvivorState(11, { kindCount: 1 }),
      createSurvivorState(12, { kindCount: 1, infinite: true }),
    ]) {
      expect(state.bonk).toBe(false);
      expect(state.player.bonkMode).toBe(false);
      const offered = Array.from({ length: 40 }, (_, seed) =>
        rollUpgrades(seededRng(seed), 12, state.player.move, state.player),
      ).flat();
      expect(offered.some((upgrade) => upgrade.id.startsWith('bonk-'))).toBe(false);
    }
  });

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

  it('deixa caminhar pela ponte e reduz o passo dentro do riacho', () => {
    const p = player();
    const physics = createBonkPhysics();
    const bridge = physics.obstacles.find((obstacle) => obstacle.id === 'bridge')!;
    expect(resolveBonkPosition(physics, bridge.x + bridge.w / 2, bridge.y + bridge.h / 2).collided).toBe(false);
    expect(bonkWaterAt(BONK_STREAM.x0 + 20, bridge.y + bridge.h / 2, physics.obstacles)).toBe(false);
    expect(bonkWaterAt(BONK_STREAM.x0 + 20, BONK_STREAM.y0 + 100, physics.obstacles)).toBe(true);

    const shore = { x: BONK_STREAM.x0 - 30, y: BONK_STREAM.y0 + 100 };
    const desired = { x: BONK_STREAM.x0 + 70, y: shore.y };
    p.x = desired.x;
    p.y = desired.y;
    stepBonkPhysics(physics, p, shore, { dx: 0, dy: 0 }, 16);
    expect(p.x).toBeCloseTo(shore.x + (desired.x - shore.x) * BONK_WATER_SPEED_FACTOR);
    expect(p.y).toBe(shore.y);
  });

  it('o analógico é relativo à câmera: para cima avança e o lado desloca lateralmente', () => {
    const physics = createBonkPhysics(Math.PI / 2);
    const forward = bonkInputToWorld(physics, 0, -1);
    expect(forward.dx).toBeCloseTo(0, 6);
    expect(forward.dy).toBeCloseTo(1, 6);
    const right = bonkInputToWorld(physics, 1, 0);
    expect(right.dx).toBeCloseTo(-1, 6);
    expect(right.dy).toBeCloseTo(0, 6);
    const diagonal = bonkInputToWorld(physics, 1, -1);
    expect(diagonal.dy).toBeCloseTo(1, 6);
  });

  it('não colide com o espaço livre junto ao canto de um obstáculo', () => {
    const physics = { z: 0, obstacles: [{ id: 'test', kind: 'wall' as const, x: 500, y: 500, w: 100, h: 100, height: 100 }] };
    expect(resolveBonkPosition(physics, 492, 492, 10).collided).toBe(false);
    expect(resolveBonkPosition(physics, 494, 494, 10).collided).toBe(true);
  });

  it('o lado gira a câmera aos poucos; frente e trás não giram', () => {
    const p = player();
    const physics = createBonkPhysics(0);
    stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: -1 }, 60);
    stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 1 }, 60);
    expect(physics.cameraYaw).toBe(0);
    for (let i = 0; i < 5; i++) stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 1, dy: 0 }, 60);
    expect(physics.cameraYaw).toBeCloseTo(BONK_TURN_RATE * 0.3, 6);
    const ahead = projectBonkPoint(physics, p, {
      x: p.x + Math.cos(physics.cameraYaw) * 500,
      y: p.y + Math.sin(physics.cameraYaw) * 500,
    }, { width: 600, height: 420 });
    expect(ahead!.x).toBeCloseTo(300, 6);
  });

  it('gera obstáculos determinísticos para a seed da corrida, mas muda a arena na próxima', () => {
    const first = createBonkPhysics(Math.PI / 2, 12345);
    const same = createBonkPhysics(Math.PI / 2, 12345);
    const next = createBonkPhysics(Math.PI / 2, 54321);
    expect(first.obstacles).toEqual(same.obstacles);
    expect(first.obstacles).not.toEqual(next.obstacles);
    expect(first.obstacles.find((obstacle) => obstacle.id === 'bridge')).toEqual(next.obstacles.find((obstacle) => obstacle.id === 'bridge'));
  });

  it('guarda um toque no Pular dado um pouco antes de pousar', () => {
    const p = player();
    const physics = createBonkPhysics();
    expect(tryBonkJump(physics, p)).toBe(true);
    // Sobe e começa a cair, com o único salto já usado.
    while (physics.verticalVelocity > -300) stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 0 }, 16);
    physics.z = Math.min(physics.z, 4);
    stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 0, jump: true }, 1);
    expect(physics.jumpBufferMs).toBeGreaterThan(0);
    for (let i = 0; i < 4 && physics.verticalVelocity <= 0; i++) stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 0 }, 16);
    expect(physics.verticalVelocity).toBeGreaterThan(0);
    expect(physics.jumpBufferMs).toBe(0);
  });

  it('o pedido de salto expira se o pouso demorar mais que a janela', () => {
    const p = player();
    const physics = createBonkPhysics();
    tryBonkJump(physics, p);
    stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 0, jump: true }, 16);
    for (let i = 0; i < 12; i++) stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 0 }, 16);
    expect(physics.jumpBufferMs).toBe(0);
    expect(physics.grounded).toBe(false);
  });

  it('liga o efeito de pouso ao tocar o chão depois de um salto', () => {
    const p = player();
    const physics = createBonkPhysics();
    tryBonkJump(physics, p);
    for (let frame = 0; frame < 180 && !physics.grounded; frame += 1) stepBonkPhysics(physics, p, { x: p.x, y: p.y }, { dx: 0, dy: 0 }, 16);
    expect(physics.grounded).toBe(true);
    expect(physics.landingMs).toBe(BONK_LANDING_MS);
  });
});

describe('pouso preso entre obstáculos que se sobrepõem', () => {
  it('um jogador espremido entre dois blocos sobrepostos sai para uma posição livre', () => {
    const obstacles = [
      { id: 'a', x: 100, y: 100, w: 100, h: 100, height: 200, kind: 'boulder' as const },
      { id: 'b', x: 190, y: 100, w: 110, h: 100, height: 200, kind: 'boulder' as const },
    ];
    const r = 16;
    const result = resolveBonkPosition({ z: 0, obstacles }, 195, 150, r);
    for (const o of obstacles) {
      const inside = result.x > o.x - r && result.x < o.x + o.w + r && result.y > o.y - r && result.y < o.y + o.h + r;
      expect(inside, `dentro de ${o.id}`).toBe(false);
    }
  });
});
