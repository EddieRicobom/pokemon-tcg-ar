import type { ParsedBottom } from './parse-ocr';
import type { CandidateInfo } from './ranking';
import { nameSimilarity, normalizeName, normalizeSearch } from './text';
import { cardImageUrl, TCGDEX_ASSETS } from './tcgdex';

/**
 * Índice estático gerado no GitHub Actions (`scripts/build-catalog-index.ts`). Não é o catálogo:
 * só ids, nomes e contagens, o suficiente para transformar "número/total" em ids candidatos
 * sem consultar a API. Medido no CI em 2026-10-11: 220 sets, 23.736 cartas, 568 kB (155 kB gzip).
 */
export interface IndexSet {
  id: string;
  name: string;
  ptName?: string;
  official: number;
  total: number;
  release?: string;
  code?: string;
  /** Série da coleção no TCGdex (índices antigos não trazem: a busca manual fica sem miniatura). */
  serie?: string;
  /** Idioma da coleção quando não é a inglesa (`ja`: só existe no Japão; nomes em japonês). Ausente = inglês. */
  lang?: string;
  /**
   * [localId, nome, nome alternativo (português; ou inglês nas coleções japonesas), dexId].
   * O dexId só vem nas coleções japonesas, onde o TCGdex muitas vezes não informa a espécie (cartas ex).
   */
  cards: [string, string, string?, number?][];
}

export interface CatalogIndexData {
  version: number;
  generatedAt: string;
  sets: IndexSet[];
}

export interface IndexCandidate extends CandidateInfo {
  release?: string;
  /** Nota provisória para ordenar antes de baixar qualquer dado. */
  prior: number;
}

/** Dígitos que o OCR costuma confundir entre si em fonte pequena. */
const CONFUSABLE: Record<string, string[]> = {
  '0': ['8', '6', '9'], '1': ['7'], '2': ['7'], '3': ['8', '5'], '4': ['9'],
  '5': ['6', '3', '8'], '6': ['8', '5', '0'], '7': ['1'], '8': ['0', '6', '3', '9'], '9': ['4', '8', '0'],
};

/** Números que diferem do lido por um dígito confundível (sem repetir o original). */
export function digitVariants(value: number): number[] {
  const digits = String(value);
  const out = new Set<number>();
  for (let i = 0; i < digits.length; i++) {
    for (const replacement of CONFUSABLE[digits[i] ?? ''] ?? []) {
      const variant = Number.parseInt(digits.slice(0, i) + replacement + digits.slice(i + 1), 10);
      if (variant > 0 && variant !== value) out.add(variant);
    }
  }
  return [...out];
}

function parseLocalId(localId: string): { prefix: string; value: number } | null {
  const match = /^([A-Za-z]*)0*(\d+)$/.exec(localId);
  if (!match) return null;
  return { prefix: (match[1] ?? '').toUpperCase(), value: Number.parseInt(match[2] ?? '0', 10) };
}

/** Carta do índice com o número já parseado no construtor (evita regex em cada varredura). */
interface CardEntry {
  localId: string;
  name: string;
  ptName: string | undefined;
  dexId: number | undefined;
  /** Prefixo em maiúsculas; null quando o localId não é numérico (ex.: "SWSH001a"). */
  prefix: string | null;
  value: number;
  /** Posição dentro do set: restaura a ordem de inserção ao mesclar buckets do Map. */
  order: number;
}

/** Resultado da busca manual (só o que a lista mostra). */
export interface ManualMatch {
  id: string;
  name: string;
  /** Nome em outro idioma (inglês nas cartas japonesas, português nas demais): a busca "traduz" o nome. */
  altName?: string;
  setName: string;
  localId: string;
  setOfficial: number;
  release?: string;
  /** Miniatura da carta no CDN do TCGdex; ausente quando o índice não sabe a série (nada de endereço inventado). */
  thumb?: string;
}

export class CatalogLookup {
  readonly generatedAt: string;
  readonly cardCount: number;

  /** Cartas de cada set na ordem original e índice `prefixo:valor` → cartas (também na ordem original). */
  private readonly cardsBySet: CardEntry[][] = [];
  private readonly numbersBySet: Map<string, CardEntry[]>[] = [];

