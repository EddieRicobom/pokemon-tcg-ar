/**
 * Gera o índice de ilustrações (opcional) no GitHub Actions: para cada carta do catálogo, baixa a imagem de referência
 * `low.webp` do TCGdex (a mesma que o app usa), calcula as MESMAS características do app (`computeFeatures`) e grava
 * 112 bytes por carta em `public/data/art-index.bin` (+ `art-index.json` com os ids). O celular nunca baixa essas imagens.
 *
 * É incremental: `.cache/art-index/` (guardado com actions/cache) mantém o que já foi calculado, e cada execução tem um
 * orçamento de tempo (ART_BUDGET_MIN, padrão 14). Se não terminar tudo, grava o que tem e continua na próxima execução;
 * o app usa o que estiver no índice. Falhas isoladas de imagem são ignoradas e tentadas de novo na execução seguinte.
 *
 *   npm run build:index && npm run build:art-index
 *   ART_LIMIT=50 npm run build:art-index   # teste rápido
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { ART_RECORD_BYTES, ArtIndex, encodeRecord, packArtIndex } from '../src/recognition/art-index.ts';
import type { ArtIndexMeta } from '../src/recognition/art-index.ts';
import { computeFeatures, FEATURE_VERSION } from '../src/recognition/hash.ts';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../src/recognition/types.ts';

const API = 'https://api.tcgdex.net/v2';
const CATALOG = process.env.CATALOG ?? 'public/data/catalog-index.json';
const OUT_DIR = process.env.OUT_DIR ?? 'public/data';
const CACHE_DIR = process.env.CACHE_DIR ?? '.cache/art-index';
const BUDGET_MS = Number(process.env.ART_BUDGET_MIN ?? 14) * 60_000;
const LIMIT = process.env.ART_LIMIT ? Number(process.env.ART_LIMIT) : Infinity;
const CONCURRENCY = 12;
const started = Date.now();

async function getJson<T>(url: string, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      if (attempt >= attempts) throw new Error(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
}

async function getBuffer(url: string, attempts = 3): Promise<Buffer | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++] as T);
    }),
  );
}

interface CatalogFile {
  sets: { id: string; cards: [string, string, string?][] }[];
}

if (!existsSync(CATALOG)) throw new Error(`Índice do catálogo não encontrado (${CATALOG}). Rode "npm run build:index" antes.`);
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as CatalogFile;
const wanted = new Set(catalog.sets.flatMap((set) => set.cards.map(([localId]) => `${set.id}-${localId}`)));

// Já calculado em execuções anteriores (se as características forem da mesma versão).
const records = new Map<string, Uint8Array>();
const cachedMetaPath = `${CACHE_DIR}/art-index.json`;
const cachedBinPath = `${CACHE_DIR}/art-index.bin`;
if (existsSync(cachedMetaPath) && existsSync(cachedBinPath)) {
  const meta = JSON.parse(readFileSync(cachedMetaPath, 'utf8')) as ArtIndexMeta;
  const bin = readFileSync(cachedBinPath);
  if (ArtIndex.from(meta, bin)) {
    meta.ids.forEach((id, i) => {
      if (wanted.has(id)) records.set(id, new Uint8Array(bin.subarray(i * ART_RECORD_BYTES, (i + 1) * ART_RECORD_BYTES)));
    });
  } else {
    console.log('Cache do índice ignorado (versão ou tamanho incompatível).');
  }
}
const reused = records.size;

// Base da imagem de cada carta (a lista de cartas do set traz `image`).
const setBriefs = await getJson<{ id: string }[]>(`${API}/en/sets`);
const images = new Map<string, string>();
await mapLimit(setBriefs, 8, async (brief) => {
  const detail = await getJson<{ id: string; cards?: { localId: string; image?: string }[] }>(`${API}/en/sets/${encodeURIComponent(brief.id)}`);
  for (const card of detail.cards ?? []) if (card.image) images.set(`${detail.id}-${card.localId}`, card.image);
});

const todo = [...wanted].filter((id) => !records.has(id) && images.has(id)).slice(0, LIMIT);
const noImage = [...wanted].filter((id) => !images.has(id)).length;
let done = 0;
let failed = 0;
let stoppedByBudget = false;

await mapLimit(todo, CONCURRENCY, async (id) => {
  if (Date.now() - started > BUDGET_MS) {
    stoppedByBudget = true;
    return;
  }
  try {
    const buffer = await getBuffer(`${images.get(id)}/low.webp`);
    if (!buffer) {
      failed++;
      return;
    }
    // Mesmo tamanho (630×880) em que o app decodifica a referência antes de calcular as características.
    const { data, info } = await sharp(buffer).resize(CARD_WIDTH_PX, CARD_HEIGHT_PX, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const features = computeFeatures({ width: info.width, height: info.height, data: new Uint8ClampedArray(data) });
    const record = new Uint8Array(ART_RECORD_BYTES);
    encodeRecord(features, record);
    records.set(id, record);
    done++;
    if (done % 1000 === 0) console.log(`  ${done}/${todo.length} (${Math.round((Date.now() - started) / 1000)} s)`);
  } catch {
    failed++;
  }
});

const entries = [...records.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, record]) => ({ id, record }));
const { meta, bin } = packArtIndex(entries, new Date().toISOString());
for (const dir of [OUT_DIR, CACHE_DIR]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/art-index.json`, JSON.stringify(meta));
  writeFileSync(`${dir}/art-index.bin`, bin);
}

const stats = {
  featureVersion: FEATURE_VERSION,
  catalogCards: wanted.size,
  inIndex: entries.length,
  coveragePct: Math.round((entries.length / Math.max(1, wanted.size)) * 1000) / 10,
  reusedFromCache: reused,
  computedNow: done,
  failed,
  withoutImage: noImage,
  stoppedByBudget,
  binBytes: bin.byteLength,
  seconds: Math.round((Date.now() - started) / 100) / 10,
};
console.log(JSON.stringify(stats));
if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Índice de ilustrações::${JSON.stringify(stats)}`);
