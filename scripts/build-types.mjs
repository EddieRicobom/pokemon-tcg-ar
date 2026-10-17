// Gera `src/core/data/pokemon-types.json` a partir dos CSVs oficiais da PokéAPI (dados abertos, licença BSD-3):
// os tipos de cada espécie (forma padrão, pelo número da Pokédex) e de cada forma alternativa (id 10001+, o mesmo de
// `spriteIdOf`). Dado fixo — fica no repositório e funciona offline. Rode de novo quando sair uma geração nova:
//   node scripts/build-types.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
async function csv(name) {
  const text = await (await fetch(`${BASE}/${name}`)).text();
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return rows.map((row) => Object.fromEntries(row.split(',').map((v, i) => [cols[i], v])));
}

const [pokemon, pokemonTypes, types] = await Promise.all([csv('pokemon.csv'), csv('pokemon_types.csv'), csv('types.csv')]);
const typeName = new Map(types.map((t) => [t.id, t.identifier]));
const typesOf = new Map();
for (const row of pokemonTypes.sort((a, b) => Number(a.slot) - Number(b.slot))) {
  const list = typesOf.get(row.pokemon_id) ?? [];
  list.push(typeName.get(row.type_id));
  typesOf.set(row.pokemon_id, list);
}
// Compacto: cada tipo vira o índice na lista do app (mesma ordem de POKEMON_TYPES em src/core/pokemon-data.ts).
const ORDER = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const code = (list) => list.map((t) => ORDER.indexOf(t)).filter((i) => i >= 0);
const species = [];
const forms = {};
for (const p of pokemon) {
  const list = typesOf.get(p.id);
  if (!list) continue;
  if (p.is_default === '1') species[Number(p.species_id)] = code(list);
  else if (Number(p.id) > 10000) forms[p.id] = code(list);
}
const out = { source: `${BASE}/pokemon_types.csv`, generatedAt: new Date().toISOString().slice(0, 10), order: ORDER, species: Array.from(species, (t) => t ?? []), forms };
writeFileSync(join(import.meta.dirname, '../src/core/data/pokemon-types.json'), JSON.stringify(out) + '\n');
console.log(`tipos: ${species.filter(Boolean).length} espécies e ${Object.keys(forms).length} formas`);
