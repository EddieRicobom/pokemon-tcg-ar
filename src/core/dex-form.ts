/**
 * Formas regionais (Alola, Galar, Hisui, Paldea): a carta de "Galarian Ponyta" traz o número 77 da Pokédex, mas o
 * Pokémon certo é a forma de Galar (PokeAPI id 10162), com outro sprite, outro tipo e outros atributos. Esta tabela vem
 * do `pokemon.csv` do repositório PokeAPI/pokeapi (identificadores `<espécie>-<região>`, em 2026-10-14) e só liga o
 * número da espécie ao id da forma; os endereços dos sprites continuam sendo calculados (`ar/sprite-url.ts`).
 */

export type Region = 'alola' | 'galar' | 'hisui' | 'paldea';

export const REGION_FORM_IDS: Readonly<Record<number, Partial<Record<Region, number>>>> = {
  19: { alola: 10091 }, // rattata
  20: { alola: 10092 }, // raticate
  26: { alola: 10100 }, // raichu
  27: { alola: 10101 }, // sandshrew
  28: { alola: 10102 }, // sandslash
  37: { alola: 10103 }, // vulpix
  38: { alola: 10104 }, // ninetales
  50: { alola: 10105 }, // diglett
  51: { alola: 10106 }, // dugtrio
  52: { alola: 10107, galar: 10161 }, // meowth
  53: { alola: 10108 }, // persian
  58: { hisui: 10229 }, // growlithe
  59: { hisui: 10230 }, // arcanine
  74: { alola: 10109 }, // geodude
  75: { alola: 10110 }, // graveler
  76: { alola: 10111 }, // golem
  77: { galar: 10162 }, // ponyta
  78: { galar: 10163 }, // rapidash
  79: { galar: 10164 }, // slowpoke
  80: { galar: 10165 }, // slowbro
  83: { galar: 10166 }, // farfetchd
  88: { alola: 10112 }, // grimer
  89: { alola: 10113 }, // muk
  100: { hisui: 10231 }, // voltorb
  101: { hisui: 10232 }, // electrode
  103: { alola: 10114 }, // exeggutor
  105: { alola: 10115 }, // marowak
  110: { galar: 10167 }, // weezing
  122: { galar: 10168 }, // mr-mime
  144: { galar: 10169 }, // articuno
  145: { galar: 10170 }, // zapdos
  146: { galar: 10171 }, // moltres
  157: { hisui: 10233 }, // typhlosion
  194: { paldea: 10253 }, // wooper
  199: { galar: 10172 }, // slowking
  211: { hisui: 10234 }, // qwilfish
  215: { hisui: 10235 }, // sneasel
  222: { galar: 10173 }, // corsola
  263: { galar: 10174 }, // zigzagoon
  264: { galar: 10175 }, // linoone
  503: { hisui: 10236 }, // samurott
  549: { hisui: 10237 }, // lilligant
  554: { galar: 10176 }, // darumaka
  562: { galar: 10179 }, // yamask
  570: { hisui: 10238 }, // zorua
  571: { hisui: 10239 }, // zoroark
  618: { galar: 10180 }, // stunfisk
  628: { hisui: 10240 }, // braviary
  705: { hisui: 10241 }, // sliggoo
  706: { hisui: 10242 }, // goodra
  713: { hisui: 10243 }, // avalugg
  724: { hisui: 10244 }, // decidueye
};

const REGION_WORDS: readonly [Region, RegExp][] = [
  ['alola', /\balola(n)?\b/i],
  ['galar', /\bgalar(ian)?\b/i],
  ['hisui', /\bhisui(an)?\b/i],
  ['paldea', /\bpalde(a|an)\b/i],
];

/** Região escrita no nome da carta ("Galarian Ponyta", "Ponyta de Galar", "Alolan Raichu"), ou null. */
export function regionOfName(name: string): Region | null {
  for (const [region, pattern] of REGION_WORDS) if (pattern.test(name)) return region;
  return null;
}

/**
 * O id a usar no sprite e nos dados do Pokémon: o da forma regional quando o nome da carta diz a região e a tabela
 * tem a forma; senão o próprio número da Pokédex.
 */
export function formDexId(dexId: number, cardName: string | undefined): number {
  const region = cardName ? regionOfName(cardName) : null;
  return (region && REGION_FORM_IDS[dexId]?.[region]) || dexId;
}

/** O sprite guardado (`key` = endereço) é o do id `id`? Serve para refazer o que foi baixado com o número errado. */
export function spriteKeyIsFor(key: string | undefined, id: number): boolean {
  return key !== undefined && new RegExp(`/${id}\\.(gif|png)$`).test(key.split('?')[0] ?? '');
}

/** O id do Pokémon de uma carta (forma regional incluída), ou undefined quando a carta não tem Pokémon. */
export function spriteIdOf(card: { dexIds: readonly number[]; name: string }): number | undefined {
  const species = card.dexIds[0];
  return species === undefined ? undefined : formDexId(species, card.name);
}
