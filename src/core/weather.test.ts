import { describe, expect, it } from 'vitest';
import { seededRng } from './battle';
import { cloudShadow, createWeather, nextKind, normalizeWeatherMode, puddleAt, snowAt, stepWeather, tileNoise, weatherTint } from './weather';
import type { WeatherKind } from './weather';

const run = (kind: WeatherKind, seconds: number, start: WeatherKind = 'sol') => {
  const s = createWeather(seededRng(1), start);
  for (let t = 0; t < seconds; t += 0.5) stepWeather(s, 0.5, seededRng(2), kind);
  return s;
};

describe('ciclo do clima', () => {
  it('o ciclo passa por sol, nuvem, chuva e neve', () => {
    const rng = seededRng(4);
    const s = createWeather(rng);
    const seen = new Set<WeatherKind>();
    for (let t = 0; t < 4000; t += 0.5) {
      stepWeather(s, 0.5, rng);
      seen.add(s.kind);
    }
    expect([...seen].sort()).toEqual(['chuva', 'neve', 'nublado', 'sol']);
  });

  it('chuva e neve sempre passam pela nuvem; o sol nunca vira chuva direto', () => {
    const rng = seededRng(9);
    for (let i = 0; i < 200; i++) {
      expect(nextKind('chuva', rng)).toBe('nublado');
      expect(nextKind('neve', rng)).toBe('nublado');
      expect(['nublado', 'sol']).toContain(nextKind('sol', rng));
    }
  });

  it('a mudança é suave: a chuva cresce aos poucos', () => {
    const s = createWeather(seededRng(1), 'sol');
    stepWeather(s, 1, seededRng(1), 'chuva');
    expect(s.rain).toBeGreaterThan(0);
    expect(s.rain).toBeLessThan(0.3);
    const later = run('chuva', 60);
    expect(later.rain).toBeGreaterThan(0.95);
  });

  it('com chuva o chão molha (poças), no sol seca', () => {
    const wet = run('chuva', 60);
    expect(wet.wet).toBeGreaterThan(0.6);
    for (let t = 0; t < 400; t += 0.5) stepWeather(wet, 0.5, seededRng(1), 'sol');
    expect(wet.wet).toBeLessThan(0.05);
  });

  it('com neve o chão fica branco e depois derrete no sol', () => {
    const snowy = run('neve', 90);
    expect(snowy.snowCover).toBeGreaterThan(0.8);
    for (let t = 0; t < 300; t += 0.5) stepWeather(snowy, 0.5, seededRng(1), 'sol');
    expect(snowy.snowCover).toBeLessThan(0.05);
  });

  it('clima fixo não muda sozinho', () => {
    const s = run('neve', 1000);
    expect(s.kind).toBe('neve');
  });

  it('a luz: nublado e chuva escurecem; neve esfria', () => {
    const sun = weatherTint({ cloud: 0.15, rain: 0, snow: 0 });
    const rain = weatherTint({ cloud: 1, rain: 1, snow: 0 });
    const snow = weatherTint({ cloud: 0.85, rain: 0, snow: 1 });
    expect(rain[0]).toBeLessThan(sun[0]);
    expect(snow[2]).toBeGreaterThan(snow[0]);
    for (const c of [...sun, ...rain, ...snow]) expect(c).toBeGreaterThan(0.5);
  });

  it('modos inválidos voltam para o ciclo', () => {
    expect(normalizeWeatherMode('neve')).toBe('neve');
    expect(normalizeWeatherMode('off')).toBe('off');
    expect(normalizeWeatherMode('tornado')).toBe('ciclo');
    expect(normalizeWeatherMode(undefined)).toBe('ciclo');
  });
});

describe('texturas do clima', () => {
  it('o ruído emenda sem costura no período', () => {
    for (const y of [0.3, 1.7, 2.2]) expect(tileNoise(0, y, 4, 3)).toBeCloseTo(tileNoise(4, y, 4, 3), 10);
    expect(cloudShadow(0, 0.4)).toBeCloseTo(cloudShadow(1, 0.4), 10);
  });

  it('as nuvens cobrem parte do chão, não tudo', () => {
    let covered = 0;
    for (let i = 0; i < 400; i++) if (cloudShadow((i % 20) / 20, Math.floor(i / 20) / 20) > 0.5) covered++;
    expect(covered).toBeGreaterThan(40);
    expect(covered).toBeLessThan(300);
  });

  it('poças: as baixadas enchem primeiro, e chão seco não tem poça', () => {
    expect(puddleAt(1, 0.5, 0)).toBe(0);
    const low = puddleAt(1, 0.5, 0.5);
    const high = puddleAt(0, 0.5, 0.5);
    expect(low).toBeGreaterThan(high);
    expect(puddleAt(1, 0.5, 1)).toBeGreaterThan(puddleAt(1, 0.5, 0.4));
    expect(puddleAt(0.2, 0.2, 1)).toBe(0);
  });

  it('neve no chão cresce com o acúmulo', () => {
    expect(snowAt(0.5, 0)).toBe(0);
    expect(snowAt(0.5, 1)).toBeGreaterThan(snowAt(0.5, 0.3));
    expect(snowAt(0.5, 1)).toBeGreaterThan(0.9);
  });
});
