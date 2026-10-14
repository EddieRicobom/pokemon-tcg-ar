import { onBeforeUnmount, ref } from 'vue';
import type { Ref } from 'vue';

/**
 * Tela cheia de um elemento (o visor da câmera). Usa a Fullscreen API quando existe (Chrome/Android) e, onde não
 * existe (iPhone), cai numa "tela cheia" por CSS (`.pseudo-full`: o visor cobre a janela inteira).
 */
export function useFullscreen(target: Ref<HTMLElement | null>) {
  const fullscreen = ref(false);
  const pseudo = ref(false);

  const onChange = () => {
    fullscreen.value = document.fullscreenElement !== null && document.fullscreenElement === target.value;
  };
  document.addEventListener('fullscreenchange', onChange);

  async function enter(): Promise<void> {
    const el = target.value;
    if (!el) return;
    if (typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' });
        return;
      } catch {
        // Recusou (ex.: sem gesto do usuário): usa a tela cheia por CSS.
      }
    }
    pseudo.value = true;
    fullscreen.value = true;
    document.body.classList.add('no-scroll');
  }

  async function exit(): Promise<void> {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Já saiu.
      }
    }
    pseudo.value = false;
    fullscreen.value = false;
    document.body.classList.remove('no-scroll');
  }

  async function toggle(): Promise<void> {
    if (fullscreen.value) await exit();
    else await enter();
  }

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', onChange);
    void exit();
  });

  return { fullscreen, pseudo, toggle, exit };
}
