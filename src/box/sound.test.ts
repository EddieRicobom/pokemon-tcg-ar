import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundEngine } from './sound';

/** WebAudio de mentira: só conta o que foi criado e iniciado. */
function installFakeAudio(state: 'running' | 'suspended' = 'running') {
  const log = { oscillators: 0, noises: 0, started: 0, resumed: 0, closed: 0 };
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  class FakeContext {
    state = state;
    currentTime = 0;
    sampleRate = 8000;
    destination = node();
    createGain() { return { ...node(), gain: param() }; }
    createDynamicsCompressor() { return node(); }
    createBiquadFilter() { return { ...node(), frequency: param(), Q: { value: 0 }, type: 'lowpass' }; }
    createBuffer(_c: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
    createOscillator() {
      log.oscillators++;
      return { ...node(), frequency: param(), type: 'sine', start: () => { log.started++; }, stop: vi.fn(), onended: null as null | (() => void) };
    }
    createBufferSource() {
      log.noises++;
      return { ...node(), buffer: null, loop: false, start: () => { log.started++; }, stop: vi.fn(), onended: null as null | (() => void) };
    }
    resume() { log.resumed++; this.state = 'running'; return Promise.resolve(); }
    close() { log.closed++; return Promise.resolve(); }
  }
  vi.stubGlobal('AudioContext', FakeContext);
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
  return log;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('SoundEngine', () => {
  it('sem WebAudio fica mudo e não quebra', () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    const engine = new SoundEngine();
    expect(() => {
      engine.unlock();
      engine.play({ kind: 'miss' });
      engine.dispose();
    }).not.toThrow();
  });

  it('não toca antes de liberar o áudio', () => {
    const log = installFakeAudio();
    const engine = new SoundEngine();
    engine.play({ kind: 'miss' });
    expect(log.started).toBe(0);
  });

  it('depois de liberar, toca as camadas do sinal', () => {
    const log = installFakeAudio();
    const engine = new SoundEngine();
    engine.unlock();
    engine.play({ kind: 'impact', type: 'electric', strength: 1, critical: true, effectiveness: 2, guarded: false });
    expect(log.started).toBeGreaterThan(2);
    expect(log.oscillators).toBeGreaterThan(0);
    expect(log.noises).toBeGreaterThan(0);
  });

  it('acorda o contexto suspenso e respeita o interruptor', () => {
    const log = installFakeAudio('suspended');
    const engine = new SoundEngine();
    engine.unlock();
    expect(log.resumed).toBe(1);
    engine.setEnabled(false);
    engine.play({ kind: 'faint' });
    expect(log.started).toBe(0);
    engine.setEnabled(true);
    engine.play({ kind: 'faint' });
    expect(log.started).toBeGreaterThan(0);
  });

  it('limita o número de vozes ao mesmo tempo', () => {
    const log = installFakeAudio();
    const engine = new SoundEngine();
    engine.unlock();
    for (let i = 0; i < 60; i++) engine.play({ kind: 'victory', personality: 'equilibrado' });
    expect(log.started).toBeLessThanOrEqual(30);
  });

  it('dispose fecha o contexto', () => {
    const log = installFakeAudio();
    const engine = new SoundEngine();
    engine.unlock();
    engine.dispose();
    expect(log.closed).toBe(1);
  });
});
