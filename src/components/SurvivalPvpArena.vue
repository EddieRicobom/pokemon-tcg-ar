<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { TYPE_COLORS } from '../core/pokemon-data';
import {
  aliveCount, SV_ARENA_H, SV_ARENA_W, SV_SUDDEN_DEATH_MS, SV_SWITCH_COOLDOWN_MS, switchBlockReason,
} from '../core/survivor-pvp';
import type { ArenaEvent, ArenaSide, ArenaState, ArenaTeamState } from '../core/survivor-pvp';
import { SurvivalGuestLink, SurvivalHostLink } from '../pvp/survival-link';
import type { ArenaView } from '../pvp/survival-link';

/**
 * A arena do PvP do Survival. Cada celular vê o próprio Pokémon embaixo (o convidado vê o mundo girado 180°). O anfitrião
 * roda a luta e o convidado desenha o que recebe; as duas telas usam os mesmos controles: arrastar para andar e tocar num
 * dos três Pokémon de baixo para trocar. Os avisos são curtos, ficam por cima da arena e nunca bloqueiam o toque.
 */
const props = defineProps<{ link: SurvivalHostLink | SurvivalGuestLink; friendName: string; friendLeft: boolean }>();
const emit = defineEmits<{ leave: [] }>();

const hostLink = props.link instanceof SurvivalHostLink ? props.link : null;
const guestLink = props.link instanceof SurvivalGuestLink ? props.link : null;
const mySide: ArenaSide = hostLink ? 0 : 1;
const foeSide: ArenaSide = hostLink ? 1 : 0;
/** O convidado vê a arena girada, para ficar sempre embaixo. */
const flip = !hostLink;
const state: ArenaState = props.link.state;

interface Row {
  index: number;
  name: string;
  dexId: number;
  shiny: boolean;
  hp: number;
  max: number;
  hpPct: number;
  active: boolean;
  fainted: boolean;
}
interface Unit {
  key: string;
  mine: boolean;
  x: number;
  y: number;
  dexId: number;
  shiny: boolean;
  name: string;
  hpPct: number;
  shield: boolean;
}
interface Bullet {
  id: number;
  mine: boolean;
  x: number;
  y: number;
  color: string;
  size: string;
}
interface Marker {
  id: number;
  mine: boolean;
  x: number;
  y: number;
  color: string;
  size: string;
  leftMs: number;
}
interface Hud {
  mine: Row[];
  foe: Row[];
  summary: string;
  hint: string;
  count: number;
  switchPct: number;
  switchSec: number;
}

const rowsOf = (team: ArenaTeamState): Row[] => team.mons.map((m, index) => ({
  index, name: m.name, dexId: m.dexId, shiny: m.shiny, hp: Math.ceil(m.hp), max: m.maxHp, hpPct: Math.round((100 * m.hp) / m.maxHp),
  active: index === team.active && m.hp > 0, fainted: m.hp <= 0,
}));

const clock = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

const hud = shallowRef<Hud>({ mine: [], foe: [], summary: '', hint: '', count: 0, switchPct: 0, switchSec: 0 });
const units = shallowRef<Unit[]>([]);
const bullets = shallowRef<Bullet[]>([]);
const markers = shallowRef<Marker[]>([]);
const broken = ref<number[]>([]);
const hurt = ref(false);
const stale = ref(false);
const toasts = ref<{ id: number; text: string; tone: 'good' | 'bad' | 'info' }[]>([]);
const result = ref<{ title: string; detail: string } | null>(null);
const arenaEl = ref<HTMLElement | null>(null);
const joy = reactive({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 });

const JOY_RADIUS = 46;
let joyId: number | null = null;
let joyVx = 0;
let joyVy = 0;
const keys = { up: false, down: false, left: false, right: false };
let queuedSwitch = -1;
let raf = 0;
let last = 0;
let lastHud = -Infinity;
let toastId = 0;
let resultTimer: ReturnType<typeof setTimeout> | null = null;
let hurtTimer: ReturnType<typeof setTimeout> | null = null;
const recentTips = new Map<string, number>();

const markBroken = (dexId: number): void => {
  if (!broken.value.includes(dexId)) broken.value = [...broken.value, dexId];
};

