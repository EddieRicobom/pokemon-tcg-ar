import { biomeOf, DUNGEON_BIOMES, floorGeneration, HOME_BONUS, LAVA_BURN } from './dungeon-biomes';
import type { HazardKind } from './dungeon-biomes';
import { generationOf, typesOfDex } from './species-filter';
import { nextEvolutions, speciesName } from './survivor-evolution';
import { statsOfDex } from './survivor-stats';
import { seededRng, TYPE_CHART } from './battle';
import type { Rng } from './battle';
import type { PokemonType } from './pokemon-data';
import type { BaseStats } from './survivor-moves';
import { chestLegendaryChance, GEM_SLOTS, gemBonus, gemName, LEGENDARY_SLOT, mergeBonus, rollGem } from './dungeon-gems';
import type { Gem, GemBonus, GemKind } from './dungeon-gems';
import { FUSION_CHARGE, fusionOrigins, fusionWeapon, WEAPONS } from './dungeon-weapons';
import type { Weapon, WeaponId } from './dungeon-weapons';
import { weaponOfDex } from './data/pokemon-weapons';

export { FUSION_CHARGE };

/**
 * Masmorra (protótipo): dungeon crawler tático em turnos baseado em `future project/IDEIAS_DO_JOGO.md`. Uma equipe de
 * até seis Pokémon divide a mesma casa da grade; um fica ativo e os outros esperam na reserva. Cada turno dá 6 PA para
 * mover, atacar, trocar, usar item ou fundir dois membros; armas definem o formato do ataque e a munição, os tipos.
 *
 * A descida não tem fim: cada andar é mais difícil que o anterior, a cada 5 há um chefe, e a expedição só acaba quando
 * a equipe cai ou quando você decide sair pela escada com o que juntou. Gemas (`dungeon-gems.ts`) achadas no caminho
 * fortalecem as armas. Visão geral, o que falta e ideias: `docs/MASMORRA.md`.
 *
 * Tudo aqui é número de protótipo. A munição ainda usa o tipo principal; a arma vem da tabela estática da espécie em
 * `data/pokemon-weapons.ts`, nunca dos atributos.
 */

export { CATALOG_ORDER, MECHANICS, WEAPONS, allFusions, fusionDescription, fusionName, fusionNumber, fusionOrigins, fusionWeapon, mechanicOf } from './dungeon-weapons';
export type { MechanicId, Weapon, WeaponCategory, WeaponId, WeaponPattern } from './dungeon-weapons';
export { baseSpeciesDexId, hasCompleteWeaponTable, NATIONAL_DEX_LAST, weaponOfDex } from './data/pokemon-weapons';

export const START_AP = 6;
/** Limite de armas/Pokémon ativos numa expedição; os atalhos 1–6 e a troca usam estes seis slots. */
export const MAX_TEAM = 6;
export const COSTS = { move: 1, switch: 1, item: 2, fusion: 1 } as const;
export const GRID_W = 7;
export const GRID_H = 7;
/** A cada quantos andares aparece um chefe. */
export const BOSS_FLOOR_EVERY = 5;
/** A cada quantos andares surge um mini-chefe, inclusive ao lado de um chefe no andar 30, 60 etc. */
export const MINI_BOSS_FLOOR_EVERY = 6;
export const FUSION_TURNS = 3;
export const RESERVE_RECOVERY = 0.25;
/** Rodadas de cooldown ao esgotar: a rodada em que a carga zera não conta (por isso 2 + 1). */
export const EXHAUST_ROUNDS = 2;
export const POTION_HEAL = 0.4;
export const MIXED_SPLIT = [0.7, 0.3] as const;
export const AFFINITY = 1.15;
export const CRIT = 1.5;
export const ECHO_CHANCE = 0.3;
export const SPAWN: Cell = { x: 3, y: GRID_H - 1 };

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
  baseMaxHp: number;
  charge: number;
  maxCharge: number;
  baseMaxCharge: number;
  status: MemberStatus;
  /** Rodadas completas até voltar (esgotado ou em recuperação após a fusão). */
  cooldown: number;
  /** Encaixes da arma: dois comuns e um lendário (`GEM_SLOTS`). */
  gems: (Gem | null)[];
  /** A Gema da Fênix já salvou este membro neste andar. */
  phoenixUsed: boolean;
}

/**
 * Como cada inimigo se comporta. Todos escolhem a próxima casa por pontuação (`planEnemy`): o bruto cerca, o atirador
 * mantém a distância da arma, o suporte cura aliados feridos, o guardião protege quem está ferido e o chefe alterna
 * golpes anunciados, reforços e ataques comuns.
 */
export type EnemyProfile = 'bruto' | 'atirador' | 'suporte' | 'guardiao' | 'chefe';
export const PROFILES: Readonly<Record<EnemyProfile, { name: string; icon: string; text: string }>> = {
  bruto: { name: 'Bruto', icon: '⚔️', text: 'Avança, tenta cercar você e ataca de perto.' },
  atirador: { name: 'Atirador', icon: '🏹', text: 'Procura a distância ideal da arma e recua se você encostar.' },
  suporte: { name: 'Suporte', icon: '✚', text: 'Cura o aliado mais ferido (20% do HP) e fica longe de você.' },
  guardiao: { name: 'Guardião', icon: '🛡️', text: 'Segura a posição; corre para proteger aliados feridos (vizinhos dele levam 25% menos dano).' },
  chefe: { name: 'Chefe', icon: '👑', text: 'A cada 2 rodadas anuncia um golpe 3×3; com metade do HP chama reforços uma vez.' },
};
export const GUARD_RADIUS = 3;
export const GUARD_SHIELD = 0.75;
export const BOSS_EVERY = 2;
export const BOSS_STRIKE = 1.8;
export const SUPPORT_HEAL = 0.2;

/** Perfil pelo formato da arma e pelos stats: quem atira e aguenta muito vira suporte; corpo a corpo lento, guardião. */
export function profileFor(weapon: WeaponId, stats: BaseStats, boss: boolean): EnemyProfile {
  if (boss) return 'chefe';
  const w = WEAPONS[weapon];
  if (w.category === 'Defesa') return 'guardiao';
  const far = w.range >= 3 || w.pattern === 'area' || w.pattern === 'homing' || w.pattern === 'trap';
  if (far) return stats.spDefense >= Math.max(stats.attack, stats.spAttack) ? 'suporte' : 'atirador';
  return stats.speed < 60 ? 'guardiao' : 'bruto';
}

/** Modificadores de elite: aparecem cada vez mais fundo e se acumulam nos chefes. */
export type Affix = 'blindado' | 'veloz' | 'furioso' | 'regenerante' | 'vampirico';
export const AFFIX_IDS: readonly Affix[] = ['blindado', 'veloz', 'furioso', 'regenerante', 'vampirico'];
export const AFFIXES: Readonly<Record<Affix, { name: string; icon: string; text: string }>> = {
  blindado: { name: 'Blindado', icon: '🪨', text: 'Defesas +35%.' },
  veloz: { name: 'Veloz', icon: '💨', text: 'Anda 3 casas por turno em vez de 2.' },
  furioso: { name: 'Furioso', icon: '💢', text: 'Dano +30%.' },
  regenerante: { name: 'Regenerante', icon: '🌿', text: 'Recupera 8% do HP ao fim de cada rodada.' },
  vampirico: { name: 'Vampírico', icon: '🦇', text: 'Cura 30% do dano que causa.' },
};

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
  /** Mini-chefe: mais resistente e com afixo, mas sem o golpe anunciado de um chefe. */
  miniBoss: boolean;
  elite: boolean;
  profile: EnemyProfile;
  affixes: Affix[];
  /** Multiplicadores da profundidade (ataque e defesas). */
  atkMul: number;
  defMul: number;
  /** O chefe já chamou reforços. */
  summoned: boolean;
  /** Defesa abalada (mecanismo Abalo) até o fim da rodada. */
  shaken: boolean;
  /** Dano por rodada do mecanismo Ação sustentada. */
  burn: { amount: number; rounds: number } | null;
}

/** Armadilha instalada: guarda o golpe de quem instalou e dispara em quem passar pela casa. */
export interface Trap { pos: Cell; power: number; atk: number; kind: 'physical' | 'special'; ammo: PokemonType[]; types: PokemonType[] }

export interface Fusion {
  a: number;
  b: number;
  /** As duas armas de origem, na ordem do catálogo. */
  origins: [WeaponId, WeaponId];
  name: string;
  weapon: Weapon;
  ammo: PokemonType[];
  charge: number;
  maxCharge: number;
  /** Turnos do jogador que ainda restam, contando o atual. */
  turnsLeft: number;
}

export type LootItem = { kind: 'gem'; gem: Gem } | { kind: 'potion' } | { kind: 'fusion' };
export interface LootDrop { pos: Cell; items: LootItem[]; chest: boolean }

export type RewardId = 'fusion' | 'potion' | 'rest';
export const REWARDS: Readonly<Record<RewardId, { name: string; text: string }>> = {
  fusion: { name: 'Buff de fusão', text: '+1 carga de fusão, para guardar até a hora certa.' },
  potion: { name: 'Poção', text: '+1 poção: cura 40% do HP do ativo por 2 PA.' },
  rest: { name: 'Sala segura', text: 'Todos os membros que não estão incapacitados recuperam 30% do HP e a carga cheia.' },
};

/**
 * `player`/`enemy`: combate. `cleared`: sala limpa, anda à vontade para pegar o saque e achar a escada. `reward`: na
 * escada, escolhe uma recompensa e desce (ou sai). `lost`: a equipe caiu. `retired`: você saiu com o espólio.
 */
export type Phase = 'player' | 'enemy' | 'cleared' | 'reward' | 'lost' | 'retired';

