<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import AttackIcon from './AttackIcon.vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { effectiveVisual } from '../app/visual-settings';
import type { SurvivorFx } from '../core/survivor';
import { MOVE_CATEGORY_LABELS_PT } from '../core/survivor-moves';
import type { MoveCategory } from '../core/survivor-moves';
import { TYPE_GLYPHS } from '../core/type-glyphs';
import { drawElementAuraField, drawElementFx, drawElementOrbiter, drawElementProjectile, drawOrbitPath } from '../village/survivor-attack-art';
import type { ScreenPoint } from '../village/survivor-attack-art';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import {
  aliveCount, arenaCameraTarget, attackSwapBlockReason, guardBlockReason, offscreenPointer, SV_ARENA_H, SV_ARENA_W, SV_ATTACK_SWAP_CD_MS, SV_GUARD_COOLDOWN_MS, SV_MON_RADIUS, SV_SWITCH_COOLDOWN_MS, SV_VIEW_H, SV_VIEW_W, switchBlockReason,
} from '../core/survivor-pvp';
import { SURVIVOR_CONE_HALF_ANGLE } from '../core/survivor-shapes';
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
  /** Acabou de levar um golpe (pisca). */
  hit: boolean;
  /** O rival está à direita: o sprite, que olha para a esquerda, vira para ele. */
  faceRight: boolean;
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
  kind: 'blink' | 'dmg';
  /** Número do dano (só no `dmg`). */
  text?: string;
  mine: boolean;
  color: string;
  style: Record<string, string>;
}
/** Linha do Foco marcada no chão (ou o clarão do feixe saindo), em coordenadas do campo. */
interface BeamMark {
  mine: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  type: PokemonType;
  born: number;
  lifeMs: number;
  fired: boolean;
}
/** Marca do golpe desenhada na tela de arte (a mesma arte elemental do Survivor), em coordenadas do campo. */
interface ArtFx {
  fx: SurvivorFx;
  born: number;
}
interface AttackFace {
  type: PokemonType;
  glyph: string;
  typeLabel: string;
  category: MoveCategory;
  categoryLabel: string;
  name: string;
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
  /** Barra de carga do Foco/Trilha do seu Pokémon em campo. */
  charge: { label: string; pct: number } | null;
  attack: { now: AttackFace; next: AttackFace; color: string; pct: number; sec: number; alt: boolean } | null;
}

const rowsOf = (team: ArenaTeamState): Row[] => team.mons.map((m, index) => ({
  index, name: m.name, dexId: m.dexId, shiny: m.shiny, hp: Math.ceil(m.hp), max: m.maxHp, hpPct: Math.round((100 * m.hp) / m.maxHp),
  active: index === team.active && m.hp > 0, fainted: m.hp <= 0,
}));

const attackFace = (type: PokemonType, category: MoveCategory | undefined, name: string | undefined): AttackFace => ({
  type, glyph: TYPE_GLYPHS[type], typeLabel: TYPE_LABELS_PT[type], category: category ?? 'projetil', categoryLabel: MOVE_CATEGORY_LABELS_PT[category ?? 'projetil'], name: name ?? 'Golpe',
});

const clock = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