function toast(text: string, tone: 'good' | 'bad' | 'info' = 'info', ms = 2200, key = text): void {
  const now = performance.now();
  if (now - (recentTips.get(key) ?? -Infinity) < 1800) return;
  recentTips.set(key, now);
  const id = ++toastId;
  toasts.value = [...toasts.value.slice(-2), { id, text, tone }];
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), ms);
}

function requestSwitch(index: number): void {
  const reason = switchBlockReason(state, mySide, index);
  if (reason) {
    toast(reason, 'info', 1800, `block:${reason}`);
    return;
  }
  queuedSwitch = index;
}

function inputVector(): { dx: number; dy: number } {
  const dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + joyVx;
  const dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + joyVy;
  const len = Math.hypot(dx, dy);
  return len > 1 ? { dx: dx / len, dy: dy / len } : { dx, dy };
}

function handleEvents(events: ArenaEvent[]): void {
  for (const e of events) {
    const mons = state.sides[e.side].mons;
    if (e.k === 'hit') {
      if (e.side === mySide) {
        hurt.value = true;
        if (hurtTimer) clearTimeout(hurtTimer);
        hurtTimer = setTimeout(() => (hurt.value = false), 140);
      } else if (e.mult === 0) toast('Não afeta o alvo…', 'info', 1800, 'imune');
      else if (e.mult > 1) toast('Super efetivo!', 'good', 1500, 'super');
      else if (e.mult < 1) toast('Pouco efetivo…', 'info', 1500, 'pouco');
    } else if (e.k === 'telegraph') {
      if (e.side !== mySide) toast('Área marcada: saia do círculo!', 'bad', 1600, `mark:${e.side}`);
    } else if (e.k === 'faint') {
      const name = mons[e.index]?.name ?? 'Pokémon';
      toast(e.side === mySide ? `${name} desmaiou` : `${name} (${props.friendName}) desmaiou`, e.side === mySide ? 'bad' : 'good', 2600);
    } else {
      const name = mons[e.index]?.name ?? 'Pokémon';
      if (e.side === mySide) toast(e.forced ? `Entrou ${name}` : `Você trocou para ${name}`, 'info', 1800, `sw:${name}`);
      else toast(`${props.friendName} trocou para ${name}`, 'info', 1800, `fsw:${name}`);
    }
  }
}

function toView(x: number, y: number): { x: number; y: number } {
  return flip ? { x: SV_ARENA_W - x, y: SV_ARENA_H - y } : { x, y };
}

function buildScene(now: number): void {
  const view: ArenaView = hostLink
    ? {
      sides: [{ x: state.sides[0].x, y: state.sides[0].y }, { x: state.sides[1].x, y: state.sides[1].y }],
      shots: state.shots.map((s) => ({ id: s.id, side: s.side, x: s.x, y: s.y, type: s.type, radius: s.radius })),
      markers: state.markers.map((m) => ({ id: m.id, side: m.side, x: m.x, y: m.y, radius: m.radius, type: m.type, leftMs: m.leftMs })),
    }
    : (guestLink as SurvivalGuestLink).view(now);
  const out: Unit[] = [];
  for (const side of [mySide, foeSide] as const) {
    const team = state.sides[side];
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0) continue;
    const p = toView(view.sides[side].x, view.sides[side].y);
    out.push({ key: side === mySide ? 'me' : 'foe', mine: side === mySide, x: (p.x / SV_ARENA_W) * 100, y: (p.y / SV_ARENA_H) * 100, dexId: mon.dexId, shiny: mon.shiny, name: mon.name, hpPct: Math.round((100 * mon.hp) / mon.maxHp), shield: team.shieldMs > 0 });
  }
  units.value = out;
  bullets.value = view.shots.map((s) => {
    const p = toView(s.x, s.y);
    return { id: s.id, mine: s.side === mySide, x: (p.x / SV_ARENA_W) * 100, y: (p.y / SV_ARENA_H) * 100, color: TYPE_COLORS[s.type], size: `${Math.max(2.5, (s.radius * 2 / SV_ARENA_W) * 100)}%` };
  });
  markers.value = view.markers.map((m) => {
    const p = toView(m.x, m.y);
    return { id: m.id, mine: m.side === mySide, x: (p.x / SV_ARENA_W) * 100, y: (p.y / SV_ARENA_H) * 100, color: TYPE_COLORS[m.type], size: `${(m.radius * 2 / SV_ARENA_W) * 100}%`, leftMs: m.leftMs };
  });
}