export interface EnemySpecies {
  dexId: number;
  name: string;
  types: PokemonType[];
  stats: BaseStats;
  /** Primeiro andar em que a espécie aparece (padrão 1). */
  minDepth?: number;
  /** Pode ser chefe. */
  boss?: boolean;
  /** Geração (0 = Kanto … 8 = Paldea): o andar prefere espécies da geração sorteada para ele. */
  generation?: number;
}

export interface DungeonStats { kills: number; gems: number; legendaries: number; deepest: number; elites: number; bosses: number }

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
  loot: LootDrop[];
  stairs: Cell | null;
  bag: Gem[];
  fusion: Fusion | null;
  fusionCharges: number;
  potions: number;
  /** O ativo caiu ou esgotou: a próxima troca é gratuita. */
  mustSwitch: boolean;
  log: string[];
  nextUid: number;
  nextGemId: number;
  rollCount: number;
  rewardOptions: RewardId[];
  /** Golpe anunciado pelo chefe: as casas atingidas no próximo turno inimigo. */
  bossThreat: { uid: number; cells: Cell[] } | null;
  /** Inimigos que ainda vão agir neste turno inimigo (em ordem). */
  turnQueue: number[];
  /** Espécies que podem aparecer (com dados reais), guardadas para os andares seguintes e os reforços do chefe. */
  pool: EnemySpecies[];
  stats: DungeonStats;
  /** Bloqueio para o próximo golpe recebido: fração que some e dano de revide em quem bater de perto. */
  guard: { reduce: number; counter: number };
  barriers: { pos: Cell; rounds: number }[];
  traps: Trap[];
  /** Ataques já feitos neste turno (mecanismo Sequência). */
  combo: number;
  /** Geração sorteada para o andar (0–8): decide inimigos, cenário e casas especiais (`dungeon-biomes.ts`). */
  biome: number;
  /** Casas especiais do andar: lava queima no fim da rodada; água custa 2 PA para quem não nada nem voa. */
  hazards: { pos: Cell; kind: HazardKind }[];
}

