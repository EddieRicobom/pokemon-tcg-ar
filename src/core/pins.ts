import { parseCardDamage, typeEffectiveness } from './battle';
import type { Rng } from './battle';
import { createArenaGrid, frictionAt, seedMarks, stampKind, stampType } from './pin-terrain';
import type { MarkResult, Spot } from './pin-terrain';
import { energyLabelPt, energyType } from './pokemon-data';
import type { BaseStats, CardAttack, PokemonType } from './pokemon-data';
import type { TerrainGrid, TerrainKind, TerrainReaction } from './terrain';

export type { Spot };

/**
 * Pin Mode: os Pokémon são pinos de boliche vistos de cima numa arena redonda. Quem empurra todos os adversários para fora
 * vence. Só física e regras (puro e testável); a tela fica em `views/PinsView.vue` e a arte em `pins/`.
 *
 * Unidades do mundo: a arena é um círculo de raio `ARENA_RADIUS` com o centro em (0, 0); y cresce para baixo (como no
 * canvas). Você começa embaixo (lado 0) e os adversários em cima (lado 1).
 */

export const ARENA_RADIUS = 330;
/** Distância de arrasto (em unidades) que dá a força máxima. */
export const MAX_PULL = 150;
/** Arrasto menor que isso cancela o disparo. */
export const MIN_PULL = 14;
/** Velocidade de saída do disparo com força máxima e `shot` = 1. */
export const BASE_SPEED = 760;
export const MAX_SPEED = 1350;
/** Desaceleração do chão comum (unidades/s²). */
export const GROUND_DECEL = 420;
const RESTITUTION = 0.86;
const BUMPER_RESTITUTION = 1.25;
const BUMPER_MIN_KICK = 150;
/** O pin elemental deixa uma marca a cada tanto que anda (unidades) e uma maior ao acertar alguém. */
const TRAIL_STEP = 26;
const TRAIL_POWER = 0.35;
const SPLASH_POWER = 0.9;
const CRACK_POWER = 0.75;
/** Quando o chão reage (fogo na água, por exemplo), quem está por perto leva um empurrão. */
const REACTION_REACH = 110;
const REACTION_KICK = 230;
export const STOP_SPEED = 6;
const FALL_SECONDS = 0.75;
/** Quantos pins cada lado leva para a arena. */
export const MAX_PER_SIDE: Record<Side, number> = { 0: 6, 1: 10 };

export type Side = 0 | 1;
export type Difficulty = 'facil' | 'normal' | 'dificil';
export const DIFFICULTIES: readonly Difficulty[] = ['facil', 'normal', 'dificil'];
export const DIFFICULTY_LABELS_PT: Record<Difficulty, string> = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' };

// ----------------------------------------------------------------------------- golpes da carta

/** Como um golpe da carta muda o disparo. Sem golpe escolhido o disparo é normal. */
export type EffectKind = 'turbo' | 'impacto' | 'onda' | 'elemental' | 'escudo';
export const EFFECT_KINDS: readonly EffectKind[] = ['turbo', 'impacto', 'onda', 'elemental', 'escudo'];

export const EFFECT_INFO: Record<EffectKind, { name: string; hint: string }> = {
  turbo: { name: 'Rápido', hint: 'Sai mais veloz e desliza melhor no chão.' },
  impacto: { name: 'Pancada', hint: 'Mais pesado e com empurrão forte, mas sai um pouco mais devagar.' },
  onda: { name: 'Onda', hint: 'No primeiro choque, uma onda empurra quem estiver por perto.' },
  elemental: { name: 'Elemental', hint: 'Passa a valer o tipo do golpe: vantagem de tipos e chão.' },
  escudo: { name: 'Escudo', hint: 'Fica pesado e firme até depois da resposta do adversário.' },
};

/** Efeito ativo num pin durante um disparo. */
export interface ShotEffect {
  kind: EffectKind;
  /** Tipo do golpe (só no elemental). */
  type: PokemonType | null;
  /** A onda só acontece uma vez. */
  used?: boolean;
}

/** Fatores do disparo por efeito. */
const EFFECT_SPEED: Record<EffectKind, number> = { turbo: 1.35, impacto: 0.92, onda: 0.88, elemental: 1, escudo: 0.8 };
const EFFECT_MASS: Record<EffectKind, number> = { turbo: 1, impacto: 1.8, onda: 1.2, elemental: 1, escudo: 2.5 };
const EFFECT_PUNCH: Record<EffectKind, number> = { turbo: 1, impacto: 1.25, onda: 1.1, elemental: 1.15, escudo: 0.8 };
const TURBO_FRICTION = 0.75;
const WAVE_REACH = 150;
const WAVE_KICK = 320;