function buildHud(): void {
  const mine = state.sides[mySide];
  const foe = state.sides[foeSide];
  const sudden = state.timeMs > SV_SUDDEN_DEATH_MS;
  let hint = '';
  if (state.winner !== null) hint = '';
  else if (state.countdownMs > 0) hint = 'Arraste na arena para desviar dos golpes. Toque num dos seus Pokémon, embaixo, para trocar.';
  else if (sudden) hint = 'Morte súbita: quem está em campo perde vida sozinho.';
  else if (state.timeMs < 9000) hint = 'Desvie dos golpes: o seu Pokémon ataca sozinho. Troque quando precisar.';
  const cd = mine.switchCdMs;
  hud.value = {
    mine: rowsOf(mine), foe: rowsOf(foe),
    summary: `Você ${aliveCount(mine)}/${mine.mons.length} de pé · ${props.friendName} ${aliveCount(foe)}/${foe.mons.length}${state.countdownMs > 0 ? '' : ` · ${clock(state.timeMs)}`}`,
    hint, count: Math.ceil(state.countdownMs / 1000),
    switchPct: cd > 0 ? Math.round((100 * cd) / SV_SWITCH_COOLDOWN_MS) : 0, switchSec: Math.ceil(cd / 1000),
  };
}

function finish(): void {
  if (result.value || resultTimer) return;
  resultTimer = setTimeout(() => {
    const mine = aliveCount(state.sides[mySide]);
    const foe = aliveCount(state.sides[foeSide]);
    const w = state.winner;
    result.value = w === 'draw'
      ? { title: 'Empate', detail: 'As duas equipes caíram ao mesmo tempo.' }
      : w === mySide
        ? { title: 'Você venceu!', detail: `${props.friendName} ficou sem Pokémon de pé. Sobraram ${mine} na sua equipe.` }
        : { title: `${props.friendName} venceu`, detail: `A sua equipe ficou sem Pokémon de pé. Sobraram ${foe} na equipe dele.` };
  }, 700);
}

function frame(ts: number): void {
  raf = requestAnimationFrame(frame);
  const dt = last ? Math.min(100, ts - last) : 16;
  last = ts;
  const v = inputVector();
  const world = flip ? { dx: -v.dx, dy: -v.dy } : v;
  const switchTo = queuedSwitch;
  queuedSwitch = -1;
  let events: ArenaEvent[] = [];
  if (hostLink) events = hostLink.step(dt, { dx: world.dx, dy: world.dy, switchTo });
  else if (guestLink) {
    guestLink.sendInput({ dx: world.dx, dy: world.dy, switchTo }, ts);
    events = guestLink.events.splice(0);
    stale.value = state.winner === null && guestLink.received > 0 && ts - guestLink.lastAt > 2500;
  }
  if (events.length) handleEvents(events);
  buildScene(ts);
  if (events.length || ts - lastHud > 90) {
    lastHud = ts;
    buildHud();
  }
  if (state.winner !== null) finish();
}

function joyDown(e: PointerEvent): void {
  if (e.button > 0 || joyId !== null || !arenaEl.value) return;
  const r = arenaEl.value.getBoundingClientRect();
  joyId = e.pointerId;
  arenaEl.value.setPointerCapture(e.pointerId);
  joy.active = true;
  joy.ox = e.clientX - r.left;
  joy.oy = e.clientY - r.top;
  joy.kx = 0;
  joy.ky = 0;
}

function joyMove(e: PointerEvent): void {
  if (e.pointerId !== joyId || !arenaEl.value) return;
  const r = arenaEl.value.getBoundingClientRect();
  let dx = e.clientX - r.left - joy.ox;
  let dy = e.clientY - r.top - joy.oy;
  const len = Math.hypot(dx, dy);
  if (len > JOY_RADIUS) {
    dx = (dx / len) * JOY_RADIUS;
    dy = (dy / len) * JOY_RADIUS;
  }
  joy.kx = dx;
  joy.ky = dy;
  // Uma pequena zona morta evita andar por tremida do dedo.
  const mag = Math.min(1, len / JOY_RADIUS);
  joyVx = mag < 0.12 ? 0 : (dx / (len || 1)) * mag;
  joyVy = mag < 0.12 ? 0 : (dy / (len || 1)) * mag;
}

