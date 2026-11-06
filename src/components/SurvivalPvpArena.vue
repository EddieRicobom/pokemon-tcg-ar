<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import {
  aliveCount, attackSwapBlockReason, guardBlockReason, SV_ARENA_H, SV_ARENA_W, SV_ATTACK_SWAP_CD_MS, SV_GUARD_COOLDOWN_MS, SV_MON_RADIUS, SV_SWITCH_COOLDOWN_MS, switchBlockReason,
} from '../core/survivor-pvp';
import { SURVIVOR_CONE_HALF_ANGLE, survivorOrbiterHitRadius, survivorOrbiters } from '../core/survivor-shapes';
import type { ArenaEvent, ArenaSide, ArenaState, ArenaTeamState, ArenaWinner } from '../core/survivor-pvp';
import { SurvivalGuestLink, SurvivalHostLink } from '../pvp/survival-link';
import type { ArenaView } from '../pvp/survival-link';

/**
 * A arena em tempo real: o fim do PvP do Survivor (3x3) e a luta 6x6 do menu da Arena, contra um amigo ou um rival do jogo.
 * Cada celular vê o próprio Pokémon embaixo (o convidado vê o mundo girado 180°). O anfitrião roda a luta e o convidado
 * desenha o que recebe; as duas telas usam os mesmos controles: arrastar para andar e tocar num dos Pokémon de baixo para
 * trocar. Quem tem dois ataques ganha o botão de troca. Os avisos são curtos, ficam por cima da arena e nunca bloqueiam o toque.
 */
const props = withDefaults(defineProps<{ link: SurvivalHostLink | SurvivalGuestLink; friendName: string; friendLeft: boolean; leaveLabel?: string }>(), { leaveLabel: 'Sair do PvP' });
const emit = defineEmits<{ leave: []; finished: [winner: ArenaWinner, hpLeft: number[]] }>();

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
  /** Escudo do botão (a bolha dourada). */
  guard: boolean;
  /** Efeitos do golpe do rival em andamento. */
  status: string;
}
interface Orb {
  key: string;
  mine: boolean;
  x: number;
  y: number;
  color: string;
  size: string;
}
interface Fx {
  id: number;
  kind: 'cone' | 'pulse' | 'blink';
  mine: boolean;
  color: string;
  style: Record<string, string>;
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
  guardPct: number;
  guardSec: number;
  guardOn: boolean;
  /** Botão de trocar de ataque; nulo quando quem está em campo só tem um. */
  attack: { now: string; next: string; color: string; pct: number; sec: number; alt: boolean } | null;
}

const rowsOf = (team: ArenaTeamState): Row[] => team.mons.map((m, index) => ({
  index, name: m.name, dexId: m.dexId, shiny: m.shiny, hp: Math.ceil(m.hp), max: m.maxHp, hpPct: Math.round((100 * m.hp) / m.maxHp),
  active: index === team.active && m.hp > 0, fainted: m.hp <= 0,
}));

const clock = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

const hud = shallowRef<Hud>({ mine: [], foe: [], summary: '', hint: '', count: 0, switchPct: 0, switchSec: 0, guardPct: 0, guardSec: 0, guardOn: false, attack: null });
const units = shallowRef<Unit[]>([]);
const orbs = shallowRef<Orb[]>([]);
const trailDots = shallowRef<Orb[]>([]);
const fx = shallowRef<Fx[]>([]);
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
let queuedGuard = false;
let queuedAttack = false;
let fxId = 0;
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

function requestGuard(): void {
  const reason = guardBlockReason(state, mySide);
  if (reason) {
    toast(reason, 'info', 1800, `guard:${reason}`);
    return;
  }
  queuedGuard = true;
}

function requestAttackSwap(): void {
  const reason = attackSwapBlockReason(state, mySide);
  if (reason) {
    toast(reason, 'info', 1800, `attack:${reason}`);
    return;
  }
  queuedAttack = true;
}

