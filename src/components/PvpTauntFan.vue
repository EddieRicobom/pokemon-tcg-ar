<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { GEMS, LEGENDARY } from '../core/dungeon-gems';
import type { GemKind, LegendaryKind } from '../core/dungeon-gems';
import { WEAPONS } from '../core/dungeon-weapons';
import type { WeaponId } from '../core/dungeon-weapons';
import type { PvpPeer } from '../pvp/peer';
import { acceptTaunt, canTaunt, TAUNTS, tauntText, tauntWait } from '../pvp/taunts';
import type { TauntId, TauntMessage } from '../pvp/taunts';

/**
 * Provocações (leque de um toque) e avisos discretos do rival, nos cantos e sem janela: somem sozinhos, não cobrem a
 * grade nem os controles (`pointer-events: none`) e não pedem toque para dispensar. A lista é fixa (`pvp/taunts.ts`).
 * Quem usa passa as mensagens `taunt`/`buff-event` que chegam para `receive`.
 */
const props = defineProps<{ peer: PvpPeer; friend: string }>();

const MUTE_KEY = 'tcg-ar-pvp-provocacoes-v1';
const open = ref(false);
const muted = ref(readMuted());
const wait = ref(0);
const toasts = ref<{ id: number; text: string; rarity: 'comum' | 'raro' | 'lendario' | 'taunt' }[]>([]);
let lastSent = 0;
let lastHeard = 0;
let toastId = 0;
let tick: ReturnType<typeof setInterval> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function toggleMute(): void {
  muted.value = !muted.value;
  try { localStorage.setItem(MUTE_KEY, muted.value ? '1' : '0'); } catch { /* vale só nesta sessão */ }
  if (muted.value) toasts.value = [];
}

function push(text: string, rarity: 'comum' | 'raro' | 'lendario' | 'taunt'): void {
  const id = ++toastId;
  toasts.value = [...toasts.value.slice(-2), { id, text, rarity }];
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id); }, rarity === 'lendario' ? 5200 : 3400);
}

function send(id: TauntId): void {
  const now = Date.now();
  if (!canTaunt(lastSent, now)) return;
  if (!props.peer.send({ t: 'taunt', id })) return;
  lastSent = now;
  open.value = false;
  push(`Você: ${tauntText(id)}`, 'taunt');
  wait.value = tauntWait(lastSent, now);
  if (tick) clearInterval(tick);
  tick = setInterval(() => {
    wait.value = tauntWait(lastSent, Date.now());
    if (wait.value === 0 && tick) { clearInterval(tick); tick = undefined; }
  }, 500);
}

function toggle(): void {
  open.value = !open.value;
  if (closeTimer) clearTimeout(closeTimer);
  if (open.value) closeTimer = setTimeout(() => { open.value = false; }, 6000);
}

function buffName(msg: Extract<TauntMessage, { t: 'buff-event' }>): string {
  if (msg.kind === 'gem') return msg.rarity === 'lendario' ? LEGENDARY[msg.id as LegendaryKind].name : `${GEMS[msg.id as GemKind].name}${msg.rarity === 'raro' ? ' de alto grau' : ''}`;
  if (msg.kind === 'weapon') return `a arma ${WEAPONS[msg.id as WeaponId]?.name ?? 'nova'}`;
  return msg.kind === 'potion' ? 'uma poção' : 'um buff de fusão';
}

/** Mostra o que o rival mandou. Devolve true se a mensagem era de provocação/buff (já tratada, ou ignorada de propósito). */
function receive(msg: { t: string }): boolean {
  if (msg.t === 'taunt') {
    const now = Date.now();
    if (!muted.value && acceptTaunt(lastHeard, now)) {
      lastHeard = now;
      push(`${props.friend}: ${tauntText((msg as Extract<TauntMessage, { t: 'taunt' }>).id)}`, 'taunt');
    }
    return true;
  }
  if (msg.t === 'buff-event') {
    const ev = msg as Extract<TauntMessage, { t: 'buff-event' }>;
    if (!muted.value) push(`${props.friend} pegou ${buffName(ev)}${ev.rarity === 'lendario' ? '!' : '.'}`, ev.rarity);
    return true;
  }
  return false;
}

defineExpose({ receive });
onBeforeUnmount(() => {
  if (tick) clearInterval(tick);
  if (closeTimer) clearTimeout(closeTimer);
});
</script>

<template>
  <span class="tf">
    <button type="button" class="tf-btn" :aria-expanded="open" aria-label="Provocações" title="Provocar o amigo" @click="toggle">💬</button>
    <span v-if="open" class="tf-fan" role="group" aria-label="Provocações">
      <button v-for="t in TAUNTS" :key="t.id" type="button" :disabled="wait > 0" @click="send(t.id)">{{ t.text }}</button>
      <button type="button" class="tf-mute" :aria-pressed="muted" @click="toggleMute">{{ muted ? '🔇 Provocações do amigo: silenciadas' : '🔔 Silenciar o amigo' }}</button>
      <small v-if="wait > 0">Espere {{ wait }} s</small>
    </span>
    <span class="tf-toasts" aria-live="polite" aria-atomic="false">
      <span v-for="t in toasts" :key="t.id" class="tf-toast" :class="t.rarity">{{ t.text }}</span>
    </span>
  </span>
</template>

<style scoped>
.tf { position: relative; display: inline-flex; }
.tf-btn { width: 32px; height: 32px; padding: 0; border-radius: 999px; border: 1px solid #ffffff33; background: #0007; color: inherit; font-size: 0.95rem; touch-action: manipulation; }
.tf-fan { position: absolute; top: 36px; right: 0; z-index: 60; display: flex; flex-direction: column; gap: 4px; width: max-content; max-width: 70vw; padding: 6px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); box-shadow: 0 6px 18px #000a; }
.tf-fan button { min-height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: inherit; font-size: 0.8rem; text-align: left; touch-action: manipulation; }
.tf-fan button:disabled { opacity: 0.5; }
.tf-fan small { color: var(--muted); font-size: 0.72rem; }
.tf-mute { color: var(--muted) !important; font-size: 0.72rem !important; }
.tf-toasts { position: fixed; top: calc(env(safe-area-inset-top) + 6px); left: 8px; z-index: 55; display: flex; flex-direction: column; gap: 4px; max-width: 60vw; pointer-events: none; }
.tf-toast { padding: 3px 9px; border-radius: 999px; font-size: 0.74rem; background: #000b; border: 1px solid #ffffff2a; color: #fff; animation: tf-in 0.25s ease-out; }
.tf-toast.taunt { border-color: #7fe7ff66; }
.tf-toast.raro { border-color: #b38cff; color: #e6d8ff; }
.tf-toast.lendario { border-color: var(--gold); background: #2a2008ee; color: #ffe9a6; font-weight: 700; font-size: 0.82rem; box-shadow: 0 0 10px #ffcb0577; }
@keyframes tf-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tf-toast { animation: none; } }
</style>
