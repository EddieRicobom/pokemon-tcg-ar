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

/**
 * Quando o sorteio repete o tipo principal, não há uma mistura redundante: a identidade do tipo é exaltada.
 * A tabela preserva o efeito característico, mas aplica um bônus maior ao ataque já elementado.
 */
export const REPEATED_TYPE_EXALTATIONS: Record<PokemonType, HypotheticalTypeRule> = {
  normal: { effect: 'precisao', damageBonus: 0.22, description: 'Exaltação Normal: precisão absoluta (+22% de dano).' },
  fire: { effect: 'queimar', damageBonus: 0.16, description: 'Exaltação Fogo: chamas intensas (+16% de dano).' },
  water: { effect: 'empurrar', damageBonus: 0.14, description: 'Exaltação Água: maré esmagadora (+14% de dano).' },
  electric: { effect: 'saltar', damageBonus: 0.15, description: 'Exaltação Elétrica: cadeia ampliada (+15% de dano).' },
  grass: { effect: 'semente', damageBonus: 0.14, description: 'Exaltação Planta: raízes dominantes (+14% de dano).' },
  ice: { effect: 'lentidao', damageBonus: 0.16, description: 'Exaltação Gelo: geada profunda (+16% de dano).' },
  fighting: { effect: 'empurrar', damageBonus: 0.17, description: 'Exaltação Lutador: impacto brutal (+17% de dano).' },
  poison: { effect: 'queimar', damageBonus: 0.14, description: 'Exaltação Veneno: toxina concentrada (+14% de dano).' },
  ground: { effect: 'atordoar', damageBonus: 0.16, description: 'Exaltação Terra: terremoto curto (+16% de dano).' },
  flying: { effect: 'empurrar', damageBonus: 0.14, description: 'Exaltação Voador: vendaval forte (+14% de dano).' },
  psychic: { effect: 'empurrar', damageBonus: 0.16, description: 'Exaltação Psíquico: pressão mental (+16% de dano).' },
  bug: { effect: 'lentidao', damageBonus: 0.14, description: 'Exaltação Inseto: enxame denso (+14% de dano).' },
  rock: { effect: 'atordoar', damageBonus: 0.17, description: 'Exaltação Pedra: fragmentação pesada (+17% de dano).' },
  ghost: { effect: 'lentidao', damageBonus: 0.16, description: 'Exaltação Fantasma: assombração profunda (+16% de dano).' },
  dragon: { effect: 'atravessar', damageBonus: 0.19, description: 'Exaltação Dragão: sopro penetrante (+19% de dano).' },
  dark: { effect: 'roubar', damageBonus: 0.16, description: 'Exaltação Sombrio: predador voraz (+16% de dano).' },
  steel: { effect: 'atravessar', damageBonus: 0.18, description: 'Exaltação Aço: liga perfurante (+18% de dano).' },
  fairy: { effect: 'roubar', damageBonus: 0.14, description: 'Exaltação Fada: brilho restaurador (+14% de dano).' },
};

export function isTypeExaltation(primary: PokemonType, secondary: PokemonType): boolean {
  return primary === secondary;
}

export function hypotheticalTypeRuleFor(primary: PokemonType, secondary: PokemonType): HypotheticalTypeRule {
  return isTypeExaltation(primary, secondary) ? REPEATED_TYPE_EXALTATIONS[primary] : HYPOTHETICAL_TYPE_EFFECTS[secondary];
}

/** Escolha estável por semente: não usa o RNG da luta; uma repetição vira Exaltação. */
export function hypotheticalSecondaryTypeFor(primary: PokemonType, seed: number): PokemonType {
  const mixed = (Math.imul(seed >>> 0, 0x45d9f3b) ^ Math.imul(POKEMON_TYPES.indexOf(primary) + 1, 0x27d4eb2d)) >>> 0;
  return POKEMON_TYPES[mixed % POKEMON_TYPES.length]!;
}
