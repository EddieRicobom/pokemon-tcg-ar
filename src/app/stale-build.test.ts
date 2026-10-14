import { describe, expect, it, vi } from 'vitest';
import { hasLiveCamera, isStaleChunkError, loadChunk, RELOAD_COOLDOWN_MS, reloadOnce, STALE_MESSAGE_PT, watchForNewVersion } from './stale-build';
import type { ReloadEnv } from './stale-build';

function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}
const env = (now: number, storage: ReloadEnv['storage'], reload = vi.fn()): ReloadEnv & { reload: ReturnType<typeof vi.fn> } => ({ storage, now: () => now, reload });

describe('isStaleChunkError', () => {
  it('reconhece as mensagens dos navegadores para um arquivo que sumiu', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/start-ar-abc.js'))).toBe(true);
    expect(isStaleChunkError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError('Unable to preload CSS for /assets/x.css')).toBe(true);
  });
  it('outros erros não contam', () => {
    expect(isStaleChunkError(new Error('Sem câmera'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError(42)).toBe(false);
  });
});

describe('reloadOnce', () => {
  it('recarrega na primeira vez e guarda a hora', () => {
    const storage = memoryStorage();
    const e = env(1_000_000, storage);
    expect(reloadOnce(e)).toBe(true);
    expect(e.reload).toHaveBeenCalledTimes(1);
  });
  it('não recarrega de novo dentro de um minuto (sem laço), mas volta a recarregar depois', () => {
    const storage = memoryStorage();
    expect(reloadOnce(env(1_000_000, storage))).toBe(true);
    const again = env(1_000_000 + RELOAD_COOLDOWN_MS - 1, storage);
    expect(reloadOnce(again)).toBe(false);
    expect(again.reload).not.toHaveBeenCalled();
    const later = env(1_000_000 + RELOAD_COOLDOWN_MS + 1, storage);
    expect(reloadOnce(later)).toBe(true);
  });
  it('sem armazenamento ou com armazenamento que falha, ainda recarrega', () => {
    const e1 = env(5, null);
    expect(reloadOnce(e1)).toBe(true);
    const broken: ReloadEnv['storage'] = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => undefined };
    const e2 = env(5, broken);
    expect(reloadOnce(e2)).toBe(true);
    expect(e2.reload).toHaveBeenCalled();
  });
});

describe('loadChunk', () => {
  it('devolve o módulo quando carrega', async () => {
    const reload = vi.fn(() => true);
    await expect(loadChunk(async () => ({ ok: 1 }), { reload })).resolves.toEqual({ ok: 1 });
    expect(reload).not.toHaveBeenCalled();
  });
  it('arquivo da versão antiga: pede a atualização, recarrega e avisa em português', async () => {
    const reload = vi.fn(() => true);
    const checkForUpdate = vi.fn(async () => undefined);
    const loader = async () => { throw new TypeError('Failed to fetch dynamically imported module: https://x/assets/start-box-old.js'); };
    await expect(loadChunk(loader, { reload, checkForUpdate })).rejects.toThrow(STALE_MESSAGE_PT);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });
  it('se já recarregou há pouco, diz para conferir a internet e fechar o app, sem recarregar em laço', async () => {
    const reload = vi.fn(() => false);
    const loader = async () => { throw new TypeError('Failed to fetch dynamically imported module: x'); };
    await expect(loadChunk(loader, { reload })).rejects.toThrow(/feche o app/);
  });
  it('outros erros passam como estavam e não recarregam', async () => {
    const reload = vi.fn(() => true);
    await expect(loadChunk(async () => { throw new Error('boom'); }, { reload })).rejects.toThrow('boom');
    expect(reload).not.toHaveBeenCalled();
  });
  it('uma falha ao procurar atualização não atrapalha', async () => {
    const reload = vi.fn(() => true);
    const checkForUpdate = vi.fn(async () => { throw new Error('offline'); });
    const loader = async () => { throw new TypeError('Failed to fetch dynamically imported module: x'); };
    await expect(loadChunk(loader, { reload, checkForUpdate })).rejects.toThrow(STALE_MESSAGE_PT);
  });
});

describe('hasLiveCamera', () => {
  const docWith = (streams: (unknown | null)[]): Document => {
    const videos = streams.map((srcObject) => ({ srcObject }));
    return { querySelectorAll: () => videos } as unknown as Document;
  };
  it('verdadeiro só com um fluxo que tem faixa ativa', () => {
    expect(hasLiveCamera(docWith([]))).toBe(false);
    expect(hasLiveCamera(docWith([null]))).toBe(false);
    expect(hasLiveCamera(docWith([{ getTracks: () => [{ readyState: 'ended' }] }]))).toBe(false);
    expect(hasLiveCamera(docWith([null, { getTracks: () => [{ readyState: 'live' }] }]))).toBe(true);
  });
});

describe('watchForNewVersion', () => {
  function fakeWindow(hasController: boolean, camera: boolean) {
    const swListeners = new Map<string, () => void>();
    const reload = vi.fn();
    const win = {
      addEventListener: () => undefined,
      navigator: { serviceWorker: { controller: hasController ? {} : null, addEventListener: (t: string, fn: () => void) => swListeners.set(t, fn) } },
      document: { querySelectorAll: () => (camera ? [{ srcObject: { getTracks: () => [{ readyState: 'live' }] } }] : []) },
      location: { reload },
      sessionStorage: memoryStorage(),
    };
    return { win: win as unknown as Window & typeof globalThis, swListeners, reload };
  }

  it('troca de Service Worker numa página que já tinha um recarrega a página', () => {
    const f = fakeWindow(true, false);
    watchForNewVersion(f.win);
    f.swListeners.get('controllerchange')!();
    expect(f.reload).toHaveBeenCalledTimes(1);
  });
  it('a primeira instalação (sem controlador antes) não recarrega', () => {
    const f = fakeWindow(false, false);
    watchForNewVersion(f.win);
    f.swListeners.get('controllerchange')!();
    expect(f.reload).not.toHaveBeenCalled();
    // A troca seguinte, essa sim, é uma atualização.
    f.swListeners.get('controllerchange')!();
    expect(f.reload).toHaveBeenCalledTimes(1);
  });
  it('com a câmera aberta não recarrega sozinho', () => {
    const f = fakeWindow(true, true);
    watchForNewVersion(f.win);
    f.swListeners.get('controllerchange')!();
    expect(f.reload).not.toHaveBeenCalled();
  });
});
