import { beforeEach, describe, expect, it } from 'vitest';
import {
  SURVIVOR_PREF_KEYS,
  SURVIVOR_TIPS_LIMIT,
  readSurvivorAdaptive,
  readSurvivorButtons,
  readSurvivorCinema,
  readSurvivorHaptics,
  readSurvivorPure,
  readSurvivorTips,
  readSurvivorTutorialSeen,
  writeSurvivorAdaptive,
  writeSurvivorButtons,
  writeSurvivorCinema,
  writeSurvivorHaptics,
  writeSurvivorPure,
  writeSurvivorTips,
  writeSurvivorTutorialSeen,
} from './survivor-preferences';

describe('preferências da Torre', () => {
  beforeEach(() => localStorage.clear());

  it('sem nada guardado, usa os padrões de sempre', () => {
    expect(readSurvivorCinema()).toBe(true);
    expect(readSurvivorAdaptive()).toBe(true);
    expect(readSurvivorPure()).toBe(false);
    expect(readSurvivorHaptics()).toBe(true);
    expect(readSurvivorTutorialSeen()).toBe(false);
    expect(readSurvivorTips()).toEqual([]);
    expect(readSurvivorButtons()).toEqual({ size: 'm', layout: 'lado', hand: 'right' });
  });

  it('grava e lê cada preferência nas chaves antigas', () => {
    writeSurvivorCinema(false);
    writeSurvivorAdaptive(false);
    writeSurvivorPure(true);
    writeSurvivorHaptics(false);
    writeSurvivorTutorialSeen(true);
    expect(localStorage.getItem(SURVIVOR_PREF_KEYS.cinema)).toBe('0');
    expect(localStorage.getItem(SURVIVOR_PREF_KEYS.adaptive)).toBe('0');
    expect(localStorage.getItem(SURVIVOR_PREF_KEYS.pure)).toBe('1');
    expect(localStorage.getItem(SURVIVOR_PREF_KEYS.haptics)).toBe('0');
    expect(localStorage.getItem(SURVIVOR_PREF_KEYS.tutorial)).toBe('1');
    expect(readSurvivorCinema()).toBe(false);
    expect(readSurvivorAdaptive()).toBe(false);
    expect(readSurvivorPure()).toBe(true);
    expect(readSurvivorHaptics()).toBe(false);
    expect(readSurvivorTutorialSeen()).toBe(true);
  });

  it('valores antigos continuam valendo (chave com "1" e "0")', () => {
    localStorage.setItem(SURVIVOR_PREF_KEYS.cinema, '0');
    localStorage.setItem(SURVIVOR_PREF_KEYS.adaptive, '1');
    localStorage.setItem(SURVIVOR_PREF_KEYS.pure, '0');
    expect(readSurvivorCinema()).toBe(false);
    expect(readSurvivorAdaptive()).toBe(true);
    expect(readSurvivorPure()).toBe(false);
  });

  it('botões: valor inválido cai no padrão, campo por campo', () => {
    localStorage.setItem(SURVIVOR_PREF_KEYS.buttons, JSON.stringify({ size: 'g', layout: 'x', hand: 'left' }));
    expect(readSurvivorButtons()).toEqual({ size: 'g', layout: 'lado', hand: 'left' });
    localStorage.setItem(SURVIVOR_PREF_KEYS.buttons, '{quebrado');
    expect(readSurvivorButtons()).toEqual({ size: 'm', layout: 'lado', hand: 'right' });
    writeSurvivorButtons({ size: 'p', layout: 'troca', hand: 'right' });
    expect(readSurvivorButtons()).toEqual({ size: 'p', layout: 'troca', hand: 'right' });
    writeSurvivorButtons({ size: 'x' as never, layout: 'y' as never, hand: 'z' as never });
    expect(readSurvivorButtons()).toEqual({ size: 'm', layout: 'lado', hand: 'right' });
  });

  it('dicas: filtra ids inválidos, remove repetidos e mantém as últimas 20', () => {
    localStorage.setItem(SURVIVOR_PREF_KEYS.tips, JSON.stringify(['a', 3, '', 'a', 'b']));
    expect(readSurvivorTips()).toEqual(['a', 'b']);
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
    writeSurvivorTips(many);
    const saved = readSurvivorTips();
    expect(saved).toHaveLength(SURVIVOR_TIPS_LIMIT);
    expect(saved[0]).toBe('t10');
    expect(saved.at(-1)).toBe('t29');
    localStorage.setItem(SURVIVOR_PREF_KEYS.tips, 'não é json');
    expect(readSurvivorTips()).toEqual([]);
    localStorage.setItem(SURVIVOR_PREF_KEYS.tips, JSON.stringify({ a: 1 }));
    expect(readSurvivorTips()).toEqual([]);
  });

  it('sem localStorage, lê o padrão e não lança ao gravar', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('bloqueado'); } });
    try {
      expect(readSurvivorHaptics()).toBe(true);
      expect(() => writeSurvivorHaptics(false)).not.toThrow();
      expect(readSurvivorTips()).toEqual([]);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});
