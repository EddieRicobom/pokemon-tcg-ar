import type { MusicEntry } from '../core/music';

interface Voice { path: string; audio: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode; targetGain: number | null; pending: boolean; failed: boolean; controller: AbortController; loading: boolean; objectUrl?: string }

/** Duas faixas compactadas no máximo; o navegador faz a decodificação progressiva. */
export class MusicPlayer {
  private context: AudioContext | null = null;
  private voices: Voice[] = [];
  private mix: MusicEntry[] = [];
  private playing = false;
  private volume = 0;
  private disposed = false;
  private unlocked = false;
  private failures = new Set<string>();
  private contextTarget: 'running' | 'suspended' | null = null;
  private contextOperation: Promise<void> | null = null;

  constructor(private readonly url: (path: string) => string, private readonly unavailable: () => void = () => undefined) {}

  /** Chamado somente por toque/tecla do jogador. */
  unlock(): void {
    if (this.disposed) return;
    this.unlocked = true;
    // A seleção pode esperar sprites antes de começar: o contexto precisa ser liberado já neste gesto.
    if (this.volume === 0) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!this.context && Ctor) this.context = new Ctor();
      for (const voice of [...this.voices]) {
        if (this.failures.has(voice.path)) { this.release(voice); this.voices.splice(this.voices.indexOf(voice), 1); }
      }
      this.failures.clear();
      for (const voice of this.voices) voice.failed = false;
      this.refresh();
    } catch { this.unavailable(); }
  }

  update(mix: MusicEntry[], playing: boolean, volume: number): void {
    this.mix = mix.slice(0, 2);
    this.playing = playing;
    this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    this.refresh();
  }

  private refresh(): void {
    const ctx = this.context;
    if (!ctx || this.disposed) return;
    const active = this.playing && this.volume > 0 && this.unlocked;
    if (!active) {
      for (const voice of [...this.voices]) {
        voice.audio.pause();
        if (voice.loading) { this.release(voice); this.voices.splice(this.voices.indexOf(voice), 1); }
      }
      this.requestContextState('suspended');
      return;
    }
    this.requestContextState('running');
    const wanted = new Set(this.mix.map(entry => entry.path));
    for (const voice of [...this.voices]) {
      if (!wanted.has(voice.path)) { this.release(voice); this.voices.splice(this.voices.indexOf(voice), 1); }
    }
    for (const entry of this.mix) {
      if (this.failures.has(entry.path)) continue;
      let voice = this.voices.find(candidate => candidate.path === entry.path);
      if (!voice) {
        const audio = new Audio();
        audio.preload = 'none'; audio.loop = true;
        const source = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain(); gain.gain.value = 0;
        source.connect(gain); gain.connect(ctx.destination);
        voice = { path: entry.path, audio, source, gain, targetGain: null, pending: false, failed: false, controller: new AbortController(), loading: true };
        const created = voice;
        audio.onerror = () => {
          if (this.disposed || !this.voices.includes(created)) return;
          this.failures.add(entry.path); created.failed = true; audio.pause(); this.unavailable();
        };
        this.voices.push(voice);
        void this.load(voice);
      }
      const targetGain = entry.gain * this.volume * 0.65;
      // syncMusic pode rodar a cada 100 ms. Reagendar o mesmo alvo a cada chamada
      // reinicia a curva exponencial e faz a música parecer pulsar em alguns celulares.
      if (voice.targetGain === null || Math.abs(voice.targetGain - targetGain) > 0.0005) {
        voice.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.15);
        voice.targetGain = targetGain;
      }
      if (voice.audio.paused && !voice.loading && !voice.pending && !voice.failed) {
        const current = voice;
        current.pending = true;
        void current.audio.play().then(() => {
          if (this.disposed || !this.playing || this.volume === 0 || !this.voices.includes(current)) current.audio.pause();
        }).catch(() => { if (!this.disposed && this.playing && this.voices.includes(current)) { current.failed = true; this.unavailable(); } })
          .finally(() => { current.pending = false; });
      }
    }
  }

  private requestContextState(target: 'running' | 'suspended'): void {
    const ctx = this.context;
    if (!ctx || this.disposed) return;
    this.contextTarget = target;
    const matches = target === 'running' ? ctx.state === 'running' : ctx.state === 'suspended';
    if (matches && !this.contextOperation) return;
    if (this.contextOperation) return;
    let operation: Promise<void>;
    try {
      operation = target === 'running' ? ctx.resume() : ctx.suspend();
    } catch {
      if (target === 'running') this.unavailable();
      return;
    }
    const tracked = operation.catch(() => {
      if (target === 'running') this.unavailable();
    });
    this.contextOperation = tracked;
    void tracked.finally(() => {
      if (this.contextOperation !== tracked) return;
      this.contextOperation = null;
      if (this.contextTarget !== target) this.requestContextState(this.contextTarget!);
    });
  }

  private async load(voice: Voice): Promise<void> {
    try {
      // GET completo: uma resposta 200 entra no cache offline, sem as requisições Range duplicadas do player.
      const response = await fetch(this.url(voice.path), { signal: voice.controller.signal });
      if (!response.ok) throw new Error('Trilha indisponível');
      const blob = await response.blob();
      if (this.disposed || voice.controller.signal.aborted || !this.voices.includes(voice)) return;
      voice.objectUrl = URL.createObjectURL(blob); voice.audio.src = voice.objectUrl; voice.loading = false;
      this.refresh();
    } catch {
      if (!voice.controller.signal.aborted && !this.disposed && this.voices.includes(voice)) {
        voice.failed = true; voice.loading = false; this.failures.add(voice.path); this.unavailable();
      }
    }
  }

  private release(voice: Voice): void {
    voice.controller.abort();
    voice.audio.onerror = null;
    voice.audio.pause(); voice.audio.removeAttribute('src'); voice.audio.load();
    voice.source.disconnect(); voice.gain.disconnect();
    if (voice.objectUrl) URL.revokeObjectURL(voice.objectUrl);
  }

  reset(): void {
    for (const voice of this.voices) this.release(voice);
    this.voices = []; this.mix = []; this.playing = false; this.failures.clear();
    this.requestContextState('suspended');
  }

  dispose(): void {
    this.disposed = true; this.reset();
    void this.context?.close().catch(() => undefined); this.context = null;
  }
}