/** Efeito curto na arena (corte do cone, pulso da aura, rastro do teleporte): some sozinho. */
function addFx(kind: Fx['kind'], mine: boolean, color: string, style: Record<string, string>, ms = 380): void {
  const id = ++fxId;
  fx.value = [...fx.value.slice(-8), { id, kind, mine, color, style }];
  setTimeout(() => (fx.value = fx.value.filter((f) => f.id !== id)), ms);
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
    } else if (e.k === 'switch') {
      const name = mons[e.index]?.name ?? 'Pokémon';
      if (e.side === mySide) toast(e.forced ? `Entrou ${name}` : `Você trocou para ${name}`, 'info', 1800, `sw:${name}`);
      else toast(`${props.friendName} trocou para ${name}`, 'info', 1800, `fsw:${name}`);
    } else if (e.k === 'attack') {
      if (e.side === mySide) {
        const mon = mons[e.index];
        if (mon) toast(`Ataque: ${TYPE_LABELS_PT[mon.attackType]}${mon.moveName ? ` · ${mon.moveName}` : ''}`, 'info', 1500, `atk:${mon.attackType}:${mon.moveCategory}`);
      } else toast(`${props.friendName} trocou de ataque`, 'info', 1500, 'foe-attack');
    } else if (e.k === 'guard') {
      toast(e.side === mySide ? 'Escudo ativo!' : `${props.friendName} ativou o escudo`, e.side === mySide ? 'good' : 'info', 1600, `guard:${e.side}`);
    } else if (e.k === 'block') {
      toast(e.side === mySide ? 'O escudo bloqueou o golpe!' : 'Golpe bloqueado pelo escudo', e.side === mySide ? 'good' : 'info', 1200, `block:${e.side}`);
    } else {
      showFx(e);
    }
  }
}

