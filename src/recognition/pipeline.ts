import { CatalogLookup } from './catalog-index';
import { detectCard } from './detect-card';
import { computeFeatures } from './hash';
import type { CardFeatures } from './hash';
import { rectify } from './homography';
import { cropFraction } from './image';
import { BOTTOM_STRIP_BOX, NAME_BOX } from './layout';
import type { OcrEngine } from './ocr';
import { parseBottomText, parseNameText } from './parse-ocr';
import type { ParsedBottom } from './parse-ocr';
import { rankCandidates } from './ranking';
import type { CandidateInfo, ScoredCandidate } from './ranking';
import { cardImageUrl } from './tcgdex';
import type { TcgdexCard, TcgdexClient } from './tcgdex';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from './types';
import type { Quad, RgbaImage } from './types';

export interface ReferenceLoader {
  (url: string): Promise<{ image: RgbaImage; bytes: number }>;
}

/** Carta já conhecida no aparelho (cache): permite reconhecer sem consultar o TCGdex. */
export interface LocalReference {
  card: CardRecordLike;
  features: CardFeatures;
}

export interface CardRecordLike {
  id: string;
  name: string;
  setId: string;
  setName: string;
  localId: string;
  setOfficial: number;
  setTotal: number;
  setCode?: string;
  dexIds: number[];
  imageBase?: string;
}

export interface PipelineDeps {
  ocr: OcrEngine;
  tcgdex: TcgdexClient;
  catalog: CatalogLookup | null;
  loadReference: ReferenceLoader;
  /** Referências do cache local (M3). Consultadas antes de qualquer requisição. */
  localReferences?: () => Promise<LocalReference[]>;
  /** Endereço da imagem de referência a partir da base do TCGdex (padrão: low.webp). */
  referenceUrl?: (imageBase: string) => string;
  /** Candidatos baixados para comparar (padrão 6). */
  maxCandidates?: number;
  now?: () => number;
}

export interface IdentifiedCard extends CardRecordLike {
  /** Primeiro número da Pokédex Nacional; undefined em Treinador/Energia. */
  dexId?: number;
}

export interface RecognitionMetrics {
  detectMs: number;
  ocrMs: number;
  candidatesMs: number;
  totalMs: number;
  requests: number;
  downloadedBytes: number;
  candidates: number;
  source: 'cache' | 'network' | 'none';
  /** Resolveu só por metadados (nenhuma imagem de referência pôde ser comparada). */
  visualVerified: boolean;
  rotated180: boolean;
}

export type RecognitionStatus = 'identified' | 'ambiguous' | 'not-found' | 'no-card';

export interface RecognitionResult {
  status: RecognitionStatus;
  card?: IdentifiedCard;
  alternatives: { card: IdentifiedCard; confidence: number; reasons: string[] }[];
  confidence: number;
  margin: number;
  parsed: { bottom: ParsedBottom; names: string[] };
  quad?: Quad;
  /** Características do quadro (para guardar no cache). */
  features?: CardFeatures;
  /** Imagem de referência usada na comparação (para o cache e o alvo de AR). */
  reference?: RgbaImage;
  metrics: RecognitionMetrics;
  message: string;
}

function toIdentified(card: CardRecordLike): IdentifiedCard {
  return { ...card, dexId: card.dexIds[0] };
}

function recordFromTcgdex(card: TcgdexCard, fallback?: CandidateInfo): CardRecordLike {
  return {
    id: card.id,
    name: card.name,
    setId: card.set.id,
    setName: card.set.name,
    localId: card.localId,
    setOfficial: card.set.cardCount?.official ?? fallback?.setOfficial ?? 0,
    setTotal: card.set.cardCount?.total ?? fallback?.setTotal ?? 0,
    setCode: fallback?.setCode,
    dexIds: Array.isArray(card.dexId) ? card.dexId.filter((n) => Number.isInteger(n) && n > 0) : [],
    imageBase: card.image,
  };
}

function rotate180(quad: Quad): Quad {
  return [quad[2], quad[3], quad[0], quad[1]];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index] as T);
      }
    }),
  );
  return results;
}

