import { describe, expect, it } from 'vitest';
import { GestureTracker, isTap } from './gestures';

describe('gestos de ajuste', () => {
  it('um dedo arrasta: devolve o deslocamento do centro, sem escala', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100);
    expect(g.move(1, 130, 90)).toEqual({ from: { x: 100, y: 100 }, to: { x: 130, y: 90 }, scale: 1, fingers: 1 });
  });
  it('dois dedos: pinça abrindo aumenta, fechando diminui', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    const open = g.move(2, 300, 100)!; // distância 100 → 200
    expect(open.scale).toBeCloseTo(2, 6);
    expect(open.fingers).toBe(2);
    const close = g.move(2, 200, 100)!; // 200 → 100
    expect(close.scale).toBeCloseTo(0.5, 6);
  });
  it('dois dedos também arrastam pelo ponto médio', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.move(1, 150, 150);
    const d = g.move(2, 250, 150)!;
    expect(d.to.x - d.from.x).toBeCloseTo(25, 6);
    expect(d.to.y - d.from.y).toBeCloseTo(25, 6);
    expect(d.fingers).toBe(2);
  });
  it('dedos quase juntos não geram escala absurda', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100);
    g.down(2, 105, 100);
    expect(g.move(2, 400, 100)!.scale).toBe(1);
  });
  it('levantar um dedo volta ao arrasto de um dedo sem salto', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.up(2);
    expect(g.fingers).toBe(1);
    const d = g.move(1, 110, 100)!;
    expect(d.from).toEqual({ x: 100, y: 100 });
    expect(d.scale).toBe(1);
  });
  it('dedo desconhecido ou sem mudança devolve null', () => {
    const g = new GestureTracker();
    expect(g.move(9, 1, 1)).toBeNull();
    g.down(1, 10, 10);
    expect(g.move(1, 10, 10)).toBeNull();
  });
  it('toque simples: pouco movimento e rápido', () => {
    expect(isTap({ x: 10, y: 10, at: 0 }, { x: 14, y: 12, at: 200 })).toBe(true);
    expect(isTap({ x: 10, y: 10, at: 0 }, { x: 80, y: 10, at: 100 })).toBe(false);
    expect(isTap({ x: 10, y: 10, at: 0 }, { x: 10, y: 10, at: 2000 })).toBe(false);
  });
});