export const key = (c: Cell): string => `${c.x},${c.y}`;
const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
const dist = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const inside = (c: Cell): boolean => c.x >= 0 && c.y >= 0 && c.x < GRID_W && c.y < GRID_H;
const isWall = (state: DungeonState, c: Cell): boolean => state.walls.some((w) => same(w, c)) || state.barriers.some((b) => same(b.pos, c));
const DIRS: readonly Cell[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

export const isBossFloor = (floor: number): boolean => floor % BOSS_FLOOR_EVERY === 0;
export const isMiniBossFloor = (floor: number): boolean => floor % MINI_BOSS_FLOOR_EVERY === 0;

export { biomeOf, DUNGEON_BIOMES, floorGeneration, HOME_BONUS, LAVA_BURN };
export type { DecorKind, DungeonBiome, HazardKind, ParticleKind } from './dungeon-biomes';

/** A casa especial em `c`, se houver. */
export function hazardAt(state: Pick<DungeonState, 'hazards'>, c: Cell): HazardKind | null {
  return state.hazards.find((h) => same(h.pos, c))?.kind ?? null;
}

/** Quem nada ou voa atravessa a água sem gastar PA a mais. */
export const isSwimmer = (types: readonly PokemonType[]): boolean => types.includes('water') || types.includes('flying');
/** Quem é Fogo ou voa não se queima na lava. */
export const lavaImmune = (types: readonly PokemonType[]): boolean => types.includes('fire') || types.includes('flying');

/** Algum dos membros em campo é da geração sorteada para o andar («em casa»). */
export function fightingAtHome(state: DungeonState): boolean {
  return fielded(state).some((m) => generationOf(m.dexId) === state.biome + 1);
}

/** Quanto os inimigos crescem por andar (HP, ataque e defesas). Sem teto: a descida fica cada vez mais dura. */
export function depthScale(floor: number): { hp: number; atk: number; def: number } {
  const d = Math.max(0, floor - 1);
  return { hp: 1 + 0.2 * d, atk: 1 + 0.07 * d, def: 1 + 0.04 * d };
}

export function eliteChance(floor: number): number {
  return Math.max(0, Math.min(0.55, 0.05 * (floor - 2)));
}

/**
 * Acompanhamento da equipe: cada aliado de pé depois do primeiro vale 1 andar virtual; a cada 6 graus de gema
 * equipados em aliados de pé vale mais 1. O ajuste é limitado a 8, para a montagem da equipe não criar um salto
 * impossível, e só afeta atributos e elites — a quantidade de inimigos continua seguindo o andar real.
 */
export function adaptiveDifficulty(state: Pick<DungeonState, 'team'>): number {
  const standing = state.team.filter((member) => member.status !== 'down');
  const allies = Math.max(0, standing.length - 1);
  const gemTiers = standing.reduce((sum, member) => sum + member.gems.reduce((tiers, gem) => tiers + (gem?.tier ?? 0), 0), 0);
  return Math.min(8, allies + Math.floor(gemTiers / 6));
}

/** Andar efetivo usado nos atributos e elites: profundidade real mais o crescimento da equipe. */
export function difficultyFloor(state: Pick<DungeonState, 'floor' | 'team'>): number {
  return state.floor + adaptiveDifficulty(state);
}

export function createMember(input: MemberInput): Member {
  const weapon = weaponOfDex(input.dexId);
  if (!weapon) throw new Error(`Sem arma catalogada para a espécie #${input.dexId}.`);
  const maxHp = Math.round(input.stats.hp * 1.2 + 40);
  const maxCharge = WEAPONS[weapon].capacity;
  return {
    ...input, weapon, ammo: input.types.slice(0, 1), hp: maxHp, maxHp, baseMaxHp: maxHp, charge: maxCharge, maxCharge, baseMaxCharge: maxCharge,
    status: 'ready', cooldown: 0, gems: new Array<Gem | null>(GEM_SLOTS).fill(null), phoenixUsed: false,
  };
}

/** Acrescenta uma arma escolhida na Pokébola à expedição já em curso. */
export function addMember(state: DungeonState, input: MemberInput): ActionResult {
  if (state.phase !== 'reward') return fail('A Pokébola só pode ser aberta na escada.');
  if (state.team.length >= MAX_TEAM) return fail(`A equipe já tem ${MAX_TEAM} armas.`);
  if (state.team.some((member) => member.id === input.id)) return fail('Esse Pokémon já está na equipe desta expedição.');
  const member = createMember(input);
  state.team.push(member);
  state.log.push(`${member.name} entra na orbe de ${WEAPONS[member.weapon].name}.`);
  return { ok: true };
}

/** Evolui uma arma/Pokémon durante a escolha da Pokébola, mantendo a fração de HP e as gemas da run. */
export function evolveMember(state: DungeonState, memberIndex: number, next: Omit<MemberInput, 'id'>): ActionResult {
  if (state.phase !== 'reward') return fail('A evolução só pode acontecer na escada.');
  const member = state.team[memberIndex];
  if (!member) return fail('Pokémon da equipe não encontrado.');
  const weapon = weaponOfDex(next.dexId);
  if (!weapon) return fail(`Sem arma catalogada para a espécie #${next.dexId}.`);
  const hpFraction = member.maxHp > 0 ? member.hp / member.maxHp : 0;
  const maxHp = Math.round(next.stats.hp * 1.2 + 40);
  const maxCharge = WEAPONS[weapon].capacity;
  member.dexId = next.dexId;
  member.name = next.name;
  member.types = [...next.types];
  member.stats = { ...next.stats };
  member.weapon = weapon;
  member.ammo = next.types.slice(0, 1);
  member.baseMaxHp = maxHp;
  member.maxHp = maxHp;
  member.hp = Math.max(1, Math.round(maxHp * hpFraction));
  member.baseMaxCharge = maxCharge;
  member.maxCharge = maxCharge;
  member.charge = maxCharge;
  recomputeMember(member);
  state.log.push(`${member.name} evoluiu e agora empunha ${WEAPONS[weapon].name}.`);
  return { ok: true };
}

/** A Pokébola aparece ao limpar o 1º andar e, depois, a cada terceiro andar. */
export function weaponOfferAtFloor(floor: number): boolean {
  return floor === 1 || (floor >= 3 && floor % 3 === 0);
}

/** Recalcula HP e carga máximos depois de trocar gemas, mantendo o que já foi perdido. */
export function recomputeMember(m: Member): void {
  const bonus = gemBonus(m.gems);
  const maxHp = Math.round(m.baseMaxHp * (1 + bonus.hp));
  const maxCharge = m.baseMaxCharge + bonus.charge;
  if (m.hp > 0) m.hp = Math.max(1, Math.min(maxHp, m.hp + (maxHp - m.maxHp)));
  m.charge = Math.max(0, Math.min(maxCharge, m.charge + Math.max(0, maxCharge - m.maxCharge)));
  m.maxHp = maxHp;
  m.maxCharge = maxCharge;
}

/** Uma expedição nova: até seis membros, andar 1. Inimigos vêm de `pool` (espécies com dado real). */
export function startDungeon(inputs: readonly MemberInput[], pool: readonly EnemySpecies[], seed: number): DungeonState {
  const team = inputs.slice(0, MAX_TEAM).map(createMember);
  if (team.length === 0) throw new Error('A equipe precisa de ao menos um Pokémon.');
  if (pool.length === 0) throw new Error('Sem espécies de inimigos com dados.');
  const state: DungeonState = {
    seed, floor: 1, round: 1, ap: START_AP, phase: 'player', team, active: 0, pos: { ...SPAWN },
    enemies: [], walls: [], loot: [], stairs: null, bag: [], fusion: null, fusionCharges: 1, potions: 2, mustSwitch: false, log: [],
    nextUid: 1, nextGemId: 1, rollCount: 0, rewardOptions: [], bossThreat: null, turnQueue: [], pool: pool.map((p) => ({ ...p })),
    stats: { kills: 0, gems: 0, legendaries: 0, deepest: 1, elites: 0, bosses: 0 },
    guard: { reduce: 0, counter: 0 }, barriers: [], traps: [], combo: 0, biome: 0, hazards: [],
  };
  buildFloor(state);
  return state;
}

function rngFor(state: DungeonState, salt: number): Rng {
  return seededRng((state.seed ^ Math.imul(state.floor * 7919 + state.round * 104729 + salt, 2654435761)) >>> 0);
}

/** Um sorteio novo a cada chamada (críticos, eco, saque), reproduzível pela semente da expedição. */
function roll(state: DungeonState): number {
  state.rollCount++;
  return seededRng((state.seed ^ Math.imul(state.rollCount + 0x51ed, 2246822519)) >>> 0)();
}

function rollRng(state: DungeonState): Rng {
  return () => roll(state);
}

function occupied(state: DungeonState, c: Cell): boolean {
  return isWall(state, c) || state.enemies.some((e) => same(e.pos, c)) || same(state.pos, c) || state.loot.some((l) => same(l.pos, c));
}

function freeCell(state: DungeonState, rng: Rng, rows: readonly [number, number]): Cell | null {
  for (let tries = 0; tries < 60; tries++) {
    const c = { x: Math.floor(rng() * GRID_W), y: rows[0] + Math.floor(rng() * (rows[1] - rows[0] + 1)) };
    if (!occupied(state, c)) return c;
  }
  return null;
}

function speciesFor(state: DungeonState, rng: Rng, kind: 'normal' | 'elite' | 'miniBoss' | 'boss'): EnemySpecies {
  const depthOk = state.pool.filter((p) => (p.minDepth ?? 1) <= state.floor);
  const pick = (from: readonly EnemySpecies[]) => from[Math.floor(rng() * from.length)]!;
  const inBiome = (list: readonly EnemySpecies[]) => list.filter((p) => {
    const generation = generationOf(p.dexId);
    return p.generation === state.biome || (p.generation === undefined && generation !== undefined && generation - 1 === state.biome);
  });
  const bosses = depthOk.filter((p) => p.boss);
  const regular = depthOk.filter((p) => !p.boss || (p.minDepth ?? 1) + 10 <= state.floor);
  const biomeBosses = inBiome(bosses);
  const biomeRegular = inBiome(regular);
  const candidates = kind === 'boss'
    ? (biomeBosses.length ? biomeBosses : biomeRegular.length ? biomeRegular : bosses.length ? bosses : regular)
    : (biomeRegular.length ? biomeRegular : regular);
  const base = candidates.length ? pick(candidates) : pick(depthOk.length ? depthOk : state.pool);
  return kind === 'boss' ? base : evolveForDepth(base, state.floor, rng);
}

/** Mais fundo, os selvagens aparecem evoluídos: um estágio a partir do andar 6 e dois a partir do 14 (só com dados reais). */
export function evolveForDepth(species: EnemySpecies, floor: number, rng: Rng): EnemySpecies {
  let current = species;
  const stages = floor >= 14 ? 2 : floor >= 6 ? 1 : 0;
  for (let i = 0; i < stages; i++) {
    const next = nextEvolutions(current.dexId).filter((id) => statsOfDex(id) && typesOfDex(id).length && weaponOfDex(id));
    if (!next.length) break;
    const id = next[Math.floor(rng() * next.length)]!;
    current = { ...current, dexId: id, name: speciesName(id) || `#${id}`, stats: statsOfDex(id)!, types: typesOfDex(id) };
  }
  return current;
}

function spawnEnemy(state: DungeonState, species: EnemySpecies, pos: Cell, kind: 'normal' | 'elite' | 'miniBoss' | 'boss', rng: Rng): Enemy {
  const effectiveFloor = difficultyFloor(state);
  const scale = depthScale(effectiveFloor);
  const weapon = weaponOfDex(species.dexId);
  if (!weapon) throw new Error(`Sem arma catalogada para a espécie inimiga #${species.dexId}.`);
  const affixCount = kind === 'boss' ? Math.floor(effectiveFloor / 10) : kind === 'miniBoss' ? (effectiveFloor >= 18 ? 2 : 1) : kind === 'elite' ? (effectiveFloor >= 15 ? 2 : 1) : 0;
  const pool = [...AFFIX_IDS];
  const affixes: Affix[] = [];
  while (affixes.length < affixCount && pool.length) affixes.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  const maxHp = Math.round((species.stats.hp * 0.8 + 25) * scale.hp * (kind === 'boss' ? 2.6 : kind === 'miniBoss' ? 1.75 : kind === 'elite' ? 1.4 : 1));
  return {
    uid: state.nextUid++, dexId: species.dexId, name: species.name, types: [...species.types], stats: { ...species.stats }, hp: maxHp, maxHp,
    pos, weapon, boss: kind === 'boss', miniBoss: kind === 'miniBoss', elite: kind === 'elite', profile: profileFor(weapon, species.stats, kind === 'boss'), affixes,
    atkMul: scale.atk, defMul: scale.def, summoned: false, shaken: false, burn: null,
  };
}

/** Monta a sala do andar atual: pilares (sem isolar casa nenhuma), inimigos nas fileiras de cima e talvez um baú. */
export function buildFloor(state: DungeonState): void {
  const rng = rngFor(state, 1);
  state.pos = { ...SPAWN };
  state.walls = [];
  state.loot = [];
  state.stairs = null;
  state.bossThreat = null;
  state.enemies = [];
  state.turnQueue = [];
  state.barriers = [];
  state.traps = [];
  state.guard = { reduce: 0, counter: 0 };
  state.combo = 0;
  state.hazards = [];
  state.biome = floorGeneration(state.seed, state.floor);
  const biome = biomeOf(state.biome);
  const boss = isBossFloor(state.floor);
  const miniBoss = isMiniBossFloor(state.floor);
  const pillars = 2 + Math.floor(rng() * 3) + Math.min(3, Math.floor(state.floor / 5));
  for (let tries = 0; state.walls.length < pillars && tries < 60; tries++) {
    const c = { x: Math.floor(rng() * GRID_W), y: 1 + Math.floor(rng() * (GRID_H - 3)) };
    if (isWall(state, c)) continue;
    state.walls.push(c);
    if (reachableAll(state).size !== GRID_W * GRID_H - state.walls.length) state.walls.pop();
  }
  const count = boss ? 1 + Math.min(3, 1 + Math.floor(state.floor / 10)) : Math.min(6, 2 + Math.floor((state.floor - 1) / 2));
  for (let i = 0; i < count; i++) {
    const kind = boss && i === 0 ? 'boss' : miniBoss && i === (boss ? 1 : 0) ? 'miniBoss' : rng() < eliteChance(difficultyFloor(state)) ? 'elite' : 'normal';
    const pos = freeCell(state, rng, [0, 1]) ?? freeCell(state, rng, [0, 3]);
    if (!pos) continue;
    state.enemies.push(spawnEnemy(state, speciesFor(state, rng, kind), pos, kind, rng));
  }
  if (rng() < 0.5) {
    const pos = freeCell(state, rng, [2, 4]);
    if (pos) state.loot.push({ pos, items: [chestItem(state, rng)], chest: true });
  }
  // Casas especiais do cenário em manchas (poças, rios de lava), longe da entrada.
  if (biome.hazard) {
    const target = Math.round((GRID_W * GRID_H - state.walls.length) * biome.hazardDensity);
    for (let tries = 0; state.hazards.length < target && tries < 40; tries++) {
      const seedCell = freeCell(state, rng, [1, GRID_H - 3]);
      if (!seedCell) break;
      const patch = [seedCell, ...DIRS.map((d) => ({ x: seedCell.x + d.x, y: seedCell.y + d.y })).filter(() => rng() < 0.35)];
      for (const c of patch) {
        if (state.hazards.length >= target || !inside(c) || isWall(state, c) || hazardAt(state, c) || state.loot.some((l) => same(l.pos, c)) || dist(c, SPAWN) <= 1) continue;
        state.hazards.push({ pos: c, kind: biome.hazard });
      }
    }
  }
  const theme = `${biome.region} · ${biome.name}`;
  const elites = state.enemies.filter((e) => e.elite).length;
  const mini = state.enemies.find((e) => e.miniBoss);
  state.log.push(boss
    ? `Andar ${state.floor} · Geração ${state.biome + 1} · ${theme}: ${state.enemies[0]?.name ?? 'o chefe'} guarda a sala${mini ? ` com o mini-chefe ${mini.name}` : ''}!`
    : `Andar ${state.floor} · Geração ${state.biome + 1} · ${theme}: ${state.enemies.length} inimigo(s)${mini ? `, mini-chefe ${mini.name}` : ''}${elites ? `, ${elites} de elite` : ''}.`);
}

function newGem(state: DungeonState, rng: Rng, legendaryChance: number): Gem {
  return rollGem(rng, state.floor, state.nextGemId++, legendaryChance);
}

function chestItem(state: DungeonState, rng: Rng): LootItem {
  const r = rng();
  if (r < 0.75) return { kind: 'gem', gem: newGem(state, rng, chestLegendaryChance(state.floor)) };
  return r < 0.9 ? { kind: 'potion' } : { kind: 'fusion' };
}

function dropAt(state: DungeonState, pos: Cell, items: LootItem[]): void {
  if (items.length === 0) return;
  const existing = state.loot.find((l) => same(l.pos, pos));
  if (existing) existing.items.push(...items);
  else state.loot.push({ pos: { ...pos }, items, chest: false });
}

/** O que um inimigo deixa ao cair: comuns às vezes, elites quase sempre, mini-chefes uma gema e chefes duas. */
function enemyDrops(state: DungeonState, enemy: Enemy): LootItem[] {
  const rng = rollRng(state);
  if (enemy.boss) return [{ kind: 'gem', gem: newGem(state, rng, 1) }, { kind: 'gem', gem: newGem(state, rng, 0) }];
  if (enemy.miniBoss) return [{ kind: 'gem', gem: newGem(state, rng, 0) }];
  const chance = enemy.elite ? 0.75 : 0.3;
  if (rng() >= chance) return rng() < 0.08 ? [{ kind: 'potion' }] : [];
  return [{ kind: 'gem', gem: newGem(state, rng, enemy.elite ? 0.06 + state.floor * 0.004 : 0.02) }];
}

function blocked(state: DungeonState, c: Cell, ignoreEnemies = false): boolean {
  return !inside(c) || isWall(state, c) || (!ignoreEnemies && state.enemies.some((e) => same(e.pos, c)));
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

/** Custo para entrar na casa: 1 PA, ou 2 na água para quem não nada nem voa. */
export function stepCost(state: DungeonState, c: Cell): number {
  if (hazardAt(state, c) !== 'agua') return COSTS.move;
  return fielded(state).some((m) => isSwimmer(m.types)) ? COSTS.move : COSTS.move + 1;
}

/** Casas alcançáveis a pé (custo em PA). Em combate, limitado pelos PA; com a sala limpa, anda à vontade. */
export function reachable(state: DungeonState): Map<string, number> {
  const out = new Map<string, number>([[key(state.pos), 0]]);
  const exploring = state.phase === 'cleared';
  if (!exploring && (state.phase !== 'player' || state.mustSwitch)) return out;
  const limit = exploring ? Infinity : state.ap;
  const queue: { c: Cell; cost: number }[] = [{ c: state.pos, cost: 0 }];
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const { c, cost } = queue.shift()!;
    if (cost > (out.get(key(c)) ?? Infinity)) continue;
    for (const d of DIRS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (blocked(state, n)) continue;
      const next = cost + (exploring ? COSTS.move : stepCost(state, n));
      if (next > limit || next >= (out.get(key(n)) ?? Infinity)) continue;
      out.set(key(n), next);
      queue.push({ c: n, cost: next });
    }
  }
  return out;
}

/** O que ataca agora: a fusão, se houver, ou o Pokémon ativo, já com as gemas. */
export interface Attacker {
  name: string;
  weapon: Weapon;
  /** Poder já com o bônus das gemas. */
  power: number;
  /** Armas de origem (duas na fusão) e o Pokémon de cada orbe, na mesma ordem. */
  origins: WeaponId[];
  orbs: number[];
  ammo: PokemonType[];
  types: PokemonType[];
  attack: number;
  spAttack: number;
  charge: number;
  bonus: GemBonus;
}

/** Os membros em campo agora (os dois da fusão, ou o ativo). */
export function fielded(state: DungeonState): Member[] {
  const f = state.fusion;
  return f ? [state.team[f.a]!, state.team[f.b]!] : [state.team[state.active]!];
}

export function attacker(state: DungeonState): Attacker {
  const f = state.fusion;
  if (f) {
    const a = state.team[f.a]!;
    const b = state.team[f.b]!;
    const [first, second]: [Member, Member] = f.origins[0] === a.weapon ? [a, b] : [b, a];
    const bonus = mergeBonus([gemBonus(a.gems), gemBonus(b.gems)]);
    return {
      name: f.name, weapon: f.weapon, power: Math.round(f.weapon.power * (1 + bonus.power)), origins: [...f.origins], orbs: [first.dexId, second.dexId], ammo: f.ammo,
      types: [...new Set([...a.types, ...b.types])], attack: (a.stats.attack + b.stats.attack) / 2, spAttack: (a.stats.spAttack + b.stats.spAttack) / 2, charge: f.charge, bonus,
    };
  }
  const m = state.team[state.active]!;
  const bonus = gemBonus(m.gems);
  let ammo = m.ammo;
  if (bonus.legendary.has('prisma')) {
    const second = m.types[1];
    if (second) ammo = [m.ammo[0] ?? second, second];
    else bonus.power += 0.15;
  }
  const weapon = WEAPONS[m.weapon];
  return { name: m.name, weapon, power: Math.round(weapon.power * (1 + bonus.power)), origins: [m.weapon], orbs: [m.dexId], ammo, types: m.types, attack: m.stats.attack, spAttack: m.stats.spAttack, charge: m.charge, bonus };
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
    if (!inside(c) || isWall(state, c)) break;
    out.push(c);
  }
  return out;
}