const hud = shallowRef<Hud>({ mine: [], foe: [], summary: '', hint: '', count: 0, switchPct: 0, switchSec: 0, guardPct: 0, guardSec: 0, guardOn: false, charge: null, attack: null });
const units = shallowRef<Unit[]>([]);
const trailDots = shallowRef<Orb[]>([]);
const fx = shallowRef<Fx[]>([]);
const artCanvas = ref<HTMLCanvasElement | null>(null);
let artFx: ArtFx[] = [];
let beamMarks: BeamMark[] = [];
/** Última posição e direção de cada disparo: o rastro da arte segue o caminho que ele fez. */
const shotTrack = new Map<number, { x: number; y: number; dx: number; dy: number }>();
const markers = shallowRef<Marker[]>([]);
const floorStyle = shallowRef<Record<string, string>>({});
const pointer = shallowRef<{ x: number; y: number; angle: number } | null>(null);
/** Canto do campo que a tela mostra agora. */
let camera = { x: 0, y: 0 };
let cameraAt = 0;
let cameraReady = false;
/** Quando cada lado levou o último golpe (para a piscada). */
const hitAt: [number, number] = [-Infinity, -Infinity];
const broken = ref<number[]>([]);
const hurt = ref(false);
const stale = ref(false);
const toasts = ref<{ id: number; text: string; tone: 'good' | 'bad' | 'info' }[]>([]);
const result = ref<{ title: string; detail: string } | null>(null);
/** Placar de cada Pokémon seu no fim (só onde a luta rodou; o convidado do PvP não recebe esses números). */
const scoreboard = ref<{ name: string; dexId: number; shiny: boolean; dealt: number; kos: number; mvp: boolean; fainted: boolean }[]>([]);
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
function addFx(kind: Fx['kind'], mine: boolean, color: string, style: Record<string, string>, ms = 380, text?: string): void {
  const id = ++fxId;
  fx.value = [...fx.value.slice(-12), { id, kind, mine, color, style, ...(text ? { text } : {}) }];
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
      hitAt[e.side] = performance.now();
      showDamage(e.side, e.damage, e.mult);
      const striker = state.sides[e.side === 0 ? 1 : 0];
      const strike = striker.mons[striker.active];
      if (strike && e.damage > 0) addArtFx('blast', state.sides[e.side].x, state.sides[e.side].y, 34, strike.attackType, 420);
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
        if (mon) toast(`${TYPE_GLYPHS[mon.attackType]} Ataque: ${TYPE_LABELS_PT[mon.attackType]}${mon.moveName ? ` · ${mon.moveName}` : ''}`, 'info', 1500, `atk:${mon.attackType}:${mon.moveCategory}`);
      } else toast(`${props.friendName} trocou de ataque`, 'info', 1500, 'foe-attack');
    } else if (e.k === 'guard') {
      toast(e.side === mySide ? 'Escudo ativo!' : `${props.friendName} ativou o escudo`, e.side === mySide ? 'good' : 'info', 1600, `guard:${e.side}`);
    } else if (e.k === 'block') {
      toast(e.side === mySide ? 'O escudo bloqueou o golpe!' : 'Golpe bloqueado pelo escudo', e.side === mySide ? 'good' : 'info', 1200, `block:${e.side}`);
    } else if (e.k === 'beam') {
      showBeam(e);
    } else {
      showFx(e);
    }
  }
}

/** Número do dano subindo de quem levou o golpe: amarelo no super efetivo, cinza no pouco efetivo. */
function showDamage(side: ArenaSide, damage: number, mult: number): void {
  const team = state.sides[side];
  const p = toView(team.x, team.y);
  const color = mult === 0 ? '#9aa3b2' : mult > 1 ? '#ffd166' : mult < 1 ? '#c7ccd6' : '#ffffff';
  const jitter = ((fxId * 37) % 9) - 4;
  addFx('dmg', side !== mySide, color, { left: `${((p.x + jitter) / SV_VIEW_W) * 100}%`, top: `${((p.y - 26) / SV_VIEW_H) * 100}%` }, 700, mult === 0 ? '0' : String(damage));
}

/** Marca na tela de arte: nasce agora e some sozinha quando passa a vida. */
function addArtFx(kind: SurvivorFx['kind'], x: number, y: number, r: number, type: PokemonType, lifeMs: number, extra: Partial<SurvivorFx> = {}): void {
  artFx = [...artFx.slice(-14), { born: performance.now(), fx: { kind, x, y, r, color: TYPE_COLORS[type], ageMs: 0, lifeMs, moveType: type, ...extra } }];
}

