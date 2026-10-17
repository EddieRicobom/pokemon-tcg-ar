import data from './data/pokemon-evolutions.json';

/**
 * Cadeia de evolução real (dado da PokéAPI em `data/pokemon-evolutions.json`, gerado por `scripts/build-evolutions.mjs`)
 * para a evolução dentro da Torre de Sobrevivência. Nunca inventa uma forma: sem próxima forma no dado, não evolui.
 */
const FROM: readonly number[] = data.from;
const NAME: readonly string[] = data.name;

/** As próximas formas reais de uma espécie (várias quando há ramos, como Eevee); vazio na forma final ou sem dado. */
export function nextEvolutions(dexId: number): number[] {
  if (!Number.isInteger(dexId) || dexId <= 0) return [];
  const out: number[] = [];
  for (let id = 1; id < FROM.length; id++) if (FROM[id] === dexId) out.push(id);
  return out;
}

/** Nome da espécie no dado da PokéAPI (o mesmo usado no Brasil); vazio se não houver. */
export function speciesName(dexId: number): string {
  return NAME[dexId] ?? '';
}
