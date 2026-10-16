// Gera `src/core/data/pokemon-heights.json` a partir do CSV oficial da PokéAPI (dados abertos, licença BSD-3):
// altura de cada espécie (forma padrão), em decímetros, indexada pelo número da Pokédex Nacional, e a de cada forma
// alternativa (regionais, Mega, Gigantamax…) pelo id da PokéAPI (10001+), o mesmo que `spriteIdOf` devolve.
// É um dado fixo (altura de espécie não muda), por isso fica no repositório e funciona offline; rode de novo quando
// sair uma geração nova:  node scripts/build-heights.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv';
const csv = await (await fetch(URL)).text();
const [header, ...rows] = csv.trim().split(/\r?\n/);
const cols = header.split(',');
const at = (name) => cols.indexOf(name);
const heights = [];
const forms = {};
for (const row of rows) {
  const f = row.split(',');
  const id = Number(f[at('id')]);
  const dex = Number(f[at('species_id')]);
  const height = Number(f[at('height')]);
  if (!(height > 0)) continue;
  if (f[at('is_default')] === '1') {
    if (Number.isInteger(dex) && dex > 0) heights[dex] = height;
  } else if (Number.isInteger(id) && id > 10000) {
    forms[id] = height;
  }
}
const out = { source: URL, unit: 'decímetros', generatedAt: new Date().toISOString().slice(0, 10), heights: Array.from(heights, (h) => h ?? 0), forms };
writeFileSync(join(import.meta.dirname, '../src/core/data/pokemon-heights.json'), JSON.stringify(out) + '\n');
console.log(`alturas: ${heights.filter(Boolean).length} espécies (até a nº ${heights.length - 1}) e ${Object.keys(forms).length} formas alternativas`);
