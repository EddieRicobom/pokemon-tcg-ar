import { POKEMON_TYPES } from './pokemon-data';
import type { PokemonType } from './pokemon-data';

/** Aos nove minutos, o segundo tipo hipotético passa a reforçar o golpe principal. */
export const HYPOTHETICAL_TYPE_ACTIVATION_MS = 9 * 60_000;

export type HypotheticalTypeEffect = 'precisao' | 'queimar' | 'empurrar' | 'saltar' | 'atordoar' | 'lentidao' | 'atravessar' | 'roubar' | 'semente';

export interface HypotheticalTypeRule {
  effect: HypotheticalTypeEffect;
  /** Bônus multiplicativo aplicado ao dano do ataque principal. */
  damageBonus: number;
  description: string;
}

/**
 * Tabela única da mistura hipotética. Ela é deliberadamente explícita para futuras consultas e balanceamento:
 * o tipo principal continua definindo o golpe, e esta tabela só acrescenta um segundo efeito após os 9 min.
 */
export const HYPOTHETICAL_TYPE_EFFECTS: Record<PokemonType, HypotheticalTypeRule> = {
  normal: { effect: 'precisao', damageBonus: 0.12, description: '+12% de dano preciso.' },
  fire: { effect: 'queimar', damageBonus: 0.08, description: '+8% de dano e queimadura curta.' },
  water: { effect: 'empurrar', damageBonus: 0.07, description: '+7% de dano e empurrão.' },
  electric: { effect: 'saltar', damageBonus: 0.06, description: '+6% de dano e faísca que salta.' },
  grass: { effect: 'semente', damageBonus: 0.07, description: '+7% de dano e semente temporária.' },
  ice: { effect: 'lentidao', damageBonus: 0.08, description: '+8% de dano e lentidão curta.' },
  fighting: { effect: 'empurrar', damageBonus: 0.09, description: '+9% de dano e impacto de empurrão.' },
  poison: { effect: 'queimar', damageBonus: 0.07, description: '+7% de dano e veneno persistente.' },
  ground: { effect: 'atordoar', damageBonus: 0.08, description: '+8% de dano e abalo atordoante.' },
  flying: { effect: 'empurrar', damageBonus: 0.07, description: '+7% de dano e rajada de empurrão.' },
  psychic: { effect: 'empurrar', damageBonus: 0.08, description: '+8% de dano e onda mental.' },
  bug: { effect: 'lentidao', damageBonus: 0.07, description: '+7% de dano e teia lenta.' },
  rock: { effect: 'atordoar', damageBonus: 0.09, description: '+9% de dano e impacto atordoante.' },
  ghost: { effect: 'lentidao', damageBonus: 0.08, description: '+8% de dano e assombração lenta.' },
  dragon: { effect: 'atravessar', damageBonus: 0.10, description: '+10% de dano e uma perfuração extra.' },
  dark: { effect: 'roubar', damageBonus: 0.08, description: '+8% de dano e roubo de vida.' },
  steel: { effect: 'atravessar', damageBonus: 0.09, description: '+9% de dano e uma perfuração extra.' },
  fairy: { effect: 'roubar', damageBonus: 0.07, description: '+7% de dano e cura delicada.' },
};

/** Escolha estável por semente: não usa o RNG da luta e nunca repete o tipo principal. */
export function hypotheticalSecondaryTypeFor(primary: PokemonType, seed: number): PokemonType {
  const options = POKEMON_TYPES.filter((type) => type !== primary);
  const mixed = (Math.imul(seed >>> 0, 0x45d9f3b) ^ Math.imul(POKEMON_TYPES.indexOf(primary) + 1, 0x27d4eb2d)) >>> 0;
  return options[mixed % options.length]!;
}
