import { describe, expect, it } from 'vitest';
import { arc, ALL_BADGE_DESIGNS, BADGE_DESIGNS, badgeDesign, counterClockwise, pathData, polishLook, signedArea, slotPosition } from './badges';
import { GYMS, LEAGUE_REGIONS } from './league';

describe('desenho das insígnias', () => {
  it('uma por Ginásio, com o mesmo nome, líder e tipo', () => {
    expect(BADGE_DESIGNS).toHaveLength(GYMS.length);
    BADGE_DESIGNS.forEach((d, i) => {
      const gym = GYMS[i]!;
      expect(d.order).toBe(i);
      expect(d.name).toBe(gym.badge?.name);
      expect(d.leader).toBe(gym.leader);
      expect(d.type).toBe(gym.type);
    });
    expect(badgeDesign(3)?.leader).toBe('Crasher Wake');
    expect(badgeDesign(32)).toBeNull();
  });

  it('cada uma tem forma, metal e esmalte próprios', () => {
    expect(new Set(BADGE_DESIGNS.map((d) => `${d.outline.length}:${signedArea(d.outline).toFixed(2)}`)).size).toBe(BADGE_DESIGNS.length);
    expect(new Set(BADGE_DESIGNS.map((d) => d.metal.name)).size).toBe(BADGE_DESIGNS.length);
    expect(new Set(BADGE_DESIGNS.map((d) => d.enamel[0])).size).toBe(BADGE_DESIGNS.length);
    expect(new Set(BADGE_DESIGNS.map((d) => d.motif)).size).toBe(BADGE_DESIGNS.length);
    expect(BADGE_DESIGNS.filter((d) => d.translucent).map((d) => d.leader)).toEqual(['Candice']);
  });

  it('contornos cabem no quadrado de -1 a 1, têm área e ocupam boa parte do quadrado', () => {
    for (const d of BADGE_DESIGNS) {
      expect(d.outline.length).toBeGreaterThanOrEqual(8);
      for (const [x, y] of [...d.outline, ...d.layers.flatMap((l) => l.points)]) {
        expect(Math.abs(x)).toBeLessThanOrEqual(1);
        expect(Math.abs(y)).toBeLessThanOrEqual(1);
      }
      // Ocupa uma boa parte do quadrado (nada de insígnia minúscula).
      expect(Math.abs(signedArea(d.outline))).toBeGreaterThan(0.9);
      expect(d.layers.length).toBeGreaterThanOrEqual(3);
      expect(d.layers.some((l) => l.fill === 'enamel')).toBe(true);
      expect(d.layers.every((l) => l.points.length >= 2 && (l.line !== undefined || l.points.length >= 3))).toBe(true);
    }
  });

  it('o contorno vira anti-horário para o Three.js', () => {
    for (const d of BADGE_DESIGNS) expect(signedArea(counterClockwise(d.outline))).toBeGreaterThan(0);
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


describe('maletas regionais', () => {
  it('32 insígnias ligadas aos ginásios, com índices e encaixes isolados', () => {
    expect(ALL_BADGE_DESIGNS).toHaveLength(32);
    for (const r of LEAGUE_REGIONS) {
      const designs = ALL_BADGE_DESIGNS.slice(r.badgeOffset, r.badgeOffset + 8);
      expect(new Set(designs.map((d) => JSON.stringify(slotPosition(d.order)))).size).toBe(8);
      designs.forEach((d, i) => {
        expect(d.name).toBe(r.gyms[i]!.badge!.name);
        expect(d.leader).toBe(r.gyms[i]!.leader);
        expect(badgeDesign(d.order)).toBe(d);
        expect(slotPosition(d.order)).toEqual(slotPosition(i));
        expect(Math.abs(signedArea(d.outline))).toBeGreaterThan(0.5);
        for (const [x, y] of [...d.outline, ...d.layers.flatMap((l) => l.points)]) {
          expect(Math.abs(x)).toBeLessThanOrEqual(1);
          expect(Math.abs(y)).toBeLessThanOrEqual(1);
        }
      });
    }
  });
});
