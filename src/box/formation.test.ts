import { describe, expect, it } from 'vitest';
import { formationSlots } from './formation';
import { createWander, stepToward } from './wander';

describe('formação', () => {
  it('vazio e um só ficam no centro', () => {
    expect(formationSlots(0, 1.2, 0, 1)).toEqual([]);
    const [one] = formationSlots(1, 1.2, 0, 1);
    expect(one!.x).toBeCloseTo(0, 9);
    expect(one!.z).toBeCloseTo(0, 9);
  });

  it('a fila é perpendicular à direção da câmera e simétrica', () => {
    const slots = formationSlots(5, 1.5, 0, 1); // câmera em +z → fila ao longo de x
    expect(slots).toHaveLength(5);
    expect(slots[0]!.x).toBeLessThan(slots[4]!.x);
    expect(slots[0]!.x + slots[4]!.x).toBeCloseTo(0, 6);
    // pontas mais para trás (z menor, longe da câmera) que o meio
    expect(slots[0]!.z).toBeLessThan(slots[2]!.z);
  });

  it('o espaçamento encolhe para caber e tudo fica dentro da caixa', () => {
    const slots = formationSlots(6, 0.6, 1, 0);
    for (const s of slots) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(0.54 + 1e-9);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(0.54 + 1e-9);
    }
    const gaps = slots.slice(1).map((s, i) => Math.hypot(s.x - slots[i]!.x, s.z - slots[i]!.z));
    expect(Math.min(...gaps)).toBeGreaterThan(0.05);
  });

  it('direção da câmera zerada não gera NaN', () => {
    for (const s of formationSlots(3, 1, 0, 0)) expect(Number.isFinite(s.x + s.z)).toBe(true);
  });
});

describe('stepToward', () => {
  it('chega sem passar do ponto e informa a chegada', () => {
    const s = createWander(1, () => 0.5);
    s.x = 0;
    s.z = 0;
    let arrived = false;
    for (let i = 0; i < 400 && !arrived; i++) arrived = stepToward(s, 0.5, 0, 16, 0.8);
    expect(arrived).toBe(true);
    expect(s.x).toBe(0.5);
    expect(s.vx).toBe(0);
  });

  it('em movimento a velocidade aponta para o destino', () => {
    const s = createWander(1, () => 0.5);
    s.x = 0;
    s.z = 0;
    stepToward(s, 0, 1, 16, 0.8);
    expect(s.vz).toBeCloseTo(0.8, 6);
    expect(s.z).toBeGreaterThan(0);
  });
});
