import { onBeforeUnmount, watch, type Ref } from 'vue';

/** Folhas não modais: levam o teclado aos controles e devolvem o foco ao fechar. */
export function useDialogFocus(root: Ref<HTMLElement | null>): void {
  let opener: HTMLElement | null = null;
  let dialog: HTMLElement | null = null;

  function restore(): void {
    // Não rouba o foco se a pessoa já escolheu outro controle fora da folha.
    if (opener?.isConnected && (document.activeElement === document.body || dialog?.contains(document.activeElement))) {
      opener.focus({ preventScroll: true });
    }
    opener = null;
    dialog = null;
  }

  watch(root, (element) => {
    if (!element) {
      restore();
      return;
    }
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog = element;
    const control = element.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]');
    (control ?? element).focus({ preventScroll: true });
  }, { flush: 'post' });

  onBeforeUnmount(restore);
}
