/**
 * Confere o build de produção (pasta dist/) antes de publicar: base path no manifest e no index.html,
 * Service Worker gerado, arquivos do OCR, e (se exigido) o índice do catálogo com tamanho plausível.
 *
 *   BASE_PATH=/pokemon-tcg-ar/ REQUIRE_INDEX=1 node scripts/verify-dist.mjs
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const base = process.env.BASE_PATH ?? '/pokemon-tcg-ar/';
const requireIndex = process.env.REQUIRE_INDEX === '1';
const requireSpritePack = process.env.REQUIRE_SPRITE_PACK === '1';
const problems = [];
const notes = [];

const need = (condition, message) => {
  if (!condition) problems.push(message);
};

const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
need(manifest.start_url === base && manifest.scope === base && manifest.id === base, `manifest com start_url/scope/id inesperados (${manifest.start_url}, ${manifest.scope}, ${manifest.id}; esperado ${base})`);
need(manifest.lang === 'pt-BR', 'manifest sem lang pt-BR');
need(manifest.display === 'standalone', 'manifest sem display standalone');

const html = readFileSync('dist/index.html', 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (ref.startsWith('http') || ref.startsWith('data:')) continue;
  need(ref.startsWith(base), `index.html referencia fora do base path: ${ref}`);
}
notes.push(`index.html: ${refs.length} referências, todas sob ${base}`);

need(existsSync('dist/sw.js'), 'dist/sw.js não foi gerado');
if (existsSync('dist/sw.js')) {
  const sw = readFileSync('dist/sw.js', 'utf8');
  need(!sw.includes('${base}'), 'Service Worker usa base sem definição (callback capturou variável da configuração)');
  need(sw.includes('index.html'), 'Service Worker não pré-cacheia index.html');
  need(!/\{url:["'][^"']*audio\/[^"']*\.mp3/.test(sw.split('precacheAndRoute')[1]?.split('],')[0] ?? ''), 'Músicas não deveriam estar no pré-cache da instalação');
  need(!/ocr\/worker\.min\.js/.test(sw.split('precacheAndRoute')[1] ?? ''), 'OCR não deveria estar no pré-cache da instalação');
}

const villageTracks = ['new-bark', 'cherrygrove', 'goldenrod', 'viridian', 'cianwood', 'hearthome', 'heahea-night', 'oreburgh-night', 'canalave', 'hearthome-night', 'azalea-winter', 'humilau-night'];
const survivalTracks = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'];
const audioPaths = [...villageTracks.map(name => `village/${name}`), ...survivalTracks.map(name => `survival/${name}`)];
for (const path of audioPaths) {
  const file = `dist/audio/${path}.mp3`;
  need(existsSync(file) && statSync(file).size > 10000, `música ausente ou vazia: ${path}`);
}
need(existsSync('dist/audio/CREDITS.md'), 'créditos das músicas ausentes');
notes.push(`músicas: ${audioPaths.length} faixas sob demanda (12 Vila, 9 Survival)`);

for (const file of ['ocr/worker.min.js', 'ocr/lang/eng.traineddata.gz', 'ocr/core/tesseract-core-simd-lstm.wasm.js']) {
  need(existsSync(`dist/${file}`), `arquivo do OCR ausente: ${file}`);
}

// Índice de ilustrações é opcional: só informa o que foi publicado (e confere que o par de arquivos combina).
if (existsSync('dist/data/art-index.json') && existsSync('dist/data/art-index.bin')) {
  const meta = JSON.parse(readFileSync('dist/data/art-index.json', 'utf8'));
  const binSize = statSync('dist/data/art-index.bin').size;
  need(binSize === meta.ids.length * 112, `índice de ilustrações inconsistente (${binSize} bytes para ${meta.ids.length} cartas)`);
  notes.push(`índice de ilustrações: ${meta.ids.length} cartas, ${(binSize / 1024).toFixed(0)} kB, gerado em ${meta.generatedAt}`);
} else {
  notes.push('índice de ilustrações: não publicado (opção "busca pela ilustração" sem efeito)');
}

const indexPath = 'dist/data/catalog-index.json';
if (existsSync(indexPath)) {
  const raw = readFileSync(indexPath);
  const data = JSON.parse(raw.toString('utf8'));
  const cards = data.sets.reduce((sum, s) => sum + s.cards.length, 0);
  const gz = gzipSync(raw).length;
  notes.push(`índice do catálogo: ${data.sets.length} sets, ${cards} cartas, ${(statSync(indexPath).size / 1024).toFixed(0)} kB (${(gz / 1024).toFixed(0)} kB gzip), gerado em ${data.generatedAt}`);
  need(data.sets.length >= 100 && cards >= 10000, 'índice do catálogo pequeno demais (geração incompleta?)');
  need(gz < 1024 * 1024, 'índice do catálogo passou de 1 MB gzip');
} else if (requireIndex) {
  problems.push('índice do catálogo ausente (REQUIRE_INDEX=1)');
} else {
  notes.push('índice do catálogo ausente (build sem rede): o app usa a busca por número do TCGdex');
}

const spriteManifestPath = 'dist/data/pokeapi-sprite-manifest.json';
if (existsSync(spriteManifestPath)) {
  const spriteManifest = JSON.parse(readFileSync(spriteManifestPath, 'utf8'));
  const assets = spriteManifest?.assets;
  need(spriteManifest?.version === 1 && assets && typeof assets === 'object', 'manifesto dos sprites PokéAPI inválido');
  const entries = assets && typeof assets === 'object' ? Object.entries(assets) : [];
  let listedBytes = 0;
  for (const [key, asset] of entries) {
    const path = typeof asset?.path === 'string' ? asset.path : '';
    const bytes = typeof asset?.bytes === 'number' ? asset.bytes : -1;
    const file = `dist/${path}`;
    need(path.startsWith('sprites/pokeapi/') && existsSync(file), `sprite listado ausente do dist: ${key}`);
    if (existsSync(file) && bytes >= 0) need(statSync(file).size === bytes, `tamanho inesperado para sprite: ${key}`);
    listedBytes += Math.max(0, bytes);
  }
  notes.push(`sprites PokéAPI: ${entries.length} arquivos, ${(listedBytes / 1024 / 1024).toFixed(1)} MB, revisão ${spriteManifest?.source?.commit ?? 'desconhecida'}`);
} else if (requireSpritePack) {
  problems.push('manifesto dos sprites PokéAPI ausente (REQUIRE_SPRITE_PACK=1)');
} else {
  notes.push('sprites PokéAPI: não publicados neste build');
}

// GitHub Pages aceita no máximo 1 GB para o site publicado. Mede o conteúdo real do dist, não o zip do artifact.
function dirBytes(path) {
  return readdirSync(path, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + statSync(`${entry.parentPath}/${entry.name}`).size, 0);
}
const distBytes = dirBytes('dist');
notes.push(`dist completo: ${(distBytes / 1024 / 1024).toFixed(1)} MB`);
need(distBytes < 900 * 1024 * 1024, `dist passou do orçamento de segurança de 900 MB (${(distBytes / 1024 / 1024).toFixed(1)} MB)`);
// Aviso antecipado (não falha o build): o orçamento acaba em 900 MB e o limite real do Pages é 1 GB.
const SIZE_WARN_BYTES = 780 * 1024 * 1024;
if (distBytes >= SIZE_WARN_BYTES && distBytes < 900 * 1024 * 1024) {
  console.log(`::warning title=dist perto do limite::O dist tem ${(distBytes / 1024 / 1024).toFixed(0)} MB; o orçamento é 900 MB (limite do Pages: 1 GB). Reduza sprites ou áudio antes de acrescentar mais arquivos.`);
}
// Resumo da execução no GitHub Actions: deixa a folga visível a cada deploy.
if (process.env.GITHUB_STEP_SUMMARY) {
  const used = distBytes / 1024 / 1024;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Tamanho do dist

${used.toFixed(1)} MB de 900 MB de orçamento (folga de ${(900 - used).toFixed(1)} MB; limite do Pages: 1 GB).
`);
}

for (const note of notes) console.log(`ok: ${note}`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`ERRO: ${problem}`);
  process.exit(1);
}
console.log('dist/ conferido.');
