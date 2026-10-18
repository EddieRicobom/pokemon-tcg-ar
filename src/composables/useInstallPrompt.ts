import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Controla o botão "Instalar app" (Chrome/Edge/Android). No iOS a instalação é manual. */
export function useInstallPrompt() {
  const deferred = ref<BeforeInstallPromptEvent | null>(null);
  const installed = ref(false);
  const installError = ref('');
  const installing = ref(false);

  function onBeforeInstallPrompt(event: Event): void {
    event.preventDefault();
    deferred.value = event as BeforeInstallPromptEvent;
    installError.value = '';
  }

  function onAppInstalled(): void {
    installed.value = true;
    deferred.value = null;
    installError.value = '';
  }

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
  });

  async function install(): Promise<void> {
    const event = deferred.value;
    if (!event || installing.value) return;
    deferred.value = null;
    installing.value = true;
    installError.value = '';
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      if (!installed.value) installError.value = 'Não foi possível abrir a instalação. Use a opção de instalar no menu do navegador.';
    } finally {
      installing.value = false;
    }
  }

  return { canInstall: computed(() => deferred.value !== null), installed, installing, installError, install };
}
