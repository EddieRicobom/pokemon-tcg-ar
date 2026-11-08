<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import AttackIcon from './AttackIcon.vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { vibrate } from '../app/haptics';
import { effectiveVisual, maxVisualFps, visual } from '../app/visual-settings';
import { isFrameDue } from '../core/frame-rate';
import type { SoundCue } from '../box/sound-recipes';
import { SoundEngine } from '../box/sound';
import { ArenaDirector, arenaResultText, speedLineWedges } from '../core/arena-cinema';
import type { CinemaBeat } from '../core/arena-cinema';
import { TELEPORT_HIT_RADIUS } from '../core/survivor-charge';
import { flashAlpha, impactFromFx, moveLight } from '../core/survivor-impacts';
import { drawLights } from '../village/survivor-cinema-art';
import type { CinemaLight } from '../village/survivor-cinema-art';
import { ImpactSparks } from '../village/survivor-impact-art';
import type { SurvivorFx } from '../core/survivor';
import { MOVE_CATEGORY_LABELS_PT } from '../core/survivor-moves';
import type { MoveCategory } from '../core/survivor-moves';
import { TYPE_GLYPHS } from '../core/type-glyphs';
import { drawConeGuide, drawElementAuraField, drawElementFx, drawElementOrbiter, drawElementProjectile, drawOrbitPath } from '../village/survivor-attack-art';
import type { ScreenPoint } from '../village/survivor-attack-art';
import { TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import {
  aliveCount, arenaCameraTarget, dodgeBlockReason, specialBlockReason, specialShapeOf, SV_DODGE_COOLDOWN_MS, SV_SWAP_RECALL_MS, SV_SWAP_SEND_MS, SV_SWAP_TOTAL_MS, SV_TELEGRAPH_MS, attackSwapBlockReason, guardBlockReason, offscreenPointer, SV_ARENA_H, SV_ARENA_W, SV_ATTACK_SWAP_CD_MS, SV_GUARD_COOLDOWN_MS, SV_MON_RADIUS, SV_SWITCH_COOLDOWN_MS, SV_VIEW_H, SV_VIEW_W, switchBlockReason,
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
  /** Troca em andamento: voltando à bola (laser vermelho) ou saindo dela; `sw` é o quanto dele aparece (0 a 1). */
  swap: 'recall' | 'send' | null;
  sw: number;
  /** Acabou de desmaiar (cai e some). */
  down: boolean;
  /** Pouca vida (a sua): a barra pisca. */
  low: boolean;
  /** Recuo do golpe, em largura da arena. */
  kx: string;
  ky: string;
  /** No meio da esquiva (fica translúcido: está invulnerável). */
  dodge: boolean;
  /** Especial pronto: o anel do Pokémon acende. */
  ready: boolean;
}
interface Fx {
  id: number;
  kind: 'blink' | 'dmg';
  /** Número do dano (só no `dmg`). */
  text?: string;
  /** Número de dano de golpe super efetivo: maior. */
  big?: boolean;
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
  /** Quem marcou: se ele sai de campo, a linha some. */
  monIndex: number;
}
/** Marca do golpe desenhada na tela de arte (a mesma arte elemental do Survivor), em coordenadas do campo. */
interface ArtFx {
  fx: SurvivorFx;
  born: number;
  /** Altura do efeito (a cabeça do Pokémon, não o chão). */
  z: number;
}
interface AttackFace {
  type: PokemonType;
  glyph: string;
  typeLabel: string;
  category: MoveCategory;
  categoryLabel: string;
  name: string;
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
  dodgePct: number;
  dodgeSec: number;
  /** Barra do Especial de quem está em campo. */
  special: { pct: number; ready: boolean; color: string; label: string } | null;
  /** Tela de abertura: só durante a contagem. */
  vs: { me: VsSide; foe: VsSide } | null;
}
interface VsSide {
  trainer: string;
  name: string;
  dexId: number;
  shiny: boolean;
  color: string;
  left: number;
}

const rowsOf = (team: ArenaTeamState): Row[] => team.mons.map((m, index) => ({
  index, name: m.name, dexId: m.dexId, shiny: m.shiny, hp: Math.ceil(m.hp), max: m.maxHp, hpPct: Math.round((100 * m.hp) / m.maxHp),
  active: index === team.active && m.hp > 0, fainted: m.hp <= 0,
}));

const attackFace = (type: PokemonType, category: MoveCategory | undefined, name: string | undefined): AttackFace => ({
  type, glyph: TYPE_GLYPHS[type], typeLabel: TYPE_LABELS_PT[type], category: category ?? 'projetil', categoryLabel: MOVE_CATEGORY_LABELS_PT[category ?? 'projetil'], name: name ?? 'Golpe',
});

const clock = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

const hud = shallowRef<Hud>({ mine: [], foe: [], summary: '', hint: '', count: 0, switchPct: 0, switchSec: 0, guardPct: 0, guardSec: 0, guardOn: false, charge: null, attack: null, dodgePct: 0, dodgeSec: 0, special: null, vs: null });
const units = shallowRef<Unit[]>([]);
const fx = shallowRef<Fx[]>([]);
const artCanvas = ref<HTMLCanvasElement | null>(null);
let artFx: ArtFx[] = [];
let beamMarks: BeamMark[] = [];
/** Teleportes recentes: o rastro de projéteis do elemento pelo caminho do salto. */
let blinkMarks: { x0: number; y0: number; x1: number; y1: number; type: PokemonType; born: number }[] = [];
const sparks = new ImpactSparks();
const shotSeen = new Set<number>();
const sound = new SoundEngine();
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Impactos e tremor obedecem à opção "Luz dos golpes/impactos", ao Modo Rotom e ao pedido do sistema por menos movimento. */
const fxOn = (): boolean => effectiveVisual.value.impactFx && !reduceMotion;
/** Sem os efeitos: a abertura, o cut-in e a pose ficam parados (ou nem entram), como pede o Modo Rotom e o sistema. */
const lite = computed(() => !fxOn());
const director = new ArenaDirector();
const stageEl = ref<HTMLElement | null>(null);
const cutIn = shallowRef<{ id: number; name: string; move: string; dexId: number; shiny: boolean; color: string; mine: boolean } | null>(null);
const banner = shallowRef<{ id: number; text: string; tone: 'ko' | 'last' } | null>(null);
/** Último Pokémon em campo: o seu pesa mais que o do rival. */
const drama = ref<'mine' | 'foe' | null>(null);
const pose = shallowRef<{ name: string; dexId: number; shiny: boolean; color: string } | null>(null);
/** Linhas de velocidade do plano atual, em coordenadas da tela da arena. */
let speedLines: { x: number; y: number; strength: number } | null = null;
let cameraOn = false;
let wasFrozen = false;
let beatId = 0;
/** Saltos anunciados (teleporte): a linha fica até o salto acontecer. */
let blinkWarn: { side: ArenaSide; x0: number; y0: number; x1: number; y1: number; type: PokemonType; born: number; lifeMs: number }[] = [];
/** Rastros da esquiva: somem em um quarto de segundo. */
let dashMarks: { x0: number; y0: number; x1: number; y1: number; color: string; born: number }[] = [];
const specialToasted = new Set<number>();
/** Instante do quadro atual: tudo que nasce e envelhece usa o mesmo relógio. */
let frameNow = 0;
const clockNow = (): number => frameNow || performance.now();
/** Última cena montada: os efeitos nascem na posição que se vê, não na do estado cru (o convidado vê um pouco atrás). */
let lastView: ArenaView | null = null;
const posOf = (side: ArenaSide): { x: number; y: number } => lastView?.sides[side] ?? state.sides[side];
const timers = new Set<ReturnType<typeof setTimeout>>();
function later(fn: () => void, ms: number): void {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}
/** Quando a troca (ou a entrada forçada) de cada lado começou, no relógio local: as fases rodam suaves mesmo entre dois instantâneos. */
const enteredAt: [number, number] = [-Infinity, -Infinity];
const swapStart: [number | null, number | null] = [null, null];
const lastPhase: [string | null, string | null] = [null, null];

/**
 * Fase da troca de Pokémon: 1,5 s de volta à bola e 1,5 s de saída. `p` anda de 0 a 1 em cada fase; `visible` é quanto do
 * Pokémon aparece (some na volta, cresce na saída). A entrada forçada por desmaio só tem a saída.
 */
function swapPhase(side: ArenaSide, now: number): { phase: 'recall' | 'send'; p: number; visible: number } | null {
  const team = state.sides[side];
  let phase: 'recall' | 'send' | null = null;
  let p = 0;
  if (team.swapMs > 0) {
    swapStart[side] ??= now - (SV_SWAP_TOTAL_MS - team.swapMs);
    const elapsed = Math.max(0, now - (swapStart[side] as number));
    if (elapsed < SV_SWAP_RECALL_MS) {
      phase = 'recall';
      p = elapsed / SV_SWAP_RECALL_MS;
    } else {
      phase = 'send';
      p = Math.min(1, (elapsed - SV_SWAP_RECALL_MS) / SV_SWAP_SEND_MS);
    }
  } else {
    swapStart[side] = null;
    const forced = now - enteredAt[side];
    if (forced >= 0 && forced < SV_SWAP_SEND_MS) {
      phase = 'send';
      p = forced / SV_SWAP_SEND_MS;
    }
  }
  if (!phase) {
    lastPhase[side] = null;
    return null;
  }
  if (phase === 'send' && lastPhase[side] !== 'send') playCue({ kind: 'enter' });
  lastPhase[side] = phase;
  return { phase, p, visible: phase === 'recall' ? 1 - p : Math.min(1, p * 1.25) };
}

/** Pokébola da troca e o laser vermelho que puxa o Pokémon para dentro ou o solta (como nos jogos). */
function drawSwap(ctx: CanvasRenderingContext2D, map: (x: number, y: number, z?: number) => ScreenPoint, k: number, at: { x: number; y: number }, sp: { phase: 'recall' | 'send'; p: number }): void {
  const ball = map(at.x, at.y, 46);
  const body = map(at.x, at.y, 12);
  const r = 8 * k;
  const ease = 1 - (1 - sp.p) * (1 - sp.p);
  // Ponta do laser: na volta acompanha o Pokémon sendo puxado; na saída acompanha o Pokémon descendo.
  const tip = sp.phase === 'recall'
    ? { x: body.x + (ball.x - body.x) * ease, y: body.y + (ball.y - body.y) * ease }
    : { x: ball.x + (body.x - ball.x) * ease, y: ball.y + (body.y - ball.y) * ease };
  const alpha = sp.phase === 'recall' ? 0.95 : 1 - sp.p * 0.75;
  ctx.save();
  ctx.lineCap = 'round';
  const beam = (width: number, a: number, color: string): void => {
    ctx.globalAlpha = a * alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y + r * 0.3);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  };
  const thick = (0.6 + 0.4 * Math.sin(sp.p * Math.PI)) * k;
  beam(11 * thick, 0.25, '#ff2a2a');
  beam(5 * thick, 0.85, '#ff3b3b');
  beam(1.8 * thick, 1, '#ffd9d9');
  // Clarão vermelho e branco na bola quando ela fecha ou abre.
  const flash = sp.phase === 'recall' ? Math.max(0, (sp.p - 0.75) / 0.25) : Math.max(0, 1 - sp.p / 0.4);
  if (flash > 0.02) {
    const g = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, r * 3.2);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * flash})`);
    g.addColorStop(0.35, `rgba(255,60,60,${0.55 * flash})`);
    g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // A bola: metade vermelha, metade branca, botão no meio; ao soltar o Pokémon a tampa levanta.
  const open = sp.phase === 'send' ? Math.min(1, sp.p * 3) * (sp.p > 0.7 ? 1 - (sp.p - 0.7) / 0.3 : 1) : sp.p > 0.85 ? (1 - sp.p) / 0.15 : 0;
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(1.2, r * 0.18);
  ctx.strokeStyle = '#1a1010';
  ctx.fillStyle = '#f4f4f4';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y + open * r * 0.15, r, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e33a3a';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y - open * r * 0.9, r, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y - open * r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
const shake = ref(false);
let shakeFrame = 0;
/** Super efetivo: um clarão de tela muito leve, baixo por acessibilidade. */
let critFlash: { born: number; color: string } | null = null;
let shakeTimer: ReturnType<typeof setTimeout> | null = null;
const faintAt: [number, number] = [-Infinity, -Infinity];
const faintIndex: [number, number] = [0, 0];
/** Áreas marcadas que estavam na tela: quando uma some, o golpe caiu e vira um clarão. */
const markerPrev = new Map<number, { x: number; y: number; radius: number; type: PokemonType }>();
let lastCount = -1;
let lastFloor = '';
let lastDue = 0;
/** Última posição e direção de cada disparo: o rastro da arte segue o caminho que ele fez. */
const shotTrack = new Map<number, { x: number; y: number; dx: number; dy: number }>();
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
let queuedDodge = false;
let queuedSpecial = false;
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
  later(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), ms);
}

/** O navegador só libera o som depois de um toque: qualquer toque na arena serve. */
function wake(): void {
  sound.setEnabled(visual.sound);
  sound.unlock();
}

function playCue(cue: SoundCue): void {
  sound.setEnabled(visual.sound);
  sound.play(cue);
}

const lastAttackSoundAt: [number, number] = [-Infinity, -Infinity];
const shotHeard = new Set<number>();
/** Som do golpe por tipo e forma, com limite de frequência (rajadas não viram ruído contínuo). */
function attackSound(side: ArenaSide, now: number): void {
  if (now - lastAttackSoundAt[side] < 70) return;
  const team = state.sides[side];
  const mon = team.mons[team.active];
  if (!mon) return;
  lastAttackSoundAt[side] = now;
  playCue({ kind: 'survivor-attack', type: mon.attackType, category: mon.moveCategory ?? 'projetil' });
}

function playSound(cue: 'survivor-hit' | 'survivor-critical' | 'survivor-hurt' | 'survivor-level' | 'survivor-gameover'): void {
  sound.setEnabled(visual.sound);
  sound.play({ kind: 'ui', cue });
}

function requestSwitch(index: number): void {
  wake();
  const reason = switchBlockReason(state, mySide, index);
  if (reason) {
    toast(reason, 'info', 1800, `block:${reason}`);
    return;
  }
  queuedSwitch = index;
}

function requestGuard(): void {
  wake();
  const reason = guardBlockReason(state, mySide);
  if (reason) {
    toast(reason, 'info', 1800, `guard:${reason}`);
    return;
  }
  queuedGuard = true;
}

function requestAttackSwap(): void {
  wake();
  const reason = attackSwapBlockReason(state, mySide);
  if (reason) {
    toast(reason, 'info', 1800, `attack:${reason}`);
    return;
  }
  queuedAttack = true;
}

function requestDodge(): void {
  wake();
  const reason = dodgeBlockReason(state, mySide);
  if (reason) {
    toast(reason, 'info', 1200, `dodge:${reason}`);
    return;
  }
  queuedDodge = true;
}

function requestSpecial(): void {
  wake();
  const reason = specialBlockReason(state, mySide);
  if (reason) {
    toast(reason, 'info', 1500, `special:${reason}`);
    return;
  }
  queuedSpecial = true;
}

/** Esquiva e Especial valem no toque, sem esperar o clique; `detail` 0 é o Enter ou espaço do teclado. */
function keyClick(event: MouseEvent, action: () => void): void {
  if (event.detail === 0) action();
}

/** Efeito curto na arena (corte do cone, pulso da aura, rastro do teleporte): some sozinho. */
function addFx(kind: Fx['kind'], mine: boolean, color: string, style: Record<string, string>, ms = 380, text?: string, big = false): void {
  const id = ++fxId;
  fx.value = [...fx.value.slice(-12), { id, kind, mine, color, style, ...(text ? { text } : {}), ...(big ? { big } : {}) }];
  later(() => (fx.value = fx.value.filter((f) => f.id !== id)), ms);
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
      hitAt[e.side] = clockNow();
      showDamage(e.side, e.damage, e.mult);
      const striker = state.sides[e.side === 0 ? 1 : 0];
      const strike = striker.mons[striker.active];
      // O impacto cresce com o dano e fica na altura do corpo, como no Survivor; super efetivo dura mais.
      if (strike && e.damage > 0 && fxOn()) addArtFx('blast', posOf(e.side).x, posOf(e.side).y, 22 + Math.min(34, e.damage * 0.5) + (e.mult > 1 ? 10 : 0), strike.attackType, e.mult > 1 ? 520 : 420, {}, 14);
      playSound(e.side === mySide ? 'survivor-hurt' : e.mult > 1 ? 'survivor-critical' : 'survivor-hit');
      if (e.side === mySide) {
        vibrate({ kind: 'hit', strength: Math.min(1, e.damage / 40) }, visual.sound);
        // O contorno vermelho é o sinal de dano e fica sempre; só o tremor depende dos efeitos.
        hurt.value = true;
        if (hurtTimer) clearTimeout(hurtTimer);
        hurtTimer = setTimeout(() => (hurt.value = false), 140);
        if (fxOn()) {
          shake.value = false;
          if (shakeFrame) cancelAnimationFrame(shakeFrame);
          shakeFrame = requestAnimationFrame(() => (shake.value = true));
          if (shakeTimer) clearTimeout(shakeTimer);
          shakeTimer = setTimeout(() => (shake.value = false), 260);
        }
      } else if (e.mult === 0) toast('Não afeta o alvo…', 'info', 1800, 'imune');
      else if (e.mult > 1) {
        toast('Super efetivo!', 'good', 1500, 'super');
        if (fxOn() && strike) critFlash = { born: clockNow(), color: TYPE_COLORS[strike.attackType] };
      }
      else if (e.mult < 1) toast('Pouco efetivo…', 'info', 1500, 'pouco');
    } else if (e.k === 'telegraph') {
      if (e.side !== mySide) toast('Área marcada: saia do círculo!', 'bad', 1600, `mark:${e.side}`);
    } else if (e.k === 'faint') {
      const name = mons[e.index]?.name ?? 'Pokémon';
      playSound(e.side === mySide ? 'survivor-gameover' : 'survivor-level');
      vibrate({ kind: 'out', mine: e.side === mySide }, visual.sound);
      playCue({ kind: 'faint' });
      faintAt[e.side] = clockNow();
      faintIndex[e.side] = e.index;
      if (fxOn()) addArtFx('blast', posOf(e.side).x, posOf(e.side).y, 46, mons[e.index]?.attackType ?? 'normal', 600, {}, 14);
      toast(e.side === mySide ? `${name} desmaiou` : `${name} (${props.friendName}) desmaiou`, e.side === mySide ? 'bad' : 'good', 2600);
    } else if (e.k === 'switch') {
      const name = mons[e.index]?.name ?? 'Pokémon';
      // Troca voluntária: a animação de 3 s vem do estado (`swapMs`). Entrada forçada por desmaio: só a saída da bola.
      if (e.forced) enteredAt[e.side] = clockNow();
      if (e.side === mySide) toast(e.forced ? `Entrou ${name}` : `Trocando para ${name}…`, 'info', 1800, `sw:${name}`);
      else toast(`${props.friendName} trocou para ${name}`, 'info', 1800, `fsw:${name}`);
    } else if (e.k === 'attack') {
      if (fxOn()) addArtFx('pulse', posOf(e.side).x, posOf(e.side).y, 34, mons[e.index]?.attackType ?? 'normal', 360);
      if (e.side === mySide) {
        playCue({ kind: 'ui', cue: 'survivor-pickup' });
        const mon = mons[e.index];
        if (mon) toast(`${TYPE_GLYPHS[mon.attackType]} Ataque: ${TYPE_LABELS_PT[mon.attackType]}${mon.moveName ? ` · ${mon.moveName}` : ''}`, 'info', 1500, `atk:${mon.attackType}:${mon.moveCategory}`);
      } else toast(`${props.friendName} trocou de ataque`, 'info', 1500, 'foe-attack');
    } else if (e.k === 'guard') {
      playCue({ kind: 'guard' });
      if (fxOn()) addArtFx('pulse', posOf(e.side).x, posOf(e.side).y, 34, 'normal', 360);
      if (e.side === mySide) vibrate({ kind: 'bumper' }, visual.sound);
      toast(e.side === mySide ? 'Escudo ativo!' : `${props.friendName} ativou o escudo`, e.side === mySide ? 'good' : 'info', 1600, `guard:${e.side}`);
    } else if (e.k === 'block') {
      playSound('survivor-hit');
      vibrate({ kind: 'bumper' }, visual.sound);
      toast(e.side === mySide ? 'O escudo bloqueou o golpe!' : 'Golpe bloqueado pelo escudo', e.side === mySide ? 'good' : 'info', 1200, `block:${e.side}`);
    } else if (e.k === 'beam') {
      showBeam(e);
    } else if (e.k === 'dodge') {
      const mon = mons[state.sides[e.side].active];
      if (fxOn()) dashMarks = [...dashMarks.slice(-3), { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, color: mon ? TYPE_COLORS[mon.attackType] : '#ffffff', born: clockNow() }];
      if (e.side === mySide) vibrate({ kind: 'bumper' }, visual.sound);
    } else if (e.k === 'evade') {
      const p = toView(posOf(e.side).x, posOf(e.side).y);
      addFx('dmg', e.side !== mySide, '#bfefff', { left: `${(p.x / SV_VIEW_W) * 100}%`, top: `${((p.y - 34) / SV_VIEW_H) * 100}%` }, 700, 'Esquivou!');
      playCue({ kind: 'guard' });
    } else if (e.k === 'special') {
      playSound(e.side === mySide ? 'survivor-level' : 'survivor-critical');
      if (e.side === mySide) vibrate({ kind: 'bumper' }, visual.sound);
      if (!fxOn()) {
        const mon = mons[e.index];
        toast(`${mon?.name ?? 'Pokémon'} usou o Especial!`, e.side === mySide ? 'good' : 'bad', 1500, `sp:${e.side}`);
      }
    } else {
      showFx(e);
    }
  }
}

/** Número do dano subindo de quem levou o golpe: amarelo no super efetivo, cinza no pouco efetivo. */
function showDamage(side: ArenaSide, damage: number, mult: number): void {
  const p = toView(posOf(side).x, posOf(side).y);
  const color = mult === 0 ? '#9aa3b2' : mult > 1 ? '#ffd166' : mult < 1 ? '#c7ccd6' : '#ffffff';
  const jitter = ((fxId * 37) % 9) - 4;
  addFx('dmg', side !== mySide, color, { left: `${((p.x + jitter) / SV_VIEW_W) * 100}%`, top: `${((p.y - 26) / SV_VIEW_H) * 100}%` }, 700, mult === 0 ? '0' : mult > 1 ? `${damage}!` : String(damage), mult > 1);
}

/** Marca na tela de arte: nasce agora e some sozinha quando passa a vida. */
function addArtFx(kind: SurvivorFx['kind'], x: number, y: number, r: number, type: PokemonType, lifeMs: number, extra: Partial<SurvivorFx> = {}, z = 0): void {
  const fxMark: SurvivorFx = { kind, x, y, r, color: TYPE_COLORS[type], ageMs: 0, lifeMs, moveType: type, ...extra };
  artFx = [...artFx.slice(-14), { born: clockNow(), fx: fxMark, z }];
  if (fxOn() && kind !== 'pulse') {
    if (pendingImpacts.length > 12) pendingImpacts.shift();
    pendingImpacts.push({ fx: fxMark, z });
  }
}
/** Marcas que ainda vão soltar faíscas: a conversão para a tela acontece no desenho, onde a câmera é conhecida. */
const pendingImpacts: { fx: SurvivorFx; z: number }[] = [];

/** Foco: a linha marcada fica até o feixe sair; quando sai, vira um clarão curto. */
function showBeam(e: Extract<ArenaEvent, { k: 'beam' }>): void {
  const team = state.sides[e.side];
  const type: PokemonType = team.mons[team.active]?.attackType ?? 'normal';
  const mine = e.side === mySide;
  const now = clockNow();
  if (e.leftMs > 0) {
    beamMarks = [...beamMarks.filter((b) => b.mine !== mine || b.fired), { mine, x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, width: e.width, type, born: now, lifeMs: e.leftMs, fired: false, monIndex: team.active }];
    if (!mine) toast('Feixe marcado: saia da linha!', 'bad', 1600, `beam:${e.side}`);
  } else {
    attackSound(e.side, now);
    beamMarks = [...beamMarks.filter((b) => b.mine !== mine || b.fired), { mine, x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, width: e.width, type, born: now, lifeMs: 380, fired: true, monIndex: team.active }];
  }
}

/** Efeitos de golpe de quem ataca: a mesma arte elemental do Survivor, sobre a geometria real (cone, raio da aura); o teleporte é um traço. */
function showFx(e: Extract<ArenaEvent, { k: 'cone' | 'pulse' | 'blink' }>): void {
  const team = state.sides[e.side];
  const mon = team.mons[team.active];
  const type: PokemonType = mon?.attackType ?? 'normal';
  const at = posOf(e.side);
  if (e.k === 'blink' && e.leftMs) {
    blinkWarn = [...blinkWarn.filter((b) => b.side !== e.side), { side: e.side, x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, type, born: clockNow(), lifeMs: e.leftMs }];
    return;
  }
  if (e.k === 'blink') blinkWarn = blinkWarn.filter((b) => b.side !== e.side);
  attackSound(e.side, clockNow());
  if (e.k === 'pulse') addArtFx('pulse', at.x, at.y, e.radius, type, 460);
  else if (e.k === 'cone') addArtFx('cone', at.x, at.y, e.range, type, 420, { angle: e.angle, spread: SURVIVOR_CONE_HALF_ANGLE });
  else blinkMarks = [...blinkMarks.slice(-4), { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, type, born: clockNow() }];
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
  lastView = view;
  for (const sh of view.shots) {
    if (shotHeard.has(sh.id)) continue;
    shotHeard.add(sh.id);
    attackSound(sh.side, now);
  }
  // Só esquece os tiros que já saíram do ar: os vivos não tocam de novo.
  if (shotHeard.size > view.shots.length + 40) for (const id of shotHeard) if (!view.shots.some((sh) => sh.id === id)) shotHeard.delete(id);
  const me = toField(view.sides[mySide].x, view.sides[mySide].y);
  // A câmera desliza até o alvo em vez de pular: segue quem joga e puxa um pouco para o rival.
  const target = arenaCameraTarget(me, toField(view.sides[foeSide].x, view.sides[foeSide].y));
  const follow = cameraReady ? 1 - Math.exp(-Math.min(100, now - cameraAt) / 140) : 1;
  camera = { x: camera.x + (target.x - camera.x) * follow, y: camera.y + (target.y - camera.y) * follow };
  cameraAt = now;
  cameraReady = true;
  const floor = `translate(${((-camera.x / SV_ARENA_W) * 100).toFixed(3)}%, ${((-camera.y / SV_ARENA_H) * 100).toFixed(3)}%)`;
  if (floor !== lastFloor) {
    lastFloor = floor;
    floorStyle.value = { transform: floor };
  }
  const foeAt = toView(view.sides[foeSide].x, view.sides[foeSide].y);
  const ptr = offscreenPointer(foeAt.x, foeAt.y);
  if (!ptr !== !pointer.value || (ptr && pointer.value && (Math.abs(ptr.x - pointer.value.x) > 0.5 || Math.abs(ptr.y - pointer.value.y) > 0.5 || Math.abs(ptr.angle - pointer.value.angle) > 0.01))) pointer.value = ptr;
  const out: Unit[] = [];
  for (const side of [mySide, foeSide] as const) {
    const team = state.sides[side];
    const mon = team.mons[team.active];
    // Quem acabou de desmaiar fica mais um instante na tela, caindo, mesmo que outro já tenha entrado.
    const ghost = now - faintAt[side] < 650 ? team.mons[faintIndex[side]] : undefined;
    if (ghost && ghost.hp <= 0) {
      const g = toView(view.sides[side].x, view.sides[side].y);
      out.push({ dodge: false, ready: false, down: true, low: false, kx: '0cqw', ky: '0cqw', hit: false, swap: null, sw: 1, faceRight: false, key: `ghost-${side}`, mine: side === mySide, x: (g.x / SV_VIEW_W) * 100, y: (g.y / SV_VIEW_H) * 100, dexId: ghost.dexId, shiny: ghost.shiny, name: ghost.name, hpPct: 0, shield: false, guard: false, status: '' });
    }
    if (!mon || mon.hp <= 0) continue;
    const p = toView(view.sides[side].x, view.sides[side].y);
    const status = `${team.burnMs > 0 ? '🔥' : ''}${team.slowMs > 0 ? '🐌' : ''}${team.stunMs > 0 ? '💫' : ''}`;
    const other = toView(view.sides[side === mySide ? foeSide : mySide].x, view.sides[side === mySide ? foeSide : mySide].y);
    const away = { x: p.x - other.x, y: p.y - other.y };
    const awayLen = Math.hypot(away.x, away.y) || 1;
    const isHit = fxOn() && now - hitAt[side] < 140;
    const sp = swapPhase(side, now);
    out.push({ dodge: team.dodgeMs > 0, ready: (mon.energy ?? 0) >= 1, swap: sp?.phase ?? null, sw: sp ? sp.visible : 1, down: false, low: side === mySide && mon.hp / mon.maxHp <= 0.25, kx: isHit ? `${((away.x / awayLen) * 1.4).toFixed(2)}cqw` : '0cqw', ky: isHit ? `${((away.y / awayLen) * 1.4).toFixed(2)}cqw` : '0cqw', hit: isHit, faceRight: other.x > p.x + 2, key: side === mySide ? 'me' : 'foe', mine: side === mySide, x: (p.x / SV_VIEW_W) * 100, y: (p.y / SV_VIEW_H) * 100, dexId: mon.dexId, shiny: mon.shiny, name: mon.name, hpPct: Math.round((100 * mon.hp) / mon.maxHp), shield: team.shieldMs > 0, guard: team.guardMs > 0, status });
  }
  const prev = units.value;
  const same = prev.length === out.length && out.every((u, i) => {
    const o = prev[i]!;
    return u.key === o.key && Math.abs(u.x - o.x) < 0.05 && Math.abs(u.y - o.y) < 0.05 && u.hpPct === o.hpPct && u.hit === o.hit && u.swap === o.swap && Math.abs(u.sw - o.sw) < 0.01 && u.down === o.down && u.low === o.low && u.shield === o.shield && u.guard === o.guard && u.status === o.status && u.faceRight === o.faceRight && u.dexId === o.dexId && u.kx === o.kx && u.dodge === o.dodge && u.ready === o.ready;
  });
  if (!same) units.value = out;
  drawArt(now, view);
}

/** Linha do Foco: faixa pulsando que enche até o disparo; o clarão do feixe é largo, claro e some rápido. */
function drawBeam(ctx: CanvasRenderingContext2D, b: BeamMark, map: (x: number, y: number, z?: number) => ScreenPoint, k: number, now: number, detailed: boolean): void {
  const a = map(b.x0, b.y0, 4);
  const e = map(b.x1, b.y1, 4);
  const len = Math.hypot(e.x - a.x, e.y - a.y);
  if (len < 1) return;
  const ux = (e.x - a.x) / len;
  const uy = (e.y - a.y) / len;
  // A zona de dano é a largura mais o corpo do Pokémon: a linha desenhada mostra exatamente onde dói.
  const half = (b.width + SV_MON_RADIUS) * k;
  const color = TYPE_COLORS[b.type];
  const age = Math.max(0, now - b.born);
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
    // Partículas do elemento ao longo do feixe, como o Foco do Survivor.
    const n = Math.min(14, Math.max(6, Math.round(len / 28)));
    for (let i = 0; i <= n; i++) {
      const head = { x: a.x + ux * len * (i / n), y: a.y + uy * len * (i / n), s: k };
      drawElementProjectile(ctx, b.type, head, { x: head.x - ux * 22, y: head.y - uy * 22, s: k }, Math.max(5, half * 0.55), 1 - t, now, detailed, i);
    }
  } else {
    const fill = Math.min(1, age / b.lifeMs);
    const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now / 90);
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
    // Energia correndo para a ponta enquanto carrega.
    const n = Math.max(5, Math.round(len / 40));
    for (let i = 0; i < n; i++) {
      const f = ((i / n + now / 700) % 1) * Math.max(0.05, fill);
      const head = { x: a.x + ux * len * f, y: a.y + uy * len * f, s: k };
      drawElementProjectile(ctx, b.type, head, { x: head.x - ux * 12, y: head.y - uy * 12, s: k }, Math.max(3, half * 0.3), 0.8, now, detailed, i);
    }
  }
  ctx.restore();
}

/** Linhas de velocidade convergindo no foco do plano: um caminho só, sem sombra borrada. Trocam de desenho poucas vezes por segundo. */
const wedgeCache = new Map<string, ReturnType<typeof speedLineWedges>>();
function drawSpeedLines(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, now: number, detailed: boolean): void {
  if (!speedLines) return;
  const key = `${detailed ? 34 : 16}:${Math.floor(now / 70) % 6}`;
  let wedges = wedgeCache.get(key);
  if (!wedges) {
    wedges = speedLineWedges(detailed ? 34 : 16, Math.floor(now / 70) % 6);
    wedgeCache.set(key, wedges);
  }
  const cx = speedLines.x * k;
  const cy = speedLines.y * k;
  const outer = Math.hypot(w, h);
  ctx.save();
  ctx.globalAlpha = 0.6 * speedLines.strength;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (const wedge of wedges) {
    const inner = outer * (wedge.inner + (1 - speedLines.strength) * 0.2);
    ctx.moveTo(cx + Math.cos(wedge.angle) * inner, cy + Math.sin(wedge.angle) * inner);
    ctx.lineTo(cx + Math.cos(wedge.angle - wedge.half) * outer, cy + Math.sin(wedge.angle - wedge.half) * outer);
    ctx.lineTo(cx + Math.cos(wedge.angle + wedge.half) * outer, cy + Math.sin(wedge.angle + wedge.half) * outer);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** Tela de arte: disparos, órbitas, aura e marcas de golpe com a arte elemental do Survivor (chama, gota, faísca…). */
function drawArt(now: number, view: ArenaView): void {
  const canvas = artCanvas.value;
  const host = arenaEl.value;
  if (!canvas || !host || !host.clientWidth) {
    pendingImpacts.length = 0;
    markerPrev.clear();
    return;
  }
  const w = host.clientWidth;
  const h = (w * SV_VIEW_H) / SV_VIEW_W;
  const dpr = Math.min(effectiveVisual.value.rotomMode ? 1 : 1.5, window.devicePixelRatio || 1);
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
  if (!ctx) {
    pendingImpacts.length = 0;
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const k = w / SV_VIEW_W;
  const map = (x: number, y: number, z = 0): ScreenPoint => {
    const p = toView(x, y);
    return { x: p.x * k, y: p.y * k - z * k * 0.5, s: k };
  };
  const detailed = !effectiveVisual.value.rotomMode && !reduceMotion;
  // Áreas marcadas: o campo do elemento com partículas girando e um pulso que fecha sobre o alvo.
  const liveMarkers = new Set<number>();
  for (const m of view.markers) {
    liveMarkers.add(m.id);
    markerPrev.set(m.id, { x: m.x, y: m.y, radius: m.radius, type: m.type });
    // O dano acerta quem está no raio mais o corpo do Pokémon: o círculo mostra exatamente essa zona.
    const reach = m.radius + SV_MON_RADIUS;
    const closing = Math.min(1, Math.max(0, 1 - m.leftMs / SV_TELEGRAPH_MS));
    drawElementAuraField(ctx, { x: m.x, y: m.y, attackRadius: reach / 0.8 }, m.type, map, reduceMotion ? 0 : now, detailed);
    drawElementFx(ctx, { kind: 'pulse', x: m.x, y: m.y, r: reach, color: TYPE_COLORS[m.type], ageMs: closing * 700, lifeMs: 700, moveType: m.type }, map, now, detailed);
    const c = map(m.x, m.y);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = m.side === mySide ? '#ffffff' : '#ff6b63';
    ctx.beginPath();
    ctx.arc(c.x, c.y, reach * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  for (const [id, gone] of markerPrev) {
    if (liveMarkers.has(id)) continue;
    markerPrev.delete(id);
    if (fxOn()) addArtFx('blast', gone.x, gone.y, gone.radius + SV_MON_RADIUS, gone.type, 460);
  }
  for (const side of [mySide, foeSide] as const) {
    const team = state.sides[side];
    const mon = team.mons[team.active];
    if (!mon || mon.hp <= 0) continue;
    const at = { x: view.sides[side].x, y: view.sides[side].y };
    if (mon.moveCategory === 'aura') drawElementAuraField(ctx, { ...at, attackRadius: ((mon.attackRadius ?? SV_MON_RADIUS * 2) * 0.8 + SV_MON_RADIUS) / 0.8 }, mon.attackType, map, reduceMotion ? 0 : now, detailed);
    else if (mon.moveCategory === 'orbit') {
      const shape = { ...at, shots: Math.max(1, mon.shots ?? 1), attackRadius: mon.attackRadius ?? SV_MON_RADIUS * 2, orbitAngle: team.orbitAngle };
      drawOrbitPath(ctx, shape, mon.attackType, map);
      for (let i = 0; i < shape.shots; i++) drawElementOrbiter(ctx, shape, mon.attackType, map, i, now, detailed);
    } else if (mon.moveCategory === 'cone') {
      const foeAt = view.sides[side === 0 ? 1 : 0];
      drawConeGuide(ctx, { ...at, aimAngle: Math.atan2(foeAt.y - at.y, foeAt.x - at.x), facing: 1 }, mon.attackRange ?? 200, mon.attackType, map, 0.6);
    } else if (mon.moveCategory === 'trilha' && team.trail.length > 1) {
      // Faixa contínua que esmaece com a idade, com partículas do elemento, no lugar das bolinhas soltas.
      const col = TYPE_COLORS[mon.attackType];
      // A faixa tem a largura em que o dano acontece (raio mais o corpo). Dois traços em um caminho só: sem emendas nem blur.
      const half = (Math.min(mon.attackRadius ?? SV_MON_RADIUS * 2, 36) + SV_MON_RADIUS) * k;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = col;
      ctx.beginPath();
      team.trail.forEach((t, i) => {
        const q = map(t.x, t.y);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = half * 2;
      ctx.stroke();
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = half * 1.2;
      ctx.stroke();
      ctx.restore();
      team.trail.forEach((t, i) => {
        if (i % (detailed ? 3 : 5) !== 0) return;
        const p = map(t.x, t.y, 6);
        drawElementProjectile(ctx, mon.attackType, p, { ...p, y: p.y + 4 }, 3.5, 0.7, now, detailed, i);
      });
    }
  }
  for (const side of [mySide, foeSide] as const) {
    const sp = swapPhase(side, now);
    if (sp) drawSwap(ctx, map, k, view.sides[side], sp);
    // Foco quase cheio: anéis fechando no Pokémon avisam que a linha vai sair.
    const team = state.sides[side];
    const charging = team.mons[team.active];
    if (fxOn() && charging && charging.hp > 0 && team.focusCharge > 0.55) {
      const c = map(view.sides[side].x, view.sides[side].y, 14);
      const p = (team.focusCharge - 0.55) / 0.45;
      ctx.save();
      ctx.strokeStyle = TYPE_COLORS[charging.attackType];
      ctx.lineWidth = (1 + p * 2) * k;
      ctx.globalAlpha = 0.25 + 0.6 * p;
      ctx.beginPath();
      ctx.arc(c.x, c.y, (16 + 26 * (1 - p)) * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  // Salto anunciado: a faixa mostra onde dói, e o círculo, onde ele vai cair.
  if (blinkWarn.some((b) => now - b.born >= b.lifeMs + 120)) blinkWarn = blinkWarn.filter((b) => now - b.born < b.lifeMs + 120);
  for (const b of blinkWarn) {
    const a = map(b.x0, b.y0, 4);
    const e = map(b.x1, b.y1, 4);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = TYPE_COLORS[b.type];
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = TELEPORT_HIT_RADIUS * 2 * k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = b.side === mySide ? '#ffffff' : '#ff6b63';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(e.x, e.y, SV_MON_RADIUS * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // Esquiva: um rastro afilado do elemento, do ponto de partida ao de chegada.
  if (dashMarks.some((d) => now - d.born >= 240)) dashMarks = dashMarks.filter((d) => now - d.born < 240);
  for (const d of dashMarks) {
    const a = map(d.x0, d.y0, 16);
    const e = map(d.x1, d.y1, 16);
    const len = Math.hypot(e.x - a.x, e.y - a.y) || 1;
    const nx = -(e.y - a.y) / len;
    const ny = (e.x - a.x) / len;
    const half = 11 * k * (1 - (now - d.born) / 240);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(e.x + nx * half, e.y + ny * half);
    ctx.lineTo(e.x - nx * half, e.y - ny * half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (beamMarks.some((b) => now - b.born >= b.lifeMs + (b.fired ? 0 : 60))) beamMarks = beamMarks.filter((b) => now - b.born < b.lifeMs + (b.fired ? 0 : 60));
  for (const b of beamMarks) {
    // Feixe cancelado (o dono trocou ou caiu): a linha some em vez de ficar enganando.
    const owner = state.sides[b.mine ? mySide : foeSide];
    if (!b.fired && ((owner.mons[owner.active]?.hp ?? 0) <= 0 || owner.active !== b.monIndex || owner.swapMs > 0)) continue;
    drawBeam(ctx, b, map, k, now, detailed);
  }
  // Teleporte: projéteis do elemento pelo caminho do salto, sumindo rápido.
  if (blinkMarks.some((b) => now - b.born >= 350)) blinkMarks = blinkMarks.filter((b) => now - b.born < 350);
  for (const b of blinkMarks) {
    const t = Math.max(0, (now - b.born) / 350);
    for (let i = 0; i < 7; i++) {
      const f = i / 6;
      const p = map(b.x0 + (b.x1 - b.x0) * f, b.y0 + (b.y1 - b.y0) * f, 10);
      const q = map(b.x0 + (b.x1 - b.x0) * (f - 0.08), b.y0 + (b.y1 - b.y0) * (f - 0.08), 10);
      drawElementProjectile(ctx, b.type, p, q, 5, (1 - t) * (0.4 + f * 0.6), now, detailed, i);
    }
  }
  const seen = shotSeen;
  seen.clear();
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
    const size = Math.max(3, Math.min(14, s.radius * k * 0.9));
    const head = map(s.x, s.y, 18);
    const tail = map(s.x - dx * (10 + size * 1.5), s.y - dy * (10 + size * 1.5), 18);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = s.side === mySide ? '#ffffff' : '#e0524f';
    ctx.beginPath();
    ctx.arc(head.x, head.y, size * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawElementProjectile(ctx, s.type, head, tail, size, 1, now, detailed, s.id);
  }
  for (const id of shotTrack.keys()) if (!seen.has(id)) shotTrack.delete(id);
  if (artFx.some((a) => now - a.born >= a.fx.lifeMs)) artFx = artFx.filter((a) => now - a.born < a.fx.lifeMs);
  for (const a of artFx) {
    a.fx.ageMs = Math.max(0, now - a.born);
    drawElementFx(ctx, a.fx, (x, y, z = 0) => map(x, y, z + a.z), now, detailed);
  }
  // Faíscas do elemento: nascem no ponto do impacto já em coordenadas de tela e seguem sozinhas.
  while (pendingImpacts.length > 0) {
    const pending = pendingImpacts.pop()!;
    const f = pending.fx;
    const impact = impactFromFx(f, 0.7);
    if (!impact) continue;
    const c = map(f.x, f.y, pending.z);
    sparks.burst({ ...impact, x: c.x, y: c.y, r: impact.r * k, length: impact.length * k, angle: flip ? impact.angle + Math.PI : impact.angle });
  }
  // Luz do golpe sobre o chão (sem sombra borrada): cada marca de golpe acende um clarão da cor do elemento.
  if (fxOn() && effectiveVisual.value.lighting) {
    const lights: CinemaLight[] = [];
    for (const a of artFx.slice(-8)) {
      const c = map(a.fx.x, a.fx.y);
      lights.push({ x: c.x, y: c.y, r: a.fx.r * k * 3, color: a.fx.color, alpha: flashAlpha(now - a.born, a.fx.lifeMs) * moveLight(a.fx.moveType) * 0.7 });
    }
    if (lights.length > 0) drawLights(ctx, lights);
  }
  if (critFlash && fxOn()) {
    const t = flashAlpha(now - critFlash.born, 180);
    if (t > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.12 * t;
      ctx.fillStyle = critFlash.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else critFlash = null;
  }
  if (fxOn()) sparks.draw(ctx, now);
  if (fxOn()) drawSpeedLines(ctx, w, h, k, now, detailed);
}

/** Zoom do plano atual: só uma transformação no palco, que o navegador compõe sem repintar. */
function applyCamera(now: number): void {
  const el = stageEl.value;
  const shot = fxOn() ? director.camera(now) : null;
  if (!el) return;
  if (!shot || shot.scale < 1.002) {
    speedLines = null;
    if (cameraOn) {
      el.style.transform = '';
      el.style.transformOrigin = '';
      cameraOn = false;
    }
    return;
  }
  const p = toView(posOf(shot.side).x, posOf(shot.side).y);
  const ox = Math.max(0, Math.min(100, (p.x / SV_VIEW_W) * 100));
  const oy = Math.max(0, Math.min(100, (p.y / SV_VIEW_H) * 100));
  el.style.transformOrigin = `${ox.toFixed(1)}% ${oy.toFixed(1)}%`;
  el.style.transform = `scale(${shot.scale.toFixed(3)})`;
  cameraOn = true;
  speedLines = { x: p.x, y: p.y, strength: shot.lines };
}

/** O que o diretor anunciou neste quadro: cut-in, nocaute e último Pokémon. Nada disso recebe toque. */
function playBeats(beats: CinemaBeat[]): void {
  for (const beat of beats) {
    const mons = state.sides[beat.side].mons;
    if (beat.kind === 'cut-in') {
      const mon = mons[beat.index];
      if (!mon || !fxOn()) continue;
      const id = ++beatId;
      cutIn.value = { id, name: mon.name, move: mon.moveName ?? 'Especial', dexId: mon.dexId, shiny: mon.shiny, color: TYPE_COLORS[mon.attackType], mine: beat.side === mySide };
      later(() => {
        if (cutIn.value?.id === id) cutIn.value = null;
      }, 920);
    } else if (beat.kind === 'ko') {
      if (fxOn()) showBanner(beat.final ? 'Fim de luta!' : 'Nocaute!', 'ko');
    } else {
      const mine = beat.side === mySide;
      if (mine || drama.value === null) drama.value = mine ? 'mine' : 'foe';
      if (fxOn()) showBanner(mine ? 'Seu último Pokémon!' : 'Último Pokémon do rival!', 'last');
      else toast(mine ? 'Seu último Pokémon!' : 'Último Pokémon do rival!', mine ? 'bad' : 'good', 2000);
    }
  }
}

function showBanner(text: string, tone: 'ko' | 'last'): void {
  const id = ++beatId;
  banner.value = { id, text, tone };
  later(() => {
    if (banner.value?.id === id) banner.value = null;
  }, tone === 'ko' ? 800 : 1300);
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
  else if (current?.moveCategory === 'trilha') hint = mine.trailMs > 0 ? 'Trilha ativa: passe por cima do rival.' : 'Ande para encher a Trilha (a barra mostra a carga).';
  else if (current?.moveCategory === 'foco') hint = mine.focusCharge > 0 && !beamMarks.some((b) => b.mine && !b.fired) ? 'Foco carregando: a linha é marcada antes do feixe.' : '';
  else if (state.timeMs < 9000) hint = 'Desvie dos golpes: o seu Pokémon ataca sozinho. Troque quando precisar.';
  const count = Math.ceil(state.countdownMs / 1000);
  if (count !== lastCount) {
    if (lastCount >= 0 && state.winner === null) playCue(count > 0 ? { kind: 'ui', cue: 'minigame-pick' } : { kind: 'go' });
    lastCount = count;
  }
  const cd = mine.switchCdMs;
  const foeNow = foe.mons[foe.active];
  const vsSide = (trainer: string, mon: NonNullable<typeof current>, left: number): VsSide => ({ trainer, name: mon.name, dexId: mon.dexId, shiny: mon.shiny, color: TYPE_COLORS[mon.attackType], left });
  const energy = current?.energy ?? 0;
  if (energy >= 1 && !specialToasted.has(mine.active)) {
    specialToasted.add(mine.active);
    toast('Especial pronto!', 'good', 1400, 'special-ready');
    playCue({ kind: 'ui', cue: 'survivor-pickup' });
  } else if (energy < 1) specialToasted.delete(mine.active);
  hud.value = {
    dodgePct: mine.dodgeCdMs > 0 ? Math.round((100 * mine.dodgeCdMs) / SV_DODGE_COOLDOWN_MS) : 0, dodgeSec: Math.ceil(mine.dodgeCdMs / 1000),
    special: current ? { pct: Math.floor(energy * 100), ready: energy >= 1, color: TYPE_COLORS[current.attackType], label: specialShapeOf(current) === 'nova' ? 'Explosão' : 'Feixe' } : null,
    vs: state.countdownMs > 0 && current && foeNow ? { me: vsSide('Você', current, aliveCount(mine)), foe: vsSide(props.friendName, foeNow, aliveCount(foe)) } : null,
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
  if (state.winner !== null) playCue(state.winner === mySide ? { kind: 'victory', personality: 'equilibrado' } : { kind: 'pin-lose' });
  if (state.winner !== null) vibrate({ kind: state.winner === mySide ? 'win' : 'lose' }, visual.sound);
  if (state.winner !== null) emit('finished', state.winner, state.sides[mySide].mons.map((m) => Math.max(0, m.hp)));
  if (hostLink) {
    const mons = state.sides[mySide].mons;
    const best = Math.max(0, ...mons.map((m) => m.dealt ?? 0));
    scoreboard.value = mons.map((m) => ({ name: m.name, dexId: m.dexId, shiny: m.shiny, dealt: Math.round(m.dealt ?? 0), kos: m.kos ?? 0, mvp: best > 0 && (m.dealt ?? 0) === best, fainted: m.hp <= 0 }));
  }
  if (state.winner === 0 || state.winner === 1) {
    const team = state.sides[state.winner];
    const star = (team.mons[team.active]?.hp ?? 0) > 0 ? team.mons[team.active] : team.mons.find((m) => m.hp > 0);
    pose.value = star ? { name: star.name, dexId: star.dexId, shiny: star.shiny, color: TYPE_COLORS[star.attackType] } : null;
  }
  // Com efeitos ligados, espera o plano do nocaute final terminar antes do placar.
  resultTimer = setTimeout(() => {
    if (state.winner !== null) result.value = arenaResultText(state.winner, mySide, props.friendName, aliveCount(state.sides[mySide]), aliveCount(state.sides[foeSide]));
  }, fxOn() ? 1050 : 700);
}

function frame(ts: number): void {
  raf = requestAnimationFrame(frame);
  if (!isFrameDue(ts, lastDue, maxVisualFps())) return;
  const stepMs = 1000 / maxVisualFps();
  lastDue = Number.isFinite(stepMs) && stepMs > 0 && ts - lastDue < stepMs * 3 ? ts - ((ts - lastDue) % stepMs) : ts;
  frameNow = ts;
  const dt = last ? Math.min(100, ts - last) : 16;
  last = ts;
  const v = inputVector();
  const world = flip ? { dx: -v.dx, dy: -v.dy } : v;
  const switchTo = queuedSwitch;
  const shield = queuedGuard;
  const swapAttack = queuedAttack;
  const dodge = queuedDodge;
  const special = queuedSpecial;
  queuedSwitch = -1;
  queuedGuard = false;
  queuedAttack = false;
  queuedDodge = false;
  queuedSpecial = false;
  let events: ArenaEvent[] = [];
  if (hostLink) events = hostLink.step(dt, { dx: world.dx, dy: world.dy, switchTo, shield, swapAttack, dodge, special });
  else if (guestLink) {
    guestLink.sendInput({ dx: world.dx, dy: world.dy, switchTo, shield, swapAttack, dodge, special }, ts);
    events = guestLink.events.splice(0);
    stale.value = state.winner === null && guestLink.received > 0 && ts - guestLink.lastAt > 2500;
  }
  if (events.length) {
    handleEvents(events);
    playBeats(director.take(events, (side) => aliveCount(state.sides[side]), ts));
  }
  applyCamera(ts);
  // Congelamento de impacto: só a imagem segura. O primeiro quadro desenha o golpe e os seguintes repetem; a luta e o toque seguem.
  const frozen = fxOn() && director.frozen(ts);
  if (!frozen || !wasFrozen) buildScene(ts);
  wasFrozen = frozen;
  if (events.length || ts - lastHud > 90) {
    lastHud = ts;
    buildHud();
  }
  if (state.winner !== null) finish();
}

function joyDown(e: PointerEvent): void {
  wake();
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
  if (down && !e.repeat && (e.key === 'f' || e.key === 'F' || e.key === 'Shift')) requestDodge();
  if (down && !e.repeat && (e.key === 'r' || e.key === 'R')) requestSpecial();
  if (down && !e.repeat && (e.key === ' ' || e.key === 'e' || e.key === 'E')) {
    e.preventDefault();
    requestGuard();
  }
}

function onBlur(): void {
  keys.up = keys.down = keys.left = keys.right = false;
  // Sem isto, um dedo que estava arrastando quando o app perdeu o foco continuaria andando sozinho.
  joyId = null;
  joy.active = false;
  joyVx = 0;
  joyVy = 0;
}

const unitStyle = (u: Unit): Record<string, string> => ({ left: `${u.x}%`, top: `${u.y}%`, '--kx': u.kx, '--ky': u.ky, '--sw': String(u.sw) });

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
  if (shakeTimer) clearTimeout(shakeTimer);
  if (shakeFrame) cancelAnimationFrame(shakeFrame);
  sound.dispose();
  timers.forEach(clearTimeout);
  timers.clear();
  sparks.clear();
});

</script>

<template>
  <section class="svp" :class="{ six: hud.mine.length > 3, lite }" :style="{ '--svp-field-scale': SV_ARENA_W / SV_VIEW_W }" aria-label="Arena da luta">
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
      :class="[{ hurt, shake }, drama ? `drama-${drama}` : '']"
      @pointerdown="joyDown"
      @pointermove="joyMove"
      @pointerup="joyUp"
      @pointercancel="joyUp"
    >
      <div ref="stageEl" class="svp-stage">
      <div class="svp-floor" :style="floorStyle" aria-hidden="true"></div>
      <div v-for="u in units" :key="u.key" class="svp-unit" :class="{ mine: u.mine, shield: u.shield, guard: u.guard, hit: u.hit, swap: !!u.swap, down: u.down, low: u.low, 'face-right': u.faceRight, dodge: u.dodge, ready: u.ready }" :style="unitStyle(u)">
        <span class="svp-shadow" aria-hidden="true"></span>
        <span class="svp-bubble" aria-hidden="true"></span>
        <span class="svp-ring"></span>
        <span v-if="u.status" class="svp-status" aria-hidden="true">{{ u.status }}</span>
        <img v-if="!broken.includes(u.dexId)" class="svp-sprite" :src="pokemonSpriteUrl(u.dexId, u.shiny)" :alt="u.name" draggable="false" @error="markBroken(u.dexId)" />
        <span v-else class="svp-fallback big" role="img" :aria-label="`${u.name} (sem sprite)`">{{ u.name.slice(0, 2) }}</span>
      </div>

      <canvas ref="artCanvas" class="svp-art" aria-hidden="true"></canvas>
      <div v-for="u in units" :key="`bar-${u.key}`" class="svp-bars" :class="{ low: u.low, down: u.down, swap: !!u.swap }" :style="unitStyle(u)" aria-hidden="true">
        <i class="svp-bar floating"><b :style="{ width: `${u.hpPct}%` }"></b></i>
      </div>

      <span
        v-for="f in fx"
        :key="f.id"
        class="svp-fx"
        :class="[f.kind, { mine: f.mine, big: f.big }]"
        :style="{ ...f.style, color: f.color }"
        aria-hidden="true"
      >{{ f.text }}</span>
      </div>

      <div v-if="joy.active" class="svp-joy" :style="{ left: `${joy.ox}px`, top: `${joy.oy}px` }" aria-hidden="true">
        <span class="knob" :style="{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }"></span>
      </div>

      <span
        v-if="pointer"
        class="svp-pointer"
        :style="{ left: `${(pointer.x / SV_VIEW_W) * 100}%`, top: `${(pointer.y / SV_VIEW_H) * 100}%`, transform: `translate(-50%, -50%) rotate(${pointer.angle}rad)` }"
        aria-hidden="true"
      >➤</span>

      <div v-if="hud.vs" class="svp-vs" aria-hidden="true">
        <div class="svp-vs-side foe" :style="{ '--c': hud.vs.foe.color }">
          <img v-if="!broken.includes(hud.vs.foe.dexId)" :src="pokemonSpriteUrl(hud.vs.foe.dexId, hud.vs.foe.shiny)" alt="" @error="markBroken(hud.vs.foe.dexId)" />
          <span><small>{{ hud.vs.foe.trainer }}</small><b>{{ hud.vs.foe.name }}</b><em>{{ hud.vs.foe.left }} de pé</em></span>
        </div>
        <strong class="svp-vs-mark">VS</strong>
        <div class="svp-vs-side mine" :style="{ '--c': hud.vs.me.color }">
          <span><small>{{ hud.vs.me.trainer }}</small><b>{{ hud.vs.me.name }}</b><em>{{ hud.vs.me.left }} de pé</em></span>
          <img v-if="!broken.includes(hud.vs.me.dexId)" :src="pokemonSpriteUrl(hud.vs.me.dexId, hud.vs.me.shiny)" alt="" @error="markBroken(hud.vs.me.dexId)" />
        </div>
      </div>
      <div v-if="cutIn" :key="cutIn.id" class="svp-cutin" :class="{ mine: cutIn.mine }" :style="{ '--c': cutIn.color }" aria-hidden="true">
        <img v-if="!broken.includes(cutIn.dexId)" :src="pokemonSpriteUrl(cutIn.dexId, cutIn.shiny)" alt="" @error="markBroken(cutIn.dexId)" />
        <span><small>{{ cutIn.name }}</small><b>{{ cutIn.move }}</b></span>
      </div>
      <p v-if="banner" :key="banner.id" class="svp-banner" :class="banner.tone" role="status">{{ banner.text }}</p>
      <div v-if="hud.charge" class="svp-charge" role="progressbar" :aria-valuenow="hud.charge.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="hud.charge.label"><small>{{ hud.charge.label }} {{ hud.charge.pct }}%</small><i class="svp-bar"><b :style="{ width: `${hud.charge.pct}%` }"></b></i></div>
      <p v-if="hud.count > 0" :key="hud.count" class="svp-count" aria-hidden="true">{{ hud.count }}</p>
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
        aria-keyshortcuts="E Space"
        @click="requestGuard"
      >
        <span class="svp-guard-icon" aria-hidden="true">🛡</span>
        <small>{{ hud.guardOn ? 'Ativo' : hud.guardPct > 0 ? `${hud.guardSec} s` : 'Escudo' }}</small>
        <span v-if="hud.guardPct > 0 && !hud.guardOn" class="svp-cd" :style="{ height: `${hud.guardPct}%` }" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="svp-guard svp-dodge"
        :class="{ wait: hud.dodgePct > 0 }"
        :aria-label="hud.dodgePct > 0 ? `Esquiva recarregando, ${hud.dodgeSec} segundos` : 'Esquiva: toque para arrancar e atravessar os golpes'"
        aria-keyshortcuts="F Shift"
        @pointerdown.stop="requestDodge"
        @click="keyClick($event, requestDodge)"
      >
        <span class="svp-guard-icon" aria-hidden="true">💨</span>
        <small>{{ hud.dodgePct > 0 ? `${hud.dodgeSec} s` : 'Esquiva' }}</small>
        <span v-if="hud.dodgePct > 0" class="svp-cd" :style="{ height: `${hud.dodgePct}%` }" aria-hidden="true"></span>
      </button>
      <button
        v-if="hud.special"
        type="button"
        class="svp-guard svp-special"
        :class="{ ready: hud.special.ready }"
        :style="{ '--attack-color': hud.special.color }"
        :aria-label="hud.special.ready ? `Especial pronto: ${hud.special.label}. Toque para lançar` : `Especial carregando, ${hud.special.pct}%`"
        aria-keyshortcuts="R"
        @pointerdown.stop="requestSpecial"
        @click="keyClick($event, requestSpecial)"
      >
        <span class="svp-fill" :style="{ height: `${hud.special.pct}%` }" aria-hidden="true"></span>
        <span class="svp-guard-icon" aria-hidden="true">✨</span>
        <small>{{ hud.special.ready ? 'Especial!' : `${hud.special.pct}%` }}</small>
      </button>
      <button
        v-if="hud.attack"
        type="button"
        class="svp-guard svp-attack"
        :class="{ alt: hud.attack.alt, wait: hud.attack.pct > 0 }"
        :style="{ '--attack-color': hud.attack.color }"
        :aria-label="`Ataque em uso: ${hud.attack.now.typeLabel}, ${hud.attack.now.categoryLabel}, ${hud.attack.now.name}. Toque para trocar para ${hud.attack.next.typeLabel}, ${hud.attack.next.categoryLabel}, ${hud.attack.next.name}`"
        @pointerdown.stop
        aria-keyshortcuts="Q"
        :aria-disabled="hud.attack.pct > 0"
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
        <small>{{ hud.attack.pct > 0 ? `Trocar em ${hud.attack.sec} s` : 'Toque: trocar' }}</small>
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
          :aria-keyshortcuts="String(r.index + 1)"
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
        <div v-if="result && pose" class="svp-pose" :style="{ '--c': pose.color }" aria-hidden="true">
          <i class="svp-rays"></i>
          <img v-if="!broken.includes(pose.dexId)" :src="pokemonSpriteUrl(pose.dexId, pose.shiny)" alt="" @error="markBroken(pose.dexId)" />
          <span v-else class="svp-fallback big">{{ pose.name.slice(0, 2) }}</span>
        </div>
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
  width: min(100%, 430px, calc((100dvh - 332px) * 0.6667));
  min-width: min(200px, calc(100vw - 32px));
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

/* O palco é o que a câmera aproxima; botões, seta e avisos ficam parados por cima. */
.svp-stage {
  position: absolute;
  inset: 0;
}

.svp-arena.drama-mine::before,
.svp-arena.drama-foe::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 50%, transparent 54%, rgba(224, 52, 52, 0.42) 100%);
  animation: svp-drama 1.1s ease-in-out infinite alternate;
}

.svp-arena.drama-foe::before {
  background: radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(255, 209, 102, 0.3) 100%);
}

@keyframes svp-drama {
  from { opacity: 0.55; }
  to { opacity: 1; }
}

.svp-vs {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 1fr auto 1fr;
  pointer-events: none;
  background: rgba(6, 8, 16, 0.55);
  animation: svp-vs-out 3s linear both;
}

@keyframes svp-vs-out {
  0%, 74% { opacity: 1; }
  100% { opacity: 0; }
}

.svp-vs-side {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3cqw;
  min-height: 0;
  background: linear-gradient(100deg, color-mix(in srgb, var(--c) 78%, #101018), color-mix(in srgb, var(--c) 28%, #101018));
  color: #fff;
  animation: svp-vs-right 0.34s cubic-bezier(0.2, 0.9, 0.3, 1) both;
}

.svp-vs-side.foe {
  clip-path: polygon(0 0, 100% 0, 100% 84%, 0 100%);
}

.svp-vs-side.mine {
  clip-path: polygon(0 16%, 100% 0, 100% 100%, 0 100%);
  animation-name: svp-vs-left;
}

@keyframes svp-vs-right {
  from { translate: 100% 0; }
}

@keyframes svp-vs-left {
  from { translate: -100% 0; }
}

.svp-vs-side img {
  height: 30cqw;
  max-width: 38cqw;
  object-fit: contain;
  image-rendering: pixelated;
}

.svp-vs-side.foe img {
  scale: -1 1;
}

.svp-vs-side span,
.svp-cutin span {
  display: grid;
  min-width: 0;
  line-height: 1.1;
}

.svp-vs-side small,
.svp-cutin small {
  font-size: 3.6cqw;
  font-weight: 800;
  opacity: 0.85;
}

.svp-vs-side b {
  font-size: 7cqw;
  font-weight: 900;
}

.svp-vs-side em {
  font-size: 3.4cqw;
  font-style: normal;
}

/* À esquerda: o centro é da contagem. */
.svp-vs-mark {
  justify-self: start;
  margin-left: 14cqw;
  padding: 0 4cqw;
  font-size: 11cqw;
  font-style: italic;
  font-weight: 900;
  line-height: 1.15;
  color: #ffd166;
  text-shadow: 0 3px 0 #7a1f12;
}

.svp-cutin {
  position: absolute;
  left: -6%;
  right: -6%;
  top: 11%;
  height: 18%;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 3cqw;
  padding: 0 10%;
  transform: skewY(-3deg);
  background: linear-gradient(90deg, color-mix(in srgb, var(--c) 92%, #000), color-mix(in srgb, var(--c) 45%, transparent));
  border-block: 2px solid rgba(255, 255, 255, 0.85);
  color: #fff;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55);
  pointer-events: none;
  animation: svp-cutin 0.92s linear both;
}

.svp-cutin.mine {
  top: auto;
  bottom: 13%;
}

@keyframes svp-cutin {
  0% { translate: -105% 0; }
  13%, 80% { translate: 0 0; opacity: 1; }
  100% { translate: 105% 0; opacity: 0.4; }
}

.svp-cutin img {
  height: 26cqw;
  max-width: 30cqw;
  object-fit: contain;
  image-rendering: pixelated;
}

.svp-cutin b {
  font-size: 7.6cqw;
  font-style: italic;
  font-weight: 900;
}

.svp-banner {
  position: absolute;
  left: 0;
  right: 0;
  top: 42%;
  z-index: 3;
  margin: 0;
  text-align: center;
  font-size: 11cqw;
  font-style: italic;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 3px 0 #a01818, 0 0 8px rgba(0, 0, 0, 0.7);
  pointer-events: none;
  animation: svp-banner 0.8s ease-out both;
}

.svp-banner.last {
  font-size: 8cqw;
  color: #ffd166;
  animation-duration: 1.3s;
}

@keyframes svp-banner {
  0% { scale: 1.7; opacity: 0; }
  16% { scale: 1; opacity: 1; }
  78% { opacity: 1; }
  100% { opacity: 0; }
}

.svp-unit.dodge .svp-sprite {
  opacity: 0.55;
}

.svp-unit.ready .svp-ring {
  border-color: #ffffff;
  border-width: 3px;
}

.svp-dodge {
  border-color: #7fd0ff;
  background: rgba(127, 208, 255, 0.16);
}

.svp-special {
  border-color: var(--attack-color, #fff);
  background: var(--surface-2);
}

.svp-special > :not(.svp-fill) {
  position: relative;
}

.svp-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--attack-color, #fff) 55%, transparent);
  pointer-events: none;
  transition: height 120ms linear;
}

.svp-special.ready {
  box-shadow: 0 0 0 2px var(--attack-color, #fff);
  animation: svp-ready 0.6s ease-in-out infinite alternate;
}

@keyframes svp-ready {
  to { scale: 1.05; }
}

.svp-pose {
  position: relative;
  display: grid;
  place-items: center;
  height: 112px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--c) 40%, #101018);
}

.svp-rays {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 340px;
  height: 340px;
  margin: -170px 0 0 -170px;
  background: repeating-conic-gradient(color-mix(in srgb, var(--c) 70%, #ffffff) 0 12deg, transparent 12deg 30deg);
  opacity: 0.5;
  animation: svp-rays 9s linear infinite;
}

@keyframes svp-rays {
  to { rotate: 360deg; }
}

.svp-pose img {
  position: relative;
  height: 96px;
  max-width: 80%;
  object-fit: contain;
  image-rendering: pixelated;
  animation: svp-pose 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both, svp-hop 0.9s ease-in-out 0.6s infinite alternate;
}

@keyframes svp-pose {
  from { scale: 0.2; opacity: 0; }
}

@keyframes svp-hop {
  to { translate: 0 -8px; }
}

.svp.lite .svp-vs,
.svp.lite .svp-vs-side,
.svp.lite .svp-special.ready,
.svp.lite .svp-rays,
.svp.lite .svp-pose img,
.svp.lite .svp-arena::before {
  animation: none;
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
  padding: 1px 5px;
  border-radius: 99px;
  background: rgba(0, 0, 0, 0.55);
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

.svp-fx {
  position: absolute;
  pointer-events: none;
}

.svp-shadow {
  position: absolute;
  left: 0;
  top: 0;
  width: 12cqw;
  height: 3.2cqw;
  transform: translate(-50%, -1.6cqw);
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.45), transparent 70%);
  pointer-events: none;
}

.svp-unit.mine .svp-ring {
  box-shadow: 0 0 10px 1px rgba(79, 140, 224, 0.6);
}

.svp-bars {
  position: absolute;
  z-index: 2;
  width: 0;
  height: 0;
  pointer-events: none;
}

.svp-bars.down {
  opacity: 0;
}

.svp-bars.low .svp-bar b {
  background: #e0524f;
  animation: svp-blink 0.5s steps(2) infinite;
}

@keyframes svp-blink {
  50% { opacity: 0.35; }
}

.svp-unit.down .svp-sprite {
  animation: svp-faint 0.65s ease-in forwards;
}

@keyframes svp-faint {
  to { opacity: 0; translate: 0 4cqw; rotate: 90deg; filter: grayscale(1); }
}

.svp-unit.hit .svp-sprite {
  translate: var(--kx, 0) var(--ky, 0);
}

.svp-guard:focus-visible,
.svp-swap:focus-visible {
  outline: 3px solid #ffffff;
  outline-offset: 2px;
}

.svp-swap.active::after {
  content: '';
  position: absolute;
  top: 3px;
  right: 3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4f8ce0;
}

.svp-arena::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 58%, rgba(0, 0, 0, 0.26) 100%);
  pointer-events: none;
}

.svp-count {
  animation: svp-pop 0.4s ease-out;
}

@keyframes svp-pop {
  from { scale: 1.8; opacity: 0; }
}

.svp-unit.swap .svp-sprite {
  scale: var(--sw, 1);
  opacity: var(--sw, 1);
  translate: 0 calc((1 - var(--sw, 1)) * -9cqw);
  filter: brightness(calc(1.2 + (1 - var(--sw, 1)))) saturate(2.2) drop-shadow(0 0 4px #ff2a2a);
}

.svp-unit.swap .svp-shadow,
.svp-bars.swap {
  opacity: var(--sw, 1);
}

.svp-arena.shake {
  animation: svp-shake 0.22s linear;
}

@keyframes svp-shake {
  0%, 100% { translate: 0 0; }
  20% { translate: -1.2cqw 0.4cqw; }
  40% { translate: 1.2cqw -0.4cqw; }
  60% { translate: -0.8cqw 0.2cqw; }
  80% { translate: 0.6cqw 0; }
}

.svp-fx.dmg.big {
  font-size: 7.4cqw;
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
  0% { opacity: 0; translate: 0 4cqw; }
  15% { opacity: 1; }
  100% { opacity: 0; translate: 0 -6cqw; }
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
  .svp-arena.shake, .svp-unit.down .svp-sprite, .svp-bars.low .svp-bar b, .svp-count, .svp-vs, .svp-vs-side, .svp-special.ready, .svp-rays, .svp-pose img, .svp-arena::before, .svp-banner { animation: none; }
  .svp-fill { transition: none; }
  .svp-unit.hit .svp-sprite { translate: none; filter: none; }
  .svp-bubble { animation: none; }
  .svp-arena.hurt { outline-width: 2px; }
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
  top: 37%;
  margin: 0;
  text-align: center;
  font-size: 4rem;
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
  font-size: 0.76rem;
  max-height: 2.8em;
  overflow: hidden;
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
  top: 24%;
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
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.85);
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
  font-size: 0.72rem;
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
