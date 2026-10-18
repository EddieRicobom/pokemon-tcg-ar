/** Controles e conversas recebem suas teclas antes dos atalhos do jogo. */
export function isGameKeyboardControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="dialog"]') !== null;
}
