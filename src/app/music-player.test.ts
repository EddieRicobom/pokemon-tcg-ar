import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayer } from './music-player';

function audioEnvironment() {
  const sources: { disconnect: ReturnType<typeof vi.fn> }[] = [];
  const gains: { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> }; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const audios: FakeAudio[] = [];
  const closed = vi.fn(); const suspended = vi.fn();
  let resolvePlay: (() => void) | null = null;
  class FakeAudio {
    src = ''; preload = ''; loop = false; paused = true;
    onerror: (() => void) | null = null;
    pause = vi.fn(() => { this.paused = true; });
    load = vi.fn();
    removeAttribute = vi.fn(() => { this.src = ''; });
    play = vi.fn(() => { this.paused = false; return new Promise<void>(resolve => { resolvePlay = resolve; }); });
    constructor() { audios.push(this); }
  }
  class FakeContext {
    currentTime = 0; state = 'suspended'; destination = {};
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { suspended(); this.state = 'suspended'; return Promise.resolve(); }
    close() { closed(); return Promise.resolve(); }
    createGain() { const gain = { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(gain); return gain; }
    createMediaElementSource() { const source = { connect: vi.fn(), disconnect: vi.fn() }; sources.push(source); return source; }
  }
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('AudioContext', FakeContext);
  const fetchAudio = vi.fn(async (_url: string, _options?: RequestInit) => new Response(new Blob(['mp3'], { type: 'audio/mpeg' })));
  vi.stubGlobal('fetch', fetchAudio);
  return { audios, gains, sources, closed, suspended, fetchAudio, resolve: () => resolvePlay?.() };
}
afterEach(() => vi.unstubAllGlobals());

describe('MusicPlayer', () => {
  it('não baixa nem abre contexto antes de um gesto ou com música desligada', () => {
    const env = audioEnvironment(); const player = new MusicPlayer(path => path);
    player.update([{ path: 'a.mp3', gain: 1 }], true, 1);
    expect(env.audios).toHaveLength(0);
    player.update([{ path: 'a.mp3', gain: 1 }], false, 1); player.unlock();
    expect(env.audios).toHaveLength(0);
    player.dispose();
  });
  it('mantém duas faixas, aplica volumes e libera a que sai do mix', async () => {
    const env = audioEnvironment(); const player = new MusicPlayer(path => `/base/${path}`);
    player.update([{ path: 'a.mp3', gain: 0.5 }, { path: 'b.mp3', gain: 0.5 }, { path: 'c.mp3', gain: 1 }], true, 0.4);
    player.unlock();
    await vi.waitFor(() => expect(env.audios[1]?.src).toMatch(/^blob:/));
    expect(env.fetchAudio.mock.calls.map(call => call[0])).toEqual(['/base/a.mp3', '/base/b.mp3']);
    expect(env.gains[0]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.13, 0, 0.15);
    player.update([{ path: 'b.mp3', gain: 1 }], true, 0.4);
    expect(env.audios[0]?.removeAttribute).toHaveBeenCalledWith('src');
    expect(env.sources[0]?.disconnect).toHaveBeenCalledOnce();
    player.dispose(); player.dispose();
    expect(env.closed).toHaveBeenCalledOnce();
  });
  it('pausa ao esconder/silenciar e uma promessa atrasada não ressuscita o áudio', async () => {
    const env = audioEnvironment(); const player = new MusicPlayer(path => path);
    player.update([{ path: 'a.mp3', gain: 1 }], true, 1); player.unlock();
    await vi.waitFor(() => expect(env.audios[0]?.src).toMatch(/^blob:/));
    player.update([{ path: 'a.mp3', gain: 1 }], false, 1);
    expect(env.suspended).toHaveBeenCalled();
    player.dispose(); env.resolve(); await Promise.resolve();
    expect(env.audios[0]?.paused).toBe(true);
    expect(env.audios[0]?.src).toBe('');
  });
  it('relata falhas sem repetir downloads a cada quadro e permite nova tentativa por gesto', async () => {
    const env = audioEnvironment(); const failed = vi.fn(); const player = new MusicPlayer(path => path, failed);
    player.update([{ path: 'missing.mp3', gain: 1 }], true, 1); player.unlock();
    await vi.waitFor(() => expect(env.audios[0]?.src).toMatch(/^blob:/));
    env.audios[0]?.onerror?.();
    for (let n = 0; n < 50; n++) player.update([{ path: 'missing.mp3', gain: 1 }], true, 1);
    expect(failed).toHaveBeenCalledOnce(); expect(env.audios).toHaveLength(1);
    player.reset(); player.update([{ path: 'missing.mp3', gain: 1 }], true, 1); player.unlock();
    expect(env.audios).toHaveLength(2); player.dispose();
  });
  it('cancela downloads e ignora respostas antigas depois de sair', async () => {
    const env = audioEnvironment();
    let finish: ((response: Response) => void) | undefined;
    env.fetchAudio.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const player = new MusicPlayer(path => path);
    player.update([{ path: 'a.mp3', gain: 1 }], true, 1); player.unlock();
    player.dispose(); finish!(new Response(new Blob(['mp3'])));
    await Promise.resolve(); await Promise.resolve();
    expect(env.audios[0]?.src).toBe('');
    expect(env.audios[0]?.play).not.toHaveBeenCalled();
  });
});
