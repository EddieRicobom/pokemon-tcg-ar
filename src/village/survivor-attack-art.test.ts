import { describe, expect, it } from 'vitest';
import { drawHostileProjectile, hostileShotColor } from './survivor-attack-art';

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const target: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key];
      const fn = () => { calls[String(key)] = (calls[String(key)] ?? 0) + 1; };
      object[key] = fn;
      return fn;
    },
    set(object, key, value) { object[key] = value; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const shot = (effect: 'burn' | 'slow' | 'stun' | undefined, detailed: boolean) => ({
  x: 40, y: 60, angle: 0.4, size: 8, effect, grade: 'chefao' as const, timeMs: 500, detailed, id: 3,
});

describe('arte dos tiros inimigos', () => {
  it('dá uma cor própria a cada efeito e desenha os quatro tiros', () => {
    const colors = new Set(['burn', 'slow', 'stun', undefined].map((effect) => hostileShotColor(effect as never)));
    expect(colors.size).toBe(4);
    for (const effect of ['burn', 'slow', 'stun', undefined] as const) {
      const { ctx, calls } = fakeContext();
      drawHostileProjectile(ctx, shot(effect, true));
      expect(calls.arc, effect ?? 'comum').toBeGreaterThan(0);
      expect(calls.restore).toBe(1);
      expect(calls.fill).toBeGreaterThan(0);
    }
  });

  it('a versão leve desenha só os círculos, sem rastro nem formas', () => {
    const { ctx, calls } = fakeContext();
    drawHostileProjectile(ctx, shot('burn', false));
    expect(calls.rotate).toBeUndefined();
    expect(calls.arc).toBeGreaterThan(0);
    expect(calls.restore).toBe(1);
  });
});
