import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { useInstallPrompt } from './useInstallPrompt';

describe('instalação do PWA', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => unmount?.());

  function setup() {
    let state!: ReturnType<typeof useInstallPrompt>;
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({ setup() { state = useInstallPrompt(); return () => h('div'); } });
    app.mount(host);
    unmount = () => { app.unmount(); host.remove(); };
    return state;
  }

  function offer(prompt: () => Promise<void> = vi.fn(async () => undefined), userChoice = Promise.resolve({ outcome: 'dismissed' })) {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt, userChoice });
    window.dispatchEvent(event);
    return { event, prompt };
  }

  it('consome cada oferta uma vez e não repete o pedido enquanto aguarda', async () => {
    const state = setup();
    let finish!: () => void;
    const { event, prompt } = offer(vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })));
    expect(event.defaultPrevented).toBe(true);
    expect(state.canInstall.value).toBe(true);
    const pending = state.install();
    expect(state.installing.value).toBe(true);
    await state.install();
    expect(prompt).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(state.installing.value).toBe(false);
    expect(state.installError.value).toBe('');
  });

  it('explica falha do navegador sem rejeição não tratada e aceita uma oferta nova', async () => {
    const state = setup();
    offer(vi.fn(async () => { throw new Error('not allowed'); }));
    await expect(state.install()).resolves.toBeUndefined();
    expect(state.installError.value).toContain('menu do navegador');
    expect(state.installing.value).toBe(false);
    offer();
    expect(state.installError.value).toBe('');
    expect(state.canInstall.value).toBe(true);
  });

  it('limpa a oferta depois de instalar e remove os listeners ao desmontar', () => {
    const state = setup();
    offer();
    window.dispatchEvent(new Event('appinstalled'));
    expect(state.installed.value).toBe(true);
    expect(state.canInstall.value).toBe(false);
    unmount?.();
    unmount = undefined;
    offer();
    expect(state.canInstall.value).toBe(false);
  });
});