/** Foco: a linha marcada fica até o feixe sair; quando sai, vira um clarão curto. */
function showBeam(e: Extract<ArenaEvent, { k: 'beam' }>): void {
  const team = state.sides[e.side];
  const type: PokemonType = team.mons[team.active]?.attackType ?? 'normal';
  const mine = e.side === mySide;
  const now = performance.now();
  if (e.leftMs > 0) {
    beamMarks = [...beamMarks.filter((b) => b.mine !== mine || b.fired), { mine, x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, width: e.width, type, born: now, lifeMs: e.leftMs, fired: false }];
    if (!mine) toast('Feixe marcado: saia da linha!', 'bad', 1600, `beam:${e.side}`);
  } else {
    beamMarks = [...beamMarks.filter((b) => b.mine !== mine || b.fired), { mine, x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, width: e.width, type, born: now, lifeMs: 380, fired: true }];
  }
}

/** Efeitos de golpe de quem ataca: a mesma arte elemental do Survivor, sobre a geometria real (cone, raio da aura); o teleporte é um traço. */
function showFx(e: Extract<ArenaEvent, { k: 'cone' | 'pulse' | 'blink' }>): void {
  const team = state.sides[e.side];
  const mon = team.mons[team.active];
  const type: PokemonType = mon?.attackType ?? 'normal';
  const color = TYPE_COLORS[type];
  if (e.k === 'pulse') addArtFx('pulse', team.x, team.y, e.radius, type, 460);
  else if (e.k === 'cone') addArtFx('cone', team.x, team.y, e.range, type, 420, { angle: e.angle, spread: SURVIVOR_CONE_HALF_ANGLE });
  else {
    const a = toView(e.x0, e.y0);
    const b = toView(e.x1, e.y1);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    addFx('blink', e.side === mySide, color, {
      left: `${(a.x / SV_VIEW_W) * 100}%`, top: `${(a.y / SV_VIEW_H) * 100}%`, width: `${(len / SV_VIEW_W) * 100}cqw`,
      transform: `translate(0, -50%) rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`,
    }, 350);
  }
}

/** No campo, do ponto de vista de quem joga (o convidado vê girado). */
const toField = (x: number, y: number): { x: number; y: number } => (flip ? { x: SV_ARENA_W - x, y: SV_ARENA_H - y } : { x, y });

/** Do campo para a tela: a câmera segue o seu Pokémon. */
function toView(x: number, y: number): { x: number; y: number } {
  const p = toField(x, y);
  return { x: p.x - camera.x, y: p.y - camera.y };
}

