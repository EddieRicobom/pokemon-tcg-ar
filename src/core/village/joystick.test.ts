import { describe, expect, it } from 'vitest';
import { stepOrder, stickDirs, stickVector } from './joystick';

describe('joystick da Vila', () => {
  it('prende o dedo ao raio do joystick', () => {
    expect(stickVector(0, 0, 40)).toEqual({ x: 0, y: 0 });
    const v = stickVector(80, 0, 40);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
    const half = stickVector(0, -20, 40);
    expect(half.y).toBeCloseTo(-0.5);
  });

  it('perto do centro fica parado (zona morta)', () => {
    expect(stickDirs(0.1, 0.1)).toEqual({ primary: null, secondary: null, strength: 0 });
  });

  it('eixo dominante vira a direção principal', () => {
    expect(stickDirs(1, 0.1)).toMatchObject({ primary: 'right', secondary: null });
    expect(stickDirs(-0.2, -0.9)).toMatchObject({ primary: 'up', secondary: null });
    expect(stickDirs(0, 1)).toMatchObject({ primary: 'down', secondary: null, strength: 1 });
  });

  it('na diagonal devolve as duas direções', () => {
    expect(stickDirs(0.7, -0.7)).toMatchObject({ primary: 'right', secondary: 'up' });
    expect(stickDirs(-0.5, 0.8)).toMatchObject({ primary: 'down', secondary: 'left' });
  });

  it('na diagonal alterna os eixos a cada passo, com o outro de reserva', () => {
    const dirs = { primary: 'right' as const, secondary: 'up' as const };
    expect(stepOrder(dirs, 0)).toEqual(['right', 'up']);
    expect(stepOrder(dirs, 1)).toEqual(['up', 'right']);
    expect(stepOrder({ primary: 'left', secondary: null }, 1)).toEqual(['left']);
    expect(stepOrder({ primary: null, secondary: null }, 0)).toEqual([]);
  });
});