/** As 8 casas em volta. */
function ring(c: Cell): Cell[] {
  const out: Cell[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push({ x: c.x + dx, y: c.y + dy });
  return out;
}

/** Direção principal (um eixo) de `from` para `to`. */
function dirTo(from: Cell, to: Cell): Cell {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}

/** Leque: 1 casa à frente e depois 3, na direção do alvo. */
function coneCells(from: Cell, target: Cell): Cell[] {
  const d = dirTo(from, target);
  const side = { x: d.y, y: d.x };
  const a = { x: from.x + d.x, y: from.y + d.y };
  const b = { x: from.x + 2 * d.x, y: from.y + 2 * d.y };
  return [a, b, { x: b.x + side.x, y: b.y + side.y }, { x: b.x - side.x, y: b.y - side.y }];
}

const chebyshev = (a: Cell, b: Cell): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function weaponArea(state: DungeonState, w: Weapon, from: Cell, target: Cell): Cell[] {
  const d = dist(from, target);
  if (d === 0 || !inside(target)) return [];
  const free = (c: Cell) => inside(c) && !isWall(state, c);
  switch (w.pattern) {
    case 'adjacent':
      return d === 1 ? [target] : [];
    case 'line': {
      const cells = lineCells(from, target, w.range, state);
      return cells.some((c) => same(c, target)) ? cells : [];
    }
    case 'ranged': {
      const cells = lineCells(from, target, w.range, state);
      const hit = cells.find((c) => state.enemies.some((e) => same(e.pos, c)));
      return cells.some((c) => same(c, target)) && hit ? [hit] : [];
    }
    case 'area':
      if (d > w.range || isWall(state, target)) return [];
      return [target, ...DIRS.map((o) => ({ x: target.x + o.x, y: target.y + o.y }))].filter(free);
    case 'cone': {
      const cells = coneCells(from, target).filter(free);
      return cells.some((c) => same(c, target)) ? cells : [];
    }
    case 'aura':
      return chebyshev(from, target) === 1 ? ring(from).filter(free) : [];
    case 'homing':
      return d <= w.range && state.enemies.some((e) => same(e.pos, target)) ? [target] : [];
    case 'trap':
      return d <= w.range && free(target) && !same(target, from) ? [target] : [];
  }
}

/** Casas que a arma atinge mirando em `target` (vazio = mira inválida). */
export function attackArea(state: DungeonState, target: Cell): Cell[] {
  return weaponArea(state, attacker(state).weapon, state.pos, target);
}

const trapAt = (state: DungeonState, c: Cell) => state.traps.some((t) => same(t.pos, c));

/** Casas onde dá para mirar e acertar ao menos um inimigo. */
export function attackTargets(state: DungeonState): Cell[] {
  const out: Cell[] = [];
  const trap = attacker(state).weapon.pattern === 'trap';
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const c = { x, y };
    const area = attackArea(state, c);
    const placesTrap = trap && area.length > 0 && !trapAt(state, c);
    if (placesTrap || area.some((a) => state.enemies.some((e) => same(e.pos, a)))) out.push(c);
  }
  return out;
}

/**
 * Casas que a arma de quem está em campo alcança de onde ele está, com ou sem inimigo nelas: é o alcance desenhado
 * no tabuleiro. Tiro reto e linha vão até a parede; teleguiado vale para qualquer casa livre dentro do alcance.
 */
export function attackReach(state: DungeonState): Cell[] {
  const w = attacker(state).weapon;
  const from = state.pos;
  const out = new Map<string, Cell>();
  const put = (c: Cell) => { if (!same(c, from) && inside(c) && !isWall(state, c)) out.set(key(c), c); };
  if (w.pattern === 'line' || w.pattern === 'ranged') {
    for (const d of DIRS) lineCells(from, { x: from.x + d.x, y: from.y + d.y }, w.range, state).forEach(put);
  } else {
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const c = { x, y };
      if (w.pattern === 'homing') { if (dist(from, c) <= w.range) put(c); }
      else weaponArea(state, w, from, c).forEach(put);
    }
  }
  return [...out.values()];
}

/**
 * Quantos ataques da arma em campo ainda cabem neste turno, contando PA e carga, e qual dos dois limita primeiro
 * (`ap` ou `charge`; empate conta como PA). Arma sem custo de carga só é limitada pelos PA.
 */
export function attacksLeft(state: DungeonState): { count: number; limit: 'ap' | 'charge' } {
  const who = attacker(state);
  const byAp = Math.floor(state.ap / Math.max(1, who.weapon.ap));
  const byCharge = who.weapon.cost > 0 ? Math.floor(who.charge / who.weapon.cost) : Number.POSITIVE_INFINITY;
  return byCharge < byAp ? { count: byCharge, limit: 'charge' } : { count: byAp, limit: 'ap' };
}

/** O inimigo tem um guardião vivo encostado (que não é ele mesmo). */
export function guarded(state: DungeonState, enemy: Enemy): boolean {
  return state.enemies.some((g) => g.uid !== enemy.uid && g.profile === 'guardiao' && g.hp > 0 && dist(g.pos, enemy.pos) === 1);
}

export interface AttackHit { enemy: Enemy; damage: number; parts: DamagePart[]; guarded: boolean }
/** `trap`: a mira cai numa casa vazia e o ataque só instala a armadilha. */
export interface AttackPreview { hits: AttackHit[]; ap: number; cost: number; reason: string | null; trap: boolean }

