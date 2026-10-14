import type { Personality, StatusKind } from '../core/battle';
import type { PokemonType } from '../core/pokemon-data';
import type { PhysicalStyle, SpecialDelivery } from './effects';

/**
 * Receitas dos sons da batalha. Nada de arquivo de áudio: cada som é sintetizado na hora (osciladores e ruído
 * filtrados), então não há direitos autorais, download nem som "de marca". Esta parte é só conta (receita →
 * camadas), sem WebAudio, para ser testável; `sound.ts` toca as camadas.
 */

export type SoundCue =
  | { kind: 'intro' }
  | { kind: 'go' }
  | { kind: 'charge'; type: PokemonType; ranged: boolean; ms: number }
  | { kind: 'launch'; type: PokemonType; melee?: PhysicalStyle; delivery?: SpecialDelivery; ms: number }
  | { kind: 'impact'; type: PokemonType; strength: number; critical: boolean; effectiveness: number; guarded: boolean }
  | { kind: 'miss' }
  | { kind: 'immune' }
  | { kind: 'guard' }
  | { kind: 'status'; status: StatusKind }
  | { kind: 'tick'; cause: StatusKind }
  | { kind: 'skip'; cause: StatusKind }
  | { kind: 'faint' }
  | { kind: 'victory'; personality: Personality };

export interface SoundSink {
  play(cue: SoundCue): void;
}

export interface FilterSpec {
  type: 'lowpass' | 'highpass' | 'bandpass';
  f0: number;
  f1?: number;
  q?: number;
}

/** Uma camada de som: um oscilador (`tone`) ou ruído (`noise`) com envelope, e talvez filtro e vibrato. */
export interface Layer {
  src: 'tone' | 'noise';
  wave?: 'sine' | 'square' | 'sawtooth' | 'triangle';
  /** Frequência inicial e final (Hz); só para `tone`. */
  f0?: number;
  f1?: number;
  /** Atraso e duração, em segundos. */
  at: number;
  dur: number;
  gain: number;
  filter?: FilterSpec;
  /** Vibrato: `rate` (Hz) e `depth` (Hz de variação da frequência). */
  vibrato?: { rate: number; depth: number };
}

export const MAX_LAYER_SECONDS = 1.6;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const tone = (wave: NonNullable<Layer['wave']>, f0: number, f1: number, at: number, dur: number, gain: number, extra: Partial<Layer> = {}): Layer => ({
  src: 'tone', wave, f0, f1, at, dur, gain, ...extra,
});
const noise = (filter: FilterSpec, at: number, dur: number, gain: number): Layer => ({ src: 'noise', at, dur, gain, filter });

