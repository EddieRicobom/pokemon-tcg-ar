import { TRAINING_DEFENSE_CAP, TRAINING_SPEED_CAP } from './survivor-lunch';
import type { LunchEffect } from './survivor-lunch';
import type { TowerState } from './village/tower-state';
import { typesOfDex } from './species-filter';
import { alternativeMoveFor, attackProfile, moveFor } from './survivor-moves';
import { statsOfDex } from './survivor-stats';
import type { PokemonType } from './pokemon-data';
import type { AttackProfile, SurvivorMove } from './survivor-moves';

/**
 * O que a Vila entrega para uma corrida do Survival (clássico e BONK usam o mesmo `createSurvivorState`).
 * Sem `loadout` a corrida é a de sempre; `PURE_LOADOUT` é esse caso escrito por extenso.
 */
export interface TowerLoadout {
  maxHpBonus: number;
  /** Defesa e Defesa Especial do Dojô, em campo próprio (não fura o limite de cartas `guard-*`). */
  defenseBonus: number;
  /** Fração somada à velocidade (0,06 = +6%). */
  speedBonus: number;
  /** Fração somada ao alcance de coleta de orbes. */
  pickupBonus: number;
  /** Cartas a mais só na primeira oferta de upgrade. */
  firstOfferExtraChoices: number;
  startingRerolls: number;
  bans: number;
  lunch: LunchEffect | null;
  /** false = corrida pura: nada da Vila entrou. */
  trained: boolean;
  /** Linhas para o resumo da corrida ("Fôlego +10 de vida"). */
  summary: string[];
}

export const PURE_LOADOUT: TowerLoadout = {
  maxHpBonus: 0, defenseBonus: 0, speedBonus: 0, pickupBonus: 0, firstOfferExtraChoices: 0, startingRerolls: 0, bans: 0, lunch: null, trained: false, summary: [],
};

/** Desejos de Jirachi que a Vila pode dar no começo (lição + sorte do Carteiro); o estoque da corrida continua com teto 3. */
export const LOADOUT_MAX_STARTING_REROLLS = 2;
export const LOADOUT_MAX_BANS = 3;
/** Ofertas nunca passam de 5 cartas, nem com o Olhar treinado. */
export const MAX_OFFER_CHOICES = 5;

const TRAINING_STEP = { folego: 5, postura: 5, passada: 0.02, faro: 0.05 } as const;

const enabled = (tower: TowerState, id: string): boolean => !tower.disabled.includes(id);

export interface TowerLoadoutOptions {
  /** Corrida pura: ignora tudo. */
  pure: boolean;
  /** O Carteiro já deu a sorte de hoje e ela ainda não foi usada. */
  luck: boolean;
  /** Efeito da marmita reservada (já resolvido pela receita). */
  lunch: LunchEffect | null;
}

export function towerLoadout(tower: TowerState, options: TowerLoadoutOptions): TowerLoadout {
  if (options.pure) return { ...PURE_LOADOUT, summary: [] };
  const level = (id: keyof typeof TRAINING_STEP): number => (enabled(tower, id) ? tower.training[id] ?? 0 : 0);
  const has = (id: string): boolean => (tower.lessons as string[]).includes(id) && enabled(tower, id);
  const hp = level('folego') * TRAINING_STEP.folego;
  const defense = Math.min(TRAINING_DEFENSE_CAP, level('postura') * TRAINING_STEP.postura);
  const speed = Math.min(TRAINING_SPEED_CAP, Math.round(level('passada') * TRAINING_STEP.passada * 1000) / 1000);
  const pickup = Math.round(level('faro') * TRAINING_STEP.faro * 1000) / 1000;
  const rerolls = Math.min(LOADOUT_MAX_STARTING_REROLLS, (has('desejo') ? 1 : 0) + (options.luck ? 1 : 0));
  const bans = Math.min(LOADOUT_MAX_BANS, (has('recusa') ? 1 : 0) + (has('recusa') && has('recusa-firme') ? 2 : 0));
  const firstOffer = has('olhar-treinado') ? 1 : 0;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const summary: string[] = [];
  if (hp > 0) summary.push(`Fôlego: +${hp} de vida`);
  if (defense > 0) summary.push(`Postura: +${defense} de Defesa e Defesa Especial`);
  if (speed > 0) summary.push(`Passada: +${pct(speed)} de velocidade`);
  if (pickup > 0) summary.push(`Faro: +${pct(pickup)} de alcance de coleta`);
  if (firstOffer) summary.push('Olhar treinado: 1 carta a mais na primeira escolha');
  if (has('desejo')) summary.push('Desejo de Jirachi: 1 desejo no início');
  if (options.luck) summary.push('Sorte do Carteiro: 1 desejo no início');
  if (bans > 0) summary.push(`Recusa: ${bans} ${bans === 1 ? 'banimento' : 'banimentos'}`);
  if (options.lunch) summary.push(`Marmita: ${options.lunch.name}`);
  const loadout: TowerLoadout = {
    maxHpBonus: hp, defenseBonus: defense, speedBonus: speed, pickupBonus: pickup, firstOfferExtraChoices: firstOffer,
    startingRerolls: rerolls, bans, lunch: options.lunch, trained: false, summary,
  };
  loadout.trained = summary.length > 0;
  return loadout;
}

/** Um golpe da Torre com os números pelos stats da espécie (o que a tela de escolha mostra). */
export interface SurvivorAttackChoice {
  move: SurvivorMove;
  profile: AttackProfile;
}

/** Os dois golpes que a tela de escolha oferece: o atual e o alternativo (a próxima forma pelos stats). */
export function survivorAttackChoices(dexId: number, picked?: PokemonType): { current: SurvivorAttackChoice; alternative: SurvivorAttackChoice } {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  const ordered = picked ? [picked, ...types.filter((t) => t !== picked)] : types;
  const alternative = alternativeMoveFor(ordered, stats);
  const current = moveFor(ordered, stats);
  return { current: { move: current, profile: attackProfile(current, stats) }, alternative: { move: alternative, profile: attackProfile(alternative, stats) } };
}

/**
 * Monta os golpes da Torre a partir dos tipos e atributos reais da espécie.
 * Com `swapped`, o golpe alternativo vira o principal e o antigo passa a ser o segundo ataque; a Mistura de tipo dos
 * 9 minutos vem do tipo antigo (quando os dois golpes têm tipos diferentes), e a Afinidade é calculada em cima do novo tipo principal.
 */
export function survivorAttackOf(dexId: number, picked?: PokemonType, swapped = false): { move: SurvivorMove; profile: AttackProfile; types: PokemonType[]; secondMove?: SurvivorMove; hypotheticalSecondaryType?: PokemonType } {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  const ordered = picked ? [picked, ...types.filter((t) => t !== picked)] : types;
  const move = moveFor(ordered, stats);
  if (swapped) {
    const alternative = alternativeMoveFor(ordered, stats);
    return {
      move: alternative,
      profile: attackProfile(alternative, stats),
      types,
      secondMove: move,
      ...(move.type !== alternative.type ? { hypotheticalSecondaryType: move.type } : {}),
    };
  }
  const secondType = types.find((type) => type !== picked && type !== move.type);
  return { move, profile: attackProfile(move, stats), types, ...(secondType ? { secondMove: moveFor([secondType], stats) } : {}) };
}