/** O que os mecanismos mudam antes do golpe: poder, chance de crítico e defesa do alvo. */
export function attackMods(state: DungeonState, who: Attacker): { power: number; crit: number; defMul: number } {
  let power = 1;
  let crit = 0;
  let defMul = 1;
  if (fightingAtHome(state)) power *= 1 + HOME_BONUS;
  for (const m of who.weapon.mechanics) {
    if (m === 'carga') power *= 1.35;
    if (m === 'combo') power *= 1 + 0.15 * Math.min(3, state.combo);
    if (m === 'precisao') crit += 0.15;
    if (m === 'perfurar') defMul *= 0.75;
  }
  return { power, crit, defMul };
}

function damageAgainst(state: DungeonState, who: Attacker, enemy: Enemy): { total: number; parts: DamagePart[]; guarded: boolean } {
  const w = who.weapon;
  const mods = attackMods(state, who);
  const raw = w.kind === 'physical' ? enemy.stats.defense * (enemy.shaken ? 0.75 : 1) : enemy.stats.spDefense;
  const def = raw * enemy.defMul * (enemy.affixes.includes('blindado') ? 1.35 : 1) * mods.defMul;
  const r = damage(who.power * mods.power, w.kind === 'physical' ? who.attack : who.spAttack, def, who.ammo, who.types, enemy.types);
  const isGuarded = guarded(state, enemy);
  return { total: Math.max(1, Math.round(r.total * (isGuarded ? GUARD_SHIELD : 1))), parts: r.parts, guarded: isGuarded };
}

export function previewAttack(state: DungeonState, target: Cell): AttackPreview {
  const who = attacker(state);
  const w = who.weapon;
  const area = attackArea(state, target);
  const hits = state.enemies.filter((e) => area.some((c) => same(c, e.pos))).map((enemy) => {
    const r = damageAgainst(state, who, enemy);
    return { enemy, damage: r.total, parts: r.parts, guarded: r.guarded };
  });
  const trap = w.pattern === 'trap' && hits.length === 0 && area.length > 0 && !trapAt(state, target);
  const reason = state.phase !== 'player' ? 'Não é o seu turno.'
    : state.mustSwitch ? 'Escolha quem assume a posição.'
    : state.ap < w.ap ? `Faltam PA (precisa de ${w.ap}).`
    : who.charge < w.cost ? `Falta carga (precisa de ${w.cost}).`
    : hits.length === 0 && !trap ? 'Nenhum inimigo nessa mira.' : null;
  return { hits, ap: w.ap, cost: w.cost, reason, trap };
}

export type ActionResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): ActionResult => ({ ok: false, reason });

function describeItem(item: LootItem): string {
  return item.kind === 'gem' ? gemName(item.gem) : item.kind === 'potion' ? 'Poção' : 'Buff de fusão';
}

/** Pega o que estiver na casa (gemas vão para a mochila). */
function pickup(state: DungeonState, at: Cell): void {
  const drop = state.loot.find((l) => same(l.pos, at));
  if (!drop) return;
  state.loot = state.loot.filter((l) => l !== drop);
  for (const item of drop.items) {
    if (item.kind === 'gem') {
      state.bag.push(item.gem);
      state.stats.gems++;
      if (item.gem.legendary) state.stats.legendaries++;
    } else if (item.kind === 'potion') state.potions++;
    else state.fusionCharges++;
  }
  state.log.push(`${drop.chest ? 'Baú aberto' : 'Achado'}: ${drop.items.map(describeItem).join(', ')}.`);
}

export function move(state: DungeonState, to: Cell): ActionResult {
  const exploring = state.phase === 'cleared';
  if (state.phase !== 'player' && !exploring) return fail('Não é o seu turno.');
  if (state.mustSwitch) return fail('Escolha quem assume a posição.');
  const cost = reachable(state).get(key(to));
  if (cost === undefined || cost === 0) return fail('Casa fora de alcance.');
  state.pos = { ...to };
  if (!exploring) state.ap -= cost;
  pickup(state, to);
  if (exploring && state.stairs && same(state.stairs, to)) {
    state.phase = 'reward';
    state.rewardOptions = ['fusion', 'potion', 'rest'];
    state.log.push('Na escada: escolha uma recompensa para descer, ou saia com o que juntou.');
  }
  return { ok: true };
}

function hurtEnemy(state: DungeonState, enemy: Enemy, amount: number, text: string): number {
  const dealt = Math.min(enemy.hp, Math.max(enemy.hp > 0 ? 1 : 0, amount));
  enemy.hp -= dealt;
  state.log.push(`${text}: −${dealt} HP.`);
  return dealt;
}

/** Empurra o inimigo uma casa para longe de você, se a casa estiver livre. */
function push(state: DungeonState, enemy: Enemy): void {
  const dx = enemy.pos.x - state.pos.x;
  const dy = enemy.pos.y - state.pos.y;
  const step = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  const to = { x: enemy.pos.x + step.x, y: enemy.pos.y + step.y };
  if (!blocked(state, to) && !same(to, state.pos)) { enemy.pos = to; state.log.push(`O vendaval empurra ${enemy.name}.`); }
}

function removeDead(state: DungeonState): void {
  for (const e of state.enemies.filter((x) => x.hp <= 0)) {
    state.log.push(`${e.name} foi derrotado.`);
    state.stats.kills++;
    if (e.elite) state.stats.elites++;
    if (e.boss) state.stats.bosses++;
    if (state.bossThreat?.uid === e.uid) state.bossThreat = null;
    dropAt(state, e.pos, enemyDrops(state, e));
  }
  state.enemies = state.enemies.filter((x) => x.hp > 0);
}

function makeTrap(state: DungeonState, who: Attacker, pos: Cell, fraction: number): Trap {
  const w = who.weapon;
  return { pos: { ...pos }, power: who.power * attackMods(state, who).power * fraction, atk: w.kind === 'physical' ? who.attack : who.spAttack, kind: w.kind, ammo: [...who.ammo], types: [...who.types] };
}

function springTrap(state: DungeonState, trap: Trap, enemy: Enemy): void {
  state.traps = state.traps.filter((t) => t !== trap);
  const raw = trap.kind === 'physical' ? enemy.stats.defense : enemy.stats.spDefense;
  const def = raw * enemy.defMul * (enemy.affixes.includes('blindado') ? 1.35 : 1);
  hurtEnemy(state, enemy, damage(trap.power, trap.atk, def, trap.ammo, trap.types, enemy.types).total, `${enemy.name} pisa numa armadilha`);
}

/** Puxa o inimigo em direção a você até encostar (no máximo 2 casas). */
function pull(state: DungeonState, enemy: Enemy): void {
  for (let i = 0; i < 2 && dist(enemy.pos, state.pos) > 1; i++) {
    const d = dirTo(enemy.pos, state.pos);
    const to = { x: enemy.pos.x + d.x, y: enemy.pos.y + d.y };
    if (blocked(state, to) || same(to, state.pos)) break;
    enemy.pos = to;
  }
  state.log.push(`A corrente puxa ${enemy.name}.`);
}