export class RecognitionPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  async recognize(frame: RgbaImage): Promise<RecognitionResult> {
    const now = this.deps.now ?? (() => performance.now());
    const started = now();
    const statsBefore = { ...this.deps.tcgdex.stats };
    let downloadedBytes = 0;
    const metrics: RecognitionMetrics = {
      detectMs: 0, ocrMs: 0, candidatesMs: 0, totalMs: 0, requests: 0, downloadedBytes: 0,
      candidates: 0, source: 'none', visualVerified: false, rotated180: false,
    };
    const finish = (result: Omit<RecognitionResult, 'metrics'>): RecognitionResult => {
      metrics.totalMs = Math.round(now() - started);
      metrics.requests = this.deps.tcgdex.stats.requests - statsBefore.requests + metrics.requests;
      metrics.downloadedBytes = this.deps.tcgdex.stats.bytes - statsBefore.bytes + downloadedBytes;
      return { ...result, metrics };
    };
    const empty = { alternatives: [], confidence: 0, margin: 0, parsed: { bottom: {}, names: [] } };

    const t0 = now();
    const detection = detectCard(frame);
    metrics.detectMs = Math.round(now() - t0);
    if (!detection) {
      return finish({ ...empty, status: 'no-card', message: 'Não encontrei uma carta no quadro. Enquadre a carta inteira sobre um fundo liso.' });
    }

    // Leitura: tenta a orientação normal; se o OCR não achar nada útil, a carta pode estar de cabeça para baixo.
    let quad = detection.quad;
    let rectified = rectify(frame, quad, CARD_WIDTH_PX, CARD_HEIGHT_PX);
    if (!rectified) return finish({ ...empty, status: 'no-card', quad, message: 'A carta detectada está deformada demais para corrigir a perspectiva.' });

    const t1 = now();
    let read = await this.readText(rectified, false);
    if (!read.bottom.number && read.names.length === 0) {
      const flippedQuad = rotate180(quad);
      const flipped = rectify(frame, flippedQuad, CARD_WIDTH_PX, CARD_HEIGHT_PX);
      if (flipped) {
        const flippedRead = await this.readText(flipped, false);
        if (flippedRead.bottom.number || flippedRead.names.length > 0) {
          quad = flippedQuad;
          rectified = flipped;
          read = flippedRead;
          metrics.rotated180 = true;
        }
      }
    }
    // O nome só é lido quando ajuda: sem número, ou quando o número deixa mais de um candidato.
    const t2Candidates = this.deps.catalog?.candidates(read.bottom, [], this.maxCandidates()) ?? [];
    if (!read.bottom.number || t2Candidates.length > 1) {
      read.names = (await this.readText(rectified, true)).names;
    }
    metrics.ocrMs = Math.round(now() - t1);

    const features = computeFeatures(rectified);
    const parsed = { bottom: read.bottom, names: read.names };

    const t3 = now();
    const evidence = { bottom: read.bottom, nameGuesses: read.names, features };

    // 1) Cache local: nenhuma requisição se a carta já foi vista.
    const local = this.deps.localReferences ? await this.deps.localReferences() : [];
    if (local.length > 0) {
      const infos: CandidateInfo[] = local.map(({ card, features: stored }) => ({
        id: card.id, setId: card.setId, localId: card.localId, name: card.name,
        setOfficial: card.setOfficial, setTotal: card.setTotal, setCode: card.setCode, features: stored,
      }));
      const ranking = rankCandidates(infos, evidence);
      if (ranking.decision === 'confident' && ranking.best) {
        const hit = local.find((entry) => entry.card.id === ranking.best?.candidate.id);
        if (hit) {
          metrics.candidatesMs = Math.round(now() - t3);
          metrics.source = 'cache';
          metrics.candidates = infos.length;
          metrics.visualVerified = ranking.best.visual !== null;
          return finish({
            status: 'identified', card: toIdentified(hit.card), confidence: ranking.best.confidence, margin: ranking.margin,
            alternatives: [], parsed, quad, features,
            message: `Reconhecida pelo cache do aparelho: ${hit.card.name} (${hit.card.setName} ${hit.card.localId}).`,
          });
        }
      }
    }

    // 2) Candidatos pelo índice estático (ou pela busca do TCGdex, se o índice não existir).
    let indexCandidates = this.deps.catalog?.candidates(read.bottom, read.names, this.maxCandidates()) ?? [];
    if (!this.deps.catalog && read.bottom.number?.total && read.bottom.number.total.prefix === '') {
      indexCandidates = await this.searchWithoutIndex(read.bottom);
    }
    metrics.candidates = indexCandidates.length;
    if (indexCandidates.length === 0) {
      metrics.candidatesMs = Math.round(now() - t3);
      return finish({
        status: 'not-found', alternatives: [], confidence: 0, margin: 0, parsed, quad, features,
        message: read.bottom.number
          ? 'Li o número da carta, mas não achei nenhuma carta com ele no catálogo. Tente de novo com mais luz e sem reflexo.'
          : 'Não consegui ler o número da carta. Aproxime, evite reflexo e enquadre a parte de baixo da carta.',
      });
    }

