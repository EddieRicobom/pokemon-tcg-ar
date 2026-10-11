import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import App from './App.vue';

describe('App', () => {
  let host: HTMLElement | null = null;
  let app: VueApp | null = null;

  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
  });

  it('monta a interface em português e não finge reconhecimento nem AR', async () => {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(App);
    app.mount(host);
    await nextTick();

    const text = host.textContent ?? '';
    expect(text).toContain('Pokémon TCG AR');
    expect(text).toContain('Reconhecimento de cartas');
    expect(text).toContain('Pokémon em pé sobre a carta (AR)');
    expect(text.match(/Ainda não implementado/g)).toHaveLength(2);
    expect(text).toContain('não reconhece nem rastreia cartas');

    expect(host.querySelector('video')).not.toBeNull();
    expect(host.querySelector('canvas')).not.toBeNull();
    expect(host.querySelector('button.primary')?.textContent?.trim()).toBe('Abrir câmera');
  });
});
