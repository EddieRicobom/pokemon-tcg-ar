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
        if (set.official !== number.total.value) continue;
        setPrior += 0.3;
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