/**
 * Efeito de um ataque da carta (a regra é só esta; nada de ler o texto livre):
 * - sem dano impresso (ataque de apoio) → Escudo;
 * - dano 100 ou mais → Onda; 60 a 99 → Pancada;
 * - ataque barato (1 energia) e fraco → Rápido;
 * - o resto → Elemental, com o tipo da energia exigida (sem energia colorida, vira Rápido).
 */
export function effectForAttack(attack: CardAttack, fallbackType: PokemonType | null = null): ShotEffect {
  const damage = parseCardDamage(attack.damage);
  if (damage === null) return { kind: 'escudo', type: null };
  if (damage >= 100) return { kind: 'onda', type: null };
  if (damage >= 60) return { kind: 'impacto', type: null };
  if (attack.cost.length <= 1 && damage < 40) return { kind: 'turbo', type: null };
  const colored = attack.cost.map((c) => energyType(c)).find((t): t is PokemonType => t !== null && t !== 'normal');
  if (colored) return { kind: 'elemental', type: colored };
  return fallbackType && damage >= 40 ? { kind: 'elemental', type: fallbackType } : { kind: 'turbo', type: null };
}

export interface PinMove {
  name: string;
  /** Energia impressa na carta (por exemplo, ['Lightning', 'Colorless']). */
  cost: string[];
  damage?: string;
  effect: ShotEffect;
  /** Quantos disparos seus o golpe espera para poder ser usado de novo: quanto mais energia na carta, mais espera (1 a 4). */
  cooldown: number;
}

export const MAX_MOVES = 4;

export function cooldownFor(attack: CardAttack): number {
  return clamp(attack.cost.length, 1, 4);
}

export function movesFromAttacks(attacks: readonly CardAttack[] | undefined, fallbackType: PokemonType | null): PinMove[] {
  return (attacks ?? []).slice(0, MAX_MOVES).map((a) => ({
    name: a.name,
    cost: [...a.cost],
    damage: a.damage,
    effect: effectForAttack(a, fallbackType),
    cooldown: cooldownFor(a),
  }));
}

/** Texto curto do que o golpe faz ("Elemental · Fogo"). */
export function effectLabel(effect: ShotEffect): string {
  const base = EFFECT_INFO[effect.kind].name;
  const first = effect.type ? effectTypeLabel(effect.type) : null;
  return first ? `${base} · ${first}` : base;
}

function effectTypeLabel(type: PokemonType): string {
  return energyLabelPt(type === 'electric' ? 'lightning' : type === 'dark' ? 'darkness' : type === 'steel' ? 'metal' : type);
}

// ----------------------------------------------------------------------------- pins

export interface PinSpec {
  id: string;
  name: string;
  types: PokemonType[];
  /** Atributos-base da PokéAPI; ausente = sem dado (o pin fica neutro e a tela avisa). */
  stats: BaseStats | null;
  weightKg: number | null;
  /** Ataques da carta escaneada (TCGdex); sem eles o pin só faz o disparo normal. */
  attacks?: CardAttack[];
}

