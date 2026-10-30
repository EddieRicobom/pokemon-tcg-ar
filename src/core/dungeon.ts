import { seededRng, TYPE_CHART } from './battle';
import type { Rng } from './battle';
import type { PokemonType } from './pokemon-data';
import type { BaseStats } from './survivor-moves';

/**
 * Masmorra (protótipo): dungeon crawler tático em turnos baseado em `future project/IDEIAS_DO_JOGO.md`. Uma equipe de
 * até seis Pokémon divide a mesma casa da grade; um fica ativo e os outros esperam na reserva. Cada turno dá 6 PA para
 * mover, atacar, trocar, usar item ou fundir dois membros; armas definem o formato do ataque e a munição, os tipos.
 *
 * Tudo aqui é número de protótipo (o próprio documento diz isso). Duas regras são PROVISÓRIAS e estão marcadas assim
 * na tela: a arma de cada Pokémon sai dos stats base dele (`weaponFor`) e a munição é o tipo principal da espécie, até
 * a associação de tipos a armas e munições ser definida separadamente.
 */

export type WeaponId = 'laminas' | 'lanca' | 'martelo' | 'emissor' | 'lancador';
export type WeaponPattern = 'adjacent' | 'line' | 'ranged' | 'area';

export interface Weapon {
  id: WeaponId;
  name: string;
  category: string;
  /** Físico usa Attack/Defense; especial usa Special Attack/Special Defense. */
  kind: 'physical' | 'special';
  ap: number;
  /** Carga gasta por ataque. */
  cost: number;
  /** Capacidade de carga da arma. */
  capacity: number;
  power: number;
  pattern: WeaponPattern;
  range: number;
  description: string;
}

/** Cinco das 20 armas do catálogo, uma de cada ritmo: rápida, média, pesada, à distância e em área. */
export const WEAPONS: Readonly<Record<WeaponId, Weapon>> = {
  laminas: { id: 'laminas', name: 'Lâminas duplas', category: 'Corpo a corpo', kind: 'physical', ap: 1, cost: 1, capacity: 10, power: 28, pattern: 'adjacent', range: 1, description: 'Ataca rapidamente um inimigo adjacente.' },
  lanca: { id: 'lanca', name: 'Lança de combate', category: 'Corpo a corpo', kind: 'physical', ap: 2, cost: 2, capacity: 10, power: 42, pattern: 'line', range: 2, description: 'Ataca em linha a até duas casas, atravessando quem estiver no caminho.' },
  martelo: { id: 'martelo', name: 'Martelo de impacto', category: 'Corpo a corpo', kind: 'physical', ap: 3, cost: 3, capacity: 12, power: 80, pattern: 'adjacent', range: 1, description: 'Golpe lento que abala a defesa do alvo até o fim da rodada.' },
  emissor: { id: 'emissor', name: 'Emissor rápido', category: 'Distância', kind: 'special', ap: 1, cost: 1, capacity: 10, power: 22, pattern: 'ranged', range: 4, description: 'Dispara um projétil preciso em linha reta, até quatro casas.' },
  lancador: { id: 'lancador', name: 'Lançador balístico', category: 'Distância', kind: 'special', ap: 3, cost: 3, capacity: 9, power: 38, pattern: 'area', range: 3, description: 'Projétil em arco que explode na casa escolhida e nas quatro vizinhas.' },
};

/** Ordem do catálogo (nome da fusão segue esta ordem, como em «Lâminas duplas + Espada longa»). */
const CATALOG_ORDER: readonly WeaponId[] = ['laminas', 'martelo', 'lanca', 'emissor', 'lancador'];

/** PROVISÓRIO: a arma sai dos stats base (físico ou especial, e rápido ou lento). */
export function weaponFor(stats: BaseStats): WeaponId {
  if (stats.attack >= stats.spAttack) {
    if (stats.speed >= 85) return 'laminas';
    return stats.speed < 55 ? 'martelo' : 'lanca';
  }
  return stats.speed >= 70 ? 'emissor' : 'lancador';
}