export function attack(state: DungeonState, target: Cell): ActionResult {
  const preview = previewAttack(state, target);
  if (preview.reason) return fail(preview.reason);
  const who = attacker(state);
  const legend = who.bonus.legendary;
  const mods = attackMods(state, who);
  state.ap -= preview.ap;
  if (preview.trap) {
    state.traps.push(makeTrap(state, who, target, 1));
    state.log.push(`${who.name} instala uma armadilha.`);
    state.combo++;
    spendCharge(state, preview.cost);
    return { ok: true };
  }
  const echo = legend.has('eco') && roll(state) < ECHO_CHANCE;
  const hitUids = new Set<number>();
  const main = new Map<number, number>();
  let dealt = 0;
  const enemyAtCell = (c: Cell) => state.enemies.find((e) => e.hp > 0 && same(e.pos, c));
  /** Golpe extra de um mecanismo: uma fração do dano que esse inimigo levaria. */
  const extra = (enemy: Enemy, fraction: number, text: string) => {
    if (enemy.hp <= 0) return;
    hitUids.add(enemy.uid);
    dealt += hurtEnemy(state, enemy, Math.round(damageAgainst(state, who, enemy).total * fraction), text);
  };
  for (const hit of preview.hits) {
    const crit = roll(state) < who.bonus.crit + mods.crit;
    const amount = Math.round(hit.damage * (crit ? CRIT : 1) + (echo ? hit.damage * 0.5 : 0));
    const d = hurtEnemy(state, hit.enemy, amount, `${who.name} acerta ${hit.enemy.name}${crit ? ' (crítico!)' : ''}${echo ? ' (eco)' : ''}${hit.guarded ? ' (protegido)' : ''}`);
    dealt += d;
    main.set(hit.enemy.uid, hit.damage);
    hitUids.add(hit.enemy.uid);
  }
  const targets = preview.hits.map((h) => h.enemy);
  const first = targets[0];
  const near = (c: Cell, r: number) => state.enemies.filter((e) => e.hp > 0 && !hitUids.has(e.uid) && dist(e.pos, c) <= r).sort((a, b) => dist(a.pos, c) - dist(b.pos, c));
  const avgMain = main.size ? [...main.values()].reduce((a, b) => a + b, 0) / main.size : 0;
  for (const m of who.weapon.mechanics) {
    switch (m) {
      case 'rapido': if (first) extra(first, 0.4, `Corte extra em ${first.name}`); break;
      case 'rajada': for (const e of targets) extra(e, 0.25, `Rajada em ${e.name}`); break;
      case 'abalo': for (const e of targets) e.shaken = true; break;
      case 'estender':
        for (const e of targets) {
          const d = dirTo(state.pos, e.pos);
          const behind = enemyAtCell({ x: e.pos.x + d.x, y: e.pos.y + d.y });
          if (behind && !hitUids.has(behind.uid)) extra(behind, 0.6, `O golpe se estende até ${behind.name}`);
        }
        break;
      case 'perfurar':
        if (first) {
          const d = dirTo(state.pos, first.pos);
          for (let i = 1; i <= 3; i++) {
            const c = { x: first.pos.x + d.x * i, y: first.pos.y + d.y * i };
            if (!inside(c) || isWall(state, c)) break;
            const e = enemyAtCell(c);
            if (e && !hitUids.has(e.uid)) extra(e, 0.6, `O tiro atravessa até ${e.name}`);
          }
        }
        break;
      case 'bloqueio':
        state.guard = { reduce: Math.max(state.guard.reduce, 0.4), counter: Math.max(state.guard.counter, Math.round(avgMain * 0.5)) };
        state.log.push('Postura de bloqueio.');
        break;
      case 'barreira': {
        const d = dirTo(state.pos, first?.pos ?? target);
        const c = { x: state.pos.x + d.x, y: state.pos.y + d.y };
        if (inside(c) && !occupied(state, c) && !trapAt(state, c)) { state.barriers.push({ pos: c, rounds: 2 }); state.log.push('Uma barreira se ergue.'); }
        break;
      }
      case 'orbita':
        state.guard = { ...state.guard, reduce: Math.max(state.guard.reduce, 0.2) };
        for (const e of near(state.pos, 1)) extra(e, 0.25, `O guardião orbital atinge ${e.name}`);
        break;
      case 'escudada':
        state.guard = { ...state.guard, reduce: Math.max(state.guard.reduce, 0.25) };
        if (first && first.hp > 0) push(state, first);
        break;
      case 'estilhaco': for (const e of near(state.pos, 1)) extra(e, 0.3, `Estilhaços em ${e.name}`); break;
      case 'queimar':
        for (const e of targets) if (e.hp > 0) e.burn = { amount: Math.max(e.burn?.amount ?? 0, Math.max(1, Math.round((main.get(e.uid) ?? 0) * 0.2))), rounds: 2 };
        break;
      case 'explosao': for (const t of targets) for (const e of near(t.pos, 1)) extra(e, 0.4, `A explosão alcança ${e.name}`); break;
      case 'arco':
        if (first) {
          let from = first.pos;
          for (const fraction of [0.5, 0.3]) {
            const next = near(from, 2)[0];
            if (!next) break;
            extra(next, fraction, `O arco salta para ${next.name}`);
            from = next.pos;
          }
        }
        break;
      case 'retorno': for (const e of targets) if (e.hp > 0) extra(e, 0.3, `O disco volta e acerta ${e.name}`); break;
      case 'armadilha':
        if (first) {
          const spot = DIRS.map((o) => ({ x: first.pos.x + o.x, y: first.pos.y + o.y }))
            .filter((c) => inside(c) && !occupied(state, c) && !trapAt(state, c))
            .sort((a, b) => dist(a, state.pos) - dist(b, state.pos))[0];
          if (spot) { state.traps.push(makeTrap(state, who, spot, 0.6)); state.log.push('Uma armadilha fica para trás.'); }
        }
        break;
      case 'puxar': if (first && first.hp > 0) pull(state, first); break;
      case 'enxame': for (const e of near(state.pos, 4).slice(0, 2)) extra(e, 0.25, `O enxame persegue ${e.name}`); break;
      default: break;
    }
  }
  if (legend.has('corrente')) {
    for (const hit of preview.hits) {
      const next = state.enemies.find((e) => e.hp > 0 && !hitUids.has(e.uid) && dist(e.pos, hit.enemy.pos) === 1);
      if (!next) continue;
      hitUids.add(next.uid);
      dealt += hurtEnemy(state, next, Math.round(hit.damage * 0.5), `A corrente salta para ${next.name}`);
    }
  }
  if (legend.has('vendaval')) for (const hit of preview.hits) if (hit.enemy.hp > 0) push(state, hit.enemy);
  if (legend.has('vampiro') && dealt > 0) {
    const heal = Math.max(1, Math.round(dealt * 0.2));
    for (const m of fielded(state)) m.hp = Math.min(m.maxHp, m.hp + Math.ceil(heal / fielded(state).length));
    state.log.push(`A gema vampírica devolve ${heal} HP.`);
  }
  state.combo++;
  removeDead(state);
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
  lose(state, 'Nenhum Pokémon pode assumir a posição: a expedição terminou.');
}

function lose(state: DungeonState, why: string): void {
  state.phase = 'lost';
  state.turnQueue = [];
  state.log.push(why);
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
  const targets = fielded(state);
  if (targets.every((m) => m.hp >= m.maxHp)) return fail('O HP já está cheio.');
  state.ap -= COSTS.item;
  state.potions--;
  for (const m of targets) m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * POTION_HEAL));
  state.log.push('Poção usada.');
  return { ok: true };
}

export function previewFusion(state: DungeonState, a: number, b: number): { ok: boolean; reason: string | null; name: string; weapon: Weapon; origins: [WeaponId, WeaponId]; ammo: PokemonType[] } | null {
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
  return { ok: reason === null, reason, name: `${ma.name} + ${mb.name}`, weapon, origins: fusionOrigins(ma.weapon, mb.weapon), ammo };
}

export function fuse(state: DungeonState, a: number, b: number): ActionResult {
  const p = previewFusion(state, a, b);
  if (!p) return fail('Escolha dois membros diferentes.');
  if (p.reason) return fail(p.reason);
  state.ap -= COSTS.fusion;
  state.fusionCharges--;
  state.fusion = { a, b, origins: p.origins, name: p.name, weapon: p.weapon, ammo: p.ammo, charge: FUSION_CHARGE, maxCharge: FUSION_CHARGE, turnsLeft: FUSION_TURNS };
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
  if (standing === undefined) return lose(state, 'Ninguém pode assumir a posição: a expedição terminou.');
  const m = state.team[standing]!;
  m.status = m.charge > 0 ? 'ready' : 'exhausted';
  m.cooldown = 0;
  state.active = standing;
  if (m.status === 'exhausted') requireSwitch(state);
}

/** Dano recebido: a fusão usa a média das defesas e divide o dano entre os dois participantes. */
function takeHit(state: DungeonState, enemy: Enemy, strength = 1): void {
  const w = WEAPONS[enemy.weapon];
  const f = state.fusion;
  const defenders = fielded(state);
  const def = defenders.reduce((s, m) => s + (w.kind === 'physical' ? m.stats.defense : m.stats.spDefense) * (1 + gemBonus(m.gems).defense), 0) / defenders.length;
  const types = [...new Set(defenders.flatMap((m) => m.types))];
  const atk = (w.kind === 'physical' ? enemy.stats.attack : enemy.stats.spAttack) * enemy.atkMul * (enemy.affixes.includes('furioso') ? 1.3 : 1);
  // Inimigos batem com uma fração do poder da arma: a equipe tem seis vidas, eles não.
  let total = damage(w.power * 0.7 * strength, atk, def, enemy.types.slice(0, 1), enemy.types, types).total;
  const guard = state.guard;
  state.guard = { reduce: 0, counter: 0 };
  if (guard.reduce > 0) total = Math.max(1, Math.round(total * (1 - guard.reduce)));
  const each = Math.ceil(total / defenders.length);
  for (const m of defenders) m.hp = Math.max(0, m.hp - each);
  state.log.push(`${enemy.name} ${strength > 1 ? 'solta o golpe em área em' : 'ataca'} ${f ? f.name : defenders[0]!.name}: −${total} HP.`);
  if (enemy.affixes.includes('vampirico')) enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.round(total * 0.3));
  if (guard.reduce > 0) state.log.push('O bloqueio amortece o golpe.');
  if (guard.counter > 0 && dist(enemy.pos, state.pos) === 1) hurtEnemy(state, enemy, guard.counter, `Revide em ${enemy.name}`);
  for (const m of defenders) {
    if (m.hp > 0 || m.phoenixUsed || !gemBonus(m.gems).legendary.has('fenix')) continue;
    m.phoenixUsed = true;
    m.hp = Math.max(1, Math.round(m.maxHp * 0.3));
    state.log.push(`A Gema da Fênix arde: ${m.name} se levanta!`);
  }
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
  if (w.pattern === 'aura') return chebyshev(from, target) === 1;
  if (w.pattern === 'area' || w.pattern === 'homing' || w.pattern === 'trap') return d > 0 && d <= w.range;
  if (w.pattern === 'cone') return d > 0 && coneCells(from, target).some((c) => same(c, target));
  return lineCells(from, target, w.range, state).some((c) => same(c, target));
}

const stepsOf = (enemy: Enemy): number => (enemy.affixes.includes('veloz') ? 3 : 2);

/** Casas a até `steps` passos do inimigo (sem atravessar ninguém nem você), com o caminho até cada uma. */
function enemyMoves(state: DungeonState, enemy: Enemy, steps: number): Map<string, { cell: Cell; path: Cell[] }> {
  const out = new Map<string, { cell: Cell; path: Cell[] }>([[key(enemy.pos), { cell: enemy.pos, path: [] }]]);
  let frontier = [enemy.pos];
  for (let s = 0; s < steps; s++) {
    const next: Cell[] = [];
    for (const c of frontier) for (const d of DIRS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (out.has(key(n)) || same(n, state.pos) || blocked(state, n)) continue;
      out.set(key(n), { cell: n, path: [...out.get(key(c))!.path, n] });
      next.push(n);
    }
    frontier = next;
  }
  return out;
}

/** Casas do golpe do chefe: o quadrado 3×3 em volta de onde você está agora. */
function bossArea(state: DungeonState): Cell[] {
  const out: Cell[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const c = { x: state.pos.x + dx, y: state.pos.y + dy };
    if (inside(c) && !isWall(state, c)) out.push(c);
  }
  return out;
}