function buildScene(now: number): void {
  const view: ArenaView = hostLink
    ? {
      sides: [{ x: state.sides[0].x, y: state.sides[0].y }, { x: state.sides[1].x, y: state.sides[1].y }],
      shots: state.shots.map((s) => ({ id: s.id, side: s.side, x: s.x, y: s.y, type: s.type, radius: s.radius })),
      markers: state.markers.map((m) => ({ id: m.id, side: m.side, x: m.x, y: m.y, radius: m.radius, type: m.type, leftMs: m.leftMs })),
    }
    : (guestLink as SurvivalGuestLink).view(now);
  const me = toField(view.sides[mySide].x, view.sides[mySide].y);
  // A câmera desliza até o alvo em vez de pular: segue quem joga e puxa um pouco para o rival.
  const target = arenaCameraTarget(me, toField(view.sides[foeSide].x, view.sides[foeSide].y));
  const follow = cameraReady ? 1 - Math.exp(-Math.min(100, now - cameraAt) / 140) : 1;
  camera = { x: camera.x + (target.x - camera.x) * follow, y: camera.y + (target.y - camera.y) * follow };
  cameraAt = now;
  cameraReady = true;
  floorStyle.value = { transform: `translate(${(-camera.x / SV_ARENA_W) * 100}%, ${(-camera.y / SV_ARENA_H) * 100}%)` };
  const foeAt = toView(view.sides[foeSide].x, view.sides[foeSide].y);
  pointer.value = offscreenPointer(foeAt.x, foeAt.y);
  const out: Unit[] = [];
  for (const side of [mySide, foeSide] as const) {
    const team = state.sides[side];
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0) continue;
    const p = toView(view.sides[side].x, view.sides[side].y);
    const status = `${team.burnMs > 0 ? '🔥' : ''}${team.slowMs > 0 ? '🐌' : ''}${team.stunMs > 0 ? '💫' : ''}`;
    const other = toView(view.sides[side === mySide ? foeSide : mySide].x, view.sides[side === mySide ? foeSide : mySide].y);
    out.push({ hit: now - hitAt[side] < 140, faceRight: other.x > p.x + 2, key: side === mySide ? 'me' : 'foe', mine: side === mySide, x: (p.x / SV_VIEW_W) * 100, y: (p.y / SV_VIEW_H) * 100, dexId: mon.dexId, shiny: mon.shiny, name: mon.name, hpPct: Math.round((100 * mon.hp) / mon.maxHp), shield: team.shieldMs > 0, guard: team.guardMs > 0, status });
  }
  units.value = out;
  // Faixa da Trilha: os mesmos pontos que decidem o dano.
  const dots: Orb[] = [];
  for (const side of [mySide, foeSide] as const) {
    const team = state.sides[side];
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0 || mon.moveCategory !== 'trilha') continue;
    const color = TYPE_COLORS[mon.attackType];
    const size = `${((Math.min(mon.attackRadius ?? SV_MON_RADIUS * 2, 36) * 2) / SV_VIEW_W) * 100}%`;
    team.trail.forEach((t, i) => {
      const p = toView(t.x, t.y);
      dots.push({ key: `${side}-t${i}`, mine: side === mySide, x: (p.x / SV_VIEW_W) * 100, y: (p.y / SV_VIEW_H) * 100, color, size });
    });
  }
  trailDots.value = dots;
  markers.value = view.markers.map((m) => {
    const p = toView(m.x, m.y);
    return { id: m.id, mine: m.side === mySide, x: (p.x / SV_VIEW_W) * 100, y: (p.y / SV_VIEW_H) * 100, color: TYPE_COLORS[m.type], size: `${(m.radius * 2 / SV_VIEW_W) * 100}%`, leftMs: m.leftMs };
  });
  drawArt(now, view);
}

/** Linha do Foco: faixa pulsando que enche até o disparo; o clarão do feixe é largo, claro e some rápido. */
function drawBeam(ctx: CanvasRenderingContext2D, b: BeamMark, map: (x: number, y: number, z?: number) => ScreenPoint, k: number, now: number): void {
  const a = map(b.x0, b.y0, 4);
  const e = map(b.x1, b.y1, 4);
  const len = Math.hypot(e.x - a.x, e.y - a.y);
  if (len < 1) return;
  const ux = (e.x - a.x) / len;
  const uy = (e.y - a.y) / len;
  const half = b.width * k;
  const color = TYPE_COLORS[b.type];
  const age = now - b.born;
  const poly = (grow: number, w: number): void => {
    const cx = a.x + ux * len * grow;
    const cy = a.y + uy * len * grow;
    ctx.beginPath();
    ctx.moveTo(a.x - uy * w, a.y + ux * w);
    ctx.lineTo(cx - uy * w, cy + ux * w);
    ctx.lineTo(cx + uy * w, cy - ux * w);
    ctx.lineTo(a.x + uy * w, a.y - ux * w);
    ctx.closePath();
  };
  ctx.save();
  if (b.fired) {
    const t = Math.min(1, age / b.lifeMs);
    ctx.globalAlpha = 0.55 * (1 - t);
    ctx.fillStyle = color;
    poly(1, half * (1.2 - 0.4 * t));
    ctx.fill();
    ctx.globalAlpha = 0.95 * (1 - t);
    ctx.fillStyle = '#ffffff';
    poly(1, half * 0.45 * (1 - t * 0.6));
    ctx.fill();
  } else {
    const fill = Math.min(1, age / b.lifeMs);
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);
    ctx.globalAlpha = 0.14 + 0.1 * pulse;
    ctx.fillStyle = color;
    poly(1, half);
    ctx.fill();
    ctx.globalAlpha = 0.25 + 0.4 * fill;
    poly(fill, half * 0.55);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = b.mine ? '#ffffff' : '#ff6b63';
    poly(1, half);
    ctx.stroke();
  }
  ctx.restore();
}