export const START_AP = 6;
export const COSTS = { move: 1, switch: 1, item: 2, fusion: 1 } as const;
export const GRID_W = 7;
export const GRID_H = 7;
export const FLOORS = 4;
export const FUSION_TURNS = 3;
export const FUSION_CHARGE = 12;
export const RESERVE_RECOVERY = 0.25;
/** Rodadas de cooldown ao esgotar: a rodada em que a carga zera não conta (por isso 2 + 1). */
export const EXHAUST_ROUNDS = 2;
export const POTION_HEAL = 0.4;
export const MIXED_SPLIT = [0.7, 0.3] as const;
export const AFFINITY = 1.15;

export interface Cell { x: number; y: number }

export interface MemberInput {
  id: string;
  dexId: number;
  name: string;
  types: PokemonType[];
  stats: BaseStats;
}

export type MemberStatus = 'ready' | 'exhausted' | 'down' | 'recovering';

export interface Member extends MemberInput {
  weapon: WeaponId;
  /** Munição: tipos e proporção. PROVISÓRIO: o tipo principal da espécie. */
  ammo: PokemonType[];
  hp: number;
  maxHp: number;
  charge: number;
  maxCharge: number;
  status: MemberStatus;
  /** Rodadas completas até voltar (esgotado ou em recuperação após a fusão). */
  cooldown: number;
}

export interface Enemy {
  uid: number;
  dexId: number;
  name: string;
  types: PokemonType[];
  stats: BaseStats;
  hp: number;
  maxHp: number;
  pos: Cell;
  weapon: WeaponId;
  boss: boolean;
  /** Defesa abalada pelo martelo até o fim da rodada. */
  shaken: boolean;
}

export interface Fusion {
  a: number;
  b: number;
  name: string;
  weapon: Weapon;
  ammo: PokemonType[];
  charge: number;
  maxCharge: number;
  /** Turnos do jogador que ainda restam, contando o atual. */
  turnsLeft: number;
}

export type RewardId = 'fusion' | 'potion' | 'rest';
export const REWARDS: Readonly<Record<RewardId, { name: string; text: string }>> = {
  fusion: { name: 'Buff de fusão', text: '+1 carga de fusão, para guardar até a hora certa.' },
  potion: { name: 'Poção', text: '+1 poção: cura 40% do HP do ativo por 2 PA.' },
  rest: { name: 'Sala segura', text: 'Todos os membros que não estão incapacitados recuperam 30% do HP e a carga cheia.' },
};

export type Phase = 'player' | 'reward' | 'won' | 'lost';

export interface DungeonState {
  seed: number;
  floor: number;
  round: number;
  ap: number;
  phase: Phase;
  team: Member[];
  active: number;
  pos: Cell;
  enemies: Enemy[];
  walls: Cell[];
  fusion: Fusion | null;
  fusionCharges: number;
  potions: number;
  /** O ativo caiu ou esgotou: a próxima troca é gratuita. */
  mustSwitch: boolean;
  log: string[];
  nextUid: number;
  rewardOptions: RewardId[];
}

export interface EnemySpecies {
  dexId: number;
  name: string;
  types: PokemonType[];
  stats: BaseStats;
}

