import { describe, expect, it } from 'vitest';
import { choosePage, PAGE_INTERVAL_MS, wrapText } from './panel-state';

const measure = (s: string) => s.length * 10;

describe('páginas do painel', () => {
  it('automático: alterna status → ataques → golpes e dá a volta', () => {
    expect(choosePage('auto', 0)).toBe('status');
    expect(choosePage('auto', PAGE_INTERVAL_MS + 1)).toBe('attacks');
    expect(choosePage('auto', PAGE_INTERVAL_MS * 2 + 1)).toBe('moves');
    expect(choosePage('auto', PAGE_INTERVAL_MS * 3 + 1)).toBe('status');
  });
  it('página escolhida fica fixa', () => {
    expect(choosePage('moves', 99999)).toBe('moves');
  });
  it('tempo negativo não quebra', () => {
    expect(choosePage('auto', -5)).toBe('status');
  });
});

describe('quebra de texto', () => {
  it('cabe numa linha', () => {
    expect(wrapText(measure, 'Flip a coin', 200, 2)).toEqual(['Flip a coin']);
  });
  it('quebra por palavras', () => {
    expect(wrapText(measure, 'aaaa bbbb cccc dddd', 90, 3)).toEqual(['aaaa bbbb', 'cccc dddd']);
  });
  it('corta com reticências quando passa do limite de linhas', () => {
    const lines = wrapText(measure, 'aaaa bbbb cccc dddd eeee ffff', 90, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
    expect(measure(lines[1]!)).toBeLessThanOrEqual(90);
  });
  it('palavra maior que a linha não trava', () => {
    expect(wrapText(measure, 'supercalifragilistic', 50, 1)[0]!.endsWith('…')).toBe(true);
  });
  it('texto vazio devolve nenhuma linha', () => {
    expect(wrapText(measure, '', 100, 2)).toEqual([]);
  });
});