export type IntentKind = 'attack' | 'approach' | 'retreat' | 'hold' | 'heal' | 'shield' | 'flee' | 'charge' | 'strike' | 'summon';
export const INTENTS: Readonly<Record<IntentKind, { icon: string; text: string }>> = {
  attack: { icon: '🗡️', text: 'vai atacar' },
  approach: { icon: '👣', text: 'vai se aproximar' },
  retreat: { icon: '↩️', text: 'vai recuar para atirar' },
  hold: { icon: '⏸️', text: 'vai segurar a posição' },
  heal: { icon: '💚', text: 'vai curar um aliado' },
  shield: { icon: '🛡️', text: 'vai proteger um aliado' },
  flee: { icon: '💦', text: 'vai fugir para se recuperar' },
  charge: { icon: '⚠️', text: 'vai anunciar um golpe em área' },
  strike: { icon: '💥', text: 'vai soltar o golpe anunciado' },
  summon: { icon: '📯', text: 'vai chamar reforços' },
};

export interface Intent { kind: IntentKind; path: Cell[]; to: Cell; attacks: boolean; healUid?: number }

const wounded = (e: Enemy, below: number): boolean => e.hp < e.maxHp * below;

/**
 * O que o inimigo faria agora (o mesmo cálculo é usado para agir e para a prévia de intenção na tela). Cada casa
 * alcançável ganha uma nota pelo perfil; ganha a mais alta, com desempate pela que pede menos passos.
 */
export function planEnemy(state: DungeonState, enemy: Enemy): Intent {
  const stay: Intent = { kind: 'hold', path: [], to: enemy.pos, attacks: false };
  if (enemy.profile === 'chefe') {
    if (state.bossThreat?.uid === enemy.uid) return { ...stay, kind: 'strike' };
    if (!enemy.summoned && wounded(enemy, 0.5)) return { ...stay, kind: 'summon' };
    if (state.round % BOSS_EVERY === 0) return { ...stay, kind: 'charge' };
  }
  const moves = [...enemyMoves(state, enemy, stepsOf(enemy)).values()];
  const allies = state.enemies.filter((e) => e.uid !== enemy.uid);
  const range = WEAPONS[enemy.weapon].range;
  const canHit = (c: Cell) => enemyReach(enemy, c, state.pos, state);
  const burns = !lavaImmune(enemy.types);
  const lava = (c: Cell) => (burns && hazardAt(state, c) === 'lava' ? 15 : 0);
  const pick = (score: (c: Cell) => number): { cell: Cell; path: Cell[] } =>
    moves.reduce((best, m) => (score(m.cell) - m.path.length * 0.5 - lava(m.cell) > score(best.cell) - best.path.length * 0.5 - lava(best.cell) ? m : best), moves[0]!);
  const result = (kind: IntentKind, m: { cell: Cell; path: Cell[] }, extra: Partial<Intent> = {}): Intent => {
    const attacks = canHit(m.cell);
    const resolved = kind === 'approach' || kind === 'retreat' || kind === 'hold'
      ? attacks ? 'attack' : m.path.length === 0 ? 'hold' : dist(m.cell, state.pos) > dist(enemy.pos, state.pos) ? 'retreat' : 'approach'
      : kind;
    return { kind: resolved, path: m.path, to: m.cell, attacks, ...extra };
  };
  const crowd = (c: Cell) => allies.filter((a) => dist(a.pos, c) === 1).length;

  // Ferido, foge para longe se alguém puder curá-lo ou se ele se regenera.
  const canRecover = enemy.affixes.includes('regenerante') || allies.some((a) => a.profile === 'suporte');
  if (!enemy.boss && enemy.profile !== 'guardiao' && wounded(enemy, 0.25) && canRecover) {
    const m = pick((c) => dist(c, state.pos) * 4 + (allies.some((a) => a.profile === 'suporte' && dist(a.pos, c) <= 2) ? 6 : 0));
    return result('flee', m);
  }

  if (enemy.profile === 'suporte') {
    const patient = [...allies, enemy].filter((a) => wounded(a, 0.7)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (patient) {
      const m = pick((c) => (dist(c, patient.uid === enemy.uid ? c : patient.pos) <= 3 ? 100 : -dist(c, patient.pos) * 5) + Math.min(dist(c, state.pos), 4) * 3);
      if (patient.uid === enemy.uid || dist(m.cell, patient.pos) <= 3) return result('heal', m, { healUid: patient.uid });
    }
  }

  if (enemy.profile === 'guardiao') {
    const ward = allies.filter((a) => wounded(a, 0.6)).sort((a, b) => dist(a.pos, enemy.pos) - dist(b.pos, enemy.pos))[0];
    if (ward && dist(ward.pos, state.pos) <= GUARD_RADIUS + 3) {
      const m = pick((c) => (dist(c, ward.pos) === 1 ? 50 : -dist(c, ward.pos) * 6) + (canHit(c) ? 20 : 0));
      return result('shield', m);
    }
    if (dist(enemy.pos, state.pos) > GUARD_RADIUS) return canHit(enemy.pos) ? { ...stay, kind: 'attack', attacks: true } : stay;
  }

  if (enemy.profile === 'atirador' || enemy.profile === 'suporte') {
    return result('approach', pick((c) => (canHit(c) ? 100 : 0) - (dist(c, state.pos) <= 1 ? 60 : 0) - Math.abs(dist(c, state.pos) - range) * 4 - crowd(c) * 2));
  }
  // Bruto, guardião acordado e chefe sem golpe especial: chegar ao alcance, cercando (evita ficar colado nos aliados).
  return result('approach', pick((c) => (canHit(c) ? 100 : 0) - dist(c, state.pos) * 3 - crowd(c) * 2));
}

/** Prévia das intenções de todos os inimigos (cada um como se agisse sozinho agora). */
export function intents(state: DungeonState): Map<number, Intent> {
  return new Map(state.enemies.map((e) => [e.uid, planEnemy(state, e)]));
}

function summon(state: DungeonState, boss: Enemy): void {
  boss.summoned = true;
  const rng = rollRng(state);
  let n = 0;
  for (const d of DIRS) {
    if (n >= 2) break;
    const c = { x: boss.pos.x + d.x, y: boss.pos.y + d.y };
    if (blocked(state, c) || same(c, state.pos)) continue;
    state.enemies.push(spawnEnemy(state, speciesFor(state, rng, 'normal'), c, 'normal', rng));
    n++;
  }
  state.log.push(n ? `${boss.name} chama ${n} reforço(s)!` : `${boss.name} chama reforços, mas não há espaço.`);
}

/** Um inimigo age segundo `planEnemy`. */
function enemyAct(state: DungeonState, enemy: Enemy): void {
  const plan = planEnemy(state, enemy);
  if (plan.kind === 'strike') {
    const cells = state.bossThreat?.cells ?? [];
    state.bossThreat = null;
    if (cells.some((c) => same(c, state.pos))) takeHit(state, enemy, BOSS_STRIKE);
    else state.log.push(`O golpe de ${enemy.name} acerta o chão vazio.`);
    return;
  }
  if (plan.kind === 'charge') {
    state.bossThreat = { uid: enemy.uid, cells: bossArea(state) };
    state.log.push(`${enemy.name} prepara um golpe em área: saia das casas marcadas!`);
    return;
  }
  if (plan.kind === 'summon') return summon(state, enemy);
  for (const step of plan.path) {
    enemy.pos = { ...step };
    const trap = state.traps.find((t) => same(t.pos, step));
    if (trap) { springTrap(state, trap, enemy); break; }
  }
  if (enemy.hp <= 0) return;
  if (plan.kind === 'heal' && plan.healUid !== undefined) {
    const patient = state.enemies.find((e) => e.uid === plan.healUid);
    if (patient) {
      const amount = Math.min(patient.maxHp - patient.hp, Math.round(patient.maxHp * SUPPORT_HEAL));
      patient.hp += amount;
      state.log.push(patient.uid === enemy.uid ? `${enemy.name} se cura: +${amount} HP.` : `${enemy.name} cura ${patient.name}: +${amount} HP.`);
    }
    return;
  }
  if (plan.kind === 'flee') state.log.push(`${enemy.name} recua, ferido.`);
  if (enemyReach(enemy, enemy.pos, state.pos, state) && plan.kind !== 'flee') takeHit(state, enemy);
}

/** Começa o turno inimigo (a fila de quem vai agir). Use `enemyStep` para um de cada vez e `finishEnemyTurn` no fim. */
export function beginEnemyTurn(state: DungeonState): ActionResult {
  if (state.phase !== 'player') return fail('Não é o seu turno.');
  if (state.mustSwitch) return fail('Escolha quem assume a posição.');
  if (state.fusion && --state.fusion.turnsLeft <= 0) endFusion(state, 'O tempo da fusão acabou.');
  if (state.mustSwitch) autoCover(state);
  if (state.phase !== 'player') return { ok: true };
  state.phase = 'enemy';
  // Quem tem golpe anunciado age primeiro; depois, do mais perto para o mais longe.
  state.turnQueue = [...state.enemies]
    .sort((a, b) => Number(state.bossThreat?.uid === b.uid) - Number(state.bossThreat?.uid === a.uid) || dist(a.pos, state.pos) - dist(b.pos, state.pos))
    .map((e) => e.uid);
  return { ok: true };
}

/** O próximo inimigo da fila age. Devolve o uid de quem agiu, ou null quando a fila acabou. */
export function enemyStep(state: DungeonState): number | null {
  while (state.phase === 'enemy' && state.turnQueue.length) {
    const uid = state.turnQueue.shift()!;
    const enemy = state.enemies.find((e) => e.uid === uid);
    if (!enemy) continue;
    enemyAct(state, enemy);
    if (state.mustSwitch && state.phase === 'enemy') autoCover(state);
    removeDead(state);
    if (state.enemies.length === 0 && state.phase === 'enemy') clearFloor(state);
    return uid;
  }
  return null;
}

/** Fecha o turno inimigo: rodada nova, recuperação da reserva e PA de volta. */
export function finishEnemyTurn(state: DungeonState): void {
  if (state.phase !== 'enemy') return;
  state.turnQueue = [];
  endRound(state);
}

/** Encerra o turno de uma vez (todos os inimigos agem em sequência). */
export function endTurn(state: DungeonState): ActionResult {
  const r = beginEnemyTurn(state);
  if (!r.ok) return r;
  while (enemyStep(state) !== null) { /* cada inimigo age */ }
  finishEnemyTurn(state);
  return { ok: true };
}

/**
 * Casas onde você seria atingido se terminasse o turno ali (estimativa: cada inimigo como se agisse sozinho, com os
 * passos do perfil dele). É a «área ameaçada» do esboço de interface.
 */
export function threatenedCells(state: DungeonState): Set<string> {
  const out = new Set<string>(state.bossThreat?.cells.map(key) ?? []);
  for (const enemy of state.enemies) {
    if (enemy.profile === 'chefe' && state.bossThreat?.uid === enemy.uid) continue;
    const spots = new Map<string, Cell>([[key(enemy.pos), enemy.pos]]);
    let frontier = [enemy.pos];
    for (let step = 0; step < stepsOf(enemy); step++) {
      const next: Cell[] = [];
      for (const c of frontier) for (const d of DIRS) {
        const n = { x: c.x + d.x, y: c.y + d.y };
        if (spots.has(key(n)) || blocked(state, n)) continue;
        spots.set(key(n), n);
        next.push(n);
      }
      frontier = next;
    }
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const target = { x, y };
      if (isWall(state, target)) continue;
      // O guardião só sai do lugar se você parar a até 3 casas dele.
      if (enemy.profile === 'guardiao' && dist(enemy.pos, target) > GUARD_RADIUS) continue;
      if ([...spots.values()].some((from) => !same(from, target) && enemyReach(enemy, from, target, state))) out.add(key(target));
    }
  }
  return out;
}

