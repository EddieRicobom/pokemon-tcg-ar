/**
 * Confere o build de produção (pasta dist/) antes de publicar: base path no manifest e no index.html,
 * Service Worker gerado, arquivos do OCR, e (se exigido) o índice do catálogo com tamanho plausível.
 *
 *   BASE_PATH=/pokemon-tcg-ar/ REQUIRE_INDEX=1 node scripts/verify-dist.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const base = process.env.BASE_PATH ?? '/pokemon-tcg-ar/';
const requireIndex = process.env.REQUIRE_INDEX === '1';
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
  need(sw.includes('index.html'), 'Service Worker não pré-cacheia index.html');
  need(!/ocr\/worker\.min\.js/.test(sw.split('precacheAndRoute')[1] ?? ''), 'OCR não deveria estar no pré-cache da instalação');
}

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

for (const note of notes) console.log(`ok: ${note}`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`ERRO: ${problem}`);
  process.exit(1);
}
console.log('dist/ conferido.');
