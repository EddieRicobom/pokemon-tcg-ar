/**
 * Motor de batalha automática da Caixa (puro e determinístico: o sorteio vem de fora, então é testável).
 *
 * Regras (inspiradas nos jogos, simplificadas):
 *  - Nível 50. PS = floor((2·base+31)·50/100)+60; demais atributos = floor((2·base+31)·50/100)+5.
 *  - Dano = ((2·50/5+2)·poder·A/D/50+2) · STAB(1,5) · efetividade de tipo · crítico(1,5, chance 1/16) · sorteio 0,85–1.
 *    Golpe físico usa Ataque/Defesa; especial usa Atq. Esp./Def. Esp.
 *  - Todos contra todos: a cada rodada, quem tem mais Velocidade ataca primeiro; cada um sorteia um alvo vivo e um golpe.
 *  - Golpes: ataques impressos na carta (poder derivado do dano da carta) e golpes do jogo (PokéAPI) com poder.
 *  - Faltando dados, a batalha usa valores neutros e a interface avisa (`quality`/`notes`); nada é inventado em silêncio.
 */
import { energyType } from './pokemon-data';
import type { BaseStats, CardBattleInfo, GameMove, PokemonProfile, PokemonType } from './pokemon-data';

export type Rng = () => number;

export const LEVEL = 50;
/** Valor-base usado quando a PokéAPI não respondeu (a interface avisa). */
export const NEUTRAL_BASE = 70;
export const MAX_ROUNDS = 60;

/** Gerador pseudoaleatório pequeno e repetível (mulberry32), para testes e revanches reproduzíveis. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------------- tabela de tipos

type Row = Partial<Record<PokemonType, number>>;
/** Multiplicador de dano: golpe do tipo da linha contra defensor do tipo da coluna (o que não aparece vale 1). */
export const TYPE_CHART: Record<PokemonType, Row> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

/** Efetividade total do golpe contra os tipos do defensor (multiplica os fatores; 0, 0,25, 0,5, 1, 2 ou 4). */
export function typeEffectiveness(attack: PokemonType, defender: readonly PokemonType[]): number {
  let result = 1;
  for (const type of defender) result *= TYPE_CHART[attack][type] ?? 1;
  return result;
}

export type EffectivenessTone = 'immune' | 'weak' | 'neutral' | 'strong';
export function effectivenessTone(multiplier: number): EffectivenessTone {
  if (multiplier === 0) return 'immune';
  if (multiplier < 1) return 'weak';
  if (multiplier > 1) return 'strong';
  return 'neutral';
}

// ----------------------------------------------------------------------------- lutadores

export type MoveSource = 'carta' | 'jogo' | 'padrao';
export interface BattleMove {
  name: string;
  type: PokemonType;
  power: number;
  /** 0–100. */
  accuracy: number;
  special: boolean;
  source: MoveSource;
}

export type DataQuality = 'completo' | 'parcial' | 'sem-dados';

/** Jeito de lutar, derivado dos atributos (ver `personalityOf`). */
export type Personality = 'agressivo' | 'defensivo' | 'veloz' | 'equilibrado';
export const PERSONALITY_LABELS_PT: Record<Personality, string> = {
  agressivo: 'Agressivo', defensivo: 'Defensivo', veloz: 'Veloz', equilibrado: 'Equilibrado',
};

/** Condições que um golpe pode causar (o tipo do golpe decide qual). */
export type StatusKind = 'burn' | 'poison' | 'paralysis' | 'freeze';
export const STATUS_LABELS_PT: Record<StatusKind, string> = {
  burn: 'Queimado', poison: 'Envenenado', paralysis: 'Paralisado', freeze: 'Congelado',
};

export interface Fighter {
  id: string;
  name: string;
  types: PokemonType[];
  maxHp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
  moves: BattleMove[];
  personality: Personality;
  quality: DataQuality;
  /** O que faltou e foi substituído por valores neutros (para a interface avisar). */
  notes: string[];
}

export interface FighterInput {
  id: string;
  name: string;
  profile: PokemonProfile | null;
  card: CardBattleInfo | null;
  gameMoves: GameMove[];
}

export const FALLBACK_MOVE: BattleMove = { name: 'Investida', type: 'normal', power: 40, accuracy: 100, special: false, source: 'padrao' };

/** Número no começo do dano impresso na carta ("30", "60+", "20×"); sem número → null. */
export function parseCardDamage(text: string | undefined): number | null {
  if (!text) return null;
  const match = /^\s*(\d+)/.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return value > 0 ? value : null;
}

