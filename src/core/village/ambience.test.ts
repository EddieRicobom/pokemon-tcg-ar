import { describe, expect, it } from 'vitest';
import { RAINBOW_MS, rainbowAlpha, residentGreeting } from './ambience';

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
