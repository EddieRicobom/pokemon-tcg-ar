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

describe('Torre de Sobrevivência', () => {
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

  it('move e revela o foco, mantém o Enter no favorito e recupera o foco ao voltar da escolha', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(MinigameSobrevivencia, { digital: [{ dexId: 25, name: 'Pikachu' }] }) });
    app.mount(host);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    release();
    await vi.waitFor(() => expect(host!.querySelector('.survivor-favorite')).not.toBeNull());

    const normal = host.querySelector<HTMLButtonElement>('[data-gamepad-default]')!;
    const bonk = host.querySelector<HTMLButtonElement>('.bonk-mode-button')!;
    const pvp = host.querySelector<HTMLButtonElement>('.survivor-pvp-entry')!;
    const favorite = host.querySelector<HTMLButtonElement>('.survivor-favorite')!;
    const pokemon = favorite.parentElement!;
    const keyboard = (target: HTMLElement, key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };
    expect(document.activeElement).toBe(normal);
    vi.spyOn(normal, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 60, 440, 60));
    vi.spyOn(bonk, 'getBoundingClientRect').mockReturnValue(new DOMRect(450, 60, 440, 60));
    vi.spyOn(pvp, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 10, 890, 40));
    const reveal = vi.spyOn(bonk, 'scrollIntoView');
    keyboard(normal, 'ArrowRight');
    expect(document.activeElement).toBe(bonk);
    expect(reveal).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });

    favorite.focus();
    expect(keyboard(favorite, 'Enter').defaultPrevented).toBe(false);
    favorite.click();
    await nextTick();
    expect(favorite.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.survivor-attack-choice')).toBeNull();

    pokemon.focus();
    expect(keyboard(pokemon, ' ').defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(host!.querySelector('.survivor-attack-option')));
    keyboard(document.activeElement as HTMLElement, 'Escape');
    await vi.waitFor(() => expect(document.activeElement).toBe(host!.querySelector('[data-gamepad-default]')));

    const volume = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    host.querySelectorAll<HTMLDetailsElement>('.survivor-more, .survivor-more details').forEach((details) => { details.open = true; });
    volume.focus();
    expect(keyboard(volume, 'ArrowRight').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(volume);
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
      'keydown', 'keyup', 'tcg-gamepad-action', 'tcg-gamepad-back', 'tcg-gamepad-button', 'tcg-gamepad-direction', 'tcg-gamepad-menu',
    ]));
    expect(removedDoc.mock.calls.map((c) => c[0])).toContain('visibilitychange');
  });
});
