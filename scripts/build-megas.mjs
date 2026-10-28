// Gera `src/core/data/pokemon-megas.json` a partir dos CSVs oficiais da PokéAPI (dados abertos, licença BSD-3): cada
// forma Mega (`-mega`, `-mega-x`, `-mega-y`, `-mega-z`…), com a espécie base, o id da forma (10001+, o mesmo dos sprites
// e de `/pokemon/{id}`), os stats base da forma (ordem HP, Ataque, Defesa, Ataque Especial, Defesa Especial e
// Velocidade) e se o repositório PokeAPI/sprites tem o GIF animado (Showdown) e o PNG parado dessa forma. Usado pela
// Mega temporária da Torre de Sobrevivência (`core/survivor-mega.ts`). Dado fixo — fica no repositório e funciona
// offline. Rode de novo quando a PokéAPI ganhar formas novas:
//   node scripts/build-megas.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
async function csv(name) {
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const [header, ...rows] = (await response.text()).trim().split(/\r?\n/);
  const cols = header.split(',');
  return rows.map((row) => Object.fromEntries(row.split(',').map((v, i) => [cols[i], v])));
}
async function exists(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.status === 404) return false;
      if (response.ok) return true;
    } catch {
      // tenta de novo
    }
  }
  throw new Error(`não consegui conferir ${url}`);
}

const [pokemon, stats] = await Promise.all([csv('pokemon.csv'), csv('pokemon_stats.csv')]);
const forms = [];
for (const row of pokemon) {
  const match = /-mega(?:-([a-z]))?$/.exec(row.identifier);
  const id = Number(row.id);
  if (!match || !(id > 10000)) continue;
  const values = [0, 0, 0, 0, 0, 0];
  // stat_id da PokéAPI: 1 HP, 2 Ataque, 3 Defesa, 4 Ataque Especial, 5 Defesa Especial, 6 Velocidade.
  for (const s of stats) if (s.pokemon_id === row.id && Number(s.stat_id) >= 1 && Number(s.stat_id) <= 6) values[Number(s.stat_id) - 1] = Number(s.base_stat);
  const [animated, still] = await Promise.all([exists(`${SPRITES}/other/showdown/${id}.gif`), exists(`${SPRITES}/${id}.png`)]);
  forms.push({ dex: Number(row.species_id), id, name: row.identifier, variant: match[1] ?? null, stats: values, animated, still });
}
forms.sort((a, b) => a.dex - b.dex || a.id - b.id);
const result = {
  source: `${BASE}/pokemon.csv + pokemon_stats.csv; sprites: ${SPRITES}`,
  generatedAt: new Date().toISOString().slice(0, 10),
  order: ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'],
  forms,
};
writeFileSync(join(import.meta.dirname, '../src/core/data/pokemon-megas.json'), JSON.stringify(result) + '\n');
console.log(`megas: ${forms.length} formas; sem GIF animado: ${forms.filter((f) => !f.animated).map((f) => f.name).join(', ') || 'nenhuma'}; sem PNG: ${forms.filter((f) => !f.still).map((f) => f.name).join(', ') || 'nenhuma'}`);
