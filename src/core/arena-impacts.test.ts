import { describe, expect, it } from 'vitest';
import { addImpact, MAX_ARENA_IMPACTS, screenFlash, shakeOffset, stepImpacts } from './arena-impacts';

describe('impactos da luta', () => {
  it('cada impacto vive o seu tempo e some', () => {
    let list = addImpact([], 'hit', 10, 10, ['#fff', '#f00'], 1);
    list = stepImpacts(list, 200);
    expect(list).toHaveLength(1);
    list = stepImpacts(list, 100);
    expect(list).toHaveLength(0);
  });

  it('tem um teto de impactos ao mesmo tempo', () => {
    let list = addImpact([], 'hit', 0, 0, ['#fff', '#fff'], 0);
    for (let i = 0; i < 40; i++) list = addImpact(list, 'hit', i, 0, ['#fff', '#fff'], i);
    expect(list).toHaveLength(MAX_ARENA_IMPACTS);
    expect(list.at(-1)?.x).toBe(39);
  });

  it('o choque sacode e clareia a tela; o golpe comum, não', () => {
    const hit = addImpact([], 'hit', 0, 0, ['#fff', '#fff'], 0);
    const clash = addImpact([], 'clash', 0, 0, ['#f00', '#00f'], 0);
    expect(shakeOffset(hit, 100, false)).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(shakeOffset(clash, 100, false).x, shakeOffset(clash, 100, false).y)).toBeGreaterThan(0);
    expect(screenFlash(clash)).toBeGreaterThan(0);
    expect(screenFlash(hit)).toBe(0);
  });

  it('com o movimento reduzido, nada sacode', () => {
    expect(shakeOffset(addImpact([], 'clash', 0, 0, ['#f00', '#00f'], 0), 100, true)).toEqual({ x: 0, y: 0 });
  });
});
