import { typeEffectiveness } from './battle';
import type { BoxSummary } from './box-summary';
import { POKEMON_TYPES, TYPE_LABELS_PT } from './pokemon-data';
import type { PokemonType } from './pokemon-data';
import { typesOfDex } from './species-filter';
import { survivorAttackChoices } from './survivor-loadout';
import { statsOfDex } from './survivor-stats';

/**
 * O que a tela de escolha de equipe conta sobre o time: cobertura de tipos, sugestão automática explicada e comparação.
 * Tudo sai dos dados reais do app (tipos da espécie, os dois golpes da luta e a mesma tabela de tipos da arena). Espécie
 * sem dado entra na lista `unknown`, nunca com valor inventado.
 */

export interface TeamInsightMember {
  id: string;
  name: string;
  /** Espécie atual; sem número da Pokédex não há o que analisar. */
  dexId: number | undefined;
}

interface Profile extends TeamInsightMember {
  dexId: number;
  types: PokemonType[];
  attacks: PokemonType[];
  total: number | null;
}

function profileOf(member: TeamInsightMember): Profile | null {
  if (member.dexId === undefined) return null;
  const types = typesOfDex(member.dexId);
  if (types.length === 0) return null;
  const { current, alternative } = survivorAttackChoices(member.dexId);
  const stats = statsOfDex(member.dexId);
  return {
    ...member,
    dexId: member.dexId,
    types,
    attacks: [...new Set([current.move.type, alternative.move.type])],
    total: stats ? stats.hp + stats.attack + stats.defense + stats.spAttack + stats.spDefense + stats.speed : null,
  };
}

export interface TeamThreat {
  type: PokemonType;
  /** Quantos da equipe levam mais dano desse tipo. */
  weak: number;
  /** Quantos resistem ou são imunes. */
  resist: number;
}

export interface TeamCoverage {
  /** Tipos que ao menos um golpe da equipe acerta com vantagem. */
  covered: PokemonType[];
  missing: PokemonType[];
  /** Tipos que pegam 2 ou mais da equipe e encontram menos resistência do que fraqueza, do pior para o menos pior. */
  threats: TeamThreat[];
  /** Nomes de quem não tem dado de tipo: fica fora da conta. */
  unknown: string[];
}

const coveredBy = (attacks: readonly PokemonType[]): PokemonType[] => POKEMON_TYPES.filter((target) => attacks.some((attack) => typeEffectiveness(attack, [target]) > 1));

function threatsOf(team: readonly Profile[]): TeamThreat[] {
  return POKEMON_TYPES.map((type) => ({
    type,
    weak: team.filter((member) => typeEffectiveness(type, member.types) > 1).length,
    resist: team.filter((member) => typeEffectiveness(type, member.types) < 1).length,
  })).filter((row) => row.weak >= 2 && row.weak > row.resist).sort((a, b) => b.weak - b.resist - (a.weak - a.resist) || b.weak - a.weak);
}

export function teamCoverage(members: readonly TeamInsightMember[]): TeamCoverage {
  const profiles = members.flatMap((member) => profileOf(member) ?? []);
  const covered = coveredBy(profiles.flatMap((member) => member.attacks));
  return {
    covered,
    missing: POKEMON_TYPES.filter((type) => !covered.includes(type)),
    threats: threatsOf(profiles),
    unknown: members.filter((member) => !profiles.some((profile) => profile.id === member.id)).map((member) => member.name),
  };
}

export interface SuggestedPick {
  id: string;
  name: string;
  /** Por que entrou, em uma frase curta. */
  reason: string;
}

export interface TeamSuggestion {
  ids: string[];
  picks: SuggestedPick[];
}

/** Quanto um tipo novo coberto vale em pontos de atributo, e quanto custa abrir uma fraqueza nova na equipe. */
const NEW_COVERAGE_VALUE = 45;
const NEW_THREAT_COST = 30;
/** Sem atributos, a conta usa um meio-termo só para ordenar: quem tem dado sempre vem antes. */
const UNKNOWN_TOTAL = 300;

