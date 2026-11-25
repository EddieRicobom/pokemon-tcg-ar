import data from './data/pokemon-species-names.json';

/**
 * Nome da espécie → número da Pokédex Nacional, a partir da lista oficial da PokéAPI
 * (`data/pokemon-species-names.json`, gerado por `scripts/build-species-names.mjs`).
 *
 * Existe porque a fonte dos dados das cartas (TCGdex) nem sempre informa o `dexId`: a coleção Delta Reign
 * (nov/2026) veio inteira sem ele. Sem número de espécie o app não acha o sprite, os tipos nem os atributos —
 * e antes ficava parecendo uma carta de Treinador. Aqui o número é recuperado do nome impresso, que é um dado
 * da própria carta; quando o nome não é de uma espécie (Treinador, Energia, forma desconhecida), devolve
 * `undefined` e o app continua dizendo que falta, como sempre.
 *
 * O arquivo guarda os nomes já normalizados (minúsculas, sem acento, apóstrofo reto); `normalizeSpeciesName`
 * aplica o mesmo critério ao nome lido da carta.
 */

const NAMES: readonly string[] = data.names;

let lookup: Map<string, number> | null = null;

function speciesByName(): Map<string, number> {
  if (!lookup) {
    lookup = new Map();
    for (let index = 0; index < NAMES.length; index++) {
      const name = NAMES[index];
      if (name && !lookup.has(name)) lookup.set(name, index + 1);
    }
  }
  return lookup;
}

/** Minúsculas, sem acento e com apóstrofo reto — o mesmo critério do arquivo gerado. */
export function normalizeSpeciesName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .trim();
}

/** Prefixos de forma/série que não fazem parte do nome da espécie ("Mega Golisopod ex" → "Golisopod"). */
const LEADING = [
  /^(?:mega|m)\s+/,
  /^(?:radiant|shining|dark|light)\s+/,
  /^(?:origin forme|dusk mane|dawn wings|ultra)\s+/,
  /^(?:alolan|galarian|hisuian|paldean)\s+/,
];

/** Sufixos impressos depois do nome ("... ex", "... VMAX", "... LV.X"). */
const TRAILING = /\s*[- ]\s*(?:ex|gx|v|vmax|vstar|v-union|break|prime|star|legend|lv\.?x|sp)$/;

/** Formas cujo nome não começa pelo nome da espécie (as formas do Rotom). */
const ALIASES: Readonly<Record<string, number>> = {
  'heat rotom': 479,
  'wash rotom': 479,
  'frost rotom': 479,
  'fan rotom': 479,
  'mow rotom': 479,
};

/**
 * Número da espécie a partir do nome impresso na carta, ou `undefined` quando o nome não é (só) de uma
 * espécie. Devolve a **espécie base**: a forma regional continua sendo resolvida por `formDexId`, que lê a
 * região no nome ("Galarian Ponyta" → 77 aqui, 10162 lá).
 */
export function speciesDexId(cardName: string): number | undefined {
  if (!cardName) return undefined;
  let name = normalizeSpeciesName(cardName);
  for (let pass = 0; pass < 4; pass++) {
    const alias = ALIASES[name];
    if (alias !== undefined) return alias;
    const found = speciesByName().get(name);
    if (found !== undefined) return found;
    let changed = false;
    for (const pattern of LEADING) {
      if (!pattern.test(name)) continue;
      name = name.replace(pattern, '');
      changed = true;
    }
    const trailing = TRAILING.exec(name);
    if (trailing) {
      name = name.slice(0, trailing.index);
      changed = true;
    }
    if (!changed) return undefined;
  }
  return undefined;
}
