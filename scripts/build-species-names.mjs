// Gera `src/core/data/pokemon-species-names.json` a partir do CSV oficial da PokéAPI (dados abertos, licença BSD-3):
// o nome em inglês de cada espécie, normalizado (minúsculas, sem acento, apóstrofo reto), indexado pelo número da
// Pokédex Nacional. Serve para recuperar o `dexId` quando a fonte dos dados (TCGdex) não informa — caso da coleção
// Delta Reign (nov/2026), em que todas as cartas vieram sem `dexId`. É um dado fixo, por isso fica no repositório e
// funciona offline; rode de novo quando sair uma geração nova:  node scripts/build-species-names.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const csv = await (await fetch(URL)).text();

function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").toLowerCase().trim();
}

const names = [];
for (const line of csv.trim().split(/\r?\n/).slice(1)) {
  const [id, language, ...rest] = line.split(',');
  // O nome é o 3º campo; o resto é o gênero ("genus"), que pode ter vírgula.
  const name = rest[0];
  if (language !== '9' || !name) continue;
  const dex = Number(id);
  if (!Number.isInteger(dex) || dex < 1) continue;
  if (names[dex - 1] === undefined) names[dex - 1] = normalize(name);
}
const out = {
  source: URL,
  generatedAt: new Date().toISOString().slice(0, 10),
  // índice + 1 = número da Pokédex; vazio quando a espécie não tem nome em inglês.
  names: Array.from(names, (n) => n ?? ''),
};
writeFileSync(join(import.meta.dirname, '../src/core/data/pokemon-species-names.json'), JSON.stringify(out) + '\n');
console.log(`nomes de espécie: ${names.filter(Boolean).length} (até a nº ${names.length})`);
