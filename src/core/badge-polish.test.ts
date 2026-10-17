import { describe, expect, it } from 'vitest';
import { currentPolish, normalizePolish, onlyWon, POLISH_DECAY_PER_DAY, POLISH_FLOOR, POLISH_START, polishLabel, rubBadge } from './badge-polish';

const DAY = 86_400_000;

describe('polimento das insígnias', () => {
  it('insígnia sem registro chega com um pouco de poeira', () => {
    expect(currentPolish({}, 2, 0)).toBe(POLISH_START);
  });

  it('esfregar aumenta o brilho, cada vez menos perto do máximo, sem passar de 1', () => {
    let s = rubBadge({}, 0, 1, true, 1000);
    const first = currentPolish(s, 0, 1000);
    expect(first).toBeGreaterThan(POLISH_START);
    s = rubBadge(s, 0, 1, true, 1000);
    const second = currentPolish(s, 0, 1000) - first;
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(first - POLISH_START);
    for (let i = 0; i < 500; i++) s = rubBadge(s, 0, 2, true, 1000);
    expect(currentPolish(s, 0, 1000)).toBeLessThanOrEqual(1);
    expect(currentPolish(s, 0, 1000)).toBeGreaterThan(0.95);
  });

  it('insígnia não conquistada não ganha brilho nem entra no estado', () => {
    const s = rubBadge({}, 4, 3, false, 0);
    expect(s).toEqual({});
    expect(rubBadge({}, 4, 0, true, 0)).toEqual({});
    expect(rubBadge({}, 4, Number.NaN, true, 0)).toEqual({});
  });

  it('o brilho cai devagar com os dias, até um mínimo', () => {
    const s = { 1: { level: 0.9, at: 0 } };
    expect(currentPolish(s, 1, 5 * DAY)).toBeCloseTo(0.9 - 5 * POLISH_DECAY_PER_DAY);
    expect(currentPolish(s, 1, 400 * DAY)).toBe(POLISH_FLOOR);
    expect(currentPolish({ 1: { level: 0.1, at: 0 } }, 1, 400 * DAY)).toBe(0.1);
    // Relógio voltando não dá brilho de graça.
    expect(currentPolish(s, 1, -DAY)).toBe(0.9);
  });

  it('normaliza o que vem do armazenamento', () => {
    expect(normalizePolish(null)).toEqual({});
    expect(normalizePolish('x')).toEqual({});
    expect(normalizePolish({ 0: { level: 2, at: 5 }, 3: { level: 0.5, at: 1 }, 9: { level: 1, at: 1 }, foo: { level: 1, at: 1 }, 2: { level: 'a', at: 1 }, 4: null })).toEqual({ 0: { level: 1, at: 5 }, 3: { level: 0.5, at: 1 } });
  });

  it('só guarda polimento das insígnias conquistadas', () => {
    expect(onlyWon({ 0: { level: 1, at: 0 }, 5: { level: 1, at: 0 } }, [0, 1])).toEqual({ 0: { level: 1, at: 0 } });
  });

  it('rótulos do brilho', () => {
    expect(polishLabel(0.2)).toBe('Fosca');
    expect(polishLabel(0.6)).toBe('Limpa');
    expect(polishLabel(0.8)).toBe('Brilhante');
    expect(polishLabel(1)).toBe('Espelhada');
  });
});
