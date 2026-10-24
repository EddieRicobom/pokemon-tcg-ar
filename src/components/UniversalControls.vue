<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { routeHref, useRoute } from '../app/route';
import type { RouteName } from '../app/route';
import { gamepadButtonPressed, gamepadDirections, type GamepadDirection } from '../app/gamepad';

const route = useRoute();
const menuOpen = ref(false);
const links: { name: RouteName; label: string }[] = [
  { name: 'escanear', label: 'Escanear' },
  { name: 'vila', label: 'Vila' },
  { name: 'cartas', label: 'Cartas' },
  { name: 'pins', label: 'Pins' },
  { name: 'treinador', label: 'Treinador' },
];
const visible = computed(() => route.value.name !== 'vila');
const routeStack: string[] = [];
let lastHash = window.location.hash;
let skipHistoryPush = false;
let returnFocus: HTMLElement | null = null;
let lastAction: HTMLElement | null = null;
const selector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
type Direction = GamepadDirection;
const directions: Direction[] = ['up', 'right', 'down', 'left'];
const heldGamepadDirections = new Set<Direction>();
const nextGamepadRepeat = new Map<Direction, number>();
const heldGamepadButtons = new Set<string>();
let gamepadFrame = 0;

function visibleActions(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter((element) =>
    (!element.closest('.universal-controls') || !!element.closest('.universal-menu-panel'))
      && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden',
  );
}

function focusWithArrowIndicator(target: HTMLElement | undefined): void {
  if (!target) return;
  document.querySelector<HTMLElement>('.arrow-focus')?.classList.remove('arrow-focus');
  target.focus({ preventScroll: true });
  target.classList.add('arrow-focus');
}

function visibleDialogs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"], .stage-sheet, .village-sheet')]
    .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
}

function onFocus(event: FocusEvent): void {
  const target = event.target;
  if (target instanceof HTMLElement && !target.closest('.universal-controls')) lastAction = target;
}
function onPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (target instanceof Element && !target.closest('.universal-controls, .village-pad')) {
    document.querySelector<HTMLElement>('.arrow-focus')?.classList.remove('arrow-focus');
  }
}
document.addEventListener('focusin', onFocus);
document.addEventListener('pointerdown', onPointerDown);

watch(route, () => {
  const next = window.location.hash;
  if (lastHash && next !== lastHash) {
    if (skipHistoryPush) skipHistoryPush = false;
    else if (routeStack.at(-1) !== lastHash) routeStack.push(lastHash);
  }
  if (routeStack.length > 20) routeStack.shift();
  lastHash = next;
  menuOpen.value = false;
});
watch(menuOpen, (open) => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement && !document.activeElement.closest('.universal-controls') ? document.activeElement : lastAction;
    void nextTick(() => focusWithArrowIndicator(document.querySelector<HTMLElement>('.universal-menu-panel a[href]') ?? undefined));
  } else {
    const target = returnFocus;
    returnFocus = null;
    void nextTick(() => target?.isConnected && focusWithArrowIndicator(target));
  }
});

function moveFocus(direction: 'up' | 'right' | 'down' | 'left'): void {
  const menu = document.querySelector<HTMLElement>('.universal-menu-panel');
  const dialogs = visibleDialogs();
  const activeDialog = document.activeElement instanceof Element
    ? document.activeElement.closest<HTMLElement>('[role="dialog"], .stage-sheet, .village-sheet')
    : null;
  const root: ParentNode = menuOpen.value && menu
    ? menu
    : activeDialog ?? dialogs.at(-1) ?? document.querySelector('main.app') ?? document;
  const actions = visibleActions(root);
  if (!actions.length) return;
  const current = actions.find((element) => element === document.activeElement)
    ?? (lastAction?.isConnected && root instanceof HTMLElement && root.contains(lastAction) ? lastAction : undefined);
  if (!current) {
    focusWithArrowIndicator(actions[0]);
    return;
  }
  const from = current.getBoundingClientRect();
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  const next = actions.filter((element) => element !== current).map((element) => {
    const rect = element.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - x;
    const dy = rect.top + rect.height / 2 - y;
    const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    return { element, primary, score: primary + secondary * 1.6 };
  }).filter((item) => item.primary > 1).sort((a, b) => a.score - b.score)[0]?.element;
  focusWithArrowIndicator(next ?? actions[(actions.indexOf(current) + 1) % actions.length]);
}

function dispatchGamepadEvent(name: string, direction?: 'up' | 'right' | 'down' | 'left'): boolean {
  if (route.value.name !== 'vila' && (menuOpen.value || visibleDialogs().length)) return false;
  const detail: { handled: boolean; direction?: 'up' | 'right' | 'down' | 'left' } = { handled: false };
  if (direction) detail.direction = direction;
  window.dispatchEvent(new CustomEvent(name, { detail }));
  return detail.handled;
}

