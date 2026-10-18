/** Controles e conversas recebem suas teclas antes dos atalhos do jogo. */
export function isGameKeyboardControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="dialog"]') !== null;
}

/** Escape da folha chega ao voltar do jogo, exceto quando o diálogo já o consumiu. */
export function handleDialogEscape(event: KeyboardEvent, back: () => void): boolean {
  if (event.type !== 'keydown' || event.key !== 'Escape' || event.defaultPrevented || !(event.target instanceof Element) || !event.target.closest('[role="dialog"]')) return false;
  event.preventDefault();
  back();
  return true;
}