/** O "estalo" do golpe de cada tipo. `k` = força (0,3–1,6). */
function hitOf(type: PokemonType, k: number): Layer[] {
  const d = 0.8 + 0.2 * k;
  switch (type) {
    case 'fire':
      return [noise({ type: 'lowpass', f0: 3200, f1: 500 }, 0, 0.45 * d, 0.34), tone('sawtooth', 220, 80, 0, 0.3 * d, 0.14, { filter: { type: 'lowpass', f0: 900 } })];
    case 'water':
      return [noise({ type: 'bandpass', f0: 900, f1: 300, q: 2 }, 0, 0.4 * d, 0.34), tone('sine', 520, 190, 0.02, 0.2, 0.2)];
    case 'electric':
      return [tone('square', 1800, 260, 0, 0.24 * d, 0.16, { vibrato: { rate: 55, depth: 600 } }), noise({ type: 'highpass', f0: 4200 }, 0, 0.22 * d, 0.26)];
    case 'grass':
      return [noise({ type: 'bandpass', f0: 2600, f1: 1200, q: 1.5 }, 0, 0.2 * d, 0.3), tone('triangle', 420, 200, 0, 0.18, 0.2)];
    case 'ice':
      return [tone('sine', 2200, 1500, 0, 0.5 * d, 0.2), tone('sine', 3300, 2600, 0.02, 0.4 * d, 0.12), noise({ type: 'highpass', f0: 6000 }, 0, 0.1, 0.25)];
    case 'fighting':
      return [noise({ type: 'lowpass', f0: 1400 }, 0, 0.08, 0.5), tone('sine', 120, 40, 0, 0.26, 0.6)];
    case 'poison':
      return [tone('sawtooth', 200, 120, 0, 0.4 * d, 0.16, { vibrato: { rate: 9, depth: 30 }, filter: { type: 'lowpass', f0: 800 } }), noise({ type: 'bandpass', f0: 700, q: 3 }, 0, 0.3, 0.15)];
    case 'ground':
      return [noise({ type: 'lowpass', f0: 420, f1: 120 }, 0, 0.6 * d, 0.45), tone('sine', 70, 35, 0, 0.5 * d, 0.6)];
    case 'rock':
      return [noise({ type: 'lowpass', f0: 950 }, 0, 0.3 * d, 0.4), tone('sine', 90, 40, 0, 0.3, 0.55), tone('square', 320, 100, 0, 0.1, 0.14)];
    case 'flying':
      return [noise({ type: 'bandpass', f0: 1800, f1: 600, q: 1.2 }, 0, 0.36 * d, 0.3), tone('sine', 700, 400, 0, 0.2, 0.12)];
    case 'psychic':
      return [tone('sine', 600, 1200, 0, 0.46 * d, 0.2, { vibrato: { rate: 7, depth: 80 } }), tone('sine', 900, 450, 0.04, 0.5 * d, 0.15)];
    case 'bug':
      return [tone('square', 900, 700, 0, 0.26 * d, 0.11, { vibrato: { rate: 40, depth: 120 } }), noise({ type: 'highpass', f0: 5000 }, 0, 0.12, 0.2)];
    case 'ghost':
      return [tone('sine', 300, 80, 0, 0.7 * d, 0.26, { vibrato: { rate: 5, depth: 20 } }), noise({ type: 'bandpass', f0: 500, q: 2 }, 0, 0.6 * d, 0.12)];
    case 'dragon':
      return [tone('sawtooth', 110, 55, 0, 0.6 * d, 0.3, { vibrato: { rate: 12, depth: 8 }, filter: { type: 'lowpass', f0: 1100 } }), noise({ type: 'lowpass', f0: 1500, f1: 300 }, 0, 0.5 * d, 0.3)];
    case 'dark':
      return [tone('sawtooth', 160, 50, 0, 0.4 * d, 0.26, { filter: { type: 'lowpass', f0: 700 } }), noise({ type: 'lowpass', f0: 600 }, 0, 0.3, 0.28)];
    case 'steel':
      return [tone('sine', 1200, 1190, 0, 0.6 * d, 0.12), tone('sine', 1870, 1860, 0, 0.5 * d, 0.1), tone('sine', 2640, 2630, 0, 0.4 * d, 0.08), noise({ type: 'highpass', f0: 3000 }, 0, 0.06, 0.4)];
    case 'fairy':
      return [1319, 1568, 2093, 2637].map((f, i) => tone('sine', f, f, i * 0.05, 0.25 * d, 0.12));
    default:
      return [noise({ type: 'lowpass', f0: 1800 }, 0, 0.1, 0.45), tone('sine', 140, 60, 0, 0.16, 0.5)];
  }
}

const CHARGE_WAVE: Partial<Record<PokemonType, NonNullable<Layer['wave']>>> = {
  electric: 'square', fire: 'sawtooth', dragon: 'sawtooth', dark: 'sawtooth', poison: 'sawtooth', bug: 'square', steel: 'triangle', grass: 'triangle',
};

