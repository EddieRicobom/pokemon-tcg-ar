import { describe, expect, it } from 'vitest';
import { layersFor, MAX_LAYER_SECONDS } from './sound-recipes';
import type { Layer, SoundCue } from './sound-recipes';
import { POKEMON_TYPES } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import type { Personality, StatusKind } from '../core/battle';

const STATUSES: StatusKind[] = ['burn', 'poison', 'paralysis', 'freeze'];
const PERSONALITIES: Personality[] = ['agressivo', 'defensivo', 'veloz', 'equilibrado'];

function allCues(): SoundCue[] {
  const cues: SoundCue[] = [{ kind: 'intro' }, { kind: 'go' }, { kind: 'miss' }, { kind: 'immune' }, { kind: 'guard' }, { kind: 'faint' }];
  for (const type of POKEMON_TYPES) {
    cues.push({ kind: 'charge', type, ranged: true, ms: 500 }, { kind: 'charge', type, ranged: false, ms: 300 });
    for (const delivery of ['orb', 'bolt', 'stream', 'swarm', 'beam', 'quake'] as const) cues.push({ kind: 'launch', type, delivery, ms: 700 });
    for (const melee of ['tackle', 'jab', 'dive', 'stomp', 'slash'] as const) cues.push({ kind: 'launch', type, melee, ms: 600 });
    for (const strength of [0.3, 1, 1.6]) {
      cues.push({ kind: 'impact', type, strength, critical: false, effectiveness: 1, guarded: false });
    }
    cues.push({ kind: 'impact', type, strength: 1.6, critical: true, effectiveness: 4, guarded: true });
  }
  for (const status of STATUSES) cues.push({ kind: 'status', status }, { kind: 'tick', cause: status }, { kind: 'skip', cause: status });
  for (const personality of PERSONALITIES) cues.push({ kind: 'victory', personality });
  return cues;
}

const totalGain = (layers: Layer[]): number => layers.reduce((sum, l) => sum + l.gain, 0);

describe('receitas de som', () => {
  it('todo sinal gera camadas finitas, curtas e em número razoável', () => {
    for (const cue of allCues()) {
      const layers = layersFor(cue);
      expect(layers.length, JSON.stringify(cue)).toBeGreaterThan(0);
      expect(layers.length).toBeLessThanOrEqual(16);
      for (const l of layers) {
        expect(Number.isFinite(l.at) && l.at >= 0).toBe(true);
        expect(l.dur).toBeGreaterThan(0);
        expect(l.dur).toBeLessThanOrEqual(MAX_LAYER_SECONDS);
        expect(l.gain).toBeGreaterThanOrEqual(0);
        expect(l.gain).toBeLessThanOrEqual(0.8);
        if (l.src === 'tone') {
          expect(l.f0).toBeGreaterThan(20);
          expect(l.f0).toBeLessThan(8000);
          expect(l.f1 === undefined || (l.f1 > 0 && Number.isFinite(l.f1))).toBe(true);
        }
        if (l.filter) expect(l.filter.f0).toBeGreaterThan(20);
      }
    }
  });

  it('cada tipo tem um golpe com som próprio', () => {
    const sig = (type: PokemonType) => JSON.stringify(layersFor({ kind: 'impact', type, strength: 1, critical: false, effectiveness: 1, guarded: false }));
    const signatures = new Set(POKEMON_TYPES.map(sig));
    expect(signatures.size).toBe(POKEMON_TYPES.length);
  });

  it('golpe forte soa mais alto que fraco; crítico e super efetivo acrescentam sons', () => {
    const hit = (over: Partial<Extract<SoundCue, { kind: 'impact' }>>) =>
      layersFor({ kind: 'impact', type: 'fire', strength: 1, critical: false, effectiveness: 1, guarded: false, ...over });
    expect(totalGain(hit({ strength: 1.6 }))).toBeGreaterThan(totalGain(hit({ strength: 0.3 })));
    expect(hit({ critical: true }).length).toBeGreaterThan(hit({}).length);
    expect(hit({ effectiveness: 2 }).length).toBeGreaterThan(hit({}).length);
  });

  it('pouco efetivo e defendido soam mais baixo', () => {
    const base = totalGain(layersFor({ kind: 'impact', type: 'water', strength: 1, critical: false, effectiveness: 1, guarded: false }));
    const weak = totalGain(layersFor({ kind: 'impact', type: 'water', strength: 1, critical: false, effectiveness: 0.5, guarded: false }));
    const blocked = totalGain(layersFor({ kind: 'impact', type: 'water', strength: 1, critical: false, effectiveness: 1, guarded: true }));
    expect(weak).toBeLessThan(base);
    expect(blocked).toBeLessThan(base);
  });

  it('a fanfarra do vencedor muda o ritmo com a personalidade', () => {
    const lastLead = (p: Personality) => Math.max(...layersFor({ kind: 'victory', personality: p }).map((l) => l.at));
    expect(lastLead('veloz')).toBeLessThan(lastLead('equilibrado'));
    expect(lastLead('equilibrado')).toBeLessThan(lastLead('defensivo'));
    // O agressivo ganha um baixo grave.
    expect(layersFor({ kind: 'victory', personality: 'agressivo' }).some((l) => l.wave === 'sawtooth' && (l.f0 ?? 999) < 200)).toBe(true);
  });

  it('o desmaio desce de tom', () => {
    const tone = layersFor({ kind: 'faint' }).find((l) => l.src === 'tone')!;
    expect(tone.f1!).toBeLessThan(tone.f0!);
  });
});