function joyUp(e: PointerEvent): void {
  if (e.pointerId !== joyId) return;
  joyId = null;
  joy.active = false;
  joyVx = 0;
  joyVy = 0;
}

const KEY_DIR: Record<string, keyof typeof keys> = {
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
};

function onKey(e: KeyboardEvent): void {
  const dir = KEY_DIR[e.key];
  const down = e.type === 'keydown';
  if (dir) {
    keys[dir] = down;
    e.preventDefault();
    return;
  }
  if (down && !e.repeat && e.key >= '1' && e.key <= '3') requestSwitch(Number(e.key) - 1);
}

function onBlur(): void {
  keys.up = keys.down = keys.left = keys.right = false;
}

const unitStyle = (u: Unit): Record<string, string> => ({ left: `${u.x}%`, top: `${u.y}%` });

onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);
  buildScene(performance.now());
  buildHud();
  raf = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  window.removeEventListener('blur', onBlur);
  if (resultTimer) clearTimeout(resultTimer);
  if (hurtTimer) clearTimeout(hurtTimer);
});

</script>

<template>
  <section class="svp" aria-label="Arena do PvP do Survival">
    <header class="svp-top">
      <ul class="svp-team" :aria-label="`Equipe de ${friendName}`">
        <li v-for="r in hud.foe" :key="r.index" class="svp-pip" :class="{ active: r.active, down: r.fainted }" :aria-label="`${r.name}: ${r.fainted ? 'fora de combate' : r.active ? 'em campo' : 'na reserva'}, ${r.hpPct}% de vida`">
          <img v-if="!broken.includes(r.dexId)" :src="pokemonSpriteUrl(r.dexId, r.shiny)" alt="" @error="markBroken(r.dexId)" />
          <span v-else class="svp-fallback" aria-hidden="true">{{ r.name.slice(0, 2) }}</span>
          <i class="svp-bar"><b :style="{ width: `${r.hpPct}%` }"></b></i>
        </li>
      </ul>
      <p class="svp-summary" role="status">{{ hud.summary }}</p>
    </header>

    <div
      ref="arenaEl"
      class="svp-arena"
      :class="{ hurt }"
      @pointerdown="joyDown"
      @pointermove="joyMove"
      @pointerup="joyUp"
      @pointercancel="joyUp"
    >
      <span
        v-for="b in bullets"
        :key="b.id"
        class="svp-shot"
        :class="{ mine: b.mine }"
        :style="{ left: `${b.x}%`, top: `${b.y}%`, background: b.color, width: b.size }"
      ></span>
      <span
        v-for="m in markers"
        :key="m.id"
        class="svp-marker"
        :class="{ mine: m.mine }"
        :style="{ left: `${m.x}%`, top: `${m.y}%`, color: m.color, width: m.size, '--mark-pulse': `${Math.max(0.45, m.leftMs / 1500)}s` }"
        aria-hidden="true"
      ></span>
      <div v-for="u in units" :key="u.key" class="svp-unit" :class="{ mine: u.mine, shield: u.shield }" :style="unitStyle(u)">
        <span class="svp-ring"></span>
        <img v-if="!broken.includes(u.dexId)" class="svp-sprite" :src="pokemonSpriteUrl(u.dexId, u.shiny)" :alt="u.name" draggable="false" @error="markBroken(u.dexId)" />
        <span v-else class="svp-fallback big" role="img" :aria-label="`${u.name} (sem sprite)`">{{ u.name.slice(0, 2) }}</span>
        <i class="svp-bar floating"><b :style="{ width: `${u.hpPct}%` }"></b></i>
      </div>

      <div v-if="joy.active" class="svp-joy" :style="{ left: `${joy.ox}px`, top: `${joy.oy}px` }" aria-hidden="true">
        <span class="knob" :style="{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }"></span>
      </div>

      <p v-if="hud.count > 0" class="svp-count" aria-hidden="true">{{ hud.count }}</p>
      <p v-if="hud.hint" class="svp-hint" role="status">{{ hud.hint }}</p>
      <p v-if="stale" class="svp-hint warn" role="status">Sem sinal do anfitrião há alguns segundos… a luta volta quando a conexão voltar.</p>
      <ul class="svp-toasts" aria-live="polite">
        <li v-for="t in toasts" :key="t.id" :class="t.tone">{{ t.text }}</li>
      </ul>
      <p class="svp-legend" aria-hidden="true">Seus golpes: borda branca · do amigo: borda vermelha</p>
    </div>

    <footer class="svp-bottom">
      <div class="svp-team mine" role="group" aria-label="Sua equipe: toque para trocar de Pokémon">
        <button
          v-for="r in hud.mine"
          :key="r.index"
          type="button"
          class="svp-swap"
          :class="{ active: r.active, down: r.fainted, wait: !r.active && !r.fainted && hud.switchPct > 0 }"
          :aria-pressed="r.active"
          :aria-label="`${r.index + 1}: ${r.name}, ${r.fainted ? 'fora de combate' : r.active ? 'em campo' : hud.switchPct > 0 ? `trocar em ${hud.switchSec} segundos` : 'toque para trocar'}, ${r.hpPct}% de vida`"
          @pointerdown.stop
          @click="requestSwitch(r.index)"
        >
          <img v-if="!broken.includes(r.dexId)" :src="pokemonSpriteUrl(r.dexId, r.shiny)" alt="" @error="markBroken(r.dexId)" />
          <span v-else class="svp-fallback" aria-hidden="true">{{ r.name.slice(0, 2) }}</span>
          <small class="svp-name">{{ r.index + 1 }} · {{ r.name }}</small>
          <i class="svp-bar"><b :style="{ width: `${r.hpPct}%` }"></b></i>
          <small class="svp-state">{{ r.fainted ? 'Fora' : r.active ? 'Em campo' : hud.switchPct > 0 ? `${hud.switchSec} s` : 'Trocar' }}</small>
          <span v-if="!r.active && !r.fainted && hud.switchPct > 0" class="svp-cd" :style="{ height: `${hud.switchPct}%` }" aria-hidden="true"></span>
        </button>
      </div>
    </footer>

    <div v-if="result || friendLeft" class="svp-result" role="dialog" aria-label="Fim da luta">
      <div class="svp-card">
        <h3>{{ result ? result.title : 'O amigo saiu da partida' }}</h3>
        <p>{{ result ? result.detail : 'A conexão fechou antes do fim da luta. Nenhum vencedor foi registrado.' }}</p>
        <button type="button" class="primary" @click="emit('leave')">Sair do PvP</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.svp {
  position: relative;
  display: grid;
  gap: 6px;
  width: 100%;
  user-select: none;
  -webkit-user-select: none;
}

