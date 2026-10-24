import { describe, expect, it } from 'vitest';
import { arc, ALL_BADGE_DESIGNS, BADGE_DESIGNS, badgeDesign, counterClockwise, pathData, polishLook, signedArea, slotPosition } from './badges';
import type { Point } from './badges';
import { band, hull, inset, rect } from './badge-geometry';
import { GYMS, LEAGUE_REGIONS, TOTAL_BADGES } from './league';

const FINISHES = new Set(['metal', 'enamel', 'enamel2', 'enamel3', 'dark', 'shine']);

/** Dois segmentos se cruzam de verdade (sem contar as pontas encostadas). */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < -1e-9 && o(c, d, a) * o(c, d, b) < -1e-9;
}

function selfIntersects(points: readonly Point[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (crosses(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

describe('desenho das insígnias', () => {
  it('uma por Ginásio de Sinnoh, com o mesmo nome, líder e tipo', () => {
    expect(BADGE_DESIGNS).toHaveLength(GYMS.length);
    BADGE_DESIGNS.forEach((d, i) => {
      const gym = GYMS[i]!;
      expect(d.order).toBe(i);
      expect(d.name).toBe(gym.badge?.name);
      expect(d.leader).toBe(gym.leader);
      expect(d.type).toBe(gym.type);
    });
    expect(badgeDesign(3)?.leader).toBe('Crasher Wake');
    expect(badgeDesign(TOTAL_BADGES)).toBeNull();
  });

  it('cada uma tem forma e motivo próprios, e cores próprias dentro da região', () => {
    expect(new Set(ALL_BADGE_DESIGNS.map((d) => JSON.stringify(d.outline))).size).toBe(ALL_BADGE_DESIGNS.length);
    expect(new Set(ALL_BADGE_DESIGNS.map((d) => d.motif)).size).toBe(ALL_BADGE_DESIGNS.length);
    for (const r of LEAGUE_REGIONS) {
      const designs = ALL_BADGE_DESIGNS.slice(r.badgeOffset, r.badgeOffset + 8);
      expect(new Set(designs.map((d) => d.enamel[0])).size).toBe(8);
    }
    expect(ALL_BADGE_DESIGNS.filter((d) => d.translucent).map((d) => d.leader)).toEqual(['Candice']);
  });

  it('contornos cabem no quadrado, têm área, não se cruzam (a peça 3D é extrudada deles) e as camadas são válidas', () => {
    for (const d of ALL_BADGE_DESIGNS) {
      expect(d.outline.length, d.name).toBeGreaterThanOrEqual(4);
      for (const [x, y] of [...d.outline, ...d.layers.flatMap((l) => l.points)]) {
        expect(Math.abs(x), d.name).toBeLessThanOrEqual(1);
        expect(Math.abs(y), d.name).toBeLessThanOrEqual(1);
      }
      // Ocupa uma boa parte do quadrado (nada de insígnia minúscula).
      expect(Math.abs(signedArea(d.outline)), d.name).toBeGreaterThan(0.6);
      expect(selfIntersects(d.outline), d.name).toBe(false);
      expect(d.layers.length, d.name).toBeGreaterThanOrEqual(3);
      expect(d.layers.some((l) => l.fill === 'enamel'), d.name).toBe(true);
      expect(d.layers.every((l) => l.points.length >= 2 && (l.line !== undefined || l.points.length >= 3)), d.name).toBe(true);
      expect(d.layers.every((l) => FINISHES.has(l.fill) || /^#[0-9a-f]{6}$/.test(l.fill)), d.name).toBe(true);
    }
  });

  it('o contorno vira anti-horário para o Three.js', () => {
    for (const d of ALL_BADGE_DESIGNS) expect(signedArea(counterClockwise(d.outline))).toBeGreaterThan(0);
    expect(signedArea(counterClockwise([...arc(1)].reverse()))).toBeGreaterThan(0);
  });

  it('SVG espelha o y e fecha o caminho', () => {
    expect(pathData([[0, 1], [1, 0], [0, -1]])).toBe('M0 -1 L1 0 L0 1 Z');
    expect(pathData([[0, 0], [0.5, 0.5]], false)).toBe('M0 0 L0.5 -0.5');
    expect(pathData([])).toBe('');
  });

  it('polir deixa o metal menos áspero, tira a poeira e aumenta o brilho', () => {
    const d = BADGE_DESIGNS[5]!;
    const dull = polishLook(d, 0);
    const shiny = polishLook(d, 1);
    expect(dull.roughness).toBe(d.metal.roughness);
    expect(shiny.roughness).toBeLessThan(0.1);
    expect(dull.dust).toBeGreaterThan(0.5);
    expect(shiny.dust).toBe(0);
    expect(dull.gleam).toBe(0);
    expect(shiny.gleam).toBe(1);
    expect(polishLook(d, 7)).toEqual(shiny);
  });

  it('encaixes em 2 fileiras de 4, sem sobrepor', () => {
    const slots = BADGE_DESIGNS.map((d) => slotPosition(d.order));
    expect(slots[0]).toEqual({ x: -0.75, y: 0.42 });
    expect(slots[7]).toEqual({ x: 0.75, y: -0.42 });
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.y - slots[j]!.y)).toBeGreaterThanOrEqual(0.5);
      }
    }
  });
});

describe('geometria das insígnias', () => {
  it('recuo para dentro encolhe a forma na medida pedida', () => {
    const square = rect(-1, -1, 1, 1);
    expect(inset(square, 0.1)).toEqual([[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]);
    // Funciona nos dois sentidos de giro.
    expect(inset([...square].reverse(), 0.1)).toEqual([[-0.9, 0.9], [0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]]);
  });

  it('faixa em volta de uma linha tem a largura pedida', () => {
    expect(Math.abs(signedArea(band([[0, 0], [1, 0]], 0.1)))).toBeCloseTo(0.2, 5);
  });

  it('união de dois círculos alcança as bordas de fora de cada um', () => {
    const outline = hull([arc(0.4, -0.5, 0, 64), arc(0.4, 0.5, 0, 64)], 180);
    const xs = outline.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(-0.9, 2);
    expect(Math.max(...xs)).toBeCloseTo(0.9, 2);
  });
});

describe('maletas regionais', () => {
  it('48 insígnias ligadas aos ginásios, com índices e encaixes isolados', () => {
    expect(ALL_BADGE_DESIGNS).toHaveLength(TOTAL_BADGES);
    for (const r of LEAGUE_REGIONS) {
      const designs = ALL_BADGE_DESIGNS.slice(r.badgeOffset, r.badgeOffset + 8);
      expect(new Set(designs.map((d) => JSON.stringify(slotPosition(d.order)))).size).toBe(8);
      designs.forEach((d, i) => {
        expect(d.order).toBe(r.badgeOffset + i);
        expect(d.name).toBe(r.gyms[i]!.badge!.name);
        expect(d.leader).toBe(r.gyms[i]!.leader);
        expect(badgeDesign(d.order)).toBe(d);
        expect(slotPosition(d.order)).toEqual(slotPosition(i));
      });
    }
  });
});