/** Dano impresso na carta (10–300) → poder de golpe do jogo (34–150). */
export function cardDamageToPower(damage: number): number {
  return Math.min(150, Math.max(30, Math.round(25 + damage * 0.9)));
}

function stat(base: number, isHp: boolean): number {
  return Math.floor(((2 * base + 31) * LEVEL) / 100) + (isHp ? LEVEL + 10 : 5);
}

export function battleStats(base: BaseStats): Pick<Fighter, 'maxHp' | 'attack' | 'defense' | 'spAttack' | 'spDefense' | 'speed'> {
  return {
    maxHp: stat(base.hp, true),
    attack: stat(base.attack, false),
    defense: stat(base.defense, false),
    spAttack: stat(base.spAttack, false),
    spDefense: stat(base.spDefense, false),
    speed: stat(base.speed, false),
  };
}

const NEUTRAL_STATS: BaseStats = {
  hp: NEUTRAL_BASE, attack: NEUTRAL_BASE, defense: NEUTRAL_BASE, spAttack: NEUTRAL_BASE, spDefense: NEUTRAL_BASE, speed: NEUTRAL_BASE,
};

/** Monta o lutador com o que foi carregado; o que faltar vira valor neutro e entra em `notes`. */
export function buildFighter(input: FighterInput): Fighter {
  const notes: string[] = [];
  const cardType = input.card?.types.map((t) => energyType(t)).find((t): t is PokemonType => t !== null);
  const types: PokemonType[] = input.profile && input.profile.types.length > 0 ? input.profile.types : cardType ? [cardType] : ['normal'];
  if (!input.profile) notes.push('sem atributos do jogo (usei valores médios)');
  if (!input.profile && !cardType) notes.push('sem tipo (usei Normal)');
  if (!input.card) notes.push('sem os ataques da carta (só golpes do jogo)');

  const base = input.profile?.stats ?? NEUTRAL_STATS;
  const stats = battleStats(base);
  const physical = base.attack >= base.spAttack;

  const moves: BattleMove[] = [];
  for (const attack of input.card?.attacks ?? []) {
    const damage = parseCardDamage(attack.damage);
    if (damage === null) continue;
    const energy = attack.cost.map((c) => energyType(c)).find((t): t is PokemonType => t !== null && t !== 'normal');
    moves.push({
      name: attack.name,
      type: energy ?? cardType ?? types[0] ?? 'normal',
      power: cardDamageToPower(damage),
      accuracy: 100,
      special: !physical,
      source: 'carta',
    });
  }
  for (const move of input.gameMoves) {
    if (move.power === null || move.power <= 0) continue;
    moves.push({
      name: move.name,
      type: move.type ?? 'normal',
      power: move.power,
      accuracy: move.accuracy ?? 100,
      special: move.damageClass ? move.damageClass === 'special' : !physical,
      source: 'jogo',
    });
  }
  if (moves.length === 0) {
    moves.push({ ...FALLBACK_MOVE });
    notes.push('sem golpes (usei Investida)');
  }
  const quality: DataQuality = notes.length === 0 ? 'completo' : input.profile || moves.some((m) => m.source !== 'padrao') ? 'parcial' : 'sem-dados';
  return { id: input.id, name: input.name, types, ...stats, moves, personality: personalityOf(stats), quality, notes };
}

/**
 * Personalidade pelos atributos: muito mais ataque que resistência → agressivo; o contrário → defensivo;
 * Velocidade muito acima do resto → veloz; senão equilibrado. Define como escolhe alvo e golpe e se se defende.
 */
export function personalityOf(stats: Pick<Fighter, 'maxHp' | 'attack' | 'defense' | 'spAttack' | 'spDefense' | 'speed'>): Personality {
  const offense = Math.max(stats.attack, stats.spAttack);
  const bulk = (stats.maxHp / 1.5 + stats.defense + stats.spDefense) / 3; // PS nível 50 ≈ 1,5× os demais atributos
  if (stats.speed >= offense * 1.15 && stats.speed >= bulk * 1.15) return 'veloz';
  if (offense >= bulk * 1.15) return 'agressivo';
  if (bulk >= offense * 1.15) return 'defensivo';
  return 'equilibrado';
}

// ----------------------------------------------------------------------------- dano e batalha

