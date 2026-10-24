import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App as VueApp } from 'vue';

// Carregamento dos sprites controlado pelo teste: todos ficam pendentes até `release()`.
const pending: (() => void)[] = [];
const release = () => pending.splice(0).forEach((resolve) => resolve());
vi.mock('../app/services', () => ({
  assetUrl: (path: string) => path,
  getCache: async () => ({ list: async () => [] }),
  getLocalVillageSprite: () => new Promise((resolve) => pending.push(() => resolve(null))),
  getLocalVillageSpriteDirs: () => new Promise((resolve) => pending.push(() => resolve(null))),
}));

const { default: MinigameSobrevivencia } = await import('./MinigameSobrevivencia.vue');

describe('Torre de Sobrevivência: sair no meio', () => {
  let host: HTMLElement | null = null;
  let app: VueApp | null = null;
  // Sem rede: o componente pede `village-sprite-meta.json`; sem este estanque o happy-dom tentava abrir localhost:3000.
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => null })));
  });
  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sair enquanto os sprites ainda carregam não deixa um laço de animação rodando depois', async () => {
    // O chão da Torre "não baixa" (caminho real sem rede): a imagem avisa erro logo, e o carregamento segue.
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailingImage);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(MinigameSobrevivencia) });
    app.mount(host);
    // Caixa vazia → começa a corrida com o Pikachu de reserva e fica esperando os sprites.
    await new Promise((r) => setTimeout(r, 10));
    app.unmount();
    app = null;
    release();
    await new Promise((r) => setTimeout(r, 30));
    await nextTick();
    expect(raf).not.toHaveBeenCalled();
  });

  it('sair tira os ouvintes de teclado e de visibilidade', async () => {
    const removedWindow = vi.spyOn(window, 'removeEventListener');
    const removedDoc = vi.spyOn(document, 'removeEventListener');
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(MinigameSobrevivencia) });
    app.mount(host);
    app.unmount();
    app = null;
    expect(removedWindow.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining([
      'keydown', 'keyup', 'tcg-gamepad-action', 'tcg-gamepad-back', 'tcg-gamepad-direction', 'tcg-gamepad-menu',
    ]));
    expect(removedDoc.mock.calls.map((c) => c[0])).toContain('visibilitychange');
  });
});