function confirm(): void {
  if (menuOpen.value) {
    const link = document.querySelector<HTMLElement>('.universal-menu-panel a:focus');
    if (link) { link.click(); return; }
  }
  if (dispatchGamepadEvent('tcg-gamepad-action')) return;
  const active = document.activeElement instanceof HTMLElement && !document.activeElement.closest('.universal-controls')
    ? document.activeElement
    : lastAction;
  if (active?.isConnected && !active.matches('input, textarea, select')) active.click();
  else if (!active) visibleActions(document.querySelector('main.app') ?? document)[0]?.focus({ preventScroll: true });
}

function goBack(): void {
  if (menuOpen.value) { menuOpen.value = false; return; }
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"], .stage-sheet, .village-sheet')]
    .find((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
  if (dialog) {
    const close = dialog.querySelector<HTMLElement>('button[aria-label*="Fechar" i], button[aria-label*="Voltar" i], button[title*="Fechar" i], .menu-close, .bc-close, .village-close');
    if (close) { close.click(); return; }
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    dialog.dispatchEvent(escape);
    if (escape.defaultPrevented) return;
  }
  const actions = visibleActions(document.querySelector('main.app') ?? document);
  const closeAction = actions.find((element) => element instanceof HTMLButtonElement && /^(fechar|cancelar|voltar|retornar|voltar à\b|voltar para\b)/i.test(element.textContent?.trim() ?? ''));
  if (closeAction) { closeAction.click(); return; }
  const backLink = actions
    .find((element) => element instanceof HTMLAnchorElement && /voltar|retornar/i.test(`${element.textContent} ${element.getAttribute('aria-label') ?? ''}`));
  if (backLink) { backLink.click(); return; }
  const previous = routeStack.pop();
  if (previous) { skipHistoryPush = true; window.location.hash = previous; }
  else if (route.value.name !== 'escanear') { skipHistoryPush = true; window.location.hash = routeHref('escanear'); }
}

function onKey(event: KeyboardEvent): void {
  if (event.type !== 'keydown' || route.value.name === 'vila') return;
  const target = event.target;
  const typing = target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  if (typing) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
    moveFocus(({ ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' } as const)[event.key]);
    event.preventDefault();
  } else if (event.key === 'Escape' || event.key === 'Backspace' || event.key.toLowerCase() === 'x') {
    goBack();
    event.preventDefault();
  } else if (event.key === 'm' || event.key === 'M') {
    menuOpen.value = !menuOpen.value;
    event.preventDefault();
  } else if ((event.key === 'Enter' || event.key === ' ' || event.key.toLowerCase() === 'z') && !(target instanceof Element && target.closest('button, a[href]'))) {
    confirm();
    event.preventDefault();
  }
}

/** O painel captura as setas localmente para que navegadores móveis/DOM que não
 * propagam o keydown da âncora ainda mantenham a navegação por controle. */
function onMenuKey(event: KeyboardEvent): void {
  const direction: Direction | undefined = ({
    ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left',
  } as const)[event.key];
  if (direction) {
    moveFocus(direction);
    event.preventDefault();
    event.stopPropagation();
  }
}

function sendDirection(direction: Direction, pressed: boolean): void {
  if (route.value.name !== 'vila' && (menuOpen.value || visibleDialogs().length)) {
    if (pressed) moveFocus(direction);
    return;
  }
  const detail: { handled: boolean; direction: Direction; pressed: boolean } = { handled: false, direction, pressed };
  window.dispatchEvent(new CustomEvent('tcg-gamepad-direction', { detail }));
  if (pressed && !detail.handled) moveFocus(direction);
}

function sendControllerAction(name: 'tcg-gamepad-action' | 'tcg-gamepad-back' | 'tcg-gamepad-menu'): void {
  if (name === 'tcg-gamepad-action' && route.value.name !== 'vila' && (menuOpen.value || visibleDialogs().length)) {
    confirm();
    return;
  }
  const detail = { handled: false };
  window.dispatchEvent(new CustomEvent(name, { detail }));
  if (detail.handled) return;
  if (name === 'tcg-gamepad-action') confirm();
  else if (name === 'tcg-gamepad-back') goBack();
  else if (route.value.name !== 'vila') menuOpen.value = !menuOpen.value;
}

function connectedGamepads(): Gamepad[] {
  return [...(navigator.getGamepads?.() ?? [])].filter((pad): pad is Gamepad => !!pad?.connected);
}

function resetGamepadState(): void {
  for (const direction of heldGamepadDirections) sendDirection(direction, false);
  heldGamepadDirections.clear();
  nextGamepadRepeat.clear();
  heldGamepadButtons.clear();
}

function pollGamepad(): void {
  const pads = connectedGamepads();
  if (!pads.length) {
    resetGamepadState();
    gamepadFrame = 0;
    return;
  }

  const input = new Set<Direction>();
  for (const pad of pads) for (const direction of gamepadDirections(pad)) input.add(direction);
  const now = performance.now();
  for (const direction of directions) {
    const down = input.has(direction);
    const wasDown = heldGamepadDirections.has(direction);
    if (down && (!wasDown || now >= (nextGamepadRepeat.get(direction) ?? 0))) {
      sendDirection(direction, true);
      nextGamepadRepeat.set(direction, now + (wasDown ? 190 : 320));
    } else if (!down && wasDown) {
      sendDirection(direction, false);
      nextGamepadRepeat.delete(direction);
    }
    if (down) heldGamepadDirections.add(direction);
    else heldGamepadDirections.delete(direction);
  }

  const actions: [number, 'tcg-gamepad-action' | 'tcg-gamepad-back' | 'tcg-gamepad-menu'][] = [
    [0, 'tcg-gamepad-action'], [1, 'tcg-gamepad-back'], [9, 'tcg-gamepad-menu'],
  ];
  const connectedIndexes = new Set(pads.map((pad) => pad.index));
  for (const key of heldGamepadButtons) {
    if (!connectedIndexes.has(Number(key.split(':', 1)[0]))) heldGamepadButtons.delete(key);
  }
  for (const pad of pads) for (const [button, action] of actions) {
    const key = `${pad.index}:${button}`;
    const down = gamepadButtonPressed(pad, button);
    if (down && !heldGamepadButtons.has(key)) sendControllerAction(action);
    if (down) heldGamepadButtons.add(key);
    else heldGamepadButtons.delete(key);
  }
  gamepadFrame = requestAnimationFrame(pollGamepad);
}

function startGamepadPolling(): void {
  if (!gamepadFrame) gamepadFrame = requestAnimationFrame(pollGamepad);
}

function onGamepadConnected(): void { startGamepadPolling(); }
function onGamepadDisconnected(): void {
  if (!connectedGamepads().length) {
    cancelAnimationFrame(gamepadFrame);
    gamepadFrame = 0;
    resetGamepadState();
  }
}
function onVisibilityChange(): void {
  if (document.hidden) {
    cancelAnimationFrame(gamepadFrame);
    gamepadFrame = 0;
    resetGamepadState();
  } else if (connectedGamepads().length) startGamepadPolling();
}

window.addEventListener('keydown', onKey);
onMounted(() => {
  window.addEventListener('gamepadconnected', onGamepadConnected);
  window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onGamepadConnected);
  if (connectedGamepads().length) startGamepadPolling();
});
onBeforeUnmount(() => {
  document.removeEventListener('focusin', onFocus);
  document.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('gamepadconnected', onGamepadConnected);
  window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('focus', onGamepadConnected);
  cancelAnimationFrame(gamepadFrame);
  gamepadFrame = 0;
});
</script>

<template>
  <div v-if="visible" class="universal-controls" role="group" aria-label="Controles do aplicativo">
    <div class="universal-dpad" role="group" aria-label="Navegar pelos controles">
      <button class="pad-up" type="button" aria-label="Navegar para cima" @pointerdown.prevent @click="dispatchGamepadEvent('tcg-gamepad-direction', 'up') || moveFocus('up')">▲</button>
      <button class="pad-left" type="button" aria-label="Navegar para a esquerda" @pointerdown.prevent @click="dispatchGamepadEvent('tcg-gamepad-direction', 'left') || moveFocus('left')">◀</button>
      <span class="pad-center" aria-hidden="true">✦</span>
      <button class="pad-right" type="button" aria-label="Navegar para a direita" @pointerdown.prevent @click="dispatchGamepadEvent('tcg-gamepad-direction', 'right') || moveFocus('right')">▶</button>
      <button class="pad-down" type="button" aria-label="Navegar para baixo" @pointerdown.prevent @click="dispatchGamepadEvent('tcg-gamepad-direction', 'down') || moveFocus('down')">▼</button>
    </div>
    <div class="universal-actions" role="group" aria-label="Ações universais">
      <button class="universal-b" type="button" aria-label="Voltar" @click="goBack">B<small>Voltar</small></button>
      <button class="universal-a" type="button" aria-label="Confirmar" @click="confirm">A<small>Confirmar</small></button>
      <button class="universal-menu-button" type="button" :aria-expanded="menuOpen" aria-label="Menu" @click="menuOpen = !menuOpen">☰<small>Menu</small></button>
    </div>
    <nav v-if="menuOpen" class="universal-menu-panel" aria-label="Menu do aplicativo" @keydown.esc.stop.prevent="menuOpen = false" @keydown="onMenuKey">
      <header><strong>Menu</strong><button type="button" aria-label="Fechar menu" @click="menuOpen = false">×</button></header>
      <p class="arrow-control-hint">Setas/controle navegam · A confirma · B volta</p>
      <a v-for="link in links" :key="link.name" :href="routeHref(link.name)" :aria-current="route.name === link.name ? 'page' : undefined" @click="menuOpen = false">{{ link.label }}</a>
      <a :href="routeHref('diagnostico')" @click="menuOpen = false">Opções e diagnóstico</a>
    </nav>
  </div>
</template>