function listTypes(types: readonly PokemonType[]): string {
  const names = types.slice(0, 3).map((type) => TYPE_LABELS_PT[type]);
  const rest = types.length - names.length;
  return rest > 0 ? `${names.join(', ')} e mais ${rest}` : names.join(' e ').replace(/ e (?=.* e )/g, ', ');
}

/**
 * Monta a equipe passo a passo: a cada vaga entra quem soma mais atributos e tipos ainda não cobertos, sem abrir fraqueza
 * nova. Espécie repetida e espécie sem dados só entram se não sobrar outra opção, e a frase diz isso.
 */
export function suggestTeam(candidates: readonly TeamInsightMember[], max: number): TeamSuggestion {
  const pool = candidates.flatMap((member) => profileOf(member) ?? []);
  const chosen: Profile[] = [];
  const picks: SuggestedPick[] = [];
  while (chosen.length < max && pool.length > 0) {
    const attacks = chosen.flatMap((member) => member.attacks);
    const before = coveredBy(attacks);
    const threatsBefore = threatsOf(chosen).length;
    const ranked = pool.map((member) => {
      const fresh = coveredBy(member.attacks).filter((type) => !before.includes(type));
      const newThreats = Math.max(0, threatsOf([...chosen, member]).length - threatsBefore);
      const repeated = chosen.some((other) => other.dexId === member.dexId);
      const tier = (repeated ? 2 : 0) + (member.total === null ? 1 : 0);
      return { member, fresh, newThreats, repeated, tier, gain: (member.total ?? UNKNOWN_TOTAL) + fresh.length * NEW_COVERAGE_VALUE - newThreats * NEW_THREAT_COST };
    }).sort((a, b) => a.tier - b.tier || b.gain - a.gain || a.member.id.localeCompare(b.member.id));
    const best = ranked[0]!;
    chosen.push(best.member);
    pool.splice(pool.indexOf(best.member), 1);
    let reason: string;
    if (best.member.total === null) reason = 'Sem os atributos da espécie: entrou só para completar, e luta com números médios.';
    else if (best.repeated) reason = `Espécie repetida: entrou para completar a equipe (total ${best.member.total}).`;
    else if (best.fresh.length > 0) reason = `Total ${best.member.total}; golpes fortes contra ${listTypes(best.fresh)}.`;
    else if (best.newThreats === 0) reason = `Total ${best.member.total}, sem abrir fraqueza nova.`;
    else reason = `Maior total que sobrou (${best.member.total}).`;
    picks.push({ id: best.member.id, name: best.member.name, reason });
  }
  return { ids: chosen.map((member) => member.id), picks };
}

export interface StatComparison {
  label: string;
  /** Diferença do Pokémon em foco para o comparado: positiva quando ele tem mais. */
  diff: number;
}

/** Diferença atributo a atributo; `null` quando falta o dado de um dos dois. */
export function compareStats(focused: Pick<BoxSummary, 'stats' | 'total'>, other: Pick<BoxSummary, 'stats' | 'total'>): { rows: StatComparison[]; total: number } | null {
  if (!focused.stats || !other.stats || focused.total === null || other.total === null) return null;
  const rows = focused.stats.flatMap((stat) => {
    const match = other.stats!.find((candidate) => candidate.label === stat.label);
    return match ? [{ label: stat.label, diff: stat.value - match.value }] : [];
  });
  return { rows, total: focused.total - other.total };
}

/** Coloca um Pokémon na vaga de outro, sem mexer na ordem dos demais. */
export function replaceMember(team: readonly string[], outId: string, inId: string): string[] {
  if (!team.includes(outId) || team.includes(inId)) return [...team];
  return team.map((id) => (id === outId ? inId : id));
}