export interface DamageRoll {
  hit: boolean;
  damage: number;
  critical: boolean;
  effectiveness: number;
  stab: boolean;
}

const CRIT_CHANCE = 1 / 16;
/** Defender-se corta pela metade o próximo golpe recebido. */
const GUARD_FACTOR = 0.5;
/** Queimado: golpes físicos saem com metade da força. */
const BURN_ATTACK_FACTOR = 0.5;

export interface DamageContext {
  /** Quem ataca está queimado. */
  burned?: boolean;
  /** Quem defende está em guarda. */
  guarded?: boolean;
}

function rawDamage(attacker: Fighter, defender: Fighter, move: BattleMove, ctx: DamageContext, critical: boolean, roll: number): number {
  const a = move.special ? attacker.spAttack : attacker.attack;
  const d = move.special ? defender.spDefense : defender.defense;
  const effectiveness = typeEffectiveness(move.type, defender.types);
  const stab = attacker.types.includes(move.type);
  const base = (Math.floor((2 * LEVEL) / 5) + 2) * move.power * (a / d) / 50 + 2;
  const burn = ctx.burned && !move.special ? BURN_ATTACK_FACTOR : 1;
  const guard = ctx.guarded ? GUARD_FACTOR : 1;
  return Math.max(1, Math.floor(base * (stab ? 1.5 : 1) * effectiveness * (critical ? 1.5 : 1) * roll * burn * guard));
}

export function calculateDamage(attacker: Fighter, defender: Fighter, move: BattleMove, rng: Rng, ctx: DamageContext = {}): DamageRoll {
  const effectiveness = typeEffectiveness(move.type, defender.types);
  const stab = attacker.types.includes(move.type);
  const hit = rng() * 100 < move.accuracy;
  const critical = rng() < CRIT_CHANCE;
  const roll = 0.85 + rng() * 0.15;
  if (!hit) return { hit: false, damage: 0, critical: false, effectiveness, stab };
  if (effectiveness === 0) return { hit: true, damage: 0, critical: false, effectiveness, stab };
  return { hit: true, damage: rawDamage(attacker, defender, move, ctx, critical, roll), critical, effectiveness, stab };
}

/** Dano esperado de um golpe (sem sorteio de crítico/variação, ponderado pela precisão): serve para escolher alvo e golpe. */
export function expectedDamage(attacker: Fighter, defender: Fighter, move: BattleMove, ctx: DamageContext = {}): number {
  if (typeEffectiveness(move.type, defender.types) === 0) return 0;
  return rawDamage(attacker, defender, move, ctx, false, 0.925) * (Math.min(100, move.accuracy) / 100);
}

// --- condições (queimadura, veneno, paralisia, congelamento)

/** Chance de o golpe de cada tipo causar condição no alvo (se acertar e causar dano). */
export const STATUS_CHANCE: Partial<Record<PokemonType, { status: StatusKind; chance: number }>> = {
  fire: { status: 'burn', chance: 0.15 },
  poison: { status: 'poison', chance: 0.25 },
  electric: { status: 'paralysis', chance: 0.2 },
  ice: { status: 'freeze', chance: 0.12 },
};

const STATUS_IMMUNE_TYPES: Record<StatusKind, PokemonType> = { burn: 'fire', poison: 'poison', paralysis: 'electric', freeze: 'ice' };

export function canGetStatus(status: StatusKind, types: readonly PokemonType[]): boolean {
  if (types.includes(STATUS_IMMUNE_TYPES[status])) return false;
  return !(status === 'poison' && types.includes('steel'));
}

/** Chance de um paralisado não conseguir agir; de um congelado descongelar a cada vez que tenta agir. */
export const PARALYSIS_SKIP_CHANCE = 0.25;
export const THAW_CHANCE = 0.3;
/** Queimado perde 1/16 e envenenado 1/8 dos PS no fim de cada rodada (nunca derruba: sobra pelo menos 1 PS). */
export const RESIDUAL_FRACTION: Record<'burn' | 'poison', number> = { burn: 1 / 16, poison: 1 / 8 };

// --- sequência de eventos

export type TurnKind = 'attack' | 'guard' | 'skip' | 'residual' | 'enter';