/** Tela de arte: disparos, órbitas, aura e marcas de golpe com a arte elemental do Survivor (chama, gota, faísca…). */
function drawArt(now: number, view: ArenaView): void {
  const canvas = artCanvas.value;
  const host = arenaEl.value;
  if (!canvas || !host || !host.clientWidth) return;
  const w = host.clientWidth;
  const h = (w * SV_VIEW_H) / SV_VIEW_W;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const k = w / SV_VIEW_W;
  const map = (x: number, y: number, z = 0): ScreenPoint => {
    const p = toView(x, y);
    return { x: p.x * k, y: p.y * k - z * k * 0.5, s: k };
  };
  const detailed = !effectiveVisual.value.rotomMode;
  for (const side of [mySide, foeSide] as const) {
    const team = state.sides[side];
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0) continue;
    const at = { x: view.sides[side].x, y: view.sides[side].y };
    if (mon.moveCategory === 'aura') drawElementAuraField(ctx, { ...at, attackRadius: mon.attackRadius ?? SV_MON_RADIUS * 2 }, mon.attackType, map, now, detailed);
    else if (mon.moveCategory === 'orbit') {
      const shape = { ...at, shots: Math.max(1, mon.shots ?? 1), attackRadius: mon.attackRadius ?? SV_MON_RADIUS * 2, orbitAngle: team.orbitAngle };
      drawOrbitPath(ctx, shape, mon.attackType, map);
      for (let i = 0; i < shape.shots; i++) drawElementOrbiter(ctx, shape, mon.attackType, map, i, now, detailed);
    }
  }
  beamMarks = beamMarks.filter((b) => now - b.born < b.lifeMs + (b.fired ? 0 : 400));
  for (const b of beamMarks) drawBeam(ctx, b, map, k, now);
  const seen = new Set<number>();
  for (const s of view.shots) {
    seen.add(s.id);
    const before = shotTrack.get(s.id);
    let dx = before?.dx ?? 0;
    let dy = before?.dy ?? (s.side === 0 ? -1 : 1);
    if (before && Math.hypot(s.x - before.x, s.y - before.y) > 0.4) {
      const len = Math.hypot(s.x - before.x, s.y - before.y);
      dx = (s.x - before.x) / len;
      dy = (s.y - before.y) / len;
    }
    shotTrack.set(s.id, { x: s.x, y: s.y, dx, dy });
    const head = map(s.x, s.y, 10);
    const tail = map(s.x - dx * 16, s.y - dy * 16, 10);
    const size = Math.max(3, Math.min(14, s.radius * k * 0.9));
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = s.side === mySide ? '#ffffff' : '#e0524f';
    ctx.beginPath();
    ctx.arc(head.x, head.y, size * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawElementProjectile(ctx, s.type, head, tail, size, 1, now, detailed, s.id);
  }
  for (const id of shotTrack.keys()) if (!seen.has(id)) shotTrack.delete(id);
  artFx = artFx.filter((a) => now - a.born < a.fx.lifeMs);
  for (const a of artFx) {
    a.fx.ageMs = now - a.born;
    drawElementFx(ctx, a.fx, map, now, detailed);
  }
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
  else if (current?.moveCategory === 'foco') hint = mine.focusCharge > 0 && !state.beams.some((b) => b.side === mySide) ? `Foco carregando (${Math.floor(mine.focusCharge * 100)}%): a linha é marcada antes do feixe.` : '';
  else if (state.timeMs < 9000) hint = 'Desvie dos golpes: o seu Pokémon ataca sozinho. Troque quando precisar.';
  const cd = mine.switchCdMs;
  hud.value = {
    mine: rowsOf(mine), foe: rowsOf(foe),
    summary: `Você ${aliveCount(mine)}/${mine.mons.length} de pé · ${props.friendName} ${aliveCount(foe)}/${foe.mons.length}${state.countdownMs > 0 ? '' : ` · ${clock(state.timeMs)}`}`,
    charge: current?.moveCategory === 'foco' ? { label: 'Foco', pct: Math.round(mine.focusCharge * 100) } : current?.moveCategory === 'trilha' && mine.trailMs <= 0 ? { label: 'Trilha', pct: Math.round(mine.trailCharge * 100) } : null,
    hint, count: Math.ceil(state.countdownMs / 1000),
    switchPct: cd > 0 ? Math.round((100 * cd) / SV_SWITCH_COOLDOWN_MS) : 0, switchSec: Math.ceil(cd / 1000),
    guardPct: mine.guardCdMs > 0 ? Math.round((100 * mine.guardCdMs) / SV_GUARD_COOLDOWN_MS) : 0, guardSec: Math.ceil(mine.guardCdMs / 1000), guardOn: mine.guardMs > 0,
    attack: current?.alt
      ? {
        now: attackFace(current.attackType, current.moveCategory, current.moveName),
        next: attackFace(current.alt.attackType, current.alt.moveCategory, current.alt.moveName),
        color: TYPE_COLORS[current.attackType], alt: current.altOn === true,
        pct: mine.attackSwapCdMs > 0 ? Math.round((100 * mine.attackSwapCdMs) / SV_ATTACK_SWAP_CD_MS) : 0, sec: Math.ceil(mine.attackSwapCdMs / 1000),
      }
      : null,
  };
}

