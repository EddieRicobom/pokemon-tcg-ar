import { describe, expect, it } from 'vitest';
import { FLOCK_CROSS_MS, FLOCK_PERIOD_MS, flockBirds, RAINBOW_MS, rainbowAlpha, residentGreeting } from './ambience';

const day = '2026-11-08';

describe('ambiente da Vila', () => {
  it('o arco-íris entra, fica e some', () => {
    expect(rainbowAlpha(0)).toBe(0);
    expect(rainbowAlpha(2_000)).toBeCloseTo(0.5);
    expect(rainbowAlpha(RAINBOW_MS / 2)).toBe(1);
    expect(rainbowAlpha(RAINBOW_MS - 1)).toBeLessThan(0.01);
    expect(rainbowAlpha(RAINBOW_MS)).toBe(0);
    expect(rainbowAlpha(-5)).toBe(0);
    expect(rainbowAlpha(Number.NaN)).toBe(0);
  });

  it('o morador acena só enquanto tem algo a oferecer hoje', () => {
    expect(residentGreeting(undefined, day)).toBe('👋');
    expect(residentGreeting({ lastTalk: '2026-11-07', request: null }, day)).toBe('👋');
    expect(residentGreeting({ lastTalk: day, request: null }, day)).toBeNull();
  });

  it('o pedido em aberto aparece, o entregue não', () => {
    const request = { day, item: 'oran', qty: 1, done: false };
    expect(residentGreeting({ lastTalk: day, request }, day)).toBe('🎁');
    expect(residentGreeting({ lastTalk: day, request: { ...request, done: true } }, day)).toBeNull();
    expect(residentGreeting({ lastTalk: day, request: { ...request, day: '2026-11-07' } }, day)).toBeNull();
  });
});

describe('bando de pássaros', () => {
  it('não aparece no primeiro minuto nem entre uma passagem e outra', () => {
    expect(flockBirds(0)).toHaveLength(0);
    expect(flockBirds(FLOCK_PERIOD_MS - 1)).toHaveLength(0);
    expect(flockBirds(FLOCK_PERIOD_MS + FLOCK_CROSS_MS)).toHaveLength(0);
    expect(flockBirds(Number.NaN)).toHaveLength(0);
  });

  it('atravessa a tela inteira, entrando e saindo por fora, sempre igual para o mesmo instante', () => {
    const start = flockBirds(FLOCK_PERIOD_MS);
    const end = flockBirds(FLOCK_PERIOD_MS + FLOCK_CROSS_MS - 1);
    expect(start).toHaveLength(5);
    expect(flockBirds(FLOCK_PERIOD_MS)).toEqual(start);
    for (const bird of start) expect(bird.x < 0 || bird.x > 1).toBe(true);
    for (const bird of end) expect(bird.x < 0 || bird.x > 1).toBe(true);
    for (const bird of [...start, ...end]) {
      expect(bird.y).toBeGreaterThan(0);
      expect(bird.y).toBeLessThan(1);
      expect(Math.abs(bird.flap)).toBeLessThanOrEqual(1);
    }
  });
});
