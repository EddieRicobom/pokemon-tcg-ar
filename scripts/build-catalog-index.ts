/**
 * Gera o índice estático de reconhecimento a partir da API REST v2 do TCGdex.
 *
 * Roda só no GitHub Actions (build/agendado); o app baixa o resultado como um arquivo estático do
 * GitHub Pages. O índice NÃO é o catálogo: guarda apenas, por coleção (set), os dados mínimos
 * para transformar "número impresso + total do set" em ids candidatos sem consultar a API:
 * id, nome, contagens oficial/total, data, código do set e [localId, nome] de cada carta.
 * Dados completos, imagens e dexId são buscados só das cartas candidatas, sob demanda.
 *
 *   node scripts/build-catalog-index.ts public/data/catalog-index.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

const API = 'https://api.tcgdex.net/v2';
const OUT = process.argv[2] ?? 'public/data/catalog-index.json';
// O TCGdex atende muitas coleções em sequência. Um limite moderado evita que uma
// rajada do Actions provoque respostas 503 e impede publicar um índice parcial.
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 6;

let requests = 0;
let downloadedBytes = 0;

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get('retry-after');
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) return retryAfterSeconds * 1_000;

  // 1 s, 2 s, 4 s, 8 s e 16 s. Dá tempo ao serviço se recuperar sem tornar
  // falhas permanentes (como 404) artificialmente lentas.
  return Math.min(1_000 * 2 ** (attempt - 1), 16_000);
}

async function getJson<T>(url: string, attempts = MAX_ATTEMPTS): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let response: Response | undefined;
    try {
      requests++;
      response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      downloadedBytes += buffer.byteLength;
      return JSON.parse(new TextDecoder().decode(buffer)) as T;
    } catch (error) {
      if (attempt >= attempts) throw new Error(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      // Não repete 4xx definitivos. Para 429/5xx e indisponibilidade de rede,
      // faz backoff exponencial e preserva a exigência de um índice completo.
      if (response && response.status < 500 && response.status !== 429) {
        throw new Error(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
      const delay = retryDelay(response, attempt);
      console.warn(`Tentativa ${attempt}/${attempts} falhou para ${url}; nova tentativa em ${delay} ms.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

interface SetBrief {
  id: string;
  name: string;
}
interface SetDetail {
  id: string;
  name: string;
  releaseDate?: string;
  tcgOnline?: string;
  /** Série da coleção: o TCGdex monta o endereço da imagem de cada carta com ela. */
  serie?: { id?: string };
  abbreviation?: { official?: string; normal?: string };
  cardCount?: { official?: number; total?: number };
  cards?: { id: string; localId: string; name: string }[];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index] as T);
      }
    }),
  );
  return results;
}

const started = Date.now();
const enSets = await getJson<SetBrief[]>(`${API}/en/sets`);
const ptSets = await getJson<SetBrief[]>(`${API}/pt/sets`);
const ptIds = new Set(ptSets.map((s) => s.id));

const enDetails = await mapLimit(enSets, CONCURRENCY, (s) => getJson<SetDetail>(`${API}/en/sets/${encodeURIComponent(s.id)}`));
const ptDetails = new Map<string, SetDetail>();
await mapLimit(
  enSets.filter((s) => ptIds.has(s.id)),
  CONCURRENCY,
  async (s) => {
    ptDetails.set(s.id, await getJson<SetDetail>(`${API}/pt/sets/${encodeURIComponent(s.id)}`));
  },
);

const sets = enDetails.map((detail) => {
  const pt = ptDetails.get(detail.id);
  const ptNames = new Map((pt?.cards ?? []).map((c) => [c.localId, c.name]));
  return {
    id: detail.id,
    name: detail.name,
    ptName: pt && pt.name !== detail.name ? pt.name : undefined,
    official: detail.cardCount?.official ?? detail.cards?.length ?? 0,
    total: detail.cardCount?.total ?? detail.cards?.length ?? 0,
    release: detail.releaseDate,
    code: detail.abbreviation?.official ?? detail.tcgOnline,
    serie: detail.serie?.id,
    cards: (detail.cards ?? []).map((c) => {
      const ptName = ptNames.get(c.localId);
      return ptName && ptName !== c.name ? [c.localId, c.name, ptName] : [c.localId, c.name];
    }),
  };
});