function finish(): void {
  if (result.value || resultTimer) return;
  if (state.winner !== null) emit('finished', state.winner, state.sides[mySide].mons.map((m) => Math.max(0, m.hp)));
  if (hostLink) {
    const mons = state.sides[mySide].mons;
    const best = Math.max(0, ...mons.map((m) => m.dealt ?? 0));
    scoreboard.value = mons.map((m) => ({ name: m.name, dexId: m.dexId, shiny: m.shiny, dealt: Math.round(m.dealt ?? 0), kos: m.kos ?? 0, mvp: best > 0 && (m.dealt ?? 0) === best, fainted: m.hp <= 0 }));
  }
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
  <section class="svp" :class="{ six: hud.mine.length > 3 }" :style="{ '--svp-field-scale': SV_ARENA_W / SV_VIEW_W }" aria-label="Arena da luta">
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
      <div class="svp-floor" :style="floorStyle" aria-hidden="true"></div>
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
      <div v-for="u in units" :key="u.key" class="svp-unit" :class="{ mine: u.mine, shield: u.shield, guard: u.guard, hit: u.hit, 'face-right': u.faceRight }" :style="unitStyle(u)">
        <span class="svp-bubble" aria-hidden="true"></span>
        <span class="svp-ring"></span>
        <span v-if="u.status" class="svp-status" aria-hidden="true">{{ u.status }}</span>
        <img v-if="!broken.includes(u.dexId)" class="svp-sprite" :src="pokemonSpriteUrl(u.dexId, u.shiny)" :alt="u.name" draggable="false" @error="markBroken(u.dexId)" />
        <span v-else class="svp-fallback big" role="img" :aria-label="`${u.name} (sem sprite)`">{{ u.name.slice(0, 2) }}</span>
        <i class="svp-bar floating"><b :style="{ width: `${u.hpPct}%` }"></b></i>
      </div>

      <canvas ref="artCanvas" class="svp-art" aria-hidden="true"></canvas>

      <span
        v-for="f in fx"
        :key="f.id"
        class="svp-fx"
        :class="[f.kind, { mine: f.mine }]"
        :style="{ ...f.style, color: f.color }"
        aria-hidden="true"
      >{{ f.text }}</span>

      <div v-if="joy.active" class="svp-joy" :style="{ left: `${joy.ox}px`, top: `${joy.oy}px` }" aria-hidden="true">
        <span class="knob" :style="{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }"></span>
      </div>

      <span
        v-if="pointer"
        class="svp-pointer"
        :style="{ left: `${(pointer.x / SV_VIEW_W) * 100}%`, top: `${(pointer.y / SV_VIEW_H) * 100}%`, transform: `translate(-50%, -50%) rotate(${pointer.angle}rad)` }"
        aria-hidden="true"
      >➤</span>

      <div v-if="hud.charge" class="svp-charge" aria-hidden="true"><small>{{ hud.charge.label }} {{ hud.charge.pct }}%</small><i class="svp-bar"><b :style="{ width: `${hud.charge.pct}%` }"></b></i></div>
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
        :aria-label="`Ataque em uso: ${hud.attack.now.typeLabel}, ${hud.attack.now.categoryLabel}, ${hud.attack.now.name}. Toque para trocar para ${hud.attack.next.typeLabel}, ${hud.attack.next.categoryLabel}, ${hud.attack.next.name}`"
        @pointerdown.stop
        @click="requestAttackSwap"
      >
        <span class="svp-atk-pair" aria-hidden="true">
          <span class="svp-atk on" :style="{ '--c': TYPE_COLORS[hud.attack.now.type] }" :title="`${hud.attack.now.typeLabel} · ${hud.attack.now.categoryLabel}`">
            <b>{{ hud.attack.now.glyph }}</b><AttackIcon :category="hud.attack.now.category" :size="18" />
          </span>
          <span class="svp-atk-arrow">⇄</span>
          <span class="svp-atk" :style="{ '--c': TYPE_COLORS[hud.attack.next.type] }" :title="`${hud.attack.next.typeLabel} · ${hud.attack.next.categoryLabel}`">
            <b>{{ hud.attack.next.glyph }}</b><AttackIcon :category="hud.attack.next.category" :size="18" />
          </span>
        </span>
        <small class="svp-attack-now">{{ hud.attack.now.name }}</small>
        <small>{{ hud.attack.pct > 0 ? `${hud.attack.sec} s` : 'Toque: trocar' }}</small>
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
        <ul v-if="result && scoreboard.length" class="svp-score">
          <li v-for="row in scoreboard" :key="row.name + row.dexId" :class="{ mvp: row.mvp, down: row.fainted }">
            <img v-if="!broken.includes(row.dexId)" :src="pokemonSpriteUrl(row.dexId, row.shiny)" alt="" @error="markBroken(row.dexId)" />
            <span>{{ row.name }}<small v-if="row.mvp">Destaque</small></span>
            <em>{{ row.dealt }} de dano · {{ row.kos }} {{ row.kos === 1 ? 'nocaute' : 'nocautes' }}</em>
          </li>
        </ul>
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
  min-width: 0;
  max-width: 100%;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  background: #1f4130;
}

