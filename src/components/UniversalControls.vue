<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { routeHref, useRoute } from '../app/route';
import type { RouteName } from '../app/route';

const route = useRoute();
const menuOpen = ref(false);
const links: { name: RouteName; label: string }[] = [
  { name: 'escanear', label: 'Escanear' },
  { name: 'vila', label: 'Vila' },
  { name: 'cartas', label: 'Cartas' },
  { name: 'arena', label: 'Arena' },
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

function visibleActions(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter((element) =>
    !element.closest('.universal-controls') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
  );
}

function onFocus(event: FocusEvent): void {
  const target = event.target;
  if (target instanceof HTMLElement && !target.closest('.universal-controls')) lastAction = target;
}
document.addEventListener('focusin', onFocus);

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
    void nextTick(() => document.querySelector<HTMLElement>('.universal-menu-panel a[href]')?.focus({ preventScroll: true }));
  } else {
    const target = returnFocus;
    returnFocus = null;
    void nextTick(() => target?.isConnected && target.focus({ preventScroll: true }));
  }
});

function moveFocus(direction: 'up' | 'right' | 'down' | 'left'): void {
  const menu = document.querySelector<HTMLElement>('.universal-menu-panel');
  const root: ParentNode = menuOpen.value && menu ? menu : document.querySelector('main.app') ?? document;
  const actions = visibleActions(root);
  if (!actions.length) return;
  const current = actions.find((element) => element === document.activeElement)
    ?? (lastAction?.isConnected && root instanceof HTMLElement && root.contains(lastAction) ? lastAction : undefined);
  if (!current) {
    actions[0]?.focus({ preventScroll: true });
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
  (next ?? actions[(actions.indexOf(current) + 1) % actions.length])?.focus({ preventScroll: true });
}

function dispatchGamepadEvent(name: string, direction?: 'up' | 'right' | 'down' | 'left'): boolean {
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
  if (event.key === 'Escape' && menuOpen.value) { menuOpen.value = false; event.preventDefault(); }
}
window.addEventListener('keydown', onKey);
onBeforeUnmount(() => {
  document.removeEventListener('focusin', onFocus);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div v-if="visible" class="universal-controls" role="group" aria-label="Controles do aplicativo">
    <div class="universal-dpad" role="group" aria-label="Navegar pelos controles">
      <button class="pad-up" type="button" aria-label="Navegar para cima" @click="dispatchGamepadEvent('tcg-gamepad-direction', 'up') || moveFocus('up')">▲</button>
      <button class="pad-left" type="button" aria-label="Navegar para a esquerda" @click="dispatchGamepadEvent('tcg-gamepad-direction', 'left') || moveFocus('left')">◀</button>
      <span class="pad-center" aria-hidden="true">✦</span>
      <button class="pad-right" type="button" aria-label="Navegar para a direita" @click="dispatchGamepadEvent('tcg-gamepad-direction', 'right') || moveFocus('right')">▶</button>
      <button class="pad-down" type="button" aria-label="Navegar para baixo" @click="dispatchGamepadEvent('tcg-gamepad-direction', 'down') || moveFocus('down')">▼</button>
    </div>
    <div class="universal-actions" role="group" aria-label="Ações universais">
      <button class="universal-b" type="button" aria-label="Voltar" @click="goBack">B<small>Voltar</small></button>
      <button class="universal-a" type="button" aria-label="Confirmar" @click="confirm">A<small>Confirmar</small></button>
      <button class="universal-menu-button" type="button" :aria-expanded="menuOpen" aria-label="Menu" @click="menuOpen = !menuOpen">☰<small>Menu</small></button>
    </div>
    <nav v-if="menuOpen" class="universal-menu-panel" aria-label="Menu do aplicativo" @keydown.esc.stop.prevent="menuOpen = false">
      <header><strong>Menu</strong><button type="button" aria-label="Fechar menu" @click="menuOpen = false">×</button></header>
      <a v-for="link in links" :key="link.name" :href="routeHref(link.name)" :aria-current="route.name === link.name ? 'page' : undefined" @click="menuOpen = false">{{ link.label }}</a>
      <a :href="routeHref('diagnostico')" @click="menuOpen = false">Opções e diagnóstico</a>
    </nav>
  </div>
</template>
