/**
 * Pokémon shiny. A carta nova ganha o brilho no primeiro escaneamento completo, com chance de 1 em `SHINY_ODDS`,
 * e guarda o resultado (`shiny`). Algumas cartas são shiny sempre (`ALWAYS_SHINY`), também as que já estavam guardadas.
 * O sorteio nunca acontece de novo: reescanear uma carta não muda o que ela é.
 */

export const SHINY_ODDS = 50;

/** O que a regra precisa saber de uma carta (estrutural, para não depender do cache). */
export interface ShinyCardLike {
  name: string;
  localId: string;
  setOfficial: number;
  shiny?: boolean;
}

interface AlwaysShinyRule {
  /** Trecho do nome (sem maiúsculas/acentos). */
  name: string;
  localId: string;
  setOfficial: number;
}

/** Cartas que são shiny com 100% de certeza. */
export const ALWAYS_SHINY: readonly AlwaysShinyRule[] = [{ name: 'gallade', localId: '244', setOfficial: 236 }];

function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Número da carta sem zeros à esquerda ("044" e "44" são o mesmo). */
function sameNumber(a: string, b: string): boolean {
  return a.replace(/^0+(?=\d)/, '') === b.replace(/^0+(?=\d)/, '');
}

export function isAlwaysShiny(card: Pick<ShinyCardLike, 'name' | 'localId' | 'setOfficial'>): boolean {
  const name = plain(card.name);
  return ALWAYS_SHINY.some((rule) => name.includes(rule.name) && sameNumber(card.localId, rule.localId) && card.setOfficial === rule.setOfficial);
}

/** Sorteio de 1 em `odds` (padrão 1/50). `random` devolve um número em [0, 1). */
export function rollShiny(random: () => number = Math.random, odds = SHINY_ODDS): boolean {
  if (!(odds >= 1)) return false;
  return random() < 1 / odds;
}

/** O resultado de um primeiro escaneamento: as cartas sempre-shiny não gastam o sorteio. */
export function shinyForNewCard(card: Pick<ShinyCardLike, 'name' | 'localId' | 'setOfficial'>, random: () => number = Math.random): boolean {
  return isAlwaysShiny(card) || rollShiny(random);
}

/** A carta é shiny se foi sorteada no primeiro escaneamento ou se está na lista das sempre-shiny. */
export function isShiny(card: ShinyCardLike): boolean {
  return card.shiny === true || isAlwaysShiny(card);
}