export const key = (c: Cell): string => `${c.x},${c.y}`;
const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
const dist = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const inside = (c: Cell): boolean => c.x >= 0 && c.y >= 0 && c.x < GRID_W && c.y < GRID_H;
const DIRS: readonly Cell[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

export function createMember(input: MemberInput): Member {
  const weapon = weaponFor(input.stats);
  const maxHp = Math.round(input.stats.hp * 1.2 + 40);
  const maxCharge = WEAPONS[weapon].capacity;
  return { ...input, weapon, ammo: input.types.slice(0, 1), hp: maxHp, maxHp, charge: maxCharge, maxCharge, status: 'ready', cooldown: 0 };
}

/** Uma expedição nova: até seis membros, andar 1. Inimigos vêm de `pool` (espécies com dado real). */
export function startDungeon(inputs: readonly MemberInput[], pool: readonly EnemySpecies[], seed: number): DungeonState {
  const team = inputs.slice(0, 6).map(createMember);
  if (team.length === 0) throw new Error('A equipe precisa de ao menos um Pokémon.');
  if (pool.length === 0) throw new Error('Sem espécies de inimigos com dados.');
  const state: DungeonState = {
    seed, floor: 1, round: 1, ap: START_AP, phase: 'player', team, active: 0, pos: { x: 3, y: GRID_H - 1 },
    enemies: [], walls: [], fusion: null, fusionCharges: 1, potions: 2, mustSwitch: false, log: [], nextUid: 1, rewardOptions: [],
  };
  buildFloor(state, pool);
  return state;
}

function rngFor(state: DungeonState, salt: number): Rng {
  return seededRng((state.seed ^ Math.imul(state.floor * 7919 + state.round * 104729 + salt, 2654435761)) >>> 0);
}

/** Monta a sala do andar atual: pilares sorteados (sem isolar casa nenhuma) e inimigos nas fileiras de cima. */
export function buildFloor(state: DungeonState, pool: readonly EnemySpecies[]): void {
  const rng = rngFor(state, 1);
  state.pos = { x: 3, y: GRID_H - 1 };
  state.walls = [];
  const boss = state.floor === FLOORS;
  const pillars = 2 + Math.floor(rng() * 3);
  for (let tries = 0; state.walls.length < pillars && tries < 40; tries++) {
    const c = { x: Math.floor(rng() * GRID_W), y: 1 + Math.floor(rng() * (GRID_H - 3)) };
    if (state.walls.some((w) => same(w, c))) continue;
    state.walls.push(c);
    if (reachableAll(state).size !== GRID_W * GRID_H - state.walls.length) state.walls.pop();
  }
  const count = boss ? 2 : Math.min(4, 1 + state.floor);
  const scale = 1 + (state.floor - 1) * 0.15;
  const taken = new Set(state.walls.map(key));
  state.enemies = [];
  for (let i = 0; i < count; i++) {
    const species = pool[Math.floor(rng() * pool.length)]!;
    const isBoss = boss && i === 0;
    let pos: Cell | null = null;
    for (let tries = 0; !pos && tries < 50; tries++) {
      const c = { x: Math.floor(rng() * GRID_W), y: Math.floor(rng() * 2) };
      if (!taken.has(key(c))) pos = c;
    }
    if (!pos) continue;
    taken.add(key(pos));
    const maxHp = Math.round((species.stats.hp * 0.8 + 25) * scale * (isBoss ? 2.2 : 1));
    state.enemies.push({ uid: state.nextUid++, ...species, types: [...species.types], stats: { ...species.stats }, hp: maxHp, maxHp, pos, weapon: weaponFor(species.stats), boss: isBoss, shaken: false });
  }
  state.log.push(boss ? `Andar ${state.floor}: a sala do chefe!` : `Andar ${state.floor}: ${state.enemies.length} inimigo(s) à vista.`);
}

function blocked(state: DungeonState, c: Cell, ignoreEnemies = false): boolean {
  return !inside(c) || state.walls.some((w) => same(w, c)) || (!ignoreEnemies && state.enemies.some((e) => same(e.pos, c)));
}

function reachableAll(state: DungeonState): Set<string> {
  const seen = new Set([key(state.pos)]);
  const queue = [state.pos];
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of DIRS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (seen.has(key(n)) || blocked(state, n, true)) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen;
}

/** Casas alcançáveis a pé com os PA atuais (custo = número de passos). */
export function reachable(state: DungeonState): Map<string, number> {
  const out = new Map<string, number>([[key(state.pos), 0]]);
  if (state.phase !== 'player' || state.mustSwitch) return out;
  const queue: Cell[] = [state.pos];
  while (queue.length) {
    const c = queue.shift()!;
    const cost = out.get(key(c))!;
    if (cost + COSTS.move > state.ap) continue;
    for (const d of DIRS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (out.has(key(n)) || blocked(state, n)) continue;
      out.set(key(n), cost + COSTS.move);
      queue.push(n);
    }
  }
  return out;
}

/** O que ataca agora: a fusão, se houver, ou o Pokémon ativo. */
export interface Attacker { name: string; weapon: Weapon; ammo: PokemonType[]; types: PokemonType[]; attack: number; spAttack: number; charge: number }

export function attacker(state: DungeonState): Attacker {
  const f = state.fusion;
  if (f) {
    const a = state.team[f.a]!;
    const b = state.team[f.b]!;
    return { name: f.name, weapon: f.weapon, ammo: f.ammo, types: [...new Set([...a.types, ...b.types])], attack: (a.stats.attack + b.stats.attack) / 2, spAttack: (a.stats.spAttack + b.stats.spAttack) / 2, charge: f.charge };
  }
  const m = state.team[state.active]!;
  return { name: m.name, weapon: WEAPONS[m.weapon], ammo: m.ammo, types: m.types, attack: m.stats.attack, spAttack: m.stats.spAttack, charge: m.charge };
}

/** Multiplicador moderado de tipo (1,25× vantagem, 0,8× resistência; imunidade vira forte resistência, 0,5×). */
export function typeFactor(attack: PokemonType, defender: readonly PokemonType[]): number {
  let out = 1;
  for (const t of defender) {
    const raw = TYPE_CHART[attack][t] ?? 1;
    out *= raw > 1 ? 1.25 : raw === 0 ? 0.5 : raw < 1 ? 0.8 : 1;
  }
  return out;
}

export interface DamagePart { type: PokemonType; share: number; factor: number; affinity: boolean }

/** Dano de um golpe: munição mista divide o dano em 70%/30%, cada parcela com o seu tipo e a sua afinidade. */
export function damage(power: number, atk: number, def: number, ammo: readonly PokemonType[], userTypes: readonly PokemonType[], target: readonly PokemonType[]): { total: number; parts: DamagePart[] } {
  const base = (power * atk) / Math.max(1, def) * 0.6;
  const shares = ammo.length >= 2 ? MIXED_SPLIT : [1];
  const parts: DamagePart[] = ammo.slice(0, shares.length).map((type, i) => ({ type, share: shares[i]!, factor: typeFactor(type, target), affinity: userTypes.includes(type) }));
  if (parts.length === 0) return { total: Math.max(1, Math.round(base)), parts };
  const total = parts.reduce((sum, p) => sum + base * p.share * p.factor * (p.affinity ? AFFINITY : 1), 0);
  return { total: Math.max(1, Math.round(total)), parts };
}

function lineCells(from: Cell, to: Cell, range: number, state: DungeonState): Cell[] {
  if (from.x !== to.x && from.y !== to.y) return [];
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const out: Cell[] = [];
  for (let i = 1; i <= range; i++) {
    const c = { x: from.x + dx * i, y: from.y + dy * i };
    if (!inside(c) || state.walls.some((w) => same(w, c))) break;
    out.push(c);
  }
  return out;
}

/** Casas que a arma atinge mirando em `target` (vazio = mira inválida). */
export function attackArea(state: DungeonState, target: Cell): Cell[] {
  const w = attacker(state).weapon;
  const d = dist(state.pos, target);
  if (d === 0) return [];
  switch (w.pattern) {
    case 'adjacent':
      return d === 1 ? [target] : [];
    case 'line': {
      const cells = lineCells(state.pos, target, w.range, state);
      return cells.some((c) => same(c, target)) ? cells : [];
    }
    case 'ranged': {
      const cells = lineCells(state.pos, target, w.range, state);
      const hit = cells.find((c) => state.enemies.some((e) => same(e.pos, c)));
      return cells.some((c) => same(c, target)) && hit ? [hit] : [];
    }
    case 'area':
      if (d > w.range || state.walls.some((c) => same(c, target))) return [];
      return [target, ...DIRS.map((o) => ({ x: target.x + o.x, y: target.y + o.y }))].filter((c) => inside(c) && !state.walls.some((x) => same(x, c)));
  }
}

/** Casas onde dá para mirar e acertar ao menos um inimigo. */
export function attackTargets(state: DungeonState): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const c = { x, y };
    if (attackArea(state, c).some((a) => state.enemies.some((e) => same(e.pos, a)))) out.push(c);
  }
  return out;
}

