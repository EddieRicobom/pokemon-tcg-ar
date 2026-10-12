/**
 * Verificação com rede de verdade da API REST v2 do TCGdex e do CDN de imagens.
 *
 * Roda no workflow "Verificação externa" (o ambiente de desenvolvimento não alcança
 * api.tcgdex.net). Imprime um JSON com o que foi medido e, no GitHub Actions, também
 * anotações `::notice::` para que o resultado possa ser lido sem baixar logs.
 *
 *   node scripts/verify-tcgdex.ts [saida.json]
 *
 * Mede: status, CORS (com cabeçalho Origin do GitHub Pages), tamanho, tempo, cabeçalhos de
 * limite de uso, forma dos JSONs, sintaxe de filtro/paginação e rajada de requisições.
 */
import { writeFileSync } from 'node:fs';

const API = 'https://api.tcgdex.net/v2';
const ORIGIN = 'https://eddiericobom.github.io';
const OUT = process.argv[2];

interface Probe {
  label: string;
  url: string;
  status: number | 'erro-de-rede';
  ms: number;
  bytes?: number;
  contentType?: string | null;
  contentEncoding?: string | null;
  acao?: string | null;
  cacheControl?: string | null;
  rateHeaders?: Record<string, string>;
  note?: string;
  json?: unknown;
}

