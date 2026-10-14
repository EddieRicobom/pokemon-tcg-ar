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
  return { id: input.id, name: input.name, types, ...stats, moves, quality, notes };
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

export function calculateDamage(attacker: Fighter, defender: Fighter, move: BattleMove, rng: Rng): DamageRoll {
  const effectiveness = typeEffectiveness(move.type, defender.types);
  const stab = attacker.types.includes(move.type);
  const hit = rng() * 100 < move.accuracy;
  const critical = rng() < CRIT_CHANCE;
  const roll = 0.85 + rng() * 0.15;
  if (!hit) return { hit: false, damage: 0, critical: false, effectiveness, stab };
  if (effectiveness === 0) return { hit: true, damage: 0, critical: false, effectiveness, stab };
  const a = move.special ? attacker.spAttack : attacker.attack;
  const d = move.special ? defender.spDefense : defender.defense;
  const base = (Math.floor((2 * LEVEL) / 5) + 2) * move.power * (a / d) / 50 + 2;
  const damage = Math.max(1, Math.floor(base * (stab ? 1.5 : 1) * effectiveness * (critical ? 1.5 : 1) * roll));
  return { hit: true, damage, critical, effectiveness, stab };
}

export interface BattleTurn extends DamageRoll {
  index: number;
  round: number;
  attacker: number;
  target: number;
  move: BattleMove;
  targetHpBefore: number;
  targetHpAfter: number;
  fainted: boolean;
}

export interface BattleResult {
  turns: BattleTurn[];
  /** Índice do vencedor em `fighters`. */
  winner: number;
  hpLeft: number[];
  reason: 'ko' | 'limite';
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** Simula a batalha inteira (todos contra todos) e devolve a sequência de golpes para a cena encenar. */
export function simulateBattle(fighters: readonly Fighter[], rng: Rng): BattleResult {
  if (fighters.length < 2) throw new Error('A batalha precisa de pelo menos 2 Pokémon.');
  const hp = fighters.map((f) => f.maxHp);
  const turns: BattleTurn[] = [];
  let round = 0;
  const alive = () => fighters.map((_, i) => i).filter((i) => hp[i]! > 0);

  while (alive().length > 1 && round < MAX_ROUNDS) {
    round++;
    // Quem tem mais Velocidade age primeiro; empate decidido por sorteio.
    const order = alive()
      .map((i) => ({ i, key: fighters[i]!.speed + rng() * 0.5 }))
      .sort((a, b) => b.key - a.key)
      .map((entry) => entry.i);
    for (const attackerIndex of order) {
      if (hp[attackerIndex]! <= 0) continue;
      const targets = alive().filter((i) => i !== attackerIndex);
      if (targets.length === 0) break;
      const target = pick(targets, rng);
      const attacker = fighters[attackerIndex]!;
      const defender = fighters[target]!;
      const move = pick(attacker.moves, rng);
      const roll = calculateDamage(attacker, defender, move, rng);
      const before = hp[target]!;
      const after = Math.max(0, before - roll.damage);
      hp[target] = after;
      turns.push({ ...roll, index: turns.length, round, attacker: attackerIndex, target, move, targetHpBefore: before, targetHpAfter: after, fainted: after === 0 });
    }
  }

  const survivors = alive();
  let winner = survivors[0] ?? 0;
  let reason: BattleResult['reason'] = 'ko';
  if (survivors.length !== 1) {
    // Estourou o limite de rodadas: vence quem tem mais PS restante (proporcional).
    reason = 'limite';
    winner = survivors.reduce((best, i) => (hp[i]! / fighters[i]!.maxHp > hp[best]! / fighters[best]!.maxHp ? i : best), survivors[0] ?? 0);
  }
  return { turns, winner, hpLeft: hp, reason };
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