export interface AttackPreview { hits: { enemy: Enemy; damage: number; parts: DamagePart[] }[]; ap: number; cost: number; reason: string | null }

export function previewAttack(state: DungeonState, target: Cell): AttackPreview {
  const who = attacker(state);
  const w = who.weapon;
  const area = attackArea(state, target);
  const hits = state.enemies.filter((e) => area.some((c) => same(c, e.pos))).map((enemy) => {
    const def = w.kind === 'physical' ? enemy.stats.defense * (enemy.shaken ? 0.75 : 1) : enemy.stats.spDefense;
    const r = damage(w.power, w.kind === 'physical' ? who.attack : who.spAttack, def, who.ammo, who.types, enemy.types);
    return { enemy, damage: r.total, parts: r.parts };
  });
  const reason = state.phase !== 'player' ? 'Não é o seu turno.'
    : state.mustSwitch ? 'Escolha quem assume a posição.'
    : state.ap < w.ap ? `Faltam PA (precisa de ${w.ap}).`
    : who.charge < w.cost ? `Falta carga (precisa de ${w.cost}).`
    : hits.length === 0 ? 'Nenhum inimigo nessa mira.' : null;
  return { hits, ap: w.ap, cost: w.cost, reason };
}

export type ActionResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): ActionResult => ({ ok: false, reason });