async function probe(label: string, url: string, keepJson = false): Promise<Probe> {
  const started = performance.now();
  try {
    const response = await fetch(url, { headers: { Origin: ORIGIN } });
    const buffer = await response.arrayBuffer();
    const rateHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (/rate|limit|retry|quota/i.test(key)) rateHeaders[key] = value;
    });
    const result: Probe = {
      label,
      url,
      status: response.status,
      ms: Math.round(performance.now() - started),
      bytes: buffer.byteLength,
      contentType: response.headers.get('content-type'),
      contentEncoding: response.headers.get('content-encoding'),
      acao: response.headers.get('access-control-allow-origin'),
      cacheControl: response.headers.get('cache-control'),
      rateHeaders,
    };
    if ((response.headers.get('content-type') ?? '').includes('json')) {
      try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(buffer));
        if (keepJson) result.json = parsed;
        result.note = describe(parsed);
      } catch {
        result.note = 'JSON inválido';
      }
    }
    return result;
  } catch (error) {
    return {
      label,
      url,
      status: 'erro-de-rede',
      ms: Math.round(performance.now() - started),
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

function describe(value: unknown): string {
  if (Array.isArray(value)) {
    const first = value[0];
    return `array(${value.length})${first && typeof first === 'object' ? ' chaves=' + Object.keys(first).join(',') : ''}`;
  }
  if (value && typeof value === 'object') return 'objeto chaves=' + Object.keys(value).join(',');
  return typeof value;
}

const report: Record<string, unknown> = { checkedAt: new Date().toISOString(), origin: ORIGIN };
const probes: Probe[] = [];
const add = async (label: string, url: string, keepJson = false) => {
  const p = await probe(label, url, keepJson);
  probes.push(p);
  return p;
};

// Idiomas
for (const lang of ['en', 'pt', 'pt-br', 'ja']) {
  await add(`sets (${lang})`, `${API}/${lang}/sets`);
}

// Lista de sets e detalhe
const setsProbe = await add('sets (en) completo', `${API}/en/sets`, true);
const sets = Array.isArray(setsProbe.json) ? (setsProbe.json as Record<string, unknown>[]) : [];
report.setCount = sets.length;
report.setSample = sets.slice(0, 2);
delete setsProbe.json;

const base1 = await add('set base1', `${API}/en/sets/base1`, true);
const base1Json = (base1.json ?? {}) as Record<string, unknown>;
report.setDetailKeys = Object.keys(base1Json);
report.setDetailSample = { ...base1Json, cards: undefined, cardsCount: Array.isArray(base1Json.cards) ? base1Json.cards.length : null };
report.setDetailCardSample = Array.isArray(base1Json.cards) ? (base1Json.cards as unknown[]).slice(0, 2) : null;
delete base1.json;

// Cartas
const cardIds = ['base1-58', 'base1-4', 'sv01-025', 'swsh1-65', 'sv03.5-025'];
let imageBase: string | undefined;
for (const id of cardIds) {
  const p = await add(`carta ${id}`, `${API}/en/cards/${id}`, true);
  const json = (p.json ?? {}) as Record<string, unknown>;
  if (id === 'base1-58') {
    report.cardKeys = Object.keys(json);
    report.cardBase158 = { id: json.id, localId: json.localId, name: json.name, image: json.image, dexId: json.dexId, set: json.set, variants: json.variants, rarity: json.rarity };
    imageBase = typeof json.image === 'string' ? json.image : undefined;
  }
  report[`card_${id}`] = { name: json.name, dexId: json.dexId, image: json.image, variants: json.variants };
  delete p.json;
}
await add('carta inexistente', `${API}/en/cards/zzz-999`);

// Sintaxe de busca
const queries: [string, string][] = [
  ['name=Pikachu', 'cards?name=Pikachu'],
  ['name eq: Pikachu', 'cards?name=eq:Pikachu'],
  ['localId=25', 'cards?localId=25'],
  ['localId eq:025', 'cards?localId=eq:025'],
  ['id contém sv01', 'cards?id=sv01-025'],
  ['paginação', 'cards?name=Pikachu&pagination:page=1&pagination:itemsPerPage=5'],
  ['ordenação', 'cards?name=Pikachu&sort:field=localId&sort:order=ASC&pagination:itemsPerPage=3'],
  ['dexId', 'cards?dexId=25&pagination:itemsPerPage=3'],
  ['set.id', 'cards?set.id=eq:base1'],
  ['set.cardCount.official', 'cards?set.cardCount.official=102&localId=58'],
];
for (const [label, query] of queries) {
  const p = await add(`busca: ${label}`, `${API}/en/${query}`, true);
  const json = p.json;
  p.note = `${p.note ?? ''}${Array.isArray(json) ? ` ids=${(json as { id?: string }[]).slice(0, 5).map((c) => c.id).join('|')}` : ''}`;
  delete p.json;
}

// Imagens
if (imageBase) {
  for (const suffix of ['low.webp', 'high.webp', 'low.png', 'high.png', 'low.jpg']) {
    await add(`imagem ${suffix}`, `${imageBase}/${suffix}`);
  }
}
report.imageBase = imageBase;

// Rajada
const burstStarted = performance.now();
const burstIds = Array.from({ length: 40 }, (_, index) => `base1-${index + 1}`);
const burst = await Promise.all(burstIds.map((id) => probe(`rajada ${id}`, `${API}/en/cards/${id}`)));
const statuses: Record<string, number> = {};
for (const item of burst) statuses[String(item.status)] = (statuses[String(item.status)] ?? 0) + 1;
report.burst = {
  requests: burst.length,
  statuses,
  totalMs: Math.round(performance.now() - burstStarted),
  rateHeaders: burst.find((item) => Object.keys(item.rateHeaders ?? {}).length > 0)?.rateHeaders ?? null,
  medianMs: [...burst.map((b) => b.ms)].sort((a, b) => a - b)[Math.floor(burst.length / 2)],
};

report.probes = probes;
const json = JSON.stringify(report, null, 2);
if (OUT) writeFileSync(OUT, json);
console.log(json);

if (process.env.GITHUB_ACTIONS) {
  const compact = probes.map((p) => `${p.label} => ${p.status} ${p.ms}ms ${p.bytes ?? '-'}B acao=${p.acao ?? '-'} enc=${p.contentEncoding ?? '-'} ${p.note ?? ''}`);
  console.log(`::notice title=TCGdex sondas (1/3)::${compact.slice(0, 18).join('%0A')}`);
  console.log(`::notice title=TCGdex sondas (2/3)::${compact.slice(18).join('%0A')}`);
  const summary = { ...report, probes: undefined, setSample: undefined, setDetailSample: undefined };
  console.log(`::notice title=TCGdex resumo (3/3)::${JSON.stringify(summary).replace(/\n/g, ' ').slice(0, 3500)}`);
}