export interface BattleTurn extends DamageRoll {
  kind: TurnKind;
  index: number;
  round: number;
  attacker: number;
  /** Em 'guard', 'skip', 'residual' e 'enter' (entrou no lugar do derrubado, no 3x3) é o próprio Pokémon. */
  target: number;
  move: BattleMove;
  targetHpBefore: number;
  targetHpAfter: number;
  fainted: boolean;
  /** Condição causada no alvo por este golpe. */
  inflicted?: StatusKind;
  /** Por que o Pokémon não agiu ('skip') ou perdeu PS no fim da rodada ('residual'). */
  cause?: StatusKind;
  /** O alvo estava em guarda e levou metade do dano. */
  guardedHit?: boolean;
  /** O alvo foi escolhido por vingança (era quem o atacou por último). */
  revenge?: boolean;
  /** Descongelou antes de agir (o golpe segue normal). */
  thawed?: boolean;
}

/** Modos de batalha: todos contra todos (padrão), duas equipes ao mesmo tempo, ou 3x3 em revezamento. */
export type BattleMode = 'royale' | 'equipes' | 'tres';
export const BATTLE_MODES: readonly BattleMode[] = ['royale', 'equipes', 'tres'];
export const BATTLE_MODE_LABELS_PT: Record<BattleMode, string> = {
  royale: 'Todos contra todos',
  equipes: 'Equipes',
  tres: '3 contra 3',
};
export const BATTLE_MODE_HINTS_PT: Record<BattleMode, string> = {
  royale: 'Todos os Pokémon da caixa lutam ao mesmo tempo e só um fica de pé.',
  equipes: 'A caixa se divide em duas equipes que lutam juntas: aliados não se atacam e vence a equipe que sobrar.',
  tres: 'Duas equipes de 3 em revezamento: um duelo por vez, e quando um cai o próximo da equipe entra. Precisa de 6 Pokémon.',
};
export const TEAM_NAMES_PT = ['Equipe Vermelha', 'Equipe Azul'] as const;
export const TEAM_COLORS = ['#ff5d5d', '#4da3ff'] as const;

export interface BattleOptions {
  /** `teams[i]` = equipe (0 ou 1) do lutador i. Sem isso, cada um é uma equipe (todos contra todos). */
  teams?: readonly number[];
  /** Revezamento: só o primeiro de pé de cada equipe luta; quando cai, o próximo entra. */
  relay?: boolean;
}

export interface BattleResult {
  turns: BattleTurn[];
  /** Índice do vencedor em `fighters` (com equipes, o melhor sobrevivente da equipe vencedora). */
  winner: number;
  hpLeft: number[];
  reason: 'ko' | 'limite';
  /** Equipe de cada lutador e a vencedora, quando a batalha teve equipes. */
  teams?: number[];
  winningTeam?: number;
  relay?: boolean;
}