/* O campo inteiro, maior que a tela: anda ao contrário do Pokémon, e a borda dele é a parede da arena. */
.svp-floor {
  position: absolute;
  top: 0;
  left: 0;
  width: calc(var(--svp-field-scale) * 100%);
  height: calc(var(--svp-field-scale) * 100%);
  pointer-events: none;
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
.svp-floor::before,
.svp-floor::after {
  content: '';
  position: absolute;
  left: 22%;
  right: 22%;
  height: 12%;
  border: 2px solid rgba(255, 255, 255, 0.32);
  pointer-events: none;
}

.svp-floor::before {
  top: 0;
  border-top: 0;
  border-radius: 0 0 14px 14px;
}

.svp-floor::after {
  bottom: 0;
  border-bottom: 0;
  border-radius: 14px 14px 0 0;
}

.svp-arena.hurt {
  outline: 4px solid rgba(224, 82, 79, 0.75);
  outline-offset: -4px;
}

.svp-pointer {
  position: absolute;
  z-index: 3;
  color: #ff6b63;
  font-size: 7cqw;
  line-height: 1;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
  pointer-events: none;
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

.svp-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.svp-trail {
  position: absolute;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: none;
}

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

.svp-fx.dmg {
  transform: translate(-50%, -50%);
  font-size: 5.4cqw;
  font-weight: 900;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.75), 0 0 6px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
  animation: svp-dmg-rise 0.7s ease-out forwards;
}

@keyframes svp-dmg-rise {
  0% { opacity: 0; margin-top: 4cqw; }
  15% { opacity: 1; }
  100% { opacity: 0; margin-top: -6cqw; }
}

.svp-unit.hit .svp-sprite {
  filter: brightness(2.4) saturate(0.4);
}

.svp-unit.face-right .svp-sprite {
  transform: translate(-50%, -62%) scaleX(-1);
}

.svp-score {
  display: grid;
  gap: 4px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  text-align: left;
}

.svp-score li {
  display: grid;
  grid-template-columns: 32px 1fr;
  grid-template-rows: auto auto;
  column-gap: 8px;
  align-items: center;
  padding: 3px 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.svp-score li.mvp {
  background: rgba(255, 209, 102, 0.16);
  box-shadow: inset 0 0 0 1px rgba(255, 209, 102, 0.6);
}

.svp-score li.down {
  opacity: 0.65;
}

.svp-score img {
  grid-row: span 2;
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.svp-score span {
  font-weight: 800;
  font-size: 0.85rem;
}

.svp-score small {
  margin-left: 6px;
  color: #ffd166;
  font-size: 0.7rem;
}

.svp-score em {
  font-size: 0.75rem;
  font-style: normal;
  opacity: 0.85;
}

@media (prefers-reduced-motion: reduce) {
  .svp-fx.dmg { animation-duration: 0.01s; }
}

.svp-fx.blink {
  height: 4px;
  transform-origin: 0 50%;
  background: currentColor;
  box-shadow: 0 0 12px currentColor;
  animation: svp-fx-fade 0.35s ease-out forwards;
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

.svp-charge {
  position: absolute;
  left: 8px;
  bottom: 22px;
  width: 30cqw;
  display: grid;
  gap: 2px;
  pointer-events: none;
  color: #fff;
  font-weight: 800;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
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
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}

/* Escudo e troca de ataque dividem a primeira linha; a equipe ocupa a linha de baixo, sem estourar a largura. */
.svp-bottom > .svp-guard {
  flex: 1 1 0;
  min-width: 0;
  min-height: 62px;
}

.svp-bottom .svp-team {
  flex: 1 1 100%;
  order: 2;
  min-width: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

/* Seis de cada lado: a fila do rival vira uma linha só, e a sua, duas linhas de três com botões mais baixos. */
.svp.six .svp-top .svp-team {
  grid-template-columns: repeat(6, minmax(0, 1fr));
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
  flex: 2 1 0 !important;
  gap: 3px;
  padding: 4px;
}

.svp-atk-pair {
  display: flex;
  align-items: center;
  gap: 3px;
}

.svp-atk {
  display: grid;
  justify-items: center;
  gap: 1px;
  padding: 2px 3px;
  border-radius: 8px;
  border: 1.5px solid color-mix(in srgb, var(--c) 55%, transparent);
  color: var(--c);
  opacity: 0.6;
  line-height: 1;
}

.svp-atk.on {
  opacity: 1;
  background: color-mix(in srgb, var(--c) 24%, transparent);
  border-color: var(--c);
  box-shadow: 0 0 8px color-mix(in srgb, var(--c) 60%, transparent);
}

.svp-atk b {
  font-size: 1rem;
}

.svp-atk-arrow {
  font-size: 1rem;
  font-weight: 900;
}

.svp-attack.wait {
  opacity: 0.75;
}

.svp-attack-now {
  max-width: 100%;
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