export function move(state: DungeonState, to: Cell): ActionResult {
  if (state.phase !== 'player') return fail('Não é o seu turno.');
  if (state.mustSwitch) return fail('Escolha quem assume a posição.');
  const cost = reachable(state).get(key(to));
  if (cost === undefined || cost === 0) return fail('Casa fora de alcance.');
  state.pos = { ...to };
  state.ap -= cost;
  return { ok: true };
}

export function attack(state: DungeonState, target: Cell): ActionResult {
  const preview = previewAttack(state, target);
  if (preview.reason) return fail(preview.reason);
  const who = attacker(state);
  state.ap -= preview.ap;
  for (const hit of preview.hits) {
    hit.enemy.hp = Math.max(0, hit.enemy.hp - hit.damage);
    if (who.weapon.id === 'martelo') hit.enemy.shaken = true;
    state.log.push(`${who.name} acerta ${hit.enemy.name}: −${hit.damage} HP.`);
    if (hit.enemy.hp === 0) state.log.push(`${hit.enemy.name} foi derrotado.`);
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
  spendCharge(state, preview.cost);
  if (state.enemies.length === 0) clearFloor(state);
  return { ok: true };
}

function spendCharge(state: DungeonState, cost: number): void {
  const f = state.fusion;
  if (f) {
    f.charge -= cost;
    if (f.charge <= 0) endFusion(state, 'A carga da fusão acabou.');
    return;
  }
  const m = state.team[state.active]!;
  m.charge = Math.max(0, m.charge - cost);
  if (m.charge === 0) {
    m.status = 'exhausted';
    m.cooldown = EXHAUST_ROUNDS + 1;
    state.log.push(`${m.name} esgotou a carga e sai por ${EXHAUST_ROUNDS} rodadas.`);
    requireSwitch(state);
  }
}

export function available(state: DungeonState, index: number): boolean {
  const m = state.team[index];
  return !!m && m.status === 'ready' && m.hp > 0;
}

function requireSwitch(state: DungeonState): void {
  if (state.team.some((_, i) => i !== state.active && available(state, i))) {
    state.mustSwitch = true;
    return;
  }
  state.phase = 'lost';
  state.log.push('Nenhum Pokémon pode assumir a posição: a expedição terminou.');
}

/** Troca o ativo (1 PA; grátis quando o ativo caiu ou esgotou). A posição na grade continua a mesma. */
export function switchTo(state: DungeonState, index: number): ActionResult {
  if (state.phase !== 'player') return fail('Não é o seu turno.');
  if (state.fusion) return fail('A fusão está ativa.');
  if (index === state.active && !state.mustSwitch) return fail('Esse já é o ativo.');
  if (!available(state, index)) return fail('Esse Pokémon não está disponível.');
  if (!state.mustSwitch) {
    if (state.ap < COSTS.switch) return fail('Faltam PA.');
    state.ap -= COSTS.switch;
  }
  state.active = index;
  state.mustSwitch = false;
  state.log.push(`${state.team[index]!.name} assume a posição.`);
  return { ok: true };
}

export function usePotion(state: DungeonState): ActionResult {
  if (state.phase !== 'player' || state.mustSwitch) return fail('Agora não dá.');
  if (state.potions <= 0) return fail('Sem poções.');
  if (state.ap < COSTS.item) return fail('Faltam PA.');
  const targets = state.fusion ? [state.team[state.fusion.a]!, state.team[state.fusion.b]!] : [state.team[state.active]!];
  if (targets.every((m) => m.hp >= m.maxHp)) return fail('O HP já está cheio.');
  state.ap -= COSTS.item;
  state.potions--;
  for (const m of targets) m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * POTION_HEAL));
  state.log.push('Poção usada.');
  return { ok: true };
}