export interface Pin {
  id: string;
  name: string;
  side: Side;
  types: PokemonType[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Raio do disco. */
  r: number;
  /** Massa efetiva (peso + resistência), usada nas colisões. */
  mass: number;
  /** Força do empurrão (ataque), de ~0,9 a ~1,4. */
  punch: number;
  /** Fator da velocidade do disparo (velocidade), de ~0,75 a ~1,5. */
  shot: number;
  /** 0 a 1: o quanto o pin é forte. Define o custo de energia. */
  rating: number;
  /** Energia gasta a cada disparo com este pin. */
  cost: number;
  alive: boolean;
  /** 0 = em pé; de 0 a 1 enquanto cai da arena. */
  fall: number;
  /** Faltou peso ou atributos: valores neutros. */
  estimated: boolean;
  /** Golpes da carta que dão efeito ao disparo, e quantos disparos faltam para cada um poder ser usado. */
  moves: PinMove[];
  cooldowns: number[];
  /** Efeito do golpe em uso (nulo = disparo normal). */
  active: ShotEffect | null;
  /** Onde o pin elemental deixou a última marca deste disparo (nulo = ainda não deixou). */
  lastMark: { x: number; y: number } | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Massa, empurrão e tipos que valem agora: o golpe em uso muda os três. */
export const massOf = (p: Pin) => p.mass * (p.active ? EFFECT_MASS[p.active.kind] : 1);
export const punchOf = (p: Pin) => p.punch * (p.active ? EFFECT_PUNCH[p.active.kind] : 1);
export const typesOf = (p: Pin): readonly PokemonType[] => (p.active?.kind === 'elemental' && p.active.type ? [p.active.type] : p.types);

const NEUTRAL_STATS: BaseStats = { hp: 70, attack: 70, defense: 70, spAttack: 70, spDefense: 70, speed: 70 };

/** Massa só pelo peso: 0,6 (Diglett) a 6 (Snorlax, Wailord). */
export function weightMass(kg: number): number {
  return clamp(Math.sqrt(Math.max(0, kg)) / 3, 0.6, 6);
}

/**
 * Transforma o que se sabe do Pokémon em um pin:
 * - peso → massa e tamanho do disco (mais pesado empurra mais e é mais difícil de empurrar);
 * - HP, Defesa e Def. Esp. → resistência (somam à massa);
 * - Ataque (o maior entre físico e especial) → força do empurrão;
 * - Velocidade → velocidade do disparo;
 * - o conjunto dos atributos, o peso e a velocidade → `rating`, que vira o custo em energia.
 * Sem atributos ou sem peso o pin usa valores neutros (`estimated`), nunca números inventados em silêncio.
 */
export function pinFromSpec(spec: PinSpec, side: Side): Pin {
  const stats = spec.stats ?? NEUTRAL_STATS;
  const hasWeight = spec.weightKg !== null && spec.weightKg > 0;
  // Sem peso: parte do porte pelos atributos de resistência (valor neutro, não o peso real).
  const kg = hasWeight ? spec.weightKg! : 20 + ((stats.hp + stats.defense) / 2) * 0.4;
  const wMass = weightMass(kg);
  const tough = clamp((stats.hp + stats.defense + stats.spDefense) / 3 / 130, 0.3, 1.3);
  const mass = wMass * (0.75 + 0.5 * tough);
  const punch = 0.85 + 0.45 * clamp(Math.max(stats.attack, stats.spAttack) / 130, 0.2, 1.3);
  const shot = 0.7 + 0.6 * clamp(stats.speed / 130, 0.1, 1.3);
  const bst = stats.hp + stats.attack + stats.defense + stats.spAttack + stats.spDefense + stats.speed;
  const rating = clamp(0.5 * clamp((bst - 200) / 450, 0, 1) + 0.3 * (wMass / 6) + 0.2 * clamp((shot - 0.7) / 0.8, 0, 1), 0, 1);
  const moves = movesFromAttacks(spec.attacks, spec.types[0] ?? null);
  return {
    id: spec.id,
    name: spec.name,
    side,
    types: [...spec.types],
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 30 + 16 * Math.sqrt(wMass / 6),
    mass,
    punch,
    shot,
    rating,
    cost: 5 + Math.round(35 * rating),
    alive: true,
    fall: 0,
    estimated: spec.stats === null || !hasWeight,
    moves,
    cooldowns: moves.map(() => 0),
    active: null,
    lastMark: null,
  };
}

// ----------------------------------------------------------------------------- terrenos e tipos

export type PatchKind = 'bumper';
export const PATCH_LABELS_PT: Record<PatchKind, { name: string; hint: string }> = {
  bumper: { name: 'Pino de mola', hint: 'Rebate o pin com mais força.' },
};

/** Obstáculo redondo da arena (hoje só o pino de mola). O resto do chão é a grade de `terrain`. */
export interface Patch {
  kind: PatchKind;
  x: number;
  y: number;
  r: number;
  angle: number;
}

/** Bônus de empurrão pela vantagem de tipos (o melhor tipo de quem bate contra os tipos de quem apanha). */
export function typeKnockback(attacker: readonly PokemonType[], defender: readonly PokemonType[]): number {
  if (attacker.length === 0 || defender.length === 0) return 1;
  const m = Math.max(...attacker.map((t) => typeEffectiveness(t, [...defender])));
  if (m === 0) return 0.75;
  if (m < 1) return 0.9;
  if (m === 1) return 1;
  return m < 4 ? 1.2 : 1.4;
}

// ----------------------------------------------------------------------------- mundo

export interface PinWorld {
  radius: number;
  patches: Patch[];
  pins: Pin[];
  time: number;
  /** Chão em blocos (base + marcas dos golpes), igual ao da batalha da Caixa. Sem ele, o atrito é sempre o comum. */
  terrain?: TerrainGrid | null;
  /** Sorteio das marcas. Sem ele os golpes não marcam o chão (a mira usa assim, só para ler). */
  markRng?: Rng | null;
  /** Raio da parte da arena que ainda vale (a borda que encolhe). Sem ele vale `radius` inteiro. */
  limit?: number;
  /** Rodadas completas (um disparo seu + a resposta do adversário) já jogadas. */
  round?: number;
  /** A borda encolhe com as rodadas. */
  shrinking?: boolean;
}

/** Raio onde o pin cai agora. */
export const arenaLimit = (world: PinWorld): number => world.limit ?? world.radius;

export type PinEvent =
  | { type: 'hit'; a: string; b: string; strength: number; /** Vantagem de tipos de quem acertou a favor de quem apanhou. */ edge: 'super' | 'weak' | 'none' | null }
  | { type: 'out'; id: string }
  | { type: 'bumper'; id: string }
  | { type: 'wave'; id: string }
  | { type: 'shrink'; limit: number }
  | { type: 'mark'; kind: TerrainKind; x: number; y: number; cells: number[]; reaction: TerrainReaction | null };

const PATCH_SPECS: { kind: PatchKind; count: number; min: number; max: number }[] = [{ kind: 'bumper', count: 2, min: 22, max: 27 }];

/**
 * Sorteia os obstáculos dentro da arena, sem cobrir quem começa (`avoid`) e sem se sobrepor. Com muitos pins a
 * faixa livre do meio é estreita e podem entrar menos elementos.
 */
export function buildPatches(rng: Rng, radius = ARENA_RADIUS, avoid: readonly Spot[] = []): Patch[] {
  const patches: Patch[] = [];
  for (const spec of PATCH_SPECS) {
    for (let n = 0; n < spec.count; n++) {
      for (let attempt = 0; attempt < 80; attempt++) {
        const r = spec.min + rng() * (spec.max - spec.min);
        const reach = radius * 0.8 - r;
        const x = (rng() * 2 - 1) * reach;
        const y = (rng() * 2 - 1) * reach;
        if (Math.hypot(x, y) > reach) continue;
        if (patches.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 12)) continue;
        if (avoid.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + r + 8)) continue;
        patches.push({ kind: spec.kind, x, y, r, angle: rng() * Math.PI * 2 });
        break;
      }
    }
  }
  return patches;
}

