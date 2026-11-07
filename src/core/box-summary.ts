import { typesOfDex } from './species-filter';
import { TYPE_COLORS, TYPE_LABELS_PT } from './pokemon-data';
import type { PokemonType } from './pokemon-data';
import { statsOfDex } from './survivor-stats';
import { survivorAttackChoices } from './survivor-loadout';
import type { SurvivorAttackChoice } from './survivor-loadout';
import type { MoveCategory } from './survivor-moves';

/**
 * A ficha do Pokémon na seleção em grade: tipos, atributos base e os dois ataques que ele leva para a luta. Sem os dados
 * da espécie, a ficha diz que eles faltam (`stats` nulo), em vez de mostrar números inventados.
 */

export const MOVE_FORM_LABELS: Record<MoveCategory, string> = {
  projetil: 'Projétil', aura: 'Aura', area: 'Área', cone: 'Cone', orbit: 'Órbita', foco: 'Foco', rapido: 'Rajada', teleporte: 'Teleporte', trilha: 'Trilha',
};

/** Atributo a partir do qual a barra fica cheia: poucas espécies passam disso. */
const STAT_FULL = 160;

export interface BoxStat {
  label: string;
  value: number;
  /** Tamanho da barra (0 a 100). */
  pct: number;
}

export interface BoxAttack {
  typeLabel: string;
  color: string;
  name: string;
  form: string;
}

export interface BoxSummary {
  types: { type: PokemonType; label: string; color: string }[];
  stats: BoxStat[] | null;
  total: number | null;
  main: BoxAttack;
  second: BoxAttack;
}

const attackOf = ({ move }: SurvivorAttackChoice): BoxAttack => ({
  typeLabel: TYPE_LABELS_PT[move.type], color: TYPE_COLORS[move.type], name: move.name, form: MOVE_FORM_LABELS[move.category],
});

export function boxSummary(dexId: number): BoxSummary {
  const base = statsOfDex(dexId);
  const { current, alternative } = survivorAttackChoices(dexId);
  const rows: [string, number][] = base
    ? [['PS', base.hp], ['Ataque', base.attack], ['Defesa', base.defense], ['At. esp.', base.spAttack], ['Def. esp.', base.spDefense], ['Veloc.', base.speed]]
    : [];
  return {
    types: typesOfDex(dexId).map((type) => ({ type, label: TYPE_LABELS_PT[type], color: TYPE_COLORS[type] })),
    stats: base ? rows.map(([label, value]) => ({ label, value, pct: Math.min(100, Math.round((value / STAT_FULL) * 100)) })) : null,
    total: base ? rows.reduce((sum, [, value]) => sum + value, 0) : null,
    main: attackOf(current),
    second: attackOf(alternative),
  };
}
