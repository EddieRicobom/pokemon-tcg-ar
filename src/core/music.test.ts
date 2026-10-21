import { describe, expect, it } from 'vitest';
import { advanceMusicTransition, MUSIC_FADE_MS, normalizeMusicSettings, transitionMusicMix, VILLAGE_TRACKS, villageMusicTrack } from './music';
import { survivorMusicMix, SURVIVOR_TRACKS } from './survivor-music';
import { REGION_DURATION_MS, REGION_TRANSITION_MS, SURVIVOR_REGIONS } from './survivor-regions';

describe('playlist da Vila', () => {
  it('oferece doze músicas distintas e alterna pares a cada seis minutos', () => {
    const reached = new Set<string>();
    for (const hour of [6, 12, 18, 23]) for (const slot of [0, 1]) reached.add(villageMusicTrack(hour, 'sol', slot)[0]);
    for (const weather of ['chuva', 'neve']) for (const slot of [0, 1]) reached.add(villageMusicTrack(12, weather, slot)[0]);
    expect(reached.size).toBe(12);
    expect(reached).toEqual(new Set(VILLAGE_TRACKS.map(track => track[0])));
  });
  it('prioriza clima e trata relógios inválidos sem inventar aleatoriedade', () => {
    expect(villageMusicTrack(23, 'chuva', 0)[0]).toBe('canalave');
    expect(villageMusicTrack(12, 'neve', 1)[0]).toBe('humilau-night');
    expect(villageMusicTrack(NaN, null, NaN)[0]).toBe('goldenrod');
    expect(villageMusicTrack(-1, null, 0)[0]).toBe('heahea-night');
  });
  it('faz crossfade sem salto de potência e sem criar uma terceira faixa', () => {
    const a = advanceMusicTransition(null, 'a', 0);
    const b = advanceMusicTransition(a, 'b', MUSIC_FADE_MS);
    expect(transitionMusicMix(b, MUSIC_FADE_MS)).toEqual([{ path: 'a', gain: 1 }, { path: 'b', gain: 0 }]);
    const halfway = transitionMusicMix(b, MUSIC_FADE_MS * 1.5);
    expect(halfway.reduce((sum, entry) => sum + entry.gain ** 2, 0)).toBeCloseTo(1);
    expect(advanceMusicTransition(b, 'c', MUSIC_FADE_MS * 1.5)).toBe(b);
    expect(transitionMusicMix(b, MUSIC_FADE_MS * 2)).toEqual([{ path: 'b', gain: 1 }]);
    expect(advanceMusicTransition(b, 'c', MUSIC_FADE_MS * 2).from).toBe('b');
  });
  it('normaliza preferências antigas e valores inválidos', () => {
    expect(normalizeMusicSettings(null)).toEqual({ enabled: true, volume: 35, effectsVolume: 70 });
    expect(normalizeMusicSettings({ enabled: false, volume: -8, effectsVolume: 500 })).toEqual({ enabled: false, volume: 0, effectsVolume: 100 });
    expect(normalizeMusicSettings({ volume: NaN, effectsVolume: Infinity }).volume).toBe(35);
  });
});

describe('playlist da Torre', () => {
  it('acompanha todas as regiões e volta a Kanto no infinito', () => {
    for (let i = 0; i < SURVIVOR_REGIONS.length; i++) expect(survivorMusicMix(i * REGION_DURATION_MS)[0]?.path).toBe(`audio/survival/${SURVIVOR_TRACKS[i]![0]}.mp3`);
    expect(survivorMusicMix(9 * REGION_DURATION_MS)).toEqual(survivorMusicMix(0));
    expect(survivorMusicMix(NaN)).toEqual(survivorMusicMix(0));
  });
  it('usa os quarenta segundos da transição do cenário com potência constante', () => {
    const mix = survivorMusicMix(REGION_DURATION_MS - REGION_TRANSITION_MS / 2);
    expect(mix).toHaveLength(2);
    expect(mix[0]?.gain).toBeCloseTo(Math.SQRT1_2);
    expect(mix[1]?.gain).toBeCloseTo(Math.SQRT1_2);
  });
});
