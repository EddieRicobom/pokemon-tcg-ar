import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BOX_NEAR_GAP_M, DEFAULT_PHONE_HEIGHT_M, intersectFloor, keepBoxAway, minBoxDistance } from './floor';

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

describe('caixa longe da câmera', () => {
  it('a distância mínima cresce com o tamanho da caixa e deixa uma folga até a borda', () => {
    expect(minBoxDistance(1.2)).toBeCloseTo(1.2 * Math.SQRT2 + BOX_NEAR_GAP_M, 9);
    expect(minBoxDistance(2)).toBeGreaterThan(minBoxDistance(1));
    // A caixa padrão (2,4 m de lado) fica a mais de 2,4 m do celular, com 0,8 m de folga até a borda mais próxima.
    expect(minBoxDistance(1.2)).toBeGreaterThan(2.4);
    expect(BOX_NEAR_GAP_M).toBeLessThan(1);
  });

  it('afasta, na mesma direção, um ponto que ficou perto demais', () => {
    const r = keepBoxAway(new Vector3(0.6, -1.3, -0.8), 1.2);
    expect(r.moved).toBe(true);
    expect(Math.hypot(r.point.x, r.point.z)).toBeCloseTo(minBoxDistance(1.2), 9);
    // Mesma direção horizontal (0,6; −0,8), mesma altura.
    expect(r.point.x / Math.hypot(r.point.x, r.point.z)).toBeCloseTo(0.6, 9);
    expect(r.point.z / Math.hypot(r.point.x, r.point.z)).toBeCloseTo(-0.8, 9);
    expect(r.point.y).toBe(-1.3);
  });

  it('um ponto que já está longe não muda', () => {
    const p = new Vector3(0, -1.3, -6);
    const r = keepBoxAway(p, 1.2);
    expect(r.moved).toBe(false);
    expect(r.point.equals(p)).toBe(true);
    expect(r.point).not.toBe(p); // devolve uma cópia
  });

  it('ponto quase embaixo do celular usa a direção para onde a câmera olha', () => {
    const r = keepBoxAway(new Vector3(0.02, -1.3, 0.01), 1, { x: 1, z: 0 });
    expect(r.moved).toBe(true);
    expect(r.point.x).toBeCloseTo(minBoxDistance(1), 9);
    expect(r.point.z).toBeCloseTo(0, 9);
    // Sem direção nenhuma, vai para a frente (−z).
    const fallback = keepBoxAway(new Vector3(0, -1.3, 0), 1, { x: 0, z: 0 });
    expect(fallback.point.z).toBeCloseTo(-minBoxDistance(1), 9);
  });
});