/** Nome do catálogo para a fusão de duas armas (a ordem do par não importa). */
export function fusionName(a: WeaponId, b: WeaponId): string {
  const [first, second] = [a, b].sort((x, y) => CATALOG_ORDER.indexOf(x) - CATALOG_ORDER.indexOf(y));
  return `${WEAPONS[first!].name} + ${WEAPONS[second!].name}`;
}

/** A arma híbrida: o formato da primeira, alcance e potência somados com desconto (proposta inicial do documento). */
export function fusionWeapon(a: WeaponId, b: WeaponId): Weapon {
  const wa = WEAPONS[a];
  const wb = WEAPONS[b];
  return {
    ...wa,
    name: fusionName(a, b),
    category: 'Fusão',
    ap: Math.min(wa.ap, wb.ap) + 1,
    cost: Math.max(wa.cost, wb.cost),
    capacity: FUSION_CHARGE,
    power: Math.round((wa.power + wb.power) * 0.75),
    range: Math.max(wa.range, wb.range),
    description: `${wa.description} O componente ${wb.name.toLowerCase()} soma potência e alcance.`,
  };
}

export function previewFusion(state: DungeonState, a: number, b: number): { ok: boolean; reason: string | null; name: string; weapon: Weapon; ammo: PokemonType[] } | null {
  const ma = state.team[a];
  const mb = state.team[b];
  if (!ma || !mb || a === b) return null;
  const weapon = fusionWeapon(ma.weapon, mb.weapon);
  const ammo = [...new Set([...ma.ammo, ...mb.ammo])].slice(0, 2);
  const reason = state.phase !== 'player' || state.mustSwitch ? 'Agora não dá.'
    : state.fusion ? 'Já há uma fusão ativa.'
    : state.fusionCharges <= 0 ? 'Sem carga de fusão (encontre um buff).'
    : state.ap < COSTS.fusion ? 'Faltam PA.'
    : !available(state, a) ? `${ma.name} não está disponível.`
    : !available(state, b) ? `${mb.name} não está disponível.` : null;
  return { ok: reason === null, reason, name: `${ma.name} + ${mb.name}`, weapon, ammo };
}

export function fuse(state: DungeonState, a: number, b: number): ActionResult {
  const p = previewFusion(state, a, b);
  if (!p) return fail('Escolha dois membros diferentes.');
  if (p.reason) return fail(p.reason);
  state.ap -= COSTS.fusion;
  state.fusionCharges--;
  state.fusion = { a, b, name: p.name, weapon: p.weapon, ammo: p.ammo, charge: FUSION_CHARGE, maxCharge: FUSION_CHARGE, turnsLeft: FUSION_TURNS };
  state.log.push(`Fusão! ${p.name} empunham ${p.weapon.name}.`);
  return { ok: true };
}