/**
 * Põe os pins nas posições iniciais: os seus embaixo, os adversários em cima, em fileiras que começam perto da borda
 * e seguem para o centro. Cada fileira leva quantos couberem na corda do círculo.
 */
export function layoutPins(pins: Pin[], radius = ARENA_RADIUS): void {
  for (const side of [0, 1] as const) {
    const group = pins.filter((p) => p.side === side);
    const rmax = Math.max(0, ...group.map((p) => p.r));
    const spacing = 2 * rmax + 8;
    let placed = 0;
    for (let row = 0; placed < group.length; row++) {
      const y = radius * 0.7 - row * (spacing + 2);
      const half = Math.sqrt(Math.max(0, (radius - rmax - 8) ** 2 - y * y));
      const capacity = Math.max(1, Math.floor((2 * half) / spacing) + 1);
      const n = Math.min(capacity, group.length - placed);
      for (let i = 0; i < n; i++) {
        const pin = group[placed + i]!;
        pin.x = (i - (n - 1) / 2) * spacing;
        pin.y = side === 0 ? y : -y;
        pin.vx = 0;
        pin.vy = 0;
      }
      placed += n;
    }
  }
}

// ----------------------------------------------------------------------------- borda que encolhe

/** Primeira rodada completa depois da qual a borda começa a avançar (as 2 primeiras são de aquecimento). */
export const SHRINK_AFTER_ROUND = 2;
/** Quanto a borda avança a cada rodada (unidades) e o menor raio que ela chega a ter. */
export const SHRINK_STEP = 28;
export const MIN_LIMIT = 170;

/** Raio da arena depois de `round` rodadas completas. */
export function limitForRound(radius: number, round: number): number {
  return Math.max(MIN_LIMIT, radius - SHRINK_STEP * Math.max(0, round - SHRINK_AFTER_ROUND + 1));
}

/** Raio que a arena terá depois da próxima rodada (a tela mostra esta linha como aviso), ou null se não vai mudar. */
export function nextLimit(world: PinWorld): number | null {
  if (!world.shrinking) return null;
  const next = limitForRound(world.radius, (world.round ?? 0) + 1);
  return next < arenaLimit(world) ? next : null;
}

/**
 * Fecha uma rodada: se a borda encolhe, os pinos de mola que ficariam no vazio somem e quem tem o centro além da nova
 * borda cai (aviso `out`). Devolve os eventos para os sons e avisos da tela.
 */
export function advanceRound(world: PinWorld, events: PinEvent[] = []): PinEvent[] {
  const next = nextLimit(world);
  world.round = (world.round ?? 0) + 1;
  if (next === null) return events;
  world.limit = next;
  events.push({ type: 'shrink', limit: next });
  for (let i = world.patches.length - 1; i >= 0; i--) {
    const patch = world.patches[i]!;
    if (Math.hypot(patch.x, patch.y) + patch.r > next) world.patches.splice(i, 1);
  }
  for (const pin of world.pins) {
    if (pin.alive && pin.fall === 0 && Math.hypot(pin.x, pin.y) > next) {
      pin.fall = 1e-4;
      events.push({ type: 'out', id: pin.id });
    }
  }
  return events;
}