.svp-top {
  display: grid;
  gap: 4px;
}

.svp-summary {
  margin: 0;
  text-align: center;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--muted);
}

.svp-team {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.svp-pip {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background: var(--surface-2);
}

.svp-pip.active {
  border-color: #e0524f;
}

.svp-pip.down,
.svp-swap.down {
  opacity: 0.4;
  filter: grayscale(1);
}

.svp-pip img,
.svp-swap img {
  height: 30px;
  max-width: 100%;
  object-fit: contain;
}

.svp-fallback {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--line);
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
}

.svp-fallback.big {
  width: 14cqw;
  height: 14cqw;
  font-size: 1rem;
}

.svp-bar {
  display: block;
  width: 100%;
  height: 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.svp-bar b {
  display: block;
  height: 100%;
  background: #3fae5a;
  transition: width 120ms linear;
}

.svp-bar.floating {
  position: absolute;
  left: 50%;
  top: -13cqw;
  width: 44px;
  transform: translateX(-50%);
}

.svp-arena {
  position: relative;
  width: min(100%, 430px, calc((100dvh - 190px) * 0.6667));
  min-width: min(260px, calc(100vw - 32px));
  aspect-ratio: 2 / 3;
  margin: 0 auto;
  overflow: hidden;
  touch-action: none;
  container-type: inline-size;
  border-radius: var(--radius-sm);
  border: 2px solid var(--line);
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.07) 0 22%, transparent 23%),
    linear-gradient(to bottom, rgba(224, 82, 79, 0.16) 0 50%, rgba(79, 140, 224, 0.16) 50% 100%),
    #1d2a22;
}

