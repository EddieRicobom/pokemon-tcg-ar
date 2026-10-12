import type { ParsedBottom } from './parse-ocr';
import type { CandidateInfo } from './ranking';
import { nameSimilarity, normalizeName } from './text';

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

function parseLocalId(localId: string): { prefix: string; value: number } | null {
  const match = /^([A-Za-z]*)0*(\d+)$/.exec(localId);
  if (!match) return null;
  return { prefix: (match[1] ?? '').toUpperCase(), value: Number.parseInt(match[2] ?? '0', 10) };
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
    const result: IndexCandidate[] = [];
    const number = bottom.number;
    const nameKeys = nameGuesses.map(normalizeName).filter(Boolean);

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
        if (number) {
          const local = parseLocalId(localId);
          if (!local || local.value !== number.value || local.prefix !== number.prefix.toUpperCase()) continue;
          prior += 0.3;
        } else if (nameKeys.length === 0) {
          continue;
        }
        if (nameGuesses.length > 0) {
          const similarity = Math.max(
            ...nameGuesses.map((guess) => Math.max(nameSimilarity(guess, name), ptName ? nameSimilarity(guess, ptName) : 0)),
          );
          if (!number && similarity < 0.85) continue;
          prior += similarity * 0.3;
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
    return result.slice(0, limit);
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
