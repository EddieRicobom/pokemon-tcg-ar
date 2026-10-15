import { computed, onBeforeUnmount, ref, watchEffect } from 'vue';
import type { Ref } from 'vue';

/**
 * Tela cheia de um elemento (o visor da câmera). Usa a Fullscreen API quando existe (Chrome/Android) e, onde não
 * existe (iPhone), cai numa "tela cheia" por CSS (`.pseudo-full`: o visor cobre a janela inteira).
 *
 * `immersive` (opcional) é o modo "câmera ligada": o visor cobre a janela inteira por CSS, a página de trás não
 * rola e tudo que importa fica sobre a imagem. Não depende da Fullscreen API (que esconde a barra do navegador).
 */
export function useFullscreen(target: Ref<HTMLElement | null>, immersive?: Ref<boolean>) {
  const fullscreen = ref(false);
  const forced = ref(false);
  /** Verdadeiro quando o visor deve cobrir a janela por CSS (classe `pseudo-full`). */
  const pseudo = computed(() => forced.value || immersive?.value === true);
  watchEffect(() => document.body.classList.toggle('no-scroll', pseudo.value));

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
    forced.value = true;
    fullscreen.value = true;
  }

  async function exit(): Promise<void> {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Já saiu.
      }
    }
    forced.value = false;
    fullscreen.value = false;
  }

  async function toggle(): Promise<void> {
    if (fullscreen.value) await exit();
    else await enter();
  }

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', onChange);
    void exit();
    document.body.classList.remove('no-scroll');
  });

  return { fullscreen, pseudo, toggle, exit };
}