export interface WorldOptions {
  /** Os golpes elementais e a Pancada marcam o chão (e a arena já começa com algumas marcas). Padrão: sim. */
  marks?: boolean;
  /** A borda da arena encolhe a cada rodada depois do aquecimento. Padrão: não (o jogo liga pela opção). */
  shrink?: boolean;
}

export function createWorld(specs: { mine: PinSpec[]; enemy: PinSpec[] }, rng: Rng, options: WorldOptions = {}): PinWorld {
  const pins = [
    ...specs.mine.slice(0, MAX_PER_SIDE[0]).map((s) => pinFromSpec(s, 0)),
    ...specs.enemy.slice(0, MAX_PER_SIDE[1]).map((s) => pinFromSpec(s, 1)),
  ];
  layoutPins(pins);
  const spots = pins.map((p) => ({ x: p.x, y: p.y, r: p.r }));
  const patches = buildPatches(rng, ARENA_RADIUS, spots);
  const terrain = createArenaGrid(Math.floor(rng() * 1e6));
  const marks = options.marks !== false;
  if (marks) seedMarks(terrain, ARENA_RADIUS, rng, [...spots, ...patches]);
  return { radius: ARENA_RADIUS, patches, pins, time: 0, terrain, markRng: marks ? rng : null, limit: ARENA_RADIUS, round: 0, shrinking: options.shrink === true };
}

const standing = (pin: Pin) => pin.alive && pin.fall === 0;

/** Quem ainda está na arena (ou caindo, que já não conta). */
export function aliveOf(world: PinWorld, side: Side): Pin[] {
  return world.pins.filter((p) => p.side === side && p.alive && p.fall === 0);
}

export function isSettled(world: PinWorld): boolean {
  return world.pins.every((p) => !p.alive || (p.fall === 0 ? Math.hypot(p.vx, p.vy) < STOP_SPEED : false));
}

export type Outcome = 'playing' | 'won' | 'lost';

export function outcomeOf(world: PinWorld): Outcome {
  if (aliveOf(world, 1).length === 0) return 'won';
  if (aliveOf(world, 0).length === 0) return 'lost';
  return 'playing';
}

function edgeOf(mult: number): 'super' | 'weak' | 'none' | null {
  if (mult >= 1.15) return 'super';
  if (mult === 0.75) return 'none';
  if (mult < 1) return 'weak';
  return null;
}

/** Onda do golpe Onda: empurra para longe de quem bateu todos os pins que estiverem por perto. */
function shockwave(world: PinWorld, source: Pin, events: PinEvent[]): void {
  const reach = source.r + WAVE_REACH;
  for (const other of world.pins) {
    if (other === source || !standing(other)) continue;
    const dx = other.x - source.x;
    const dy = other.y - source.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    if (d > reach + other.r) continue;
    const falloff = clamp(1 - (d - other.r) / reach, 0.15, 1);
    const kick = (WAVE_KICK * falloff * punchOf(source)) / Math.sqrt(massOf(other));
    other.vx += (dx / d) * kick;
    other.vy += (dy / d) * kick;
  }
  events.push({ type: 'wave', id: source.id });
}

/** Aplica uma marca no chão, avisa a tela e, se o chão reagiu, empurra quem está perto (menos `sourceId`). */
function applyMark(world: PinWorld, mark: MarkResult | null, x: number, y: number, sourceId: string, events: PinEvent[]): void {
  if (!mark) return;
  events.push({ type: 'mark', kind: mark.kind, x, y, cells: mark.cells, reaction: mark.reaction });
  if (!mark.reaction) return;
  for (const other of world.pins) {
    if (other.id === sourceId || !standing(other)) continue;
    const dx = other.x - x;
    const dy = other.y - y;
    const d = Math.hypot(dx, dy) || 1e-6;
    if (d > REACTION_REACH + other.r) continue;
    const kick = (REACTION_KICK * clamp(1 - d / (REACTION_REACH + other.r), 0.25, 1)) / Math.sqrt(massOf(other));
    other.vx += (dx / d) * kick;
    other.vy += (dy / d) * kick;
  }
}

/** O pin elemental em movimento deixa um rastro de marcas no chão. */
function leaveTrail(world: PinWorld, pin: Pin, events: PinEvent[]): void {
  const effect = pin.active;
  if (!world.terrain || !world.markRng || effect?.kind !== 'elemental' || !effect.type) return;
  const last = pin.lastMark;
  if (last && Math.hypot(pin.x - last.x, pin.y - last.y) < TRAIL_STEP) return;
  pin.lastMark = { x: pin.x, y: pin.y };
  applyMark(world, stampType(world.terrain, world.radius, effect.type, pin.x, pin.y, TRAIL_POWER, world.markRng), pin.x, pin.y, pin.id, events);
}

