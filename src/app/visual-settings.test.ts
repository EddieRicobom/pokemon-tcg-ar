import { describe, expect, it } from 'vitest';
import { normalizeVisual } from './visual-settings';

describe('configurações visuais', () => {
  it('aceita só modos de suavização conhecidos', () => {
    expect(normalizeVisual({ smoothing: 'macio' })).toEqual({ smoothing: 'macio', lighting: true, terrain: true, social: true, weather: 'ciclo', sound: true, shadow: true });
    expect(normalizeVisual({ smoothing: 'xyz' as never })).toEqual({ smoothing: 'bordas', lighting: true, terrain: true, social: true, weather: 'ciclo', sound: true, shadow: true });
    expect(normalizeVisual(null)).toEqual({ smoothing: 'bordas', lighting: true, terrain: true, social: true, weather: 'ciclo', sound: true, shadow: true });
  });

  it('os encontros e emoções vêm ligados e só desligam com false explícito', () => {
    expect(normalizeVisual({ social: false }).social).toBe(false);
    expect(normalizeVisual({ social: undefined }).social).toBe(true);
    expect(normalizeVisual({ social: 'x' as never }).social).toBe(true);
  });

  it('o som vem ligado e só desliga com false explícito', () => {
    expect(normalizeVisual({ sound: false }).sound).toBe(false);
    expect(normalizeVisual({ sound: undefined }).sound).toBe(true);
    expect(normalizeVisual({ sound: 'x' as never }).sound).toBe(true);
  });

  it('a luz dos golpes vem ligada e só desliga com false explícito', () => {
    expect(normalizeVisual({ lighting: false }).lighting).toBe(false);
    expect(normalizeVisual({ lighting: undefined }).lighting).toBe(true);
    expect(normalizeVisual({ lighting: 'x' as never }).lighting).toBe(true);
  });

  it('a sombra do Pokémon vem ligada e só desliga com false explícito', () => {
    expect(normalizeVisual({ shadow: false }).shadow).toBe(false);
    expect(normalizeVisual({ shadow: undefined }).shadow).toBe(true);
    expect(normalizeVisual({ shadow: 'x' as never }).shadow).toBe(true);
  });
});

describe('opção de clima', () => {
  it('guarda o modo do clima e cai no ciclo quando não conhece', () => {
    expect(normalizeVisual({ weather: 'neve' }).weather).toBe('neve');
    expect(normalizeVisual({ weather: 'off' }).weather).toBe('off');
    expect(normalizeVisual({ weather: 'granizo' as never }).weather).toBe('ciclo');
  });
});
