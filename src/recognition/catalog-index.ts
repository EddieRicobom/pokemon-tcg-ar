import type { ParsedBottom } from './parse-ocr';
import type { CandidateInfo } from './ranking';
import { nameSimilarity, normalizeName } from './text';
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
  /** [localId, nome em inglês, nome em português (se diferente)] */
  cards: [string, string, string?][];
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

/** Resultado da busca manual (só o que a lista mostra). */
export interface ManualMatch {
  id: string;
  name: string;
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

  constructor(private readonly data: CatalogIndexData) {
    this.generatedAt = data.generatedAt;
    this.cardCount = data.sets.reduce((sum, set) => sum + set.cards.length, 0);
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

    for (const set of this.data.sets) {
      let setPrior = 0;
      if (number?.total && number.total.prefix === '') {
        if (set.official === number.total.value || set.total === number.total.value) {
          setPrior += 0.4;
        } else if (Math.abs(set.official - number.total.value) <= 2) {
          setPrior += 0.2;
        }
      }
      if (bottom.setCode && set.code && set.code.toUpperCase() === bottom.setCode.toUpperCase()) setPrior += 0.2;

      for (const [localId, name, ptName] of set.cards) {
        let prior = setPrior;
        let numberMatched = false;
        if (number) {
          const local = parseLocalId(localId);
          if (local && local.value === number.value && local.prefix === number.prefix.toUpperCase()) {
            numberMatched = true;
            prior += 0.3;
          }
        }
        if (strictNumber) {
          // Set certo, número certo: segue. Qualquer outra coisa (número não bateu) não é candidata — o nome
          // não resgata um número que já fechou errado; isso é papel da rodada de variantes, depois.
          if (!numberMatched) continue;
          if (nameGuesses.length > 0) {
            const similarity = Math.max(
              ...nameGuesses.map((guess) => Math.max(nameSimilarity(guess, name), ptName ? nameSimilarity(guess, ptName) : 0)),
            );
            prior += similarity * 0.4;
          }
        } else {
          if (!numberMatched && nameKeys.length === 0) continue;
          if (nameGuesses.length > 0) {
            const similarity = Math.max(
              ...nameGuesses.map((guess) => Math.max(nameSimilarity(guess, name), ptName ? nameSimilarity(guess, ptName) : 0)),
            );
            if (!numberMatched && similarity < 0.75) continue;
            prior += similarity * 0.4;
          } else if (!numberMatched) {
            continue;
          }
        }
        result.push({
          id: `${set.id}-${localId}`,
          setId: set.id,
          localId,
          name,
          altNames: ptName ? [ptName] : undefined,
          setOfficial: set.official,
          setTotal: set.total,
          setCode: set.code,
          release: set.release,
          prior,
        });
      }
    }
    // Mais evidência primeiro; em empate, a coleção mais recente.
    result.sort((a, b) => b.prior - a.prior || (b.release ?? '').localeCompare(a.release ?? ''));
    return { list: result.slice(0, limit), total: result.length };
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
    for (const set of this.data.sets) {
      let changed = 0;
      if (totalValues.size > 0) {
        const penalty = totalValues.get(set.official);
        if (penalty === undefined) continue;
        changed += penalty;
      }
      for (const [localId, name, ptName] of set.cards) {
        const local = parseLocalId(localId);
        if (!local || local.prefix !== number.prefix.toUpperCase()) continue;
        const numberPenalty = numberValues.get(local.value);
        if (numberPenalty === undefined) continue;
        const id = `${set.id}-${localId}`;
        if (excludeIds.has(id)) continue;
        let prior = 0.3 - 0.1 * (changed + numberPenalty);
        if (nameGuesses.length > 0) {
          const similarity = Math.max(
            ...nameGuesses.map((guess) => Math.max(nameSimilarity(guess, name), ptName ? nameSimilarity(guess, ptName) : 0)),
          );
          prior += similarity * 0.3;
        }
        result.push({
          id, setId: set.id, localId, name, altNames: ptName ? [ptName] : undefined, setOfficial: set.official,
          setTotal: set.total, setCode: set.code, release: set.release, prior, viaVariant: true,
        });
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

  /** Busca manual com o total de resultados: a lista mostra os primeiros `limit` e diz quantos existem ("mostrar mais"). */
  searchPage(query: string, number?: number, limit = 30): { matches: ManualMatch[]; total: number } {
    const q = normalizeName(query);
    if (!q && number === undefined) return { matches: [], total: 0 };
    const out: (ManualMatch & { exact: boolean })[] = [];
    for (const set of this.data.sets) {
      for (const [localId, name, ptName] of set.cards) {
        if (number !== undefined && parseLocalId(localId)?.value !== number) continue;
        let exact = false;
        if (q) {
          const names = [name, ...(ptName ? [ptName] : [])].map(normalizeName);
          exact = names.includes(q);
          if (!exact && !names.some((n) => n.includes(q)) && !names.some((n) => nameSimilarity(query, n) >= 0.85)) continue;
        }
        const thumb = set.serie ? cardImageUrl(`${TCGDEX_ASSETS}/en/${set.serie}/${set.id}/${localId}`, 'low', 'webp') : undefined;
        out.push({ id: `${set.id}-${localId}`, name, setName: set.name, localId, setOfficial: set.official, release: set.release, ...(thumb ? { thumb } : {}), exact });
      }
    }
    out.sort((a, b) => Number(b.exact) - Number(a.exact) || (b.release ?? '').localeCompare(a.release ?? ''));
    return { matches: out.slice(0, limit).map(({ exact: _exact, ...match }) => match), total: out.length };
  }

  private byIdMap: Map<string, IndexCandidate> | null = null;

  /** Dados do índice de uma carta pelo id (usado para transformar um palpite visual em candidata). */
  byId(id: string): IndexCandidate | null {
    if (!this.byIdMap) {
      this.byIdMap = new Map();
      for (const set of this.data.sets) {
        for (const [localId, name, ptName] of set.cards) {
          this.byIdMap.set(`${set.id}-${localId}`, {
            id: `${set.id}-${localId}`, setId: set.id, localId, name, altNames: ptName ? [ptName] : undefined,
            setOfficial: set.official, setTotal: set.total, setCode: set.code, release: set.release, prior: 0.2,
          });
        }
      }
    }
    return this.byIdMap.get(id) ?? null;
  }

  hasCard(id: string): boolean {
    return this.data.sets.some((set) => id.startsWith(`${set.id}-`) && set.cards.some(([localId]) => `${set.id}-${localId}` === id));
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