function endFusion(state: DungeonState, why: string): void {
  const f = state.fusion;
  if (!f) return;
  state.fusion = null;
  state.log.push(`${why} A fusão terminou.`);
  for (const i of [f.a, f.b]) {
    const m = state.team[i]!;
    if (m.hp > 0) { m.status = 'recovering'; m.cooldown = 2; }
  }
  if (state.team.some((_, i) => available(state, i))) {
    state.active = state.team.findIndex((_, i) => available(state, i));
    state.mustSwitch = true;
    return;
  }
  // Ninguém mais disponível: o participante de pé continua lutando, sem a recuperação curta.
  const standing = [f.a, f.b].find((i) => state.team[i]!.hp > 0);
  if (standing === undefined) {
    state.phase = 'lost';
    state.log.push('Ninguém pode assumir a posição: a expedição terminou.');
    return;
  }
  const m = state.team[standing]!;
  m.status = m.charge > 0 ? 'ready' : 'exhausted';
  m.cooldown = 0;
  state.active = standing;
  if (m.status === 'exhausted') requireSwitch(state);
}

/** Dano recebido: a fusão usa a média das defesas e divide o dano entre os dois participantes. */
function takeHit(state: DungeonState, enemy: Enemy): void {
  const w = WEAPONS[enemy.weapon];
  const f = state.fusion;
  const defenders = f ? [state.team[f.a]!, state.team[f.b]!] : [state.team[state.active]!];
  const def = defenders.reduce((s, m) => s + (w.kind === 'physical' ? m.stats.defense : m.stats.spDefense), 0) / defenders.length;
  const types = [...new Set(defenders.flatMap((m) => m.types))];
  const atk = w.kind === 'physical' ? enemy.stats.attack : enemy.stats.spAttack;
  // Inimigos batem com uma fração do poder da arma: a equipe tem seis vidas, eles não.
  const total = damage(w.power * 0.7, atk, def, enemy.types.slice(0, 1), enemy.types, types).total;
  const each = Math.ceil(total / defenders.length);
  for (const m of defenders) m.hp = Math.max(0, m.hp - each);
  state.log.push(`${enemy.name} ataca ${f ? f.name : defenders[0]!.name}: −${total} HP.`);
  const fallen = defenders.filter((m) => m.hp === 0);
  for (const m of fallen) { m.status = 'down'; state.log.push(`${m.name} foi incapacitado.`); }
  if (fallen.length === 0) return;
  if (f) endFusion(state, `${fallen[0]!.name} caiu.`);
  else requireSwitch(state);
}

function enemyReach(enemy: Enemy, from: Cell, target: Cell, state: DungeonState): boolean {
  const w = WEAPONS[enemy.weapon];
  const d = dist(from, target);
  if (w.pattern === 'adjacent') return d === 1;
  if (w.pattern === 'area') return d <= w.range;
  return lineCells(from, target, w.range, state).some((c) => same(c, target));
}

/** Próximo passo pelo menor caminho até ficar ao alcance (BFS; inimigos não atravessam uns aos outros). */
function stepToward(state: DungeonState, enemy: Enemy): Cell | null {
  const prev = new Map<string, Cell | null>([[key(enemy.pos), null]]);
  const queue = [enemy.pos];
  while (queue.length) {
    const c = queue.shift()!;
    if (!same(c, enemy.pos) && enemyReach(enemy, c, state.pos, state)) {
      let cur = c;
      while (!same(prev.get(key(cur))!, enemy.pos)) cur = prev.get(key(cur))!;
      return cur;
    }
    for (const d of DIRS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (prev.has(key(n)) || same(n, state.pos) || blocked(state, n)) continue;
      prev.set(key(n), c);
      queue.push(n);
    }
  }
  return null;
}