/** Primeiro choque de um golpe elemental (borrão grande do tipo) ou da Pancada (rachaduras). */
function splash(world: PinWorld, striker: Pin, x: number, y: number, events: PinEvent[]): void {
  const effect = striker.active;
  if (!world.terrain || !world.markRng || !effect || effect.used) return;
  if (effect.kind === 'elemental' && effect.type) {
    effect.used = true;
    applyMark(world, stampType(world.terrain, world.radius, effect.type, x, y, SPLASH_POWER, world.markRng), x, y, striker.id, events);
  } else if (effect.kind === 'impacto') {
    effect.used = true;
    applyMark(world, stampKind(world.terrain, world.radius, 'crack', x, y, CRACK_POWER, world.markRng), x, y, striker.id, events);
  }
}

/** Avança a física `dt` segundos (use passos pequenos, ~1/120). Devolve o que aconteceu, para sons e avisos. */
export function stepWorld(world: PinWorld, dt: number, events: PinEvent[] = []): PinEvent[] {
  world.time += dt;
  const pins = world.pins;

  for (const pin of pins) {
    if (!pin.alive) continue;
    if (pin.fall > 0) {
      // Caindo: segue o embalo, encolhe e some.
      pin.fall = Math.min(1, pin.fall + dt / FALL_SECONDS);
      pin.x += pin.vx * dt;
      pin.y += pin.vy * dt;
      if (pin.fall >= 1) pin.alive = false;
      continue;
    }
    // Chão sob o pin: o atrito depende do bloco (chão base ou marca) e do tipo do pin.
    let mu = world.terrain ? frictionAt(world.terrain, world.radius, pin.x, pin.y, typesOf(pin)) : 1;
    // Atrito: desaceleração constante contra o movimento (o disparo Rápido desliza melhor).
    if (pin.active?.kind === 'turbo') mu *= TURBO_FRICTION;
    const speed = Math.hypot(pin.vx, pin.vy);
    if (speed > 0) {
      const slowed = Math.max(0, speed - GROUND_DECEL * mu * dt);
      const k = slowed / speed;
      pin.vx *= k;
      pin.vy *= k;
      if (slowed < STOP_SPEED * 0.4) {
        pin.vx = 0;
        pin.vy = 0;
      }
    }
    const capped = Math.hypot(pin.vx, pin.vy);
    if (capped > MAX_SPEED) {
      pin.vx *= MAX_SPEED / capped;
      pin.vy *= MAX_SPEED / capped;
    }
    pin.x += pin.vx * dt;
    pin.y += pin.vy * dt;

    // Pinos de mola (obstáculos que rebatem com mais força).
    for (const patch of world.patches) {
      if (patch.kind !== 'bumper') continue;
      const dx = pin.x - patch.x;
      const dy = pin.y - patch.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const min = patch.r + pin.r;
      if (d >= min) continue;
      const nx = dx / d;
      const ny = dy / d;
      pin.x = patch.x + nx * min;
      pin.y = patch.y + ny * min;
      const vn = pin.vx * nx + pin.vy * ny;
      if (vn < 0) {
        const out = Math.max(BUMPER_MIN_KICK, -vn * BUMPER_RESTITUTION);
        pin.vx += (out - vn) * nx;
        pin.vy += (out - vn) * ny;
        events.push({ type: 'bumper', id: pin.id });
      }
    }
    leaveTrail(world, pin, events);
  }

  // Choques entre pins.
  for (let i = 0; i < pins.length; i++) {
    const a = pins[i]!;
    if (!standing(a)) continue;
    for (let j = i + 1; j < pins.length; j++) {
      const b = pins[j]!;
      if (!standing(b)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const min = a.r + b.r;
      if (d >= min) continue;
      const nx = dx / d;
      const ny = dy / d;
      // Separa na proporção inversa da massa (o mais leve cede mais).
      const ma = massOf(a);
      const mb = massOf(b);
      const overlap = min - d;
      const total = ma + mb;
      a.x -= nx * overlap * (mb / total);
      a.y -= ny * overlap * (mb / total);
      b.x += nx * overlap * (ma / total);
      b.y += ny * overlap * (ma / total);
      const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vn <= 0) continue;
      const J = ((1 + RESTITUTION) * vn) / (1 / ma + 1 / mb);
      const ta = typesOf(a);
      const tb = typesOf(b);
      const kA = punchOf(a) * typeKnockback(ta, tb);
      const kB = punchOf(b) * typeKnockback(tb, ta);
      // Quem bate com mais força/vantagem empurra mais o outro; o ganho tem teto para não explodir.
      const dvB = Math.min((J * kA) / mb, vn * 1.5);
      const dvA = Math.min((J * kB) / ma, vn * 1.5);
      b.vx += nx * dvB;
      b.vy += ny * dvB;
      a.vx -= nx * dvA;
      a.vy -= ny * dvA;
      const faster = Math.hypot(a.vx, a.vy) >= Math.hypot(b.vx, b.vy);
      events.push({
        type: 'hit',
        a: a.id,
        b: b.id,
        strength: clamp(vn / 700, 0, 1),
        edge: edgeOf(faster ? typeKnockback(tb, ta) : typeKnockback(ta, tb)),
      });
      const hitX = a.x + nx * a.r;
      const hitY = a.y + ny * a.r;
      for (const striker of [a, b]) splash(world, striker, hitX, hitY, events);
      for (const striker of [a, b]) {
        if (striker.active?.kind === 'onda' && !striker.active.used) {
          striker.active.used = true;
          shockwave(world, striker, events);
        }
      }
    }
  }

  // Fora da arena: o pin cai quando o centro passa da borda.
  for (const pin of pins) {
    if (pin.alive && pin.fall === 0 && Math.hypot(pin.x, pin.y) > arenaLimit(world)) {
      pin.fall = 1e-4;
      events.push({ type: 'out', id: pin.id });
    }
  }
  return events;
}

