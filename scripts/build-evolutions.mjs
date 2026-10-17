// Gera `src/core/data/pokemon-evolutions.json` a partir dos CSVs oficiais da PokéAPI (dados abertos, licença BSD-3):
// de qual espécie cada uma evolui (`evolves_from_species_id`) e o nome de cada espécie (o nome em inglês da PokéAPI,
// que é o mesmo usado no Brasil). Usado pela evolução dentro da Torre de Sobrevivência (`core/survivor-evolution.ts`).
// Dado fixo — fica no repositório e funciona offline. Rode de novo quando sair uma geração nova:
//   node scripts/build-evolutions.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
async function csv(name) {
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const [header, ...rows] = (await response.text()).trim().split(/\r?\n/);
  const cols = header.split(',');
  // Os nomes podem ter vírgula entre aspas (ex.: "Farfetch’d" não tem, mas os gêneros têm): só as colunas do começo importam.
  return rows.map((row) => Object.fromEntries(row.split(',').map((v, i) => [cols[i], v])));
}

const [species, names] = await Promise.all([csv('pokemon_species.csv'), csv('pokemon_species_names.csv')]);
const ENGLISH = '9';
const nameOf = new Map(names.filter((n) => n.local_language_id === ENGLISH).map((n) => [Number(n.pokemon_species_id), n.name]));
const from = [];
const name = [];
for (const s of species) {
  const id = Number(s.id);
  if (!Number.isInteger(id) || id <= 0) continue;
  from[id] = s.evolves_from_species_id ? Number(s.evolves_from_species_id) : 0;
  name[id] = nameOf.get(id) ?? '';
}
const out = {
  source: `${BASE}/pokemon_species.csv`,
  generatedAt: new Date().toISOString().slice(0, 10),
  // `from[dex]` = de quem a espécie evolui (0 = forma base); `name[dex]` = nome da espécie.
  from: Array.from(from, (v) => v ?? 0),
  name: Array.from(name, (v) => v ?? ''),
};
writeFileSync(join(import.meta.dirname, '../src/core/data/pokemon-evolutions.json'), JSON.stringify(out) + '\n');
console.log(`evoluções: ${from.filter((v) => v > 0).length} espécies evoluem de outra; ${name.filter(Boolean).length} nomes`);