/** Encerra o turno: inimigos agem (até 2 passos e 1 ataque cada) e a rodada fecha com a recuperação da reserva. */
export function endTurn(state: DungeonState): ActionResult {
  if (state.phase !== 'player') return fail('Não é o seu turno.');
  if (state.mustSwitch) return fail('Escolha quem assume a posição.');
  if (state.fusion && --state.fusion.turnsLeft <= 0) endFusion(state, 'O tempo da fusão acabou.');
  if (state.mustSwitch) autoCover(state);
  for (const enemy of [...state.enemies]) {
    if (state.phase !== 'player') break;
    for (let steps = 0; steps < 2 && !enemyReach(enemy, enemy.pos, state.pos, state); steps++) {
      const next = stepToward(state, enemy);
      if (!next) break;
      enemy.pos = next;
    }
    if (enemyReach(enemy, enemy.pos, state.pos, state)) {
      takeHit(state, enemy);
      if (state.mustSwitch) autoCover(state);
    }
  }
  if (state.phase === 'player') endRound(state);
  return { ok: true };
}

/** Durante o turno inimigo, quem cai é coberto pelo próximo disponível (o jogador troca de novo no turno dele). */
function autoCover(state: DungeonState): void {
  const next = state.team.findIndex((_, i) => available(state, i));
  if (next < 0) return;
  state.active = next;
  state.mustSwitch = false;
  state.log.push(`${state.team[next]!.name} cobre a posição.`);
}

function endRound(state: DungeonState): void {
  for (const e of state.enemies) e.shaken = false;
  state.team.forEach((m, i) => {
    const inFusion = state.fusion && (i === state.fusion.a || i === state.fusion.b);
    if ((m.status === 'exhausted' || m.status === 'recovering') && --m.cooldown <= 0) {
      if (m.status === 'exhausted') m.charge = m.maxCharge;
      m.status = 'ready';
      m.cooldown = 0;
      state.log.push(`${m.name} voltou para a reserva.`);
    } else if (m.status === 'ready' && i !== state.active && !inFusion) {
      m.charge = Math.min(m.maxCharge, m.charge + Math.ceil(m.maxCharge * RESERVE_RECOVERY));
    }
  });
  state.round++;
  state.ap = START_AP;
}

function clearFloor(state: DungeonState): void {
  if (state.fusion) endFusion(state, 'Sala limpa.');
  if (state.floor >= FLOORS) {
    state.phase = 'won';
    state.log.push('O chefe caiu! Masmorra concluída.');
    return;
  }
  state.phase = 'reward';
  state.mustSwitch = false;
  state.rewardOptions = ['fusion', 'potion', 'rest'];
  state.log.push('Sala limpa! Escolha uma recompensa.');
}

/** Pega a recompensa e desce para o próximo andar. */
export function chooseReward(state: DungeonState, reward: RewardId, pool: readonly EnemySpecies[]): ActionResult {
  if (state.phase !== 'reward' || !state.rewardOptions.includes(reward)) return fail('Nada para escolher agora.');
  if (reward === 'fusion') state.fusionCharges++;
  if (reward === 'potion') state.potions++;
  if (reward === 'rest') for (const m of state.team) if (m.status !== 'down') { m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.3)); m.charge = m.maxCharge; m.status = 'ready'; m.cooldown = 0; }
  state.log.push(`${REWARDS[reward].name} escolhido.`);
  state.floor++;
  state.round = 1;
  state.ap = START_AP;
  state.phase = 'player';
  state.rewardOptions = [];
  for (const m of state.team) if (m.status === 'recovering') { m.status = 'ready'; m.cooldown = 0; }
  if (!available(state, state.active)) state.active = Math.max(0, state.team.findIndex((_, i) => available(state, i)));
  if (!available(state, state.active)) {
    state.phase = 'lost';
    state.log.push('Ninguém pode seguir: a expedição terminou.');
    return { ok: true };
  }
  buildFloor(state, pool);
  return { ok: true };
}
