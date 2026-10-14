import { layersFor } from './sound-recipes';
import type { Layer, SoundCue, SoundSink } from './sound-recipes';

/** Camadas tocando ao mesmo tempo, no máximo (descarta o excesso em vez de sobrecarregar o celular). */
const MAX_VOICES = 28;
const MASTER_GAIN = 0.6;

/**
 * Toca os sons da batalha com WebAudio (sintetizados, ver `sound-recipes.ts`). O navegador só libera áudio depois
 * de um toque do usuário: `unlock()` é chamado dentro do clique de "Batalhar". Sem WebAudio, tudo vira silêncio.
 */
export class SoundEngine implements SoundSink {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voices = 0;
  enabled = true;

  /** Cria e acorda o contexto de áudio (precisa vir de um gesto do usuário). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const compressor = ctx.createDynamicsCompressor();
        const master = ctx.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(compressor);
        compressor.connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
        this.noiseBuffer = this.makeNoise(ctx);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  play(cue: SoundCue): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || !this.master || ctx.state !== 'running') return;
    for (const layer of layersFor(cue)) {
      if (this.voices >= MAX_VOICES) return;
      this.render(ctx, layer);
    }
  }

  private render(ctx: AudioContext, layer: Layer): void {
    const start = ctx.currentTime + layer.at;
    const end = start + layer.dur;
    const gain = ctx.createGain();
    // Envelope: ataque curto e queda suave até zero (sem estalo no corte).
    const attack = Math.min(0.012, layer.dur / 4);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(layer.gain, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    let source: AudioScheduledSourceNode;
    let tail: AudioNode;
    if (layer.src === 'noise') {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuffer;
      s.loop = true;
      source = s;
      tail = s;
    } else {
      const osc = ctx.createOscillator();
      osc.type = layer.wave ?? 'sine';
      osc.frequency.setValueAtTime(layer.f0 ?? 440, start);
      if (layer.f1 !== undefined && layer.f1 !== layer.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(layer.f1, 1), end);
      if (layer.vibrato) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = layer.vibrato.rate;
        depth.gain.value = layer.vibrato.depth;
        lfo.connect(depth);
        depth.connect(osc.frequency);
        lfo.start(start);
        lfo.stop(end + 0.05);
      }
      source = osc;
      tail = osc;
    }
    if (layer.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = layer.filter.type;
      filter.frequency.setValueAtTime(layer.filter.f0, start);
      if (layer.filter.f1 !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(layer.filter.f1, 20), end);
      filter.Q.value = layer.filter.q ?? 0.7;
      tail.connect(filter);
      tail = filter;
    }
    tail.connect(gain);
    gain.connect(this.master!);
    this.voices++;
    source.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      gain.disconnect();
    };
    source.start(start);
    source.stop(end + 0.05);
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