/** Durante o turno inimigo, quem cai é coberto pelo próximo disponível (o jogador troca de novo no turno dele). */
function autoCover(state: DungeonState): void {
  const next = state.team.findIndex((_, i) => available(state, i));
  if (next < 0) return;
  state.active = next;
  state.mustSwitch = false;
  state.log.push(`${state.team[next]!.name} cobre a posição.`);
}

/** PA do turno: 6, mais 1 se quem está em campo carrega a Gema da Ampulheta. */
export function turnAp(state: DungeonState): number {
  return START_AP + (fielded(state).some((m) => gemBonus(m.gems).legendary.has('ampulheta')) ? 1 : 0);
}

function endRound(state: DungeonState): void {
  for (const e of state.enemies) {
    e.shaken = false;
    if (e.burn) {
      hurtEnemy(state, e, Math.min(e.hp, e.burn.amount), `${e.name} queima`);
      if (--e.burn.rounds <= 0) e.burn = null;
    }
    if (e.affixes.includes('regenerante') && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.08));
  }
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
  if (hazardAt(state, state.pos) === 'lava') {
    const team = fielded(state);
    if (!team.some((m) => lavaImmune(m.types))) {
      for (const m of team) m.hp = Math.max(1, m.hp - Math.ceil(m.maxHp * LAVA_BURN));
      state.log.push('A lava queima quem está em campo.');
    }
  }
  for (const e of state.enemies) if (hazardAt(state, e.pos) === 'lava' && !lavaImmune(e.types)) hurtEnemy(state, e, Math.ceil(e.maxHp * LAVA_BURN), `${e.name} se queima na lava`);
  state.barriers = state.barriers.filter((b) => --b.rounds > 0);
  state.guard = { reduce: 0, counter: 0 };
  state.combo = 0;
  state.round++;
  removeDead(state);
  if (state.enemies.length === 0) return clearFloor(state);
  state.phase = 'player';
  state.ap = turnAp(state);
}

/** Sala limpa: todos retomam fôlego (carga cheia para quem esgotou), a escada aparece e o saque fica para pegar. */
function clearFloor(state: DungeonState): void {
  if (state.fusion) endFusion(state, 'Sala limpa.');
  state.phase = 'cleared';
  state.mustSwitch = false;
  state.turnQueue = [];
  state.bossThreat = null;
  for (const m of state.team) {
    if (m.status === 'exhausted' || m.status === 'recovering') { m.status = 'ready'; m.cooldown = 0; m.charge = m.maxCharge; }
  }
  if (!available(state, state.active)) state.active = Math.max(0, state.team.findIndex((_, i) => available(state, i)));
  let far: Cell | null = null;
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const c = { x, y };
    if (occupied(state, c)) continue;
    if (!far || dist(c, state.pos) > dist(far, state.pos)) far = c;
  }
  state.stairs = far;
  state.log.push(isBossFloor(state.floor) ? 'O chefe caiu! A escada para o fundo se abre.' : isMiniBossFloor(state.floor) ? 'O mini-chefe caiu! A escada para o fundo se abre.' : 'Sala limpa! Pegue o que caiu e siga para a escada.');
}

/** Pega a recompensa da escada e desce para o próximo andar (sempre mais difícil). */
export function chooseReward(state: DungeonState, reward: RewardId): ActionResult {
  if (state.phase !== 'reward' || !state.rewardOptions.includes(reward)) return fail('Nada para escolher agora.');
  if (reward === 'fusion') state.fusionCharges++;
  if (reward === 'potion') state.potions++;
  if (reward === 'rest') for (const m of state.team) if (m.status !== 'down') { m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.3)); m.charge = m.maxCharge; m.status = 'ready'; m.cooldown = 0; }
  state.log.push(`${REWARDS[reward].name} escolhido.`);
  return descend(state);
}

function descend(state: DungeonState): ActionResult {
  state.floor++;
  state.stats.deepest = Math.max(state.stats.deepest, state.floor);
  state.round = 1;
  state.phase = 'player';
  state.rewardOptions = [];
  for (const m of state.team) {
    m.phoenixUsed = false;
    if (m.status === 'recovering') { m.status = 'ready'; m.cooldown = 0; }
  }
  if (!available(state, state.active)) state.active = Math.max(0, state.team.findIndex((_, i) => available(state, i)));
  if (!available(state, state.active)) {
    lose(state, 'Ninguém pode seguir: a expedição terminou.');
    return { ok: true };
  }
  buildFloor(state);
  state.ap = turnAp(state);
  return { ok: true };
}

/** Sai da masmorra pela escada, com tudo o que juntou. Só depois de limpar a sala. */
export function retreat(state: DungeonState): ActionResult {
  if (state.phase !== 'cleared' && state.phase !== 'reward') return fail('Só dá para sair com a sala limpa.');
  state.phase = 'retired';
  state.log.push(`Você sai da masmorra no andar ${state.floor}, com ${state.bag.length} gema(s) na mochila.`);
  return { ok: true };
}

const canForge = (state: DungeonState): boolean => state.phase === 'cleared' || state.phase === 'reward';

/** Encaixa uma gema da mochila numa arma (só com a sala limpa). A que estava ali volta para a mochila. */
export function equipGem(state: DungeonState, member: number, slot: number, gemId: number): ActionResult {
  if (!canForge(state)) return fail('Só dá para mexer nas gemas com a sala limpa.');
  const m = state.team[member];
  const gem = state.bag.find((g) => g.id === gemId);
  if (!m || !gem || slot < 0 || slot >= GEM_SLOTS) return fail('Gema ou encaixe inválido.');
  if ((slot === LEGENDARY_SLOT) !== gem.legendary) return fail(gem.legendary ? 'Gemas lendárias vão no encaixe lendário.' : 'Esse encaixe é só para gemas lendárias.');
  state.bag = state.bag.filter((g) => g.id !== gemId);
  const old = m.gems[slot];
  if (old) state.bag.push(old);
  m.gems[slot] = gem;
  recomputeMember(m);
  state.log.push(`${gemName(gem)} encaixada em ${WEAPONS[m.weapon].name} de ${m.name}.`);
  return { ok: true };
}

export function unequipGem(state: DungeonState, member: number, slot: number): ActionResult {
  if (!canForge(state)) return fail('Só dá para mexer nas gemas com a sala limpa.');
  const m = state.team[member];
  const old = m?.gems[slot];
  if (!m || !old) return fail('Nada nesse encaixe.');
  m.gems[slot] = null;
  state.bag.push(old);
  recomputeMember(m);
  return { ok: true };
}

/**
 * Munições que o Pokémon pode carregar: cada tipo dele sozinho e, com dois tipos, as duas misturas (70% do primeiro,
 * 30% do segundo). Pokémon de um tipo só tem uma opção.
 */
export function ammoOptions(m: Pick<Member, 'types'>): PokemonType[][] {
  const [a, b] = m.types;
  if (!a) return [];
  return b ? [[a], [b], [a, b], [b, a]] : [[a]];
}

/** Troca a munição do membro (sem custo de PA: é só escolher o que carregar). */
export function setAmmo(state: DungeonState, member: number, ammo: readonly PokemonType[]): ActionResult {
  const m = state.team[member];
  if (!m) return fail('Membro inválido.');
  const ok = ammoOptions(m).some((o) => o.length === ammo.length && o.every((t, i) => t === ammo[i]));
  if (!ok) return fail('Essa munição não combina com os tipos desse Pokémon.');
  m.ammo = [...ammo];
  return { ok: true };
}

/** Lapida três gemas comuns iguais (tipo e grau) em uma do grau seguinte. */
export function polishGems(state: DungeonState, kind: GemKind, tier: number): ActionResult {
  if (!canForge(state)) return fail('Só dá para lapidar com a sala limpa.');
  const group = state.bag.filter((g) => !g.legendary && g.kind === kind && g.tier === tier).slice(0, 3);
  if (group.length < 3) return fail('Precisa de três gemas iguais do mesmo grau.');
  const ids = new Set(group.map((g) => g.id));
  state.bag = state.bag.filter((g) => !ids.has(g.id));
  const gem: Gem = { id: state.nextGemId++, kind, tier: tier + 1, legendary: false };
  state.bag.push(gem);
  state.log.push(`Lapidação: ${gemName(gem)}.`);
  return { ok: true };
}
