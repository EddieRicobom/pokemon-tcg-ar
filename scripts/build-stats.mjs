// Gera `src/core/data/pokemon-stats.json` a partir do CSV oficial da PokéAPI (dados abertos, licença BSD-3): os stats
// base de cada espécie (forma padrão, pelo número da Pokédex) na ordem HP, Ataque, Defesa, Ataque Especial, Defesa
// Especial e Velocidade. Usado pela Torre de Sobrevivência (`core/survivor-stats.ts`): os stats decidem a forma do golpe
// e os números dele. Dado fixo — fica no repositório e funciona offline. Rode de novo quando sair uma geração nova:
//   node scripts/build-stats.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
async function csv(name) {
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const [header, ...rows] = (await response.text()).trim().split(/\r?\n/);
  const cols = header.split(',');
  return rows.map((row) => Object.fromEntries(row.split(',').map((v, i) => [cols[i], v])));
}

const [pokemon, stats] = await Promise.all([csv('pokemon.csv'), csv('pokemon_stats.csv')]);
// Só a forma padrão de cada espécie (o id da forma padrão nem sempre é o número da Pokédex).
const speciesOf = new Map(pokemon.filter((p) => p.is_default === '1').map((p) => [p.id, Number(p.species_id)]));
// stat_id da PokéAPI: 1 HP, 2 Ataque, 3 Defesa, 4 Ataque Especial, 5 Defesa Especial, 6 Velocidade.
const out = [];
for (const row of stats) {
  const dex = speciesOf.get(row.pokemon_id);
  const stat = Number(row.stat_id);
  if (!dex || stat < 1 || stat > 6) continue;
  (out[dex] ??= [0, 0, 0, 0, 0, 0])[stat - 1] = Number(row.base_stat);
}
const result = {
  source: `${BASE}/pokemon_stats.csv`,
  generatedAt: new Date().toISOString().slice(0, 10),
  order: ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'],
  stats: Array.from(out, (v) => v ?? []),
};
writeFileSync(join(import.meta.dirname, '../src/core/data/pokemon-stats.json'), JSON.stringify(result) + '\n');
console.log(`stats: ${out.filter(Boolean).length} espécies`);