function chargeOf(type: PokemonType, ranged: boolean, ms: number): Layer[] {
  const dur = clamp(ms / 1000, 0.15, 0.8);
  const wave = CHARGE_WAVE[type] ?? 'sine';
  const low = ranged ? 220 : 150;
  const layers: Layer[] = [tone(wave, low, low * 3.2, 0, dur, wave === 'square' ? 0.07 : 0.11, { filter: { type: 'lowpass', f0: 2400 }, vibrato: type === 'electric' || type === 'psychic' ? { rate: 14, depth: 40 } : undefined })];
  if (type === 'fire' || type === 'water' || type === 'flying' || type === 'ground') layers.push(noise({ type: 'bandpass', f0: 400, f1: 1600, q: 1 }, 0, dur, 0.1));
  return layers;
}

function launchOf(cue: Extract<SoundCue, { kind: 'launch' }>): Layer[] {
  const dur = clamp(cue.ms / 1000, 0.12, 1.2);
  if (cue.melee) {
    if (cue.melee === 'stomp') return [tone('sine', 160, 50, 0, 0.2, 0.3)];
    return [noise({ type: 'bandpass', f0: 400, f1: 1800, q: 1.2 }, 0, Math.min(0.32, dur), 0.3)];
  }
  switch (cue.delivery) {
    case 'bolt':
      return [noise({ type: 'highpass', f0: 3500 }, 0, 0.3, 0.3), tone('square', 2000, 400, 0, 0.3, 0.1, { vibrato: { rate: 50, depth: 500 } })];
    case 'stream':
      return [noise({ type: 'bandpass', f0: 1000, q: 0.8 }, 0, dur, 0.24)];
    case 'swarm':
      return [tone('square', 300, 320, 0, dur, 0.08, { vibrato: { rate: 45, depth: 100 } }), noise({ type: 'highpass', f0: 4500 }, 0, dur, 0.1)];
    case 'beam':
      return [tone('sawtooth', 300, 1200, 0, dur, 0.13, { filter: { type: 'lowpass', f0: 2600 } }), noise({ type: 'bandpass', f0: 2000, q: 2 }, 0, dur, 0.08)];
    case 'quake':
      return [noise({ type: 'lowpass', f0: 220 }, 0, dur, 0.42), tone('sine', 55, 45, 0, dur, 0.5)];
    default:
      return [tone('sine', 900, 500, 0, dur, 0.11, { vibrato: { rate: 18, depth: 40 } }), noise({ type: 'bandpass', f0: 1400, q: 1.5 }, 0, dur, 0.1)];
  }
}

function victoryOf(personality: Personality): Layer[] {
  const gap = personality === 'veloz' ? 0.09 : personality === 'defensivo' ? 0.18 : 0.13;
  const lead = personality === 'defensivo' ? 'triangle' : 'square';
  const notes = [523, 659, 784, 1047];
  const layers: Layer[] = [];
  notes.forEach((f, i) => {
    layers.push(tone(lead, f, f, i * gap, 0.16, lead === 'square' ? 0.09 : 0.2, { filter: { type: 'lowpass', f0: 3200 } }));
    layers.push(tone('triangle', f * 2, f * 2, i * gap, 0.12, 0.05));
  });
  const end = notes.length * gap;
  for (const f of [1047, 1319, 1568]) layers.push(tone('triangle', f, f, end, 1.0, 0.16));
  layers.push(tone('sine', 523, 523, end, 1.0, 0.12));
  if (personality === 'agressivo') layers.push(tone('sawtooth', 131, 131, 0, end + 0.7, 0.1, { filter: { type: 'lowpass', f0: 500 } }));
  return layers;
}

