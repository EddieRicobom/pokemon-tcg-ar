import { describe, expect, it } from 'vitest';
import { planRelief, reliefShade } from './relief';

describe('relevo da caixa', () => {
  it('é sempre o mesmo para a mesma semente e muda com outra', () => {
    const a = planRelief(1.2, 1.2, 11, 0.2);
    const b = planRelief(1.2, 1.2, 11, 0.2);
    const c = planRelief(1.2, 1.2, 12, 0.2);
    expect(a.bumps).toEqual(b.bumps);
    expect(a.bumps).not.toEqual(c.bumps);
    expect(a.heightAt(0.3, -0.4)).toBe(b.heightAt(0.3, -0.4));
  });

  it('volta a zero na borda e fora da caixa: a caixa fica rente ao chão', () => {
    const r = planRelief(1.2, 1.2, 11, 0.3);
    for (const t of [-1.2, 1.2, 1.5]) {
      expect(r.heightAt(t, 0.3)).toBeCloseTo(0, 6);
      expect(r.heightAt(0.1, t)).toBeCloseTo(0, 6);
    }
    expect(Math.abs(r.heightAt(-1.19, 0.3))).toBeLessThan(0.001); // quase na borda: quase nada
    expect(r.heightAt(1.2, 1.2)).toBe(0);
  });

  it('amplitude 0 é chão liso', () => {
    const r = planRelief(1.2, 1.2, 11, 0);
    expect(r.bumps).toEqual([]);
    expect(r.heightAt(0.2, 0.2)).toBe(0);
    expect(reliefShade(r.normalAt(0.2, 0.2))).toBeCloseTo(1, 6);
  });

  it('tem morrinhos e baixadas de altura razoável, sem ultrapassar o dobro da amplitude', () => {
    const r = planRelief(1.2, 1.2, 11, 0.2);
    let max = -Infinity;
    let min = Infinity;
    for (let x = -1.2; x <= 1.2; x += 0.05) {
      for (let z = -1.2; z <= 1.2; z += 0.05) {
        const h = r.heightAt(x, z);
        max = Math.max(max, h);
        min = Math.min(min, h);
      }
    }
    expect(max).toBeGreaterThan(0.05);
    expect(max).toBeLessThan(0.2 * 2);
    expect(min).toBeGreaterThan(-0.2 * 2);
  });

  it('é suave: alturas vizinhas quase não mudam', () => {
    const r = planRelief(1.2, 1.2, 11, 0.2);
    for (let x = -1.1; x < 1.1; x += 0.07) {
      expect(Math.abs(r.heightAt(x + 0.01, 0.2) - r.heightAt(x, 0.2))).toBeLessThan(0.02);
    }
  });

  it('a normal é unitária e aponta para cima; encosta virada para a luz clareia e a oposta escurece', () => {
    const r = planRelief(1.2, 1.2, 11, 0.25, 1);
    const hill = r.bumps[0]!;
    for (const [x, z] of [[0, 0], [hill.x, hill.z], [hill.x + 0.2, hill.z]] as const) {
      const n = r.normalAt(x, z);
      expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
      expect(n.y).toBeGreaterThan(0);
    }
    const shades = [-0.3, 0.3].map((dx) => reliefShade(r.normalAt(hill.x + dx, hill.z)));
    expect(shades[0]).not.toBeCloseTo(shades[1]!, 2);
    for (const s of shades) {
      expect(s).toBeGreaterThanOrEqual(0.55);
      expect(s).toBeLessThanOrEqual(1.16);
    }
  });
});
