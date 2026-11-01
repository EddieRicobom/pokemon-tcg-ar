import { describe, expect, it } from 'vitest';
import { layersFor, MAX_LAYER_SECONDS } from './sound-recipes';
import type { Layer, SoundCue } from './sound-recipes';
import { POKEMON_TYPES } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import type { Personality, StatusKind } from '../core/battle';
import type { MoveCategory } from '../core/survivor-moves';

const STATUSES: StatusKind[] = ['burn', 'poison', 'paralysis', 'freeze'];
const PERSONALITIES: Personality[] = ['agressivo', 'defensivo', 'veloz', 'equilibrado'];

function allCues(): SoundCue[] {
  const cues: SoundCue[] = [{ kind: 'intro' }, { kind: 'go' }, { kind: 'enter' }, { kind: 'miss' }, { kind: 'immune' }, { kind: 'guard' }, { kind: 'faint' }];
  for (const type of POKEMON_TYPES) {
    cues.push({ kind: 'charge', type, ranged: true, ms: 500 }, { kind: 'charge', type, ranged: false, ms: 300 });
    for (const delivery of ['orb', 'bolt', 'stream', 'swarm', 'beam', 'quake'] as const) cues.push({ kind: 'launch', type, delivery, ms: 700 });
    for (const melee of ['tackle', 'jab', 'dive', 'stomp', 'slash'] as const) cues.push({ kind: 'launch', type, melee, ms: 600 });
    for (const strength of [0.3, 1, 1.6]) {
      cues.push({ kind: 'impact', type, strength, critical: false, effectiveness: 1, guarded: false });
    }
    cues.push({ kind: 'impact', type, strength: 1.6, critical: true, effectiveness: 4, guarded: true });
    for (const category of ['projetil', 'aura', 'area', 'cone', 'orbit'] as MoveCategory[]) cues.push({ kind: 'survivor-attack', type, category });
  }
  for (const status of STATUSES) cues.push({ kind: 'status', status }, { kind: 'tick', cause: status }, { kind: 'skip', cause: status });
  for (const personality of PERSONALITIES) cues.push({ kind: 'victory', personality });
  for (const cue of ['menu', 'interact', 'talk', 'collect', 'gift', 'success', 'bell', 'village-water', 'village-birds', 'village-door', 'village-chime', 'village-night', 'village-leaves', 'village-market', 'village-mine', 'village-chop', 'village-plant', 'village-coins'] as const) cues.push({ kind: 'ui', cue });
  for (const power of [0.1, 1]) cues.push({ kind: 'pin-launch', power, type: null }, { kind: 'pin-launch', power, type: 'fire' });
  for (const edge of ['super', 'weak', 'none', null] as const) cues.push({ kind: 'pin-hit', strength: 0.15, edge }, { kind: 'pin-hit', strength: 1, edge });
  for (const type of [null, ...POKEMON_TYPES]) cues.push({ kind: 'pin-mark', type, big: true }, { kind: 'pin-mark', type, big: false });
  cues.push({ kind: 'pin-bumper' }, { kind: 'pin-wave' }, { kind: 'pin-reaction' }, { kind: 'pin-out', mine: true }, { kind: 'pin-out', mine: false }, { kind: 'pin-shrink' }, { kind: 'pin-win' }, { kind: 'pin-lose' });
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

  it('muda a articulação conforme a forma do ataque da Torre', () => {
    const projectile = JSON.stringify(layersFor({ kind: 'survivor-attack', type: 'fire', category: 'projetil' }));
    const aura = JSON.stringify(layersFor({ kind: 'survivor-attack', type: 'fire', category: 'aura' }));
    expect(aura).not.toBe(projectile);
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

  it('sons do Pin Mode: batida forte soa mais alto, o super efetivo acrescenta notas e perder é diferente de ganhar', () => {
    const hit = (strength: number, edge: 'super' | 'weak' | 'none' | null = null) => layersFor({ kind: 'pin-hit', strength, edge });
    expect(totalGain(hit(1))).toBeGreaterThan(totalGain(hit(0.15)));
    expect(hit(1, 'super').length).toBeGreaterThan(hit(1).length);
    expect(JSON.stringify(layersFor({ kind: 'pin-win' }))).not.toBe(JSON.stringify(layersFor({ kind: 'pin-lose' })));
    expect(JSON.stringify(layersFor({ kind: 'pin-out', mine: true }))).not.toBe(JSON.stringify(layersFor({ kind: 'pin-out', mine: false })));
    const mark = (big: boolean) => totalGain(layersFor({ kind: 'pin-mark', type: 'water', big }));
    expect(mark(true)).toBeGreaterThan(mark(false));
  });

  it('gera sinais curtos para a Vila e o modo Survivor', () => {
    for (const cue of ['menu', 'talk', 'collect', 'bell', 'village-leaves', 'village-market', 'survivor-shot', 'survivor-hit', 'survivor-level', 'survivor-boss', 'survivor-gameover'] as const) {
      const layers = layersFor({ kind: 'ui', cue });
      expect(layers.length).toBeGreaterThan(0);
      expect(Math.max(...layers.map((layer) => layer.at + layer.dur))).toBeLessThanOrEqual(MAX_LAYER_SECONDS);
    }
  });

  it('dá assinaturas próprias para Escanear e para os eventos do Fliperama', () => {
    const scan = ['scan-appear', 'scan-shiny', 'scan-archetype', 'scan-evolution'] as const;
    const arcade = ['minigame-pick', 'minigame-right', 'minigame-wrong', 'minigame-combo', 'minigame-timeout', 'minigame-record'] as const;
    for (const cue of [...scan, ...arcade]) expect(layersFor({ kind: 'ui', cue }).length).toBeGreaterThan(0);
    expect(JSON.stringify(layersFor({ kind: 'ui', cue: 'scan-shiny' }))).not.toBe(JSON.stringify(layersFor({ kind: 'ui', cue: 'scan-appear' })));
    expect(JSON.stringify(layersFor({ kind: 'ui', cue: 'minigame-right' }))).not.toBe(JSON.stringify(layersFor({ kind: 'ui', cue: 'minigame-wrong' })));
  });
});