/** Efeitos de golpe de quem ataca: o desenho usa a geometria real (cone, raio da aura, caminho do teleporte). */
function showFx(e: Extract<ArenaEvent, { k: 'cone' | 'pulse' | 'blink' }>): void {
  const team = state.sides[e.side];
  const mon = team.mons[team.active];
  const color = mon ? TYPE_COLORS[mon.attackType] : '#fff';
  const mine = e.side === mySide;
  const cqw = (length: number): string => `${(length / SV_ARENA_W) * 100}cqw`;
  if (e.k === 'pulse') {
    const p = toView(team.x, team.y);
    addFx('pulse', mine, color, { left: `${(p.x / SV_ARENA_W) * 100}%`, top: `${(p.y / SV_ARENA_H) * 100}%`, width: cqw(e.radius * 2) });
  } else if (e.k === 'cone') {
    const p = toView(team.x, team.y);
    const angle = flip ? e.angle + Math.PI : e.angle;
    addFx('cone', mine, color, {
      left: `${(p.x / SV_ARENA_W) * 100}%`, top: `${(p.y / SV_ARENA_H) * 100}%`, width: cqw(e.range),
      height: cqw(2 * e.range * Math.tan(SURVIVOR_CONE_HALF_ANGLE)), transform: `translate(0, -50%) rotate(${angle}rad)`,
    }, 300);
  } else {
    const a = toView(e.x0, e.y0);
    const b = toView(e.x1, e.y1);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    addFx('blink', mine, color, {
      left: `${(a.x / SV_ARENA_W) * 100}%`, top: `${(a.y / SV_ARENA_H) * 100}%`, width: cqw(len),
      transform: `translate(0, -50%) rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`,
    }, 350);
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
    const status = `${team.burnMs > 0 ? '🔥' : ''}${team.slowMs > 0 ? '🐌' : ''}${team.stunMs > 0 ? '💫' : ''}`;
    out.push({ key: side === mySide ? 'me' : 'foe', mine: side === mySide, x: (p.x / SV_ARENA_W) * 100, y: (p.y / SV_ARENA_H) * 100, dexId: mon.dexId, shiny: mon.shiny, name: mon.name, hpPct: Math.round((100 * mon.hp) / mon.maxHp), shield: team.shieldMs > 0, guard: team.guardMs > 0, status });
  }
  units.value = out;
  // Orbitais e faixa da Trilha: as mesmas posições que decidem o dano.
  const orbOut: Orb[] = [];
  const dots: Orb[] = [];
  for (const side of [mySide, foeSide] as const) {
    const team = state.sides[side];
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0) continue;
    const mine = side === mySide;
    const color = TYPE_COLORS[mon.attackType];
    if (mon.moveCategory === 'orbit') {
      const shape = { x: view.sides[side].x, y: view.sides[side].y, shots: Math.max(1, mon.shots ?? 1), attackRadius: mon.attackRadius ?? SV_MON_RADIUS * 2, orbitAngle: team.orbitAngle };
      const size = `${((survivorOrbiterHitRadius(shape) * 1.4) / SV_ARENA_W) * 100}%`;
      survivorOrbiters(shape).forEach((o, i) => {
        const p = toView(o.x, o.y);
        orbOut.push({ key: `${side}-o${i}`, mine, x: (p.x / SV_ARENA_W) * 100, y: (p.y / SV_ARENA_H) * 100, color, size });
      });
    }
    if (mon.moveCategory === 'trilha') {
      const size = `${((Math.min(mon.attackRadius ?? SV_MON_RADIUS * 2, 36) * 2) / SV_ARENA_W) * 100}%`;
      team.trail.forEach((t, i) => {
        const p = toView(t.x, t.y);
        dots.push({ key: `${side}-t${i}`, mine, x: (p.x / SV_ARENA_W) * 100, y: (p.y / SV_ARENA_H) * 100, color, size });
      });
    }
  }
  orbs.value = orbOut;
  trailDots.value = dots;
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
  const sudden = state.timeMs > state.suddenDeathMs;
  const current = mine.mons[mine.active];
  let hint = '';
  if (state.winner !== null) hint = '';
  else if (state.countdownMs > 0) hint = 'Arraste na arena para desviar dos golpes. Toque num dos seus Pokémon, embaixo, para trocar.';
  else if (sudden) hint = 'Morte súbita: quem está em campo perde vida sozinho.';
  else if (current?.moveCategory === 'trilha') hint = mine.trailMs > 0 ? 'Trilha ativa: passe por cima do rival.' : `Ande para encher a Trilha (${Math.floor(mine.trailCharge * 100)}%).`;
  else if (state.timeMs < 9000) hint = 'Desvie dos golpes: o seu Pokémon ataca sozinho. Troque quando precisar.';
  const cd = mine.switchCdMs;
  hud.value = {
    mine: rowsOf(mine), foe: rowsOf(foe),
    summary: `Você ${aliveCount(mine)}/${mine.mons.length} de pé · ${props.friendName} ${aliveCount(foe)}/${foe.mons.length}${state.countdownMs > 0 ? '' : ` · ${clock(state.timeMs)}`}`,
    hint, count: Math.ceil(state.countdownMs / 1000),
    switchPct: cd > 0 ? Math.round((100 * cd) / SV_SWITCH_COOLDOWN_MS) : 0, switchSec: Math.ceil(cd / 1000),
    guardPct: mine.guardCdMs > 0 ? Math.round((100 * mine.guardCdMs) / SV_GUARD_COOLDOWN_MS) : 0, guardSec: Math.ceil(mine.guardCdMs / 1000), guardOn: mine.guardMs > 0,
    attack: current?.alt
      ? {
        now: `${TYPE_LABELS_PT[current.attackType]}${current.moveName ? ` · ${current.moveName}` : ''}`,
        next: `${TYPE_LABELS_PT[current.alt.attackType]} · ${current.alt.moveName}`,
        color: TYPE_COLORS[current.attackType], alt: current.altOn === true,
        pct: mine.attackSwapCdMs > 0 ? Math.round((100 * mine.attackSwapCdMs) / SV_ATTACK_SWAP_CD_MS) : 0, sec: Math.ceil(mine.attackSwapCdMs / 1000),
      }
      : null,
  };
}

function finish(): void {
  if (result.value || resultTimer) return;
  if (state.winner !== null) emit('finished', state.winner, state.sides[mySide].mons.map((m) => Math.max(0, m.hp)));
  resultTimer = setTimeout(() => {
    const mine = aliveCount(state.sides[mySide]);
    const foe = aliveCount(state.sides[foeSide]);
    const w = state.winner;
    result.value = w === 'draw'
      ? { title: 'Empate', detail: 'As duas equipes caíram ao mesmo tempo.' }
      : w === mySide
        ? { title: 'Você venceu!', detail: `${props.friendName} ficou sem Pokémon de pé. Sobraram ${mine} na sua equipe.` }
        : { title: `${props.friendName} venceu`, detail: `A sua equipe ficou sem Pokémon de pé. Sobraram ${foe} na equipe rival.` };
  }, 700);
}