// ----------------------------------------------------------------------------- disparo

export interface Shot {
  dirX: number;
  dirY: number;
  /** 0 a 1. */
  power: number;
}

/**
 * Disparo de estilingue: o jogador arrasta de um ponto (`fromX`, `fromY`) até outro (`toX`, `toY`) e o pin sai para o
 * lado contrário do arrasto ("puxar para trás"). Arrasto curto demais cancela (null).
 */
export function shotFromDrag(fromX: number, fromY: number, toX: number, toY: number): Shot | null {
  const dx = fromX - toX;
  const dy = fromY - toY;
  const len = Math.hypot(dx, dy);
  if (len < MIN_PULL) return null;
  return { dirX: dx / len, dirY: dy / len, power: clamp(len / MAX_PULL, 0, 1) };
}

export function launchSpeed(pin: Pin, shot: Shot, effect: ShotEffect | null = pin.active): number {
  return Math.min(MAX_SPEED, BASE_SPEED * shot.power * pin.shot * (effect ? EFFECT_SPEED[effect.kind] : 1));
}

/** O golpe `moveIndex` pode ser usado agora? (sem golpe, o disparo normal sempre pode) */
export function canUse(pin: Pin, moveIndex: number | null): boolean {
  if (moveIndex === null) return true;
  return moveIndex >= 0 && moveIndex < pin.moves.length && (pin.cooldowns[moveIndex] ?? 0) === 0;
}

/**
 * Dispara o pin. Com `moveIndex` o efeito do golpe vale neste disparo; sem ele o disparo é normal. Devolve false (e não
 * dispara) se o golpe ainda estiver em recarga.
 */
export function launch(pin: Pin, shot: Shot, moveIndex: number | null = null): boolean {
  if (!canUse(pin, moveIndex)) return false;
  pin.active = moveIndex === null ? null : { ...pin.moves[moveIndex]!.effect };
  pin.lastMark = null;
  const speed = launchSpeed(pin, shot);
  pin.vx = shot.dirX * speed;
  pin.vy = shot.dirY * speed;
  return true;
}

/**
 * Depois de um disparo do lado `side`: cada golpe dos pins desse lado espera um disparo a menos e o golpe que acabou de
 * ser usado começa a recarga (quanto mais energia na carta, mais disparos de espera).
 */
export function afterShot(world: PinWorld, side: Side, used: { pinId: string; moveIndex: number | null } | null): void {
  for (const pin of world.pins) {
    if (pin.side !== side) continue;
    pin.cooldowns = pin.cooldowns.map((c) => Math.max(0, c - 1));
  }
  if (!used || used.moveIndex === null) return;
  const pin = world.pins.find((p) => p.id === used.pinId);
  const move = pin?.moves[used.moveIndex];
  if (pin && move) pin.cooldowns[used.moveIndex] = move.cooldown;
}

/** Tira os efeitos dos golpes; o Escudo dura até a resposta do adversário (`keepGuard`). */
export function clearEffects(world: PinWorld, keepGuard: boolean): void {
  for (const pin of world.pins) {
    if (pin.active && !(keepGuard && pin.active.kind === 'escudo')) {
      pin.active = null;
      pin.lastMark = null;
    }
  }
}

export interface PathPoint {
  x: number;
  y: number;
}

/**
 * Trajetória prevista do disparo (só este pin, com o chão da arena e sem os outros pins): é o que a mira desenha.
 * `falls` diz se o pin sairia sozinho da arena.
 */