function statusOf(status: StatusKind): Layer[] {
  switch (status) {
    case 'burn':
      return [noise({ type: 'lowpass', f0: 2600, f1: 700 }, 0, 0.4, 0.26), tone('sawtooth', 300, 520, 0, 0.3, 0.1, { filter: { type: 'lowpass', f0: 1200 } })];
    case 'poison':
      return [300, 420, 560].map((f, i) => tone('sine', f, f * 1.8, i * 0.1, 0.12, 0.2));
    case 'paralysis':
      return [tone('square', 1500, 300, 0, 0.3, 0.13, { vibrato: { rate: 55, depth: 500 } }), noise({ type: 'highpass', f0: 4000 }, 0, 0.18, 0.2)];
    default:
      return [tone('sine', 2200, 2100, 0, 0.5, 0.2), tone('sine', 3000, 2900, 0.04, 0.4, 0.12)];
  }
}

/** Camadas de um sinal. Sempre finitas, com duração limitada e um número pequeno de camadas. */
export function layersFor(cue: SoundCue): Layer[] {
  let layers: Layer[];
  switch (cue.kind) {
    case 'intro':
      layers = [tone('square', 392, 392, 0, 0.14, 0.09), tone('square', 523, 523, 0.15, 0.14, 0.09), tone('square', 784, 784, 0.3, 0.4, 0.1), tone('triangle', 196, 196, 0, 0.7, 0.2)];
      break;
    case 'go':
      layers = [tone('sine', 220, 110, 0, 0.3, 0.4), noise({ type: 'bandpass', f0: 1200, q: 1 }, 0, 0.15, 0.18)];
      break;
    case 'charge':
      layers = chargeOf(cue.type, cue.ranged, cue.ms);
      break;
    case 'launch':
      layers = launchOf(cue);
      break;
    case 'impact': {
      const k = clamp(cue.strength, 0.3, 1.6);
      const scale = (0.45 + 0.55 * k) * (cue.effectiveness < 1 ? 0.7 : 1) * (cue.guarded ? 0.6 : 1);
      layers = hitOf(cue.type, k).map((l) => ({ ...l, gain: l.gain * scale }));
      layers.push(tone('sine', 110, 38, 0, 0.3, 0.35 * scale));
      if (cue.effectiveness >= 2) layers.push(tone('sine', 1046, 1568, 0.06, 0.4, 0.14), tone('sine', 1568, 2093, 0.12, 0.35, 0.1));
      if (cue.critical) layers.push(noise({ type: 'highpass', f0: 5000 }, 0, 0.14, 0.4), tone('sine', 1760, 1760, 0.02, 0.5, 0.16));
      if (cue.guarded) layers.push(tone('sine', 1400, 1100, 0, 0.25, 0.14));
      break;
    }
    case 'miss':
      layers = [noise({ type: 'bandpass', f0: 1500, f1: 500, q: 1 }, 0, 0.3, 0.24)];
      break;
    case 'immune':
      layers = [tone('sine', 300, 240, 0, 0.3, 0.15), noise({ type: 'lowpass', f0: 800 }, 0, 0.2, 0.1)];
      break;
    case 'guard':
      layers = [tone('sine', 900, 1300, 0, 0.25, 0.18), tone('sine', 1800, 1800, 0.04, 0.35, 0.1), noise({ type: 'highpass', f0: 3000 }, 0, 0.05, 0.25)];
      break;
    case 'status':
      layers = statusOf(cue.status);
      break;
    case 'tick':
      layers = statusOf(cue.cause).map((l) => ({ ...l, gain: l.gain * 0.6, dur: l.dur * 0.7 }));
      break;
    case 'skip':
      layers = statusOf(cue.cause).map((l) => ({ ...l, gain: l.gain * 0.8 }));
      break;
    case 'faint':
      layers = [tone('triangle', 600, 80, 0.12, 0.9, 0.3), noise({ type: 'lowpass', f0: 900, f1: 150 }, 0.12, 0.4, 0.18)];
      break;
    case 'victory':
      layers = victoryOf(cue.personality);
      break;
  }
  return layers.map((l) => ({ ...l, dur: clamp(l.dur, 0.03, MAX_LAYER_SECONDS), gain: clamp(l.gain, 0, 0.8) }));
}