function frame(ts: number): void {
  raf = requestAnimationFrame(frame);
  const dt = last ? Math.min(100, ts - last) : 16;
  last = ts;
  const v = inputVector();
  const world = flip ? { dx: -v.dx, dy: -v.dy } : v;
  const switchTo = queuedSwitch;
  const shield = queuedGuard;
  const swapAttack = queuedAttack;
  queuedSwitch = -1;
  queuedGuard = false;
  queuedAttack = false;
  let events: ArenaEvent[] = [];
  if (hostLink) events = hostLink.step(dt, { dx: world.dx, dy: world.dy, switchTo, shield, swapAttack });
  else if (guestLink) {
    guestLink.sendInput({ dx: world.dx, dy: world.dy, switchTo, shield, swapAttack }, ts);
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
  if (down && !e.repeat && e.key >= '1' && e.key <= '6') requestSwitch(Number(e.key) - 1);
  if (down && !e.repeat && (e.key === 'q' || e.key === 'Q')) requestAttackSwap();
  if (down && !e.repeat && (e.key === ' ' || e.key === 'e' || e.key === 'E')) {
    e.preventDefault();
    requestGuard();
  }
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
  <section class="svp" :class="{ six: hud.mine.length > 3 }" aria-label="Arena da luta">
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
        v-for="d in trailDots"
        :key="d.key"
        class="svp-trail"
        :class="{ mine: d.mine }"
        :style="{ left: `${d.x}%`, top: `${d.y}%`, width: d.size, color: d.color }"
        aria-hidden="true"
      ></span>
      <span
        v-for="m in markers"
        :key="m.id"
        class="svp-marker"
        :class="{ mine: m.mine }"
        :style="{ left: `${m.x}%`, top: `${m.y}%`, color: m.color, width: m.size, '--mark-pulse': `${Math.max(0.45, m.leftMs / 1500)}s` }"
        aria-hidden="true"
      ></span>
      <span
        v-for="o in orbs"
        :key="o.key"
        class="svp-orb"
        :class="{ mine: o.mine }"
        :style="{ left: `${o.x}%`, top: `${o.y}%`, width: o.size, color: o.color }"
        aria-hidden="true"
      ></span>
      <div v-for="u in units" :key="u.key" class="svp-unit" :class="{ mine: u.mine, shield: u.shield, guard: u.guard }" :style="unitStyle(u)">
        <span class="svp-bubble" aria-hidden="true"></span>
        <span class="svp-ring"></span>
        <span v-if="u.status" class="svp-status" aria-hidden="true">{{ u.status }}</span>
        <img v-if="!broken.includes(u.dexId)" class="svp-sprite" :src="pokemonSpriteUrl(u.dexId, u.shiny)" :alt="u.name" draggable="false" @error="markBroken(u.dexId)" />
        <span v-else class="svp-fallback big" role="img" :aria-label="`${u.name} (sem sprite)`">{{ u.name.slice(0, 2) }}</span>
        <i class="svp-bar floating"><b :style="{ width: `${u.hpPct}%` }"></b></i>
      </div>

      <span
        v-for="f in fx"
        :key="f.id"
        class="svp-fx"
        :class="[f.kind, { mine: f.mine }]"
        :style="{ ...f.style, color: f.color }"
        aria-hidden="true"
      ></span>

      <div v-if="joy.active" class="svp-joy" :style="{ left: `${joy.ox}px`, top: `${joy.oy}px` }" aria-hidden="true">
        <span class="knob" :style="{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }"></span>
      </div>

      <p v-if="hud.count > 0" class="svp-count" aria-hidden="true">{{ hud.count }}</p>
      <p v-if="hud.hint" class="svp-hint" role="status">{{ hud.hint }}</p>
      <p v-if="stale" class="svp-hint warn" role="status">Sem sinal do anfitrião há alguns segundos… a luta volta quando a conexão voltar.</p>
      <ul class="svp-toasts" aria-live="polite">
        <li v-for="t in toasts" :key="t.id" :class="t.tone">{{ t.text }}</li>
      </ul>
      <p class="svp-legend" aria-hidden="true">Seus golpes: borda branca · do rival: borda vermelha</p>
    </div>

    <footer class="svp-bottom">
      <button
        type="button"
        class="svp-guard"
        :class="{ on: hud.guardOn, wait: hud.guardPct > 0 && !hud.guardOn }"
        :aria-label="hud.guardOn ? 'Escudo ativo' : hud.guardPct > 0 ? `Escudo recarregando, ${hud.guardSec} segundos` : 'Escudo: toque para ficar imune por 2 segundos'"
        @pointerdown.stop
        @click="requestGuard"
      >
        <span class="svp-guard-icon" aria-hidden="true">🛡</span>
        <small>{{ hud.guardOn ? 'Ativo' : hud.guardPct > 0 ? `${hud.guardSec} s` : 'Escudo' }}</small>
        <span v-if="hud.guardPct > 0 && !hud.guardOn" class="svp-cd" :style="{ height: `${hud.guardPct}%` }" aria-hidden="true"></span>
      </button>
      <button
        v-if="hud.attack"
        type="button"
        class="svp-guard svp-attack"
        :class="{ alt: hud.attack.alt, wait: hud.attack.pct > 0 }"
        :style="{ '--attack-color': hud.attack.color }"
        :aria-label="`Ataque em uso: ${hud.attack.now}. Toque para trocar para ${hud.attack.next}`"
        @pointerdown.stop
        @click="requestAttackSwap"
      >
        <span class="svp-guard-icon" aria-hidden="true">⇄</span>
        <small>{{ hud.attack.pct > 0 ? `${hud.attack.sec} s` : hud.attack.alt ? 'Secund.' : 'Principal' }}</small>
        <small class="svp-attack-now">{{ hud.attack.now }}</small>
        <span v-if="hud.attack.pct > 0" class="svp-cd" :style="{ height: `${hud.attack.pct}%` }" aria-hidden="true"></span>
      </button>
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
        <slot v-if="result" name="result"></slot>
        <button type="button" class="primary" @click="emit('leave')">{{ leaveLabel }}</button>
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
  /* Estádio: gramado listrado, linha do meio, círculo central e uma luz da cor de cada lado. */
  background:
    radial-gradient(circle at 50% 50%, transparent 0 17.6%, rgba(255, 255, 255, 0.5) 17.6% 18.4%, transparent 18.4%),
    linear-gradient(to bottom, transparent calc(50% - 1px), rgba(255, 255, 255, 0.5) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)),
    radial-gradient(ellipse at 50% 100%, rgba(79, 140, 224, 0.34), transparent 58%),
    radial-gradient(ellipse at 50% 0%, rgba(224, 82, 79, 0.34), transparent 58%),
    repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 0 8.33%, transparent 8.33% 16.66%),
    linear-gradient(to bottom, #2e5a3c, #1f4130);
  box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.12), inset 0 0 46px rgba(0, 0, 0, 0.55);
}

