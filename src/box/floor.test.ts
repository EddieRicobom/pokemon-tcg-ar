import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { DEFAULT_PHONE_HEIGHT_M, intersectFloor } from './floor';

describe('chão', () => {
  it('olhando reto para baixo, o chão está na altura do celular', () => {
    const r = intersectFloor(new Vector3(0, -1, 0));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.distance).toBeCloseTo(DEFAULT_PHONE_HEIGHT_M, 6);
      expect(r.point.y).toBeCloseTo(-DEFAULT_PHONE_HEIGHT_M, 6);
    }
  });

  it('a 45° para baixo o ponto fica à mesma distância da altura, à frente', () => {
    const r = intersectFloor(new Vector3(0, -1, -1), 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.point.y).toBeCloseTo(-1, 6);
      expect(r.point.z).toBeCloseTo(-1, 6);
    }
  });

  it('altura maior afasta o ponto', () => {
    const a = intersectFloor(new Vector3(0, -1, -1), 1);
    const b = intersectFloor(new Vector3(0, -1, -1), 2);
    expect(a.ok && b.ok && b.distance > a.distance).toBe(true);
  });

  it('rejeita raios acima do horizonte e quase horizontais', () => {
    expect(intersectFloor(new Vector3(0, 0.5, -1))).toEqual({ ok: false, reason: 'acima-do-horizonte' });
    expect(intersectFloor(new Vector3(0, 0, -1))).toEqual({ ok: false, reason: 'acima-do-horizonte' });
    expect(intersectFloor(new Vector3(0, -0.01, -1))).toEqual({ ok: false, reason: 'quase-horizontal' });
  });
});