/** Sorteio ponderado (pesos ≤ 0 contam como um mínimo para ninguém ficar com chance zero). */
function pickWeighted<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  const w = weights.map((x) => Math.max(1e-6, x));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (const [i, item] of items.entries()) {
    r -= w[i]!;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

/** O quanto o golpe pesa no sorteio: personalidades agressivas preferem muito os golpes mais fortes. */
const MOVE_SHARPNESS: Record<Personality, number> = { agressivo: 3, equilibrado: 1.6, defensivo: 1.2, veloz: 1.6 };
const REVENGE_CHANCE: Record<Personality, number> = { agressivo: 0.3, equilibrado: 0.3, defensivo: 0.65, veloz: 0.15 };
const GUARD_CHANCE: Record<Personality, number> = { agressivo: 0.05, equilibrado: 0.15, defensivo: 0.45, veloz: 0.1 };
/** Só se defende abaixo desta fração de PS. */
const GUARD_BELOW_HP = 0.45;

interface Live {
  hp: number;
  status: StatusKind | null;
  guard: boolean;
  guardedLast: boolean;
  lastHitBy: number | null;
}

/** Escolhe o alvo: personalidades agressivas miram quem dá para derrubar; defensivas retribuem a quem as acertou. */
export function chooseTarget(
  attackerIndex: number,
  fighters: readonly Fighter[],
  live: readonly Live[],
  rng: Rng,
  /** Quem pode ser alvo além de estar de pé (outra equipe, em campo). Padrão: qualquer outro. */
  eligible: (i: number) => boolean = () => true,
): { target: number; revenge: boolean } {
  const attacker = fighters[attackerIndex]!;
  const me = live[attackerIndex]!;
  const candidates = fighters.map((_, i) => i).filter((i) => i !== attackerIndex && live[i]!.hp > 0 && eligible(i));
  if (me.lastHitBy !== null && candidates.includes(me.lastHitBy) && rng() < REVENGE_CHANCE[attacker.personality]) {
    return { target: me.lastHitBy, revenge: true };
  }
  const bestHit = (i: number) => Math.max(...attacker.moves.map((m) => expectedDamage(attacker, fighters[i]!, m, { burned: me.status === 'burn', guarded: live[i]!.guard })));
  const kill = (i: number) => Math.min(2, bestHit(i) / Math.max(1, live[i]!.hp));
  const weights = candidates.map((i) => {
    if (attacker.personality === 'agressivo') return (kill(i) + 0.15) ** 2;
    if (attacker.personality === 'equilibrado') return kill(i) + 0.5;
    return 1; // defensivo e veloz: sem preferência
  });
  return { target: pickWeighted(candidates, weights, rng), revenge: false };
}

/** Escolhe o golpe contra o alvo, ponderando pelo dano esperado (a "agudeza" depende da personalidade). */
export function chooseMove(attacker: Fighter, defender: Fighter, rng: Rng, ctx: DamageContext = {}): BattleMove {
  const k = MOVE_SHARPNESS[attacker.personality];
  const weights = attacker.moves.map((m) => (expectedDamage(attacker, defender, m, ctx) + 1) ** k);
  return pickWeighted(attacker.moves, weights, rng);
}

/** Limite de rodadas: o revezamento tem até 5 duelos em sequência. */
const RELAY_MAX_ROUNDS = MAX_ROUNDS * 2;

const GUARD_MOVE: BattleMove = { name: 'Defender', type: 'normal', power: 0, accuracy: 100, special: false, source: 'padrao' };

/**
 * Simula a batalha inteira (todos contra todos) e devolve a sequência de eventos para a cena encenar.
 * Cada Pokémon age conforme a personalidade: escolhe alvo e golpe de modo diferente, pode se defender com poucos
 * PS, e condições (queimadura, veneno, paralisia, congelamento) mudam o que ele consegue fazer.
 */
export function simulateBattle(fighters: readonly Fighter[], rng: Rng, options: BattleOptions = {}): BattleResult {
  if (fighters.length < 2) throw new Error('A batalha precisa de pelo menos 2 Pokémon.');
  const { teams, relay = false } = options;
  if (teams && teams.length !== fighters.length) throw new Error('É preciso informar a equipe de cada lutador.');
  if (teams && new Set(teams).size < 2) throw new Error('A batalha por equipes precisa de pelo menos 2 equipes.');
  const teamOf = (i: number): number => teams?.[i] ?? i;
  const live: Live[] = fighters.map((f) => ({ hp: f.maxHp, status: null, guard: false, guardedLast: false, lastHitBy: null }));
  const turns: BattleTurn[] = [];
  let round = 0;
  const alive = () => fighters.map((_, i) => i).filter((i) => live[i]!.hp > 0);
  /** Quem está em campo: todos os de pé, ou (revezamento) o primeiro de pé de cada equipe. */
  const inField = (): number[] => {
    const up = alive();
    if (!relay) return up;
    const seen = new Set<number>();
    return up.filter((i) => {
      const t = teamOf(i);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  };
  const teamsStanding = (): number => new Set(alive().map(teamOf)).size;
  const blank = (kind: TurnKind, attacker: number, target: number, move: BattleMove): BattleTurn => ({
    kind, index: turns.length, round, attacker, target, move, hit: false, damage: 0, critical: false, effectiveness: 1, stab: false,
    targetHpBefore: live[target]!.hp, targetHpAfter: live[target]!.hp, fainted: false,
  });

  const maxRounds = relay ? RELAY_MAX_ROUNDS : MAX_ROUNDS;
  while (teamsStanding() > 1 && round < maxRounds) {
    round++;
    // Quem tem mais Velocidade age primeiro (paralisia corta pela metade); empate decidido por sorteio.
    const order = inField()
      .map((i) => ({ i, key: fighters[i]!.speed * (live[i]!.status === 'paralysis' ? 0.5 : 1) + rng() * 0.5 }))
      .sort((a, b) => b.key - a.key)
      .map((entry) => entry.i);
    for (const attackerIndex of order) {
      const me = live[attackerIndex]!;
      if (me.hp <= 0) continue;
      if (teamsStanding() <= 1) break;
      const attacker = fighters[attackerIndex]!;
      me.guard = false; // a guarda dura só até a vez dele de agir de novo

      // Condições que impedem de agir.
      let thawed = false;
      if (me.status === 'freeze') {
        if (rng() < THAW_CHANCE) {
          me.status = null;
          thawed = true;
        } else {
          turns.push({ ...blank('skip', attackerIndex, attackerIndex, GUARD_MOVE), cause: 'freeze' });
          me.guardedLast = false;
          continue;
        }
      } else if (me.status === 'paralysis' && rng() < PARALYSIS_SKIP_CHANCE) {
        turns.push({ ...blank('skip', attackerIndex, attackerIndex, GUARD_MOVE), cause: 'paralysis' });
        me.guardedLast = false;
        continue;
      }

      // Com poucos PS, quem é cauteloso se defende (nunca duas vezes seguidas).
      if (!me.guardedLast && me.hp / attacker.maxHp < GUARD_BELOW_HP && rng() < GUARD_CHANCE[attacker.personality]) {
        me.guard = true;
        me.guardedLast = true;
        turns.push({ ...blank('guard', attackerIndex, attackerIndex, GUARD_MOVE), hit: true });
        continue;
      }
      me.guardedLast = false;

      const field = relay ? inField() : null;
      const { target, revenge } = chooseTarget(attackerIndex, fighters, live, rng, (i) => teamOf(i) !== teamOf(attackerIndex) && (field === null || field.includes(i)));
      const foe = live[target]!;
      const defender = fighters[target]!;
      const ctx: DamageContext = { burned: me.status === 'burn', guarded: foe.guard };
      const move = chooseMove(attacker, defender, rng, ctx);
      const roll = calculateDamage(attacker, defender, move, rng, ctx);
      const before = foe.hp;
      const after = Math.max(0, before - roll.damage);
      foe.hp = after;
      const turn: BattleTurn = { ...blank('attack', attackerIndex, target, move), ...roll, targetHpBefore: before, targetHpAfter: after, fainted: after === 0 };
      if (revenge) turn.revenge = true;
      if (thawed) turn.thawed = true;
      if (foe.guard && roll.hit && roll.damage > 0) {
        turn.guardedHit = true;
        foe.guard = false; // a guarda vale por um golpe
      }
      if (roll.hit) foe.lastHitBy = attackerIndex;
      const effect = STATUS_CHANCE[move.type];
      if (effect && roll.hit && roll.damage > 0 && after > 0 && foe.status === null && canGetStatus(effect.status, defender.types) && rng() < effect.chance) {
        foe.status = effect.status;
        turn.inflicted = effect.status;
      }
      turns.push(turn);
      // Revezamento: quando o alvo cai, o próximo da equipe dele entra em campo.
      if (relay && turn.fainted) {
        const next = alive().find((i) => teamOf(i) === teamOf(target));
        if (next !== undefined) turns.push({ ...blank('enter', next, next, GUARD_MOVE), hit: true });
      }
    }

    // Fim da rodada: queimadura e veneno tiram PS (sempre sobra 1, para não encerrar a luta fora de um golpe).
    for (const i of inField()) {
      const status = live[i]!.status;
      if (status !== 'burn' && status !== 'poison') continue;
      const f = fighters[i]!;
      const loss = Math.max(1, Math.floor(f.maxHp * RESIDUAL_FRACTION[status]));
      const before = live[i]!.hp;
      const after = Math.max(1, before - loss);
      if (after === before) continue;
      live[i]!.hp = after;
      turns.push({ ...blank('residual', i, i, GUARD_MOVE), hit: true, damage: before - after, targetHpBefore: before, targetHpAfter: after, cause: status });
    }
  }

  const survivors = alive();
  const frac = (i: number) => live[i]!.hp / fighters[i]!.maxHp;
  const bestOf = (list: number[]) => list.reduce((best, i) => (frac(i) > frac(best) ? i : best), list[0] ?? 0);
  let reason: BattleResult['reason'] = 'ko';
  let winningTeam: number;
  if (teamsStanding() === 1) {
    winningTeam = teamOf(survivors[0] ?? 0);
  } else {
    // Estourou o limite de rodadas: vence a equipe com mais PS restante (soma das frações de PS).
    reason = 'limite';
    const score = new Map<number, number>();
    for (const i of survivors) score.set(teamOf(i), (score.get(teamOf(i)) ?? 0) + frac(i));
    winningTeam = [...score.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [teamOf(survivors[0] ?? 0), -1] as [number, number])[0];
  }
  const winner = bestOf(survivors.filter((i) => teamOf(i) === winningTeam));
  const result: BattleResult = { turns, winner, hpLeft: live.map((l) => l.hp), reason };
  if (teams) {
    result.teams = [...teams];
    result.winningTeam = winningTeam;
  }
  if (relay) result.relay = true;
  return result;
}

// ----------------------------------------------------------------------------- modos

export interface BattlePlan {
  mode: BattleMode;
  /** Índices (da lista original) de quem luta, na ordem em que entram. */
  picks: number[];
  /** Equipe de cada escolhido; ausente em "todos contra todos". */
  teams?: number[];
  relay: boolean;
}

/** Quantos Pokémon cada modo exige, no mínimo. */
export const BATTLE_MODE_MIN: Record<BattleMode, number> = { royale: 2, equipes: 2, tres: 6 };

/** Por que o modo não pode ser usado com essa quantidade (ou null se pode). */
export function battleModeBlocker(mode: BattleMode, count: number): string | null {
  if (count >= BATTLE_MODE_MIN[mode]) return null;
  return `${BATTLE_MODE_LABELS_PT[mode]} precisa de ${BATTLE_MODE_MIN[mode]} Pokémon na caixa (hoje há ${count}).`;
}

/** Escalação de cada Pokémon da caixa: sorteio (padrão), equipe 0 (Vermelha), equipe 1 (Azul) ou fora da luta. */
export type RosterSlot = 'auto' | 0 | 1 | 'out';
export const ROSTER_SLOTS: readonly RosterSlot[] = ['auto', 0, 1, 'out'];

export function isRosterSlot(value: unknown): value is RosterSlot {
  return value === 'auto' || value === 0 || value === 1 || value === 'out';
}

/** Lado do 3x3: 3 de cada equipe. */
export const RELAY_SIDE = 3;

function manualRoster(roster: readonly RosterSlot[] | undefined, count: number): RosterSlot[] | null {
  if (!roster || roster.length !== count || roster.every((slot) => slot === 'auto')) return null;
  return [...roster];
}

/**
 * Por que a luta não pode acontecer com essa escalação (ou null). Sem escalação (ou tudo em sorteio) vale a regra
 * de antes: só a quantidade de Pokémon na caixa.
 */
export function rosterBlocker(mode: BattleMode, count: number, roster?: readonly RosterSlot[]): string | null {
  const manual = manualRoster(roster, count);
  if (!manual) return battleModeBlocker(mode, count);
  const eligible = manual.filter((slot) => slot !== 'out').length;
  const red = manual.filter((slot) => slot === 0).length;
  const blue = manual.filter((slot) => slot === 1).length;
  if (mode === 'royale') return eligible >= 2 ? null : `${BATTLE_MODE_LABELS_PT[mode]} precisa de 2 Pokémon escalados (hoje há ${eligible}).`;
  if (mode === 'equipes') {
    if (eligible < 2) return `${BATTLE_MODE_LABELS_PT[mode]} precisa de 2 Pokémon escalados (hoje há ${eligible}).`;
    // As duas equipes precisam existir: quem está em sorteio completa o lado que estiver vazio.
    const autos = eligible - red - blue;
    return (red > 0 || autos >= 1) && (blue > 0 || autos >= 1) ? null : 'Cada equipe precisa de pelo menos 1 Pokémon.';
  }
  if (red > RELAY_SIDE) return `A ${TEAM_NAMES_PT[0]} tem ${red} escalados e o 3x3 usa ${RELAY_SIDE} por lado. Tire alguns.`;
  if (blue > RELAY_SIDE) return `A ${TEAM_NAMES_PT[1]} tem ${blue} escalados e o 3x3 usa ${RELAY_SIDE} por lado. Tire alguns.`;
  const autos = eligible - red - blue;
  if (red + blue + autos < RELAY_SIDE * 2) return `3x3 precisa de ${RELAY_SIDE * 2} Pokémon escalados (hoje há ${eligible}).`;
  return null;
}

function shuffled<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Entra um de cada equipe por vez (vermelho, azul, vermelho, ...), para as duas entrarem juntas na arena. */
function interleave(red: readonly number[], blue: readonly number[]): { picks: number[]; teams: number[] } {
  const picks: number[] = [];
  const teams: number[] = [];
  for (let i = 0; i < Math.max(red.length, blue.length); i++) {
    if (i < red.length) { picks.push(red[i]!); teams.push(0); }
    if (i < blue.length) { picks.push(blue[i]!); teams.push(1); }
  }
  return { picks, teams };
}

/**
 * Monta quem luta e em que equipe. Royale: todos. Equipes: todos, embaralhados e repartidos de forma equilibrada
 * (a diferença entre as equipes é de no máximo 1). 3x3: 6 sorteados, 3 de cada lado. Só consome o sorteio nos
 * modos com equipes, então o Royale continua idêntico ao de antes.
 *
 * Com `roster`, o jogador decide: quem está "fora" não luta, quem tem equipe fixa fica nela e quem está em "sorteio"
 * completa o que faltar (no Equipes, equilibrando os lados; no 3x3, até 3 por lado).
 */
export function planBattle(mode: BattleMode, count: number, rng: Rng, roster?: readonly RosterSlot[]): BattlePlan {
  const blocker = rosterBlocker(mode, count, roster);
  if (blocker) throw new Error(blocker);
  const manual = manualRoster(roster, count);
  if (manual) {
    const indices = manual.map((_, i) => i);
    const pool = indices.filter((i) => manual[i] !== 'out');
    if (mode === 'royale') return { mode, picks: pool, relay: false };
    const red = pool.filter((i) => manual[i] === 0);
    const blue = pool.filter((i) => manual[i] === 1);
    const autos = shuffled(pool.filter((i) => manual[i] === 'auto'), rng);
    const cap = mode === 'tres' ? RELAY_SIDE : Infinity;
    for (const i of autos) {
      // Vai para a equipe com menos gente (empate: vermelha) enquanto couber.
      const side = red.length <= blue.length ? red : blue;
      const other = side === red ? blue : red;
      if (side.length < cap) side.push(i);
      else if (other.length < cap) other.push(i);
    }
    return { mode, ...interleave(red, blue), relay: mode === 'tres' };
  }
  const all = Array.from({ length: count }, (_, i) => i);
  if (mode === 'royale') return { mode, picks: all, relay: false };
  const order = shuffled(all, rng);
  const picks = mode === 'tres' ? order.slice(0, 6) : order;
  // Alternar as equipes na ordem embaralhada deixa as duas com o mesmo tamanho (ou 1 de diferença).
  const teams = picks.map((_, i) => i % 2);
  return { mode, picks, teams, relay: mode === 'tres' };
}

// ----------------------------------------------------------------------------- resumo

export interface FighterSummary {
  id: string;
  name: string;
  damageDealt: number;
  knockouts: number;
  criticals: number;
  /** Golpes que acertaram, errados, defesas e vezes que não conseguiu agir. */
  hits: number;
  misses: number;
  guards: number;
  skipped: number;
  inflicted: number;
  biggestHit: number;
}

export interface BattleSummary {
  fighters: FighterSummary[];
  /** Quem causou mais dano (índice). */
  mvp: number;
  rounds: number;
}

export function summarizeBattle(fighters: readonly Fighter[], result: BattleResult): BattleSummary {
  const stats: FighterSummary[] = fighters.map((f) => ({
    id: f.id, name: f.name, damageDealt: 0, knockouts: 0, criticals: 0, hits: 0, misses: 0, guards: 0, skipped: 0, inflicted: 0, biggestHit: 0,
  }));
  for (const turn of result.turns) {
    const s = stats[turn.attacker]!;
    if (turn.kind === 'guard') s.guards++;
    else if (turn.kind === 'skip') s.skipped++;
    else if (turn.kind === 'attack') {
      if (turn.hit) s.hits++;
      else s.misses++;
      s.damageDealt += turn.damage;
      s.biggestHit = Math.max(s.biggestHit, turn.damage);
      if (turn.critical) s.criticals++;
      if (turn.fainted) s.knockouts++;
      if (turn.inflicted) s.inflicted++;
    }
  }
  const mvp = stats.reduce((best, s, i) => (s.damageDealt > stats[best]!.damageDealt ? i : best), 0);
  return { fighters: stats, mvp, rounds: result.turns.at(-1)?.round ?? 0 };
}

/** Textos curtos em português para a interface. */
export function effectivenessLabel(multiplier: number): string | null {
  if (multiplier === 0) return 'Não afeta…';
  if (multiplier >= 4) return 'Super efetivo ×4!';
  if (multiplier > 1) return 'Super efetivo!';
  if (multiplier <= 0.25) return 'Quase não faz efeito…';
  if (multiplier < 1) return 'Pouco efetivo…';
  return null;
}