/* Áreas de cada lado, como num campo de verdade. */
.svp-arena::before,
.svp-arena::after {
  content: '';
  position: absolute;
  left: 22%;
  right: 22%;
  height: 12%;
  border: 2px solid rgba(255, 255, 255, 0.32);
  pointer-events: none;
}

.svp-arena::before {
  top: -2px;
  border-top: 0;
  border-radius: 0 0 14px 14px;
}

.svp-arena::after {
  bottom: -2px;
  border-bottom: 0;
  border-radius: 14px 14px 0 0;
}

.svp-arena.hurt {
  box-shadow: inset 0 0 0 4px rgba(224, 82, 79, 0.75), inset 0 0 46px rgba(0, 0, 0, 0.55);
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

/* Escudo do botão: bolha dourada em volta do Pokémon enquanto durar. */
.svp-bubble {
  display: none;
  position: absolute;
  left: 0;
  top: 0;
  width: 19cqw;
  aspect-ratio: 1;
  transform: translate(-50%, -58%);
  border-radius: 50%;
  border: 3px solid rgba(255, 224, 120, 0.95);
  background: radial-gradient(circle, rgba(255, 240, 170, 0.12), rgba(255, 210, 80, 0.38));
  box-shadow: 0 0 16px 4px rgba(255, 210, 80, 0.7);
  pointer-events: none;
  animation: svp-bubble 0.5s ease-in-out infinite alternate;
}

.svp-unit.guard .svp-bubble {
  display: block;
}

@keyframes svp-bubble {
  to { opacity: 0.7; transform: translate(-50%, -58%) scale(1.06); }
}

.svp-status {
  position: absolute;
  left: 0;
  top: -19cqw;
  transform: translateX(-50%);
  font-size: 0.8rem;
  pointer-events: none;
}

.svp-orb,
.svp-trail {
  position: absolute;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: none;
}

.svp-orb {
  background: radial-gradient(circle, #fff 0 22%, currentColor 55%, transparent 72%);
  box-shadow: 0 0 10px currentColor;
}

.svp-trail {
  background: color-mix(in srgb, currentColor 38%, transparent);
  box-shadow: 0 0 8px currentColor;
  opacity: 0.8;
}

.svp-fx {
  position: absolute;
  pointer-events: none;
}

.svp-fx.pulse {
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 3px solid currentColor;
  background: color-mix(in srgb, currentColor 16%, transparent);
  animation: svp-fx-pulse 0.38s ease-out forwards;
}

.svp-fx.cone {
  transform-origin: 0 50%;
  background: linear-gradient(90deg, color-mix(in srgb, currentColor 80%, transparent), transparent);
  clip-path: polygon(0 50%, 100% 0, 100% 100%);
  animation: svp-fx-fade 0.3s ease-out forwards;
}

.svp-fx.blink {
  height: 4px;
  transform-origin: 0 50%;
  background: currentColor;
  box-shadow: 0 0 12px currentColor;
  animation: svp-fx-fade 0.35s ease-out forwards;
}

@keyframes svp-fx-pulse {
  from { opacity: 0.95; scale: 0.3; }
  to { opacity: 0; scale: 1; }
}

@keyframes svp-fx-fade {
  from { opacity: 0.95; }
  to { opacity: 0; }
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

.svp-bottom {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.svp-bottom .svp-team {
  flex: 1;
  gap: 8px;
}

/* Seis de cada lado: a fila do rival vira uma linha só, e a sua, duas linhas de três com botões mais baixos. */
.svp.six .svp-top .svp-team {
  grid-template-columns: repeat(6, 1fr);
}

.svp.six .svp-pip img {
  height: 22px;
}

.svp.six .svp-bottom .svp-team {
  gap: 4px;
}

.svp.six .svp-swap {
  align-items: center;
  gap: 3px;
  min-height: 44px;
  padding: 3px 4px;
}

.svp.six .svp-swap img {
  height: 26px;
}

.svp.six .svp-swap .svp-name,
.svp.six .svp-swap .svp-state {
  display: none;
}

.svp.six .svp-swap.active {
  box-shadow: inset 0 -3px 0 #4f8ce0;
}

.svp-attack {
  border-color: var(--attack-color, #fff);
  max-width: 76px;
}

.svp-attack.wait {
  opacity: 0.75;
}

.svp-attack-now {
  max-width: 68px;
  overflow: hidden;
  font-size: 0.62rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.svp-guard {
  position: relative;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 2px;
  min-width: 64px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  border: 2px solid #d8b84a;
  background: rgba(216, 184, 74, 0.18);
  color: var(--text);
  font: inherit;
  touch-action: manipulation;
}

.svp-guard-icon {
  font-size: 1.6rem;
  line-height: 1;
}

.svp-guard small {
  font-size: 0.68rem;
  font-weight: 800;
}

.svp-guard.on {
  background: rgba(255, 216, 74, 0.5);
  box-shadow: 0 0 12px rgba(255, 216, 74, 0.8);
}

.svp-guard.wait {
  border-color: var(--line);
  background: var(--surface-2);
  opacity: 0.85;
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