// Coleções do Japão (ex.: SV8a «Terastal Fest ex», 136/187): o TCGdex em inglês/português não as tem, então sem
// elas uma carta japonesa nunca vira candidata. Só a era moderna (números impressos «136/187»), para o índice não inchar.
const JA_SINCE = '2016-01-01';
const SPECIES_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const JA_SUFFIXES: [RegExp, string][] = [
  [/VSTAR$/, ' VSTAR'], [/VMAX$/, ' VMAX'], [/V-UNION$/, ' V-UNION'], [/GX$/, '-GX'], [/EX$/, '-EX'], [/ex$/, ' ex'], [/V$/, ' V'],
];

/** Nome em japonês (katakana) → { dexId, inglês }, a partir da lista oficial de espécies do PokéAPI (1 arquivo). */
async function loadSpeciesNames(): Promise<Map<string, { dexId: number; en: string }>> {
  const text = await (await fetch(SPECIES_CSV)).text();
  const ja = new Map<number, string>();
  const en = new Map<number, string>();
  for (const line of text.split('\n').slice(1)) {
    const [id, language, name] = line.split(',');
    if (!id || !name) continue;
    if (language === '11') ja.set(Number(id), name);
    if (language === '9') en.set(Number(id), name);
  }
  const out = new Map<string, { dexId: number; en: string }>();
  for (const [dexId, jaName] of ja) {
    const enName = en.get(dexId);
    if (enName) out.set(jaName, { dexId, en: enName });
  }
  return out;
}

const speciesNames = await loadSpeciesNames().catch((error: unknown) => {
  console.warn(`Lista de espécies indisponível (${error instanceof Error ? error.message : String(error)}); cartas japonesas ficam sem nome em inglês.`);
  return new Map<string, { dexId: number; en: string }>();
});

function jaCard(c: { localId: string; name: string }): [string, string, string?, number?] {
  for (const [pattern, suffix] of JA_SUFFIXES) {
    if (!pattern.test(c.name)) continue;
    const species = speciesNames.get(c.name.replace(pattern, ''));
    return species ? [c.localId, c.name, species.en + suffix, species.dexId] : [c.localId, c.name];
  }
  const species = speciesNames.get(c.name);
  return species ? [c.localId, c.name, species.en, species.dexId] : [c.localId, c.name];
}

const jaSetBriefs = await getJson<SetBrief[]>(`${API}/ja/sets`);
const jaDetails = await mapLimit(jaSetBriefs, CONCURRENCY, (s) => getJson<SetDetail>(`${API}/ja/sets/${encodeURIComponent(s.id)}`));
const jaSets = jaDetails
  .filter((detail) => (detail.releaseDate ?? '') >= JA_SINCE && (detail.cards?.length ?? 0) > 0)
  .map((detail) => ({
    id: detail.id,
    name: detail.name,
    lang: 'ja',
    official: detail.cardCount?.official ?? detail.cards?.length ?? 0,
    total: detail.cardCount?.total ?? detail.cards?.length ?? 0,
    release: detail.releaseDate,
    // O código impresso na carta («sv8a») é o próprio id do TCGdex nas coleções japonesas.
    code: detail.abbreviation?.official ?? detail.id,
    serie: detail.serie?.id,
    cards: (detail.cards ?? []).map(jaCard),
  }));
sets.push(...(jaSets as unknown as (typeof sets)[number][]));

const index = { version: 1, generatedAt: new Date().toISOString(), source: 'tcgdex v2', sets };
const json = JSON.stringify(index);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json);

const cardCount = sets.reduce((sum, s) => sum + s.cards.length, 0);
const stats = {
  sets: sets.length,
  cards: cardCount,
  rawBytes: Buffer.byteLength(json),
  gzipBytes: gzipSync(json).byteLength,
  requests,
  downloadedBytes,
  seconds: Math.round((Date.now() - started) / 100) / 10,
};
console.log(JSON.stringify(stats));
if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Índice do catálogo::${JSON.stringify(stats)}`);