  constructor(private readonly data: CatalogIndexData) {
    this.generatedAt = data.generatedAt;
    let cardCount = 0;
    for (const set of data.sets) {
      const entries: CardEntry[] = [];
      const byNumber = new Map<string, CardEntry[]>();
      for (const [localId, name, ptName, dexId] of set.cards) {
        const local = parseLocalId(localId);
        const entry: CardEntry = {
          localId,
          name,
          ptName,
          dexId,
          prefix: local ? local.prefix : null,
          value: local ? local.value : 0,
          order: entries.length,
        };
        entries.push(entry);
        if (local) {
          const key = `${local.prefix}:${local.value}`;
          const bucket = byNumber.get(key);
          if (bucket) bucket.push(entry);
          else byNumber.set(key, [entry]);
        }
      }
      this.cardsBySet.push(entries);
      this.numbersBySet.push(byNumber);
      cardCount += set.cards.length;
    }
    this.cardCount = cardCount;
  }

  get setCount(): number {
    return this.data.sets.length;
  }

  /**
   * Ids candidatos a partir do que o OCR leu. Com número: todas as cartas daquele número em sets cujo
   * total oficial bate (ou qualquer set, se o total não foi lido), ordenadas por evidência.
   * Sem número: só por nome (candidatos fracos, limitados).
   */
  candidates(bottom: ParsedBottom, nameGuesses: string[], limit = 8): IndexCandidate[] {
    return this.candidatesWithTotal(bottom, nameGuesses, limit).list;
  }

  /**
   * Como `candidates`, mas também diz quantas cartas do índice combinaram ANTES do corte em `limit` — para a
   * interface avisar que há mais (ex.: número sem total bate em dezenas de coleções) e oferecer a busca manual,
   * em vez de esconder em silêncio as que não foram baixadas.
   */
  candidatesWithTotal(bottom: ParsedBottom, nameGuesses: string[], limit = 8): { list: IndexCandidate[]; total: number } {
    const result: IndexCandidate[] = [];
    const number = bottom.number;
    const nameKeys = nameGuesses.map(normalizeName).filter(Boolean);
    // Número com total lido fecha o set: exige correspondência exata de número (o nome só reforça). O nome só
    // amplia a busca ("busca combinada") quando o número veio isolado (sem total) ou não foi lido — aí entram
    // também cartas achadas só pelo nome. Com total, um dígito mal lido é tratado pela rodada de variantes
    // (números parecidos), não aqui.
    const strictNumber = !!(number && number.total);
    const numberPrefix = number?.prefix.toUpperCase() ?? '';
    const setCode = bottom.setCode?.toUpperCase() ?? '';

    for (let index = 0; index < this.data.sets.length; index++) {
      const set = this.data.sets[index]!;
      let setPrior = 0;
      if (number?.total && number.total.prefix === '') {
        if (set.official === number.total.value || set.total === number.total.value) {
          setPrior += 0.4;
        } else if (Math.abs(set.official - number.total.value) <= 2) {
          setPrior += 0.2;
        }
      }
      if (setCode && set.code && set.code.toUpperCase() === setCode) setPrior += 0.2;

      // Sem nome útil (ou com número e sem nomes), a única porta é o número: o Map do set evita varrer as cartas.
      if (number && (strictNumber || nameKeys.length === 0)) {
        const matched = this.numbersBySet[index]!.get(`${numberPrefix}:${number.value}`);
        if (!matched) continue;
        for (const card of matched) {
          // Set certo, número certo: segue. O nome, quando existe, só reforça o prior.
          let prior = setPrior + 0.3;
          if (nameGuesses.length > 0) prior += this.bestSimilarity(nameGuesses, card) * 0.4;
          result.push(this.candidateFrom(set, card, prior));
        }
        continue;
      }
      if (!number && nameKeys.length === 0) continue;

      // Nome participa (busca combinada ou só nome): varredura completa, mas sem regex por carta.
      for (const card of this.cardsBySet[index]!) {
        const numberMatched = !!number && card.prefix === numberPrefix && card.value === number.value;
        let prior = setPrior;
        if (numberMatched) prior += 0.3;
        const similarity = this.bestSimilarity(nameGuesses, card);
        if (!numberMatched && similarity < 0.75) continue;
        prior += similarity * 0.4;
        result.push(this.candidateFrom(set, card, prior));
      }
    }
    // Mais evidência primeiro; em empate, a coleção mais recente.
    result.sort((a, b) => b.prior - a.prior || (b.release ?? '').localeCompare(a.release ?? ''));
    return { list: result.slice(0, limit), total: result.length };
  }