export function previewPath(world: PinWorld, pin: Pin, shot: Shot, moveIndex: number | null = null, maxSeconds = 2.2): { points: PathPoint[]; falls: boolean } {
  const ghost: Pin = { ...pin, types: [...pin.types], active: null, lastMark: null };
  launch(ghost, shot, moveIndex);
  const sim: PinWorld = { radius: world.radius, patches: world.patches, pins: [ghost], time: 0, terrain: world.terrain ?? null, markRng: null, limit: world.limit };
  const points: PathPoint[] = [{ x: ghost.x, y: ghost.y }];
  const dt = 1 / 60;
  for (let t = 0, n = 0; t < maxSeconds; t += dt, n++) {
    stepWorld(sim, dt);
    if (n % 3 === 0) points.push({ x: ghost.x, y: ghost.y });
    if (ghost.fall > 0 || Math.hypot(ghost.vx, ghost.vy) < STOP_SPEED) break;
  }
  points.push({ x: ghost.x, y: ghost.y });
  return { points, falls: ghost.fall > 0 || !ghost.alive };
}

// ----------------------------------------------------------------------------- adversário

const AIM_ERROR: Record<Difficulty, number> = { facil: 0.5, normal: 0.14, dificil: 0.035 };
/** Chance de o adversário usar um golpe da carta quando tem algum pronto. */
const MOVE_CHANCE: Record<Difficulty, number> = { facil: 0.3, normal: 0.5, dificil: 0.65 };

/** Quase gaussiano (soma de três sorteios), centrado em 0, de -1 a 1. */
const bell = (rng: Rng) => (rng() + rng() + rng()) / 1.5 - 1;

/**
 * Um disparo do adversário (um por disparo seu): escolhe o par pin → alvo que mais promete (alvo perto da borda e
 * em linha que o empurre para fora), calcula a força para chegar lá e erra a mira conforme a dificuldade.
 */
export function chooseEnemyShot(world: PinWorld, rng: Rng, difficulty: Difficulty): { pinId: string; shot: Shot; moveIndex: number | null } | null {
  const mine = aliveOf(world, 0);
  const theirs = aliveOf(world, 1);
  if (mine.length === 0 || theirs.length === 0) return null;
  let best: { score: number; pin: Pin; target: Pin } | null = null;
  for (const pin of theirs) {
    for (const target of mine) {
      const dx = target.x - pin.x;
      const dy = target.y - pin.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const cd = Math.hypot(target.x, target.y) || 1e-6;
      // 1 = o empurrão leva o alvo direto para fora.
      const outward = (dx / d) * (target.x / cd) + (dy / d) * (target.y / cd);
      const score = 1.2 * outward + 0.7 * (cd / arenaLimit(world)) - 0.4 * (d / (2 * arenaLimit(world))) + (rng() - 0.5) * 0.5;
      if (!best || score > best.score) best = { score, pin, target };
    }
  }
  if (!best) return null;
  const { pin, target } = best;
  const dx = target.x - pin.x;
  const dy = target.y - pin.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const angle = Math.atan2(dy, dx) + bell(rng) * AIM_ERROR[difficulty];
  // Velocidade para percorrer a distância até o alvo (e um pouco mais) no chão comum.
  // Às vezes usa um golpe da carta que esteja pronto (Escudo só às vezes: não atrapalha o ataque).
  const ready = pin.moves.map((m, i) => ({ m, i })).filter(({ m, i }) => (pin.cooldowns[i] ?? 0) === 0 && (m.effect.kind !== 'escudo' || rng() < 0.3));
  const useMove = ready.length > 0 && rng() < MOVE_CHANCE[difficulty];
  const moveIndex = useMove ? ready[Math.floor(rng() * ready.length)]!.i : null;
  const effect = moveIndex === null ? null : pin.moves[moveIndex]!.effect;
  const want = Math.sqrt(2 * GROUND_DECEL * (d + 70));
  const power = clamp(want / (BASE_SPEED * pin.shot * (effect ? EFFECT_SPEED[effect.kind] : 1)) + bell(rng) * (difficulty === 'facil' ? 0.3 : 0.06), 0.4, 1);
  return { pinId: pin.id, shot: { dirX: Math.cos(angle), dirY: Math.sin(angle), power }, moveIndex };
}

// ----------------------------------------------------------------------------- pontuação e energia

/** Nota de 0 a 100: vitória com poucos disparos vale mais; derrota vale 0. */
export function scoreMatch(won: boolean, shots: number, enemies: number): number {
  if (!won) return 0;
  return clamp(100 - Math.max(0, shots - enemies) * 7, 20, 100);
}

/** Quem pode ser disparado agora com esta energia. */
export function affordable(world: PinWorld, energy: number): Pin[] {
  return aliveOf(world, 0).filter((p) => p.cost <= energy);
}
