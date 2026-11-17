import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sheetSize, type LocalSpriteMeta } from '../../village/local-sprite-meta';
import { speciesTiles } from '../size-scale';
import { AMBIENT_POKEMON, FLOCK_CROSS_MS, FLOCK_PERIOD_MS, flockBirds, RAINBOW_MS, rainbowAlpha, residentGreeting } from './ambience';

const day = '2026-11-08';

describe('ambiente da Vila', () => {
  it('inclui folhas animadas locais nas duas direções e escala definida para todos os Pokémon do ambiente', () => {
    const meta = JSON.parse(readFileSync('public/data/village-sprite-meta.json', 'utf8')) as LocalSpriteMeta;
    const ids = Object.values(AMBIENT_POKEMON).flat();
    for (const id of ids) {
      const anim = meta[String(id)]!.a.Walk!;
      expect(anim.r).toBeGreaterThanOrEqual(7);
      expect(anim.n).toBeGreaterThan(1);
      expect(speciesTiles(id)).toBeGreaterThan(0);
      const { width, height } = sheetSize(anim);
      const png = readFileSync(`public/sprites/pokemon/${id}/Walk.png`);
      expect(png.readUInt32BE(16)).toBe(width);
      expect(png.readUInt32BE(20)).toBe(height);
    }
  });
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
    for (const [i, bird] of start.entries()) {
      expect(bird.y).toBeGreaterThan(0);
      expect(bird.y).toBeLessThan(1);
      expect(bird.facing).toBe(end[i]!.x > bird.x ? 'right' : 'left');
      expect(end[i]!.facing).toBe(bird.facing);
    }
  });
});