  /** Monta a candidata com os mesmos campos/ordem de antes (o `dexId` só entra quando existe). */
  private candidateFrom(set: IndexSet, card: CardEntry, prior: number): IndexCandidate {
    return {
      id: `${set.id}-${card.localId}`,
      setId: set.id,
      localId: card.localId,
      name: card.name,
      altNames: card.ptName ? [card.ptName] : undefined,
      setOfficial: set.official,
      setTotal: set.total,
      setCode: set.code,
      release: set.release,
      ...(card.dexId ? { dexId: card.dexId } : {}),
      prior,
    };
  }

  /** Maior semelhança entre os palpites e o nome (e o alternativo) da carta — mesma conta de antes. */
  private bestSimilarity(nameGuesses: string[], card: CardEntry): number {
    let best = 0;
    for (const guess of nameGuesses) {
      best = Math.max(best, nameSimilarity(guess, card.name), card.ptName ? nameSimilarity(guess, card.ptName) : 0);
    }
    return best;
  }

  /**
   * Segunda rodada, quando as candidatas exatas não se confirmaram: cartas cujo número (e/ou total) difere do
   * que o OCR leu só por dígitos facilmente confundidos. Marcadas como `viaVariant` (crédito parcial de metadados);
   * quem decide é a comparação visual. Nunca repete ids já tentados.
   */
  variantCandidates(bottom: ParsedBottom, nameGuesses: string[], excludeIds: ReadonlySet<string>, limit = 6): IndexCandidate[] {
    const number = bottom.number;
    if (!number) return [];
    const numberValues = new Map<number, number>([[number.value, 0]]);
    for (const v of digitVariants(number.value)) numberValues.set(v, 1);
    const totalValues = new Map<number, number>();
    if (number.total && number.total.prefix === '') {
      totalValues.set(number.total.value, 0);
      for (const v of digitVariants(number.total.value)) totalValues.set(v, 1);
    }
    const result: IndexCandidate[] = [];
    const numberPrefix = number.prefix.toUpperCase();
    const values = [...numberValues.keys()];
    for (let index = 0; index < this.data.sets.length; index++) {
      const set = this.data.sets[index]!;
      let changed = 0;
      if (totalValues.size > 0) {
        const penalty = totalValues.get(set.official);
        if (penalty === undefined) continue;
        changed += penalty;
      }
      // Junta os buckets dos números procurados e devolve a ordem original das cartas no set.
      const byNumber = this.numbersBySet[index]!;
      const matched: CardEntry[] = [];
      for (const value of values) {
        const bucket = byNumber.get(`${numberPrefix}:${value}`);
        if (bucket) matched.push(...bucket);
      }
      if (matched.length === 0) continue;
      if (matched.length > 1) matched.sort((a, b) => a.order - b.order);
      for (const card of matched) {
        const id = `${set.id}-${card.localId}`;
        if (excludeIds.has(id)) continue;
        const numberPenalty = numberValues.get(card.value)!;
        let prior = 0.3 - 0.1 * (changed + numberPenalty);
        if (nameGuesses.length > 0) prior += this.bestSimilarity(nameGuesses, card) * 0.3;
        result.push({ ...this.candidateFrom(set, card, prior), viaVariant: true });
      }
    }
    result.sort((a, b) => b.prior - a.prior || (b.release ?? '').localeCompare(a.release ?? ''));
    return result.slice(0, limit);
  }

  /**
   * Busca manual (o usuário digita): nome (contém, sem acento/caixa) e/ou número da carta. Não é reconhecimento:
   * só lista cartas do índice para a pessoa escolher. Mais recentes primeiro, nome exato antes de parcial.
   */
  search(query: string, number?: number, limit = 30): ManualMatch[] {
    return this.searchPage(query, number, limit).matches;
  }

