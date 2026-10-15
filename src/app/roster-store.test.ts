import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeRoster, resetRoster, roster, rosterFor, setSlot, slotOf } from './roster-store';

describe('escalação das batalhas', () => {
  beforeEach(() => resetRoster());

  it('só aceita marcas válidas', () => {
    expect(normalizeRoster({ a: 0, b: 1, c: 'out', d: 'auto', e: 7, f: 'x' })).toEqual({ a: 0, b: 1, c: 'out' });
    expect(normalizeRoster(null)).toEqual({});
    expect(normalizeRoster([1, 2])).toEqual({});
    expect(normalizeRoster('lixo')).toEqual({});
  });

  it('o padrão é sorteio e voltar a ele limpa a marca', () => {
    expect(slotOf('x')).toBe('auto');
    setSlot('x', 1);
    expect(slotOf('x')).toBe(1);
    expect(rosterFor(['x', 'y'])).toEqual([1, 'auto']);
    setSlot('x', 'auto');
    expect(roster.value).toEqual({});
  });

  it('é lembrada no aparelho', () => {
    setSlot('x', 'out');
    expect(JSON.parse(localStorage.getItem('tcg-ar-roster-v1')!)).toEqual({ x: 'out' });
  });
});
