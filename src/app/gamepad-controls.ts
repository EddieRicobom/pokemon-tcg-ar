import type { GamepadDirection } from './gamepad';

/** Ajusta controles nativos pela esquerda/direita, preservando os eventos usados pelo Vue. */
export function adjustFocusedControl(direction: GamepadDirection, root?: HTMLElement): boolean {
  if (direction !== 'left' && direction !== 'right') return false;
  const element = document.activeElement;
  if (!element || (root && !root.contains(element)) || element.matches(':disabled, [aria-disabled="true"]')) return false;
  const delta = direction === 'right' ? 1 : -1;
  const previous = element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? element.value : null;

  if (element instanceof HTMLInputElement && element.type === 'range') {
    const min = element.min === '' ? 0 : Number(element.min);
    const max = element.max === '' ? 100 : Number(element.max);
    const step = Number(element.step) > 0 ? Number(element.step) : 1;
    const value = Number((Number(element.value) + delta * step).toPrecision(12));
    element.value = String(Math.max(min, Math.min(max, value)));
  } else if (element instanceof HTMLSelectElement && !element.multiple) {
    let index = element.selectedIndex + delta;
    while (element.options[index]?.matches(':disabled')) index += delta;
    if (index < 0 || index >= element.options.length) return true;
    element.selectedIndex = index;
  } else return false;

  if (element.value !== previous) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}