  /**
   * Busca manual com o total de resultados: a lista mostra os primeiros `limit` e diz quantos existem ("mostrar mais").
   * O nome pode ser digitado em inglês, português ou japonês (kana/kanji). Digitar em japonês também acha as cartas em
   * inglês da mesma espécie: o índice sabe, pelas cartas japonesas, qual é o nome em inglês de cada espécie.
   */
  searchPage(query: string, number?: number, limit = 30): { matches: ManualMatch[]; total: number } {
    const q = normalizeSearch(query);
    if (!q && number === undefined) return { matches: [], total: 0 };
    const queries = q ? [q, ...this.translations(q)] : [];
    const out: (ManualMatch & { exact: boolean })[] = [];
    for (const set of this.data.sets) {
      for (const [localId, name, altName] of set.cards) {
        if (number !== undefined && parseLocalId(localId)?.value !== number) continue;
        let exact = false;
        if (q) {
          const names = [name, ...(altName ? [altName] : [])].map(normalizeSearch);
          exact = queries.some((x) => names.includes(x));
          if (!exact && !queries.some((x) => names.some((n) => n.includes(x))) && !names.some((n) => nameSimilarity(query, n) >= 0.85)) continue;
        }
        const thumb = set.serie ? cardImageUrl(`${TCGDEX_ASSETS}/${set.lang ?? 'en'}/${set.serie}/${set.id}/${localId}`, 'low', 'webp') : undefined;
        out.push({ id: `${set.id}-${localId}`, name, ...(altName && altName !== name ? { altName } : {}), setName: set.name, localId, setOfficial: set.official, release: set.release, ...(thumb ? { thumb } : {}), exact });
      }
    }
    out.sort((a, b) => Number(b.exact) - Number(a.exact) || (b.release ?? '').localeCompare(a.release ?? ''));
    return { matches: out.slice(0, limit).map(({ exact: _exact, ...match }) => match), total: out.length };
  }

  private jaToEn: Map<string, string> | null = null;

  /** Nomes em inglês (sem o sufixo ex/V/VMAX…) das cartas japonesas cujo nome contém `q`; vazio se `q` não é japonês. */
  private translations(q: string): string[] {
    if (!/[\u30a0-\u30ff\u4e00-\u9fff]/.test(q)) return [];
    if (!this.jaToEn) {
      this.jaToEn = new Map();
      for (const set of this.data.sets) {
        if (set.lang !== 'ja') continue;
        for (const [, name, altName] of set.cards) {
          if (!altName) continue;
          const en = normalizeSearch(altName).replace(/(vstar|vmax|vunion|ex|gx|v)$/, '');
          if (en.length >= 3) this.jaToEn.set(normalizeSearch(name), en);
        }
      }
    }
    const out = new Set<string>();
    for (const [ja, en] of this.jaToEn) {
      if (ja.includes(q)) out.add(en);
      if (out.size >= 12) break;
    }
    return [...out];
  }

  /** Índice id → (set, carta); a candidata é montada só para o id pedido (alguns por busca, não 23,7 mil objetos). */
  private byIdLookup: Map<string, { set: IndexSet; card: CardEntry }> | null = null;

  /** Dados do índice de uma carta pelo id (usado para transformar um palpite visual em candidata). */
  byId(id: string): IndexCandidate | null {
    if (!this.byIdLookup) {
      this.byIdLookup = new Map();
      for (let index = 0; index < this.data.sets.length; index++) {
        const set = this.data.sets[index]!;
        for (const card of this.cardsBySet[index]!) this.byIdLookup.set(`${set.id}-${card.localId}`, { set, card });
      }
    }
    const found = this.byIdLookup.get(id);
    return found ? this.candidateFrom(found.set, found.card, 0.2) : null;
  }

  private idSet: Set<string> | null = null;

  hasCard(id: string): boolean {
    if (!this.idSet) {
      this.idSet = new Set();
      for (const set of this.data.sets) {
        for (const [localId] of set.cards) this.idSet.add(`${set.id}-${localId}`);
      }
    }
    return this.idSet.has(id);
  }
}

export async function loadCatalogIndex(url: string, fetchImpl: typeof fetch = fetch): Promise<CatalogLookup | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const data = (await response.json()) as CatalogIndexData;
    if (!data || !Array.isArray(data.sets)) return null;
    return new CatalogLookup(data);
  } catch {
    return null;
  }
}