    // 3) Detalhes (dexId, imagem) e imagem de referência só dos candidatos.
    const loaded = await mapLimit(indexCandidates, 3, async (candidate) => {
      try {
        const card = await this.deps.tcgdex.getCard(candidate.id);
        if (!card) return null;
        const record = recordFromTcgdex(card, candidate);
        let reference: RgbaImage | undefined;
        let referenceFeatures: CardFeatures | undefined;
        if (card.image) {
          try {
            const loadedImage = await this.deps.loadReference((this.deps.referenceUrl ?? ((base) => cardImageUrl(base, 'low', 'webp')))(card.image));
            downloadedBytes += loadedImage.bytes;
            reference = loadedImage.image;
            referenceFeatures = computeFeatures(loadedImage.image);
          } catch {
            // Sem imagem (rede/CORS): essa candidata segue só pelos metadados.
          }
        }
        return { record, reference, features: referenceFeatures, prior: candidate };
      } catch {
        return null;
      }
    });
    const usable = loaded.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    metrics.candidatesMs = Math.round(now() - t3);
    if (usable.length === 0) {
      return finish({
        status: 'not-found', alternatives: [], confidence: 0, margin: 0, parsed, quad, features,
        message: 'Não consegui consultar o TCGdex agora. Verifique a conexão e tente de novo.',
      });
    }
    metrics.source = 'network';

    const infos: CandidateInfo[] = usable.map((entry) => ({
      id: entry.record.id, setId: entry.record.setId, localId: entry.record.localId, name: entry.record.name,
      altNames: entry.prior.altNames, setOfficial: entry.record.setOfficial, setTotal: entry.record.setTotal,
      setCode: entry.record.setCode, features: entry.features,
    }));
    const ranking = rankCandidates(infos, evidence);
    const best = ranking.best;
    const byId = new Map(usable.map((entry) => [entry.record.id, entry]));
    const alternatives = ranking.ranked.slice(best ? 1 : 0).map((scored: ScoredCandidate) => ({
      card: toIdentified(byId.get(scored.candidate.id)!.record), confidence: scored.confidence, reasons: scored.reasons,
    }));
    if (!best || ranking.decision === 'none') {
      return finish({
        status: 'not-found', alternatives, confidence: best?.confidence ?? 0, margin: ranking.margin, parsed, quad, features,
        message: 'Nenhuma candidata combinou o bastante com o que li. Tente de novo com a carta mais reta e iluminada.',
      });
    }
    const winner = byId.get(best.candidate.id)!;
    metrics.visualVerified = best.visual !== null;
    const identified = toIdentified(winner.record);
    if (ranking.decision === 'confident') {
      return finish({
        status: 'identified', card: identified, confidence: best.confidence, margin: ranking.margin, alternatives, parsed, quad,
        features, reference: winner.reference,
        message: `${identified.name} (${identified.setName} ${identified.localId}).`,
      });
    }
    return finish({
      status: 'ambiguous', card: identified, confidence: best.confidence, margin: ranking.margin, alternatives, parsed, quad,
      features, reference: winner.reference,
      message: 'Não tenho certeza de qual impressão é. Escolha uma das opções ou tente de novo.',
    });
  }

  private maxCandidates(): number {
    return this.deps.maxCandidates ?? 6;
  }

  private async readText(rectified: RgbaImage, nameOnly: boolean): Promise<{ bottom: ParsedBottom; names: string[] }> {
    if (nameOnly) {
      const text = await this.deps.ocr.recognize(cropFraction(rectified, NAME_BOX), 'name');
      return { bottom: {}, names: parseNameText(text) };
    }
    const text = await this.deps.ocr.recognize(cropFraction(rectified, BOTTOM_STRIP_BOX), 'bottom');
    return { bottom: parseBottomText(text), names: [] };
  }

  /** Sem índice estático: pergunta ao TCGdex pelas cartas com esse número e esse total. */
  private async searchWithoutIndex(bottom: ParsedBottom): Promise<(CandidateInfo & { prior: number })[]> {
    const number = bottom.number;
    if (!number?.total) return [];
    const results = await this.deps.tcgdex.searchByNumber(number.value, number.total.value);
    return results.slice(0, this.maxCandidates()).map((card) => ({
      id: card.id, setId: card.id.slice(0, card.id.length - card.localId.length - 1), localId: card.localId, name: card.name,
      setOfficial: number.total!.value, setTotal: number.total!.value, prior: 0.5,
    }));
  }
}
