import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import { useFullscreen } from './fullscreen';

type Api = ReturnType<typeof useFullscreen>;

function mountComposable(immersive?: Ref<boolean>): { api: Api; unmount: () => void } {
  let api!: Api;
  const target = document.createElement('div');
  // Sem Fullscreen API (como no iPhone): cai no modo por CSS.
  (target as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = () => Promise.reject(new Error('recusou'));
  const host = document.createElement('div');
  const app = createApp({
    setup() {
      api = useFullscreen(ref<HTMLElement | null>(target), immersive);
      return () => null;
    },
  });
  app.mount(host);
  return { api, unmount: () => app.unmount() };
}

afterEach(() => document.body.classList.remove('no-scroll'));

describe('useFullscreen: modo imersivo (câmera ligada)', () => {
  it('sem o modo imersivo o visor só cobre a janela quando a tela cheia é pedida', async () => {
    const { api, unmount } = mountComposable();
    expect(api.pseudo.value).toBe(false);
    await nextTick();
    expect(document.body.classList.contains('no-scroll')).toBe(false);
    unmount();
  });

  it('com a câmera ligada o visor cobre a janela e a página de trás não rola', async () => {
    const on = ref(false);
    const { api, unmount } = mountComposable(on);
    await nextTick();
    expect(api.pseudo.value).toBe(false);
    expect(document.body.classList.contains('no-scroll')).toBe(false);

    on.value = true;
    await nextTick();
    expect(api.pseudo.value).toBe(true);
    expect(document.body.classList.contains('no-scroll')).toBe(true);

    on.value = false;
    await nextTick();
    expect(api.pseudo.value).toBe(false);
    expect(document.body.classList.contains('no-scroll')).toBe(false);
    unmount();
  });

  it('sair da tela cheia não destrava a página enquanto a câmera continua ligada', async () => {
    const on = ref(true);
    const { api, unmount } = mountComposable(on);
    await nextTick();
    await api.toggle(); // a Fullscreen API recusa: cai no modo por CSS
    expect(api.fullscreen.value).toBe(true);
    await api.exit();
    await nextTick();
    expect(api.fullscreen.value).toBe(false);
    expect(api.pseudo.value).toBe(true);
    expect(document.body.classList.contains('no-scroll')).toBe(true);
    unmount();
    expect(document.body.classList.contains('no-scroll')).toBe(false);
  });
});