.svp-arena.hurt {
  box-shadow: inset 0 0 0 4px rgba(224, 82, 79, 0.75);
}

.svp-unit {
  position: absolute;
  width: 0;
  height: 0;
}

.svp-ring {
  position: absolute;
  left: 0;
  top: 0;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2px solid #e0524f;
  width: 11.25cqw;
}

.svp-unit.mine .svp-ring {
  border-color: #4f8ce0;
}

.svp-unit.shield .svp-ring {
  border-color: #ffd84a;
  box-shadow: 0 0 10px 2px rgba(255, 216, 74, 0.8);
}

.svp-sprite {
  position: absolute;
  left: 0;
  top: 0;
  height: 17.5cqw;
  max-width: 24cqw;
  object-fit: contain;
  transform: translate(-50%, -62%);
  pointer-events: none;
  image-rendering: pixelated;
}

.svp-unit .svp-fallback {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -50%);
}

.svp-shot {
  position: absolute;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2px solid #e0524f;
  pointer-events: none;
  width: 3.75cqw;
  min-width: 8px;
}

.svp-shot.mine {
  border-color: #fff;
}

.svp-marker {
  position: absolute;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border: 3px solid currentColor;
  border-radius: 50%;
  background: color-mix(in srgb, currentColor 18%, transparent);
  box-shadow: inset 0 0 18px currentColor, 0 0 12px currentColor;
  opacity: 0.78;
  pointer-events: none;
  animation: svp-marker var(--mark-pulse, 1s) ease-in-out infinite alternate;
}

.svp-marker.mine { color: #fff !important; }
@keyframes svp-marker { to { opacity: 0.24; transform: translate(-50%, -50%) scale(0.82); } }

.svp-joy {
  position: absolute;
  width: 92px;
  height: 92px;
  margin: -46px 0 0 -46px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.svp-joy .knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 38px;
  height: 38px;
  margin: -19px 0 0 -19px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
}

.svp-count {
  position: absolute;
  left: 0;
  right: 0;
  top: 32%;
  margin: 0;
  text-align: center;
  font-size: 5rem;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 3px 12px rgba(0, 0, 0, 0.7);
  pointer-events: none;
}

.svp-hint {
  position: absolute;
  left: 8px;
  right: 8px;
  top: 8px;
  margin: 0;
  padding: 6px 9px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 0.8rem;
  text-align: center;
  pointer-events: none;
}

.svp-hint.warn {
  top: auto;
  bottom: 28px;
  background: rgba(150, 70, 10, 0.8);
}

.svp-toasts {
  position: absolute;
  left: 8px;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  justify-items: center;
  pointer-events: none;
}

.svp-toasts li {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
}

.svp-toasts li.good {
  background: rgba(30, 120, 60, 0.85);
}

.svp-toasts li.bad {
  background: rgba(160, 40, 40, 0.85);
}

.svp-legend {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 4px;
  margin: 0;
  text-align: center;
  font-size: 0.66rem;
  color: rgba(255, 255, 255, 0.65);
  pointer-events: none;
}

.svp-bottom .svp-team {
  gap: 8px;
}

.svp-swap {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 2px;
  min-height: 78px;
  padding: 6px 4px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  border: 2px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  touch-action: manipulation;
}

.svp-swap.active {
  border-color: #4f8ce0;
  background: rgba(79, 140, 224, 0.18);
}

.svp-swap .svp-name {
  font-size: 0.72rem;
  font-weight: 800;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.svp-swap .svp-state {
  font-size: 0.68rem;
  color: var(--muted);
}

.svp-swap.wait {
  opacity: 0.8;
}

.svp-cd {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.svp-result {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
  z-index: 5;
}

.svp-card {
  display: grid;
  gap: 10px;
  max-width: 340px;
  padding: 18px;
  text-align: center;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1.5px solid var(--line);
}

.svp-card h3,
.svp-card p {
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .svp-bar b {
    transition: none;
  }
}
</style>
