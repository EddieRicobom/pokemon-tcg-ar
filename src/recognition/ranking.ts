import { compareFeatures } from './hash';
import type { CardFeatures } from './hash';
import type { ParsedBottom } from './parse-ocr';
import { nameSimilarity } from './text';

/**
 * Fusão de evidências e decisão. Estrutura e limiares do pokeum (MIT):
 *   confiante  ≥ 0,80 com margem ≥ 0,10 sobre o segundo;
 *   incerto    ≥ 0,50 (devolve o melhor palpite e as alternativas);
 *   nenhum     abaixo disso.
 * O OCR nunca é filtro rígido: ele muda a nota, e a comparação visual pode compensar um OCR ruim.
 */
export const CONFIDENT_THRESHOLD = 0.8;
export const CONFIDENT_MARGIN = 0.1;
export const UNCERTAIN_THRESHOLD = 0.5;
/** Semelhança visual abaixo disto vale 0; acima de VISUAL_FULL vale 1 (a calibrar com dados reais). */
export const VISUAL_FLOOR = 0.65;
export const VISUAL_FULL = 0.85;
const VISUAL_WEIGHT = 0.55;
const NO_VISUAL_FACTOR = 0.9;
/** Crédito parcial (0-1) de número/total que diferem do OCR só por dígitos facilmente confundidos. */
const VARIANT_CREDIT = 0.6;

export interface CandidateInfo {
  id: string;
  setId: string;
  localId: string;
  name: string;
  altNames?: string[];
  setOfficial: number;
  setTotal: number;
  setCode?: string;
  features?: CardFeatures;
  /**
   * Candidata vinda de uma variação plausível de dígitos mal lidos pelo OCR (6↔8, 1↔7…). O número impresso
   * dela difere do que foi lido, então a nota de metadados dá crédito parcial; a comparação visual decide.
   */
  viaVariant?: boolean;
}

export interface Evidence {
  bottom: ParsedBottom;
  nameGuesses: string[];
  features?: CardFeatures;
}

export interface ScoredCandidate {
  candidate: CandidateInfo;
  /** Nota de metadados (OCR) em [0, 1], ou null se o OCR não deu evidência alguma. */
  meta: number | null;
  /** Nota visual em [0, 1], ou null se não havia referência. */
  visual: number | null;
  similarity?: { art: number; full: number; color: number; combined: number };
  confidence: number;
  reasons: string[];
}

function stripToValue(localId: string): { prefix: string; value: number } | null {
  const match = /^([A-Za-z]*)0*(\d+)$/.exec(localId);
  if (!match) return null;
  return { prefix: (match[1] ?? '').toUpperCase(), value: Number.parseInt(match[2] ?? '0', 10) };
}

export function scoreMeta(candidate: CandidateInfo, evidence: Evidence): { meta: number | null; reasons: string[] } {
  const reasons: string[] = [];
  let weightSum = 0;
  let total = 0;
  const add = (weight: number, score: number) => {
    weightSum += weight;
    total += weight * score;
  };

  const number = evidence.bottom.number;
  if (number) {
    const local = stripToValue(candidate.localId);
    const numberOk = !!local && local.value === number.value && local.prefix === number.prefix.toUpperCase();
    add(0.4, numberOk ? 1 : candidate.viaVariant ? VARIANT_CREDIT : 0);
    reasons.push(numberOk ? `número ${candidate.localId}` : candidate.viaVariant ? `número parecido (${candidate.localId})` : `número diferente (${candidate.localId})`);
    if (number.total && number.total.prefix === '') {
      const totalOk = candidate.setOfficial === number.total.value;
      add(0.2, totalOk ? 1 : candidate.viaVariant ? VARIANT_CREDIT : 0);
      reasons.push(totalOk ? `total ${candidate.setOfficial}` : `total diferente (${candidate.setOfficial})`);
    }
  }
  if (evidence.bottom.setCode && candidate.setCode) {
    const codeOk = evidence.bottom.setCode.toUpperCase() === candidate.setCode.toUpperCase();
    add(0.15, codeOk ? 1 : 0);
    reasons.push(codeOk ? `set ${candidate.setCode}` : `set diferente (${candidate.setCode})`);
  }
  if (evidence.nameGuesses.length > 0) {
    const names = [candidate.name, ...(candidate.altNames ?? [])];
    const best = Math.max(...evidence.nameGuesses.flatMap((guess) => names.map((name) => nameSimilarity(guess, name))));
    add(0.25, best);
    if (best >= 0.85) reasons.push('nome combina');
  }
  if (weightSum === 0) return { meta: null, reasons };
  // Pouca evidência pesa menos: com só o nome (0,25) a nota máxima é 0,25/0,6.
  const trust = Math.min(1, weightSum / 0.6);
  return { meta: (total / weightSum) * trust, reasons };
}

export function scoreCandidate(candidate: CandidateInfo, evidence: Evidence): ScoredCandidate {
  const { meta, reasons } = scoreMeta(candidate, evidence);
  let visual: number | null = null;
  let similarity: ScoredCandidate['similarity'];
  if (evidence.features && candidate.features) {
    similarity = compareFeatures(evidence.features, candidate.features);
    visual = Math.min(1, Math.max(0, (similarity.combined - VISUAL_FLOOR) / (VISUAL_FULL - VISUAL_FLOOR)));
  }
  let confidence: number;
  if (visual !== null && meta !== null) confidence = VISUAL_WEIGHT * visual + (1 - VISUAL_WEIGHT) * meta;
  else if (visual !== null) confidence = visual * 0.85; // só visual: nunca "confiante" sozinho em 1.0
  else if (meta !== null) confidence = meta * NO_VISUAL_FACTOR;
  else confidence = 0;
  return { candidate, meta, visual, similarity, confidence, reasons };
}

export type Decision = 'confident' | 'uncertain' | 'none';

export interface RankingResult {
  decision: Decision;
  ranked: ScoredCandidate[];
  best?: ScoredCandidate;
  margin: number;
}

/**
 * Ordena TODAS as candidatas (sem corte): as que foram baixadas e comparadas precisam poder aparecer, inclusive a
 * última — um corte aqui (antes era 5) escondia candidatas válidas da lista de escolha. `topK` só para quem pedir.
 */
export function rankCandidates(candidates: CandidateInfo[], evidence: Evidence, topK = Number.POSITIVE_INFINITY): RankingResult {
  const ranked = candidates
    .map((candidate) => scoreCandidate(candidate, evidence))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topK);
  const best = ranked[0];
  if (!best) return { decision: 'none', ranked, margin: 0 };
  const second = ranked[1];
  const margin = best.confidence - (second?.confidence ?? 0);
  let decision: Decision = 'none';
  if (best.confidence >= CONFIDENT_THRESHOLD && margin >= CONFIDENT_MARGIN) decision = 'confident';
  else if (best.confidence >= UNCERTAIN_THRESHOLD) decision = 'uncertain';
  return { decision, ranked, best, margin };
}
