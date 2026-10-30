import type { ArtIndex } from './art-index';
import { traitsFromTcgdex } from '../core/card-traits';
import type { CardTraits } from '../core/card-traits';
import { CatalogLookup } from './catalog-index';
import { detectCard } from './detect-card';
import type { CardDetection } from './detect-card';
import { computeFeatures } from './hash';
import type { CardFeatures } from './hash';
import { applyHomography, homographyFromPoints, rectify, rectifyRegion } from './homography';
import { cropFraction, resizeAverage } from './image';
import { BOTTOM_LEFT_BOX, BOTTOM_OCR_FULL_WIDTH, BOTTOM_RIGHT_BOX, BOTTOM_STRIP_BOX, NAME_BOX, NAME_OCR_FULL_WIDTH } from './layout';
import { prepareForOcr } from './ocr';
import type { OcrEngine } from './ocr';
import { parseBottomText, parseNameText } from './parse-ocr';
import type { ParsedBottom } from './parse-ocr';
import { CONFIDENT_MARGIN, CONFIDENT_THRESHOLD, rankCandidates, UNCERTAIN_THRESHOLD } from './ranking';
import type { CandidateInfo, RankingResult, ScoredCandidate } from './ranking';
import { frameQuality } from './stability';
import type { FrameQuality } from './stability';
import { StageClock } from './stage-clock';
import type { ScanStage, StageTimes } from './stage-clock';
import { cardImageUrl } from './tcgdex';
import type { TcgdexCard, TcgdexClient } from './tcgdex';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from './types';
import type { FractionBox, Quad, RgbaImage } from './types';

export interface ReferenceLoader {
  /** `blob` (opcional) é o arquivo original baixado, para o cache guardar sem baixar de novo. */
  (url: string): Promise<{ image: RgbaImage; bytes: number; blob?: Blob }>;
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
  rarity?: string;
  setOfficial: number;
  setTotal: number;
  setCode?: string;
  dexIds: number[];
  imageBase?: string;
  /** Detalhes da carta (estágio, sufixo, HP…), usados pelos arquétipos. Ausente em cartas antigas. */
  traits?: CardTraits;
}

export interface PipelineDeps {
  ocr: OcrEngine;
  tcgdex: TcgdexClient;
  catalog: CatalogLookup | null;
  loadReference: ReferenceLoader;
  /** Referências do cache local (M3). Consultadas antes de qualquer requisição. */
  localReferences?: () => Promise<LocalReference[]>;
  /**
   * Busca pela ilustração (opcional): devolve o índice de ilustrações, ou null se a opção está desligada ou o índice
   * não existe. Quando devolve, as cartas mais parecidas entram como candidatas ao lado das do OCR.
   */
  artSearch?: () => Promise<ArtIndex | null>;
  /** Liga o diagnóstico do scan (guarda miniaturas e motivos). Consultado a cada quadro. */
  captureDebug?: () => boolean;
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
  /** Houve segunda rodada com números parecidos (dígitos confundidos pelo OCR). */
  variantRound?: boolean;
  /** Quantas candidatas vieram da busca pela ilustração (opção ligada e índice disponível). */
  artCandidates?: number;
  /** Tempo (ms) de cada etapa que de fato rodou nesta leitura (ver `stage-clock.ts`). */
  stages: StageTimes;
  /** Etapas puladas nesta leitura, com o motivo (nada de tempo inventado para elas). */
  skipped: Partial<Record<ScanStage, string>>;
  /** Cartas do índice que combinaram com o que foi lido, ANTES do corte em `maxCandidates` (as baixadas são `candidates`). */
  catalogMatches?: number;
  /** Imagens de referência reaproveitadas de quadros anteriores (não baixadas nem decodificadas de novo). */
  referenceCacheHits?: number;
}

export interface RecognizeOptions {
  /** Detecção já feita pelo controlador (etapa leve, em todo quadro): o pipeline não detecta de novo. */
  detection?: CardDetection;
  /** Avisado quando cada etapa começa (progresso honesto na interface). */
  onStage?: (stage: ScanStage) => void;
  /** false = leitura obsoleta (cancelou/recomeçou): para entre as etapas com `ScanCancelled`. */
  isCurrent?: () => boolean;
}

export type RecognitionStatus = 'identified' | 'ambiguous' | 'not-found' | 'no-card';

export interface RecognitionResult {
  status: RecognitionStatus;
  card?: IdentifiedCard;
  alternatives: { card: IdentifiedCard; confidence: number; reasons: string[] }[];
  confidence: number;
  margin: number;
  parsed: { bottom: ParsedBottom; names: string[] };
  /** Texto cru do OCR (diagnóstico e medição); não é guardado em lugar nenhum. */
  ocrText?: { bottom?: string; name?: string };
  quad?: Quad;
  /** Características do quadro (para guardar no cache). */
  features?: CardFeatures;
  /** Imagem de referência usada na comparação (para o cache e o alvo de AR). */
  reference?: RgbaImage;
  /** Arquivo original da referência (webp do TCGdex), se o carregador o forneceu. */
  referenceBlob?: Blob;
  /** Endereço da imagem de referência (chave no cache de arquivos). */
  referenceUrl?: string;
  metrics: RecognitionMetrics;
  /** O que o scan "viu" neste quadro (só quando o diagnóstico está ligado): para achar a raiz de falhas de leitura. */
  view?: ScanView;
  /** Diagnóstico da melhor candidata (calibração dos limiares com dados reais). */
  debug?: { bestId?: string; bestSimilarity?: number; bestMeta?: number | null; secondId?: string; secondSimilarity?: number };
  message: string;
}

/** Por que cada candidata foi aceita, deixada em dúvida ou rejeitada (diagnóstico). */
export interface CandidateVerdict {
  id: string;
  name: string;
  setName: string;
  localId: string;
  setOfficial: number;
  confidence: number;
  meta: number | null;
  visual: number | null;
  reasons: string[];
  verdict: 'aceita' | 'duvida' | 'rejeitada';
  why: string;
  viaVariant?: boolean;
}

export interface ScanView {
  frame: { width: number; height: number };
  /** Por que nenhuma carta foi achada (ou vazio se foi). */
  detectReasons: string[];
  detect?: Pick<CardDetection, 'areaFraction' | 'aspect' | 'fillRatio' | 'score'>;
  /** Carta retificada (miniatura) e a faixa inferior exatamente como o OCR a recebe (já em cinza/contraste). */
  rectified?: RgbaImage;
  strip?: RgbaImage;
  /** Metades da faixa inferior lidas na segunda tentativa (só quando ela rodou), como o OCR as recebe. */
  sides?: RgbaImage[];
  /** Faixa do nome como o OCR a recebe (só quando o nome foi lido). */
  nameCrop?: RgbaImage;
  /** Áreas exatas lidas, em coordenadas do quadro: faixa do número (e metades, se lidas) e faixa do nome. */
  regions?: { number: Quad[]; name?: Quad };
  quality?: FrameQuality;
  /** Todas as candidatas comparadas, com o veredito e o motivo de cada uma. */
  candidates?: CandidateVerdict[];
}

/** Projeta uma caixa fracionária da carta retificada de volta no quadro da câmera (o que foi recortado de verdade). */
export function regionInFrame(quad: Quad, box: FractionBox): Quad | null {
  const W = CARD_WIDTH_PX - 1;
  const H = CARD_HEIGHT_PX - 1;
  const h = homographyFromPoints([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], quad);
  if (!h) return null;
  const [l, t, r, b] = box;
  return [
    applyHomography(h, { x: l * W, y: t * H }),
    applyHomography(h, { x: r * W, y: t * H }),
    applyHomography(h, { x: r * W, y: b * H }),
    applyHomography(h, { x: l * W, y: b * H }),
  ];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Veredito de cada candidata a partir do ranking real (os mesmos limiares que decidem a identificação). */
export function verdictsOf(
  ranking: RankingResult, records: ReadonlyMap<string, CardRecordLike>, referenceErrors: ReadonlyMap<string, string> = new Map(),
): CandidateVerdict[] {
  const best = ranking.best;
  return ranking.ranked.map((scored, index) => {
    const record = records.get(scored.candidate.id);
    let verdict: CandidateVerdict['verdict'];
    let why: string;
    if (scored.confidence < UNCERTAIN_THRESHOLD) {
      verdict = 'rejeitada';
      why = `confiança ${pct(scored.confidence)} abaixo de ${pct(UNCERTAIN_THRESHOLD)}`;
    } else if (index === 0 && ranking.decision === 'confident') {
      verdict = 'aceita';
      why = `confiança ${pct(scored.confidence)} ≥ ${pct(CONFIDENT_THRESHOLD)} e margem ${pct(ranking.margin)} ≥ ${pct(CONFIDENT_MARGIN)}`;
    } else if (index === 0) {
      verdict = 'duvida';
      why = scored.confidence < CONFIDENT_THRESHOLD
        ? `melhor palpite, mas confiança ${pct(scored.confidence)} abaixo de ${pct(CONFIDENT_THRESHOLD)}`
        : `empate: margem ${pct(ranking.margin)} sobre a 2ª abaixo de ${pct(CONFIDENT_MARGIN)}`;
    } else {
      verdict = 'duvida';
      why = `${pct((best?.confidence ?? 0) - scored.confidence)} atrás da melhor`;
    }
    if (scored.visual === null) {
      const error = referenceErrors.get(scored.candidate.id);
      why += error ? ` · sem imagem de referência (${error}); só o texto` : ' · sem imagem de referência (só o texto)';
    }
    return {
      id: scored.candidate.id,
      name: record?.name ?? scored.candidate.name,
      setName: record?.setName ?? scored.candidate.setId,
      localId: scored.candidate.localId,
      setOfficial: scored.candidate.setOfficial,
      confidence: scored.confidence,
      meta: scored.meta,
      visual: scored.visual,
      reasons: scored.reasons,
      verdict,
      why,
      viaVariant: scored.candidate.viaVariant,
    };
  });
}

interface LoadedCandidate {
  record: CardRecordLike;
  reference?: RgbaImage;
  referenceBlob?: Blob;
  referenceUrl?: string;
  features?: CardFeatures;
  prior: CandidateInfo & { prior: number; viaVariant?: boolean };
  /** Por que a imagem de referência não pôde ser usada (sem imagem no TCGdex, rede, CORS, decodificação…). */
  referenceError?: string;
}

interface ReadResult {
  bottom: ParsedBottom;
  names: string[];
  bottomText?: string;
  /** Segunda leitura da mesma faixa, com contraste binarizado (só no fallback). */
  binaryText?: string;
  nameText?: string;
  /** Faixa inferior enviada ao OCR (diagnóstico). */
  strip?: RgbaImage;
  /** Metades lidas na segunda tentativa (diagnóstico). */
  sides?: RgbaImage[];
  /** Faixa do nome enviada ao OCR (diagnóstico). */
  nameCrop?: RgbaImage;
}

interface CachedReference {
  image: RgbaImage;
  blob?: Blob;
  features: CardFeatures;
}

/** Referências guardadas na memória entre quadros (a mesma carta aparece em vários quadros seguidos). */
const REFERENCE_MEMORY = 24;

function toIdentified(card: CardRecordLike): IdentifiedCard {
  return { ...card, dexId: card.dexIds[0] };
}

export function recordFromTcgdex(card: TcgdexCard, fallback?: CandidateInfo): CardRecordLike {
  return {
    id: card.id,
    name: card.name,
    setId: card.set.id,
    setName: card.set.name,
    localId: card.localId,
    ...(card.rarity ? { rarity: card.rarity } : {}),
    setOfficial: card.set.cardCount?.official ?? fallback?.setOfficial ?? 0,
    setTotal: card.set.cardCount?.total ?? fallback?.setTotal ?? 0,
    setCode: fallback?.setCode,
    dexIds: Array.isArray(card.dexId) ? card.dexId.filter((n) => Number.isInteger(n) && n > 0) : [],
    imageBase: card.image,
    ...(traitsFromTcgdex(card) ? { traits: traitsFromTcgdex(card) } : {}),
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

const ART_CANDIDATES = 5;

type IndexedCandidate = CandidateInfo & { prior: number; viaVariant?: boolean };

export class RecognitionPipeline {
  /** Imagens de referência já baixadas e decodificadas (LRU por endereço). */
  private readonly references = new Map<string, CachedReference>();
  /** A última leitura achou a carta de cabeça para baixo: no próximo quadro tenta essa orientação primeiro. */
  private lastRotated = false;

  constructor(private readonly deps: PipelineDeps) {}

  async recognize(frame: RgbaImage, options: RecognizeOptions = {}): Promise<RecognitionResult> {
    const now = this.deps.now ?? (() => performance.now());
    const started = now();
    const statsBefore = { ...this.deps.tcgdex.stats };
    const clock = new StageClock({ now, onStage: options.onStage, isCurrent: options.isCurrent });
    let downloadedBytes = 0;
    const metrics: RecognitionMetrics = {
      detectMs: 0, ocrMs: 0, candidatesMs: 0, totalMs: 0, requests: 0, downloadedBytes: 0,
      candidates: 0, source: 'none', visualVerified: false, rotated180: false, stages: clock.times, skipped: clock.skipped,
    };
    let ocrTextOut: RecognitionResult['ocrText'];
    let debugOut: RecognitionResult['debug'];
    const capture = this.deps.captureDebug?.() ?? false;
    const diag = { reasons: [] as string[] };
    let viewOut: ScanView | undefined = capture ? { frame: { width: frame.width, height: frame.height }, detectReasons: [] } : undefined;
    const finish = (result: Omit<RecognitionResult, 'metrics'>): RecognitionResult => {
      metrics.totalMs = Math.round(now() - started);
      metrics.requests = this.deps.tcgdex.stats.requests - statsBefore.requests + metrics.requests;
      metrics.downloadedBytes = this.deps.tcgdex.stats.bytes - statsBefore.bytes + downloadedBytes;
      return { ...result, ocrText: ocrTextOut, debug: debugOut, view: viewOut, metrics };
    };
    const empty = { alternatives: [], confidence: 0, margin: 0, parsed: { bottom: {}, names: [] } };

    let detection: CardDetection | null;
    if (options.detection) {
      detection = options.detection;
    } else {
      const t0 = now();
      detection = clock.time('detect', () => detectCard(frame, capture ? diag : undefined));
      metrics.detectMs = Math.round(now() - t0);
      if (viewOut) viewOut.detectReasons = diag.reasons;
    }
    if (!detection) {
      return finish({ ...empty, status: 'no-card', message: 'Não encontrei uma carta no quadro. Enquadre a carta inteira sobre um fundo liso.' });
    }

    // Leitura: tenta a orientação normal (ou a da última leitura, se ela achou a carta virada); se o OCR não achar
    // nada útil, a carta pode estar de cabeça para baixo.
    let rotated = this.lastRotated;
    let quad = rotated ? rotate180(detection.quad) : detection.quad;
    const firstQuad = quad;
    let rectified = clock.time('perspective', () => rectify(frame, firstQuad, CARD_WIDTH_PX, CARD_HEIGHT_PX));
    if (!rectified) return finish({ ...empty, status: 'no-card', quad, message: 'A carta detectada está deformada demais para corrigir a perspectiva.' });

    const t1 = now();
    // Ordem pensada para o celular (cada passada do Tesseract custa segundos): primeiro só a faixa de baixo nas
    // duas orientações; as metades esquerda/direita (mais lentas) só se nenhuma das duas achou número e total.
    let read = await this.readText(clock, frame, quad, rectified, false, false);
    if (!read.bottom.number?.total) {
      const flippedQuad = rotate180(quad);
      const flipped = clock.time('perspective', () => rectify(frame, flippedQuad, CARD_WIDTH_PX, CARD_HEIGHT_PX));
      if (flipped) {
        const flippedRead = await this.readText(clock, frame, flippedQuad, flipped, false, false);
        if (flippedRead.bottom.number?.total || (!read.bottom.number && flippedRead.bottom.number)) {
          quad = flippedQuad;
          rectified = flipped;
          read = flippedRead;
          rotated = !rotated;
        }
      }
    }
    if (!read.bottom.number?.total) {
      const withSides = await this.readText(clock, frame, quad, rectified, false, true, read);
      if (withSides.bottom.number) read = withSides;
    }
    metrics.rotated180 = rotated;
    if (read.bottom.number) this.lastRotated = rotated;
    // O nome só é lido quando ajuda: sem número, ou quando o número deixa mais de um candidato.
    const t2Candidates = this.deps.catalog?.candidates(read.bottom, [], this.maxCandidates()) ?? [];
    if (!read.bottom.number || t2Candidates.length !== 1) {
      const nameRead = await this.readText(clock, frame, quad, rectified, true);
      read.names = nameRead.names;
      read.nameText = nameRead.nameText;
      read.nameCrop = nameRead.nameCrop;
    } else {
      clock.skip('cropName', 'o número já aponta uma única carta no catálogo');
      clock.skip('ocrName', 'o número já aponta uma única carta no catálogo');
    }
    metrics.ocrMs = Math.round(now() - t1);
    const readQuad = quad;
    const readRectified = rectified;
    if (viewOut) {
      const numberBoxes = read.sides ? [BOTTOM_STRIP_BOX, BOTTOM_LEFT_BOX, BOTTOM_RIGHT_BOX] : [BOTTOM_STRIP_BOX];
      viewOut = {
        ...viewOut,
        detect: { areaFraction: detection.areaFraction, aspect: detection.aspect, fillRatio: detection.fillRatio, score: detection.score },
        rectified: resizeAverage(readRectified, 210, 293),
        strip: read.strip ? prepareForOcr(read.strip) : undefined,
        sides: read.sides?.map((side) => prepareForOcr(side)),
        nameCrop: read.nameCrop ? prepareForOcr(read.nameCrop) : undefined,
        regions: {
          number: numberBoxes.map((box) => regionInFrame(readQuad, box)).filter((q): q is Quad => q !== null),
          name: read.nameCrop ? regionInFrame(readQuad, NAME_BOX) ?? undefined : undefined,
        },
        quality: frameQuality(frame, readQuad),
      };
    }

    const features = clock.time('visual', () => computeFeatures(readRectified));
    const parsed = { bottom: read.bottom, names: read.names };
    ocrTextOut = { bottom: read.bottomText, name: read.nameText };

    const t3 = now();
    const evidence = { bottom: read.bottom, nameGuesses: read.names, features };

    // 1) Cache local: nenhuma requisição se a carta já foi vista.
    const localReferences = this.deps.localReferences;
    const local = localReferences ? await clock.timeAsync('catalog', () => localReferences()) : [];
    if (local.length > 0) {
      const infos: CandidateInfo[] = local.map(({ card, features: stored }) => ({
        id: card.id, setId: card.setId, localId: card.localId, name: card.name,
        setOfficial: card.setOfficial, setTotal: card.setTotal, setCode: card.setCode, features: stored,
      }));
      const ranking = clock.time('ranking', () => rankCandidates(infos, evidence));
      if (ranking.decision === 'confident' && ranking.best) {
        const hit = local.find((entry) => entry.card.id === ranking.best?.candidate.id);
        if (hit) {
          metrics.candidatesMs = Math.round(now() - t3);
          metrics.source = 'cache';
          metrics.candidates = infos.length;
          metrics.visualVerified = ranking.best.visual !== null;
          if (viewOut) viewOut.candidates = verdictsOf(ranking, new Map(local.map((entry) => [entry.card.id, entry.card])));
          return finish({
            status: 'identified', card: toIdentified(hit.card), confidence: ranking.best.confidence, margin: ranking.margin,
            alternatives: [], parsed, quad, features,
            message: `Reconhecida pelo cache do aparelho: ${hit.card.name} (${hit.card.setName} ${hit.card.localId}).`,
          });
        }
      }
    }

    // 2) Candidatos pelo índice estático (ou pela busca do TCGdex, se o índice não existir).
    const catalog = this.deps.catalog;
    let indexCandidates: IndexedCandidate[] = [];
    if (catalog) {
      const found = clock.time('catalog', () => catalog.candidatesWithTotal(read.bottom, read.names, this.maxCandidates()));
      indexCandidates = found.list;
      metrics.catalogMatches = found.total;
    } else if (read.bottom.number?.total && read.bottom.number.total.prefix === '') {
      indexCandidates = await clock.timeAsync('catalog', () => this.searchWithoutIndex(read.bottom));
      metrics.catalogMatches = indexCandidates.length;
    }
    // 2b) Busca pela ilustração (opção): as cartas de aparência mais parecida viram candidatas extras. Elas ainda
    // passam pela comparação com a imagem de referência real; impressões com a mesma arte seguem ambíguas.
    // Só entra quando o texto não bastou (sem número com total, ou nenhuma candidata): quando o número já
    // identifica a carta, não vale carregar o índice nem misturar candidatas.
    const textWeak = indexCandidates.length === 0 || !read.bottom.number?.total;
    const artSearch = this.deps.artSearch;
    const artIndex = artSearch && textWeak ? await clock.timeAsync('catalog', () => artSearch().catch(() => null)) : null;
    if (artIndex && catalog) {
      const known = new Set(indexCandidates.map((c) => c.id));
      const extra = clock.time('visual', () => artIndex
        .search(features, ART_CANDIDATES)
        .filter((match) => !known.has(match.id))
        .map((match) => catalog.byId(match.id))
        .filter((c): c is NonNullable<typeof c> => !!c));
      metrics.artCandidates = extra.length;
      indexCandidates = [...indexCandidates, ...extra];
    }
    metrics.candidates = indexCandidates.length;
    const hasVariants = (catalog?.variantCandidates(read.bottom, read.names, new Set(), 1).length ?? 0) > 0;
    if (indexCandidates.length === 0 && !hasVariants) {
      metrics.candidatesMs = Math.round(now() - t3);
      clock.skip('ranking', 'nenhuma candidata no catálogo');
      return finish({
        status: 'not-found', alternatives: [], confidence: 0, margin: 0, parsed, quad, features,
        message: read.bottom.number
          ? 'Li o número da carta, mas não achei nenhuma carta com ele no catálogo. Tente de novo com mais luz e sem reflexo.'
          : 'Não consegui ler o número da carta. Aproxime, evite reflexo e enquadre a parte de baixo da carta.',
      });
    }

    // 3) Detalhes (dexId, imagem) e imagem de referência só dos candidatos.
    const bytes = { value: 0, hits: 0 };
    let usable = await this.loadCandidates(clock, indexCandidates, bytes);
    const toInfos = (entries: LoadedCandidate[]): CandidateInfo[] => entries.map((entry) => ({
      id: entry.record.id, setId: entry.record.setId, localId: entry.record.localId, name: entry.record.name,
      altNames: entry.prior.altNames, setOfficial: entry.record.setOfficial, setTotal: entry.record.setTotal,
      setCode: entry.record.setCode, features: entry.features, viaVariant: entry.prior.viaVariant,
    }));
    let ranking = usable.length > 0 ? clock.time('ranking', () => rankCandidates(toInfos(usable), evidence)) : null;

    // 3b) Segunda rodada: se nada se confirmou, tenta números parecidos (dígitos que o OCR confunde).
    if ((!ranking || ranking.decision !== 'confident') && catalog) {
      const tried = new Set(indexCandidates.map((c) => c.id));
      const variants = clock.time('catalog', () => catalog.variantCandidates(read.bottom, read.names, tried, this.maxCandidates()));
      if (variants.length > 0) {
        metrics.variantRound = true;
        usable = [...usable, ...(await this.loadCandidates(clock, variants, bytes))];
        ranking = clock.time('ranking', () => rankCandidates(toInfos(usable), evidence));
      }
    }
    downloadedBytes += bytes.value;
    metrics.referenceCacheHits = bytes.hits;
    metrics.candidates = usable.length;
    metrics.candidatesMs = Math.round(now() - t3);
    if (usable.length === 0 || !ranking) {
      return finish({
        status: 'not-found', alternatives: [], confidence: 0, margin: 0, parsed, quad, features,
        message: 'Não consegui consultar o TCGdex agora. Verifique a conexão e tente de novo.',
      });
    }
    metrics.source = 'network';
    const best = ranking.best;
    const runnerUp = ranking.ranked[1];
    debugOut = {
      bestId: best?.candidate.id, bestSimilarity: best?.similarity?.combined, bestMeta: best?.meta,
      secondId: runnerUp?.candidate.id, secondSimilarity: runnerUp?.similarity?.combined,
    };
    const byId = new Map(usable.map((entry) => [entry.record.id, entry]));
    if (viewOut) {
      const errors = new Map(usable.filter((entry) => entry.referenceError).map((entry) => [entry.record.id, entry.referenceError!]));
      viewOut.candidates = verdictsOf(ranking, new Map(usable.map((entry) => [entry.record.id, entry.record])), errors);
    }
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
        features, reference: winner.reference, referenceBlob: winner.referenceBlob, referenceUrl: winner.referenceUrl,
        message: `${identified.name} (${identified.setName} ${identified.localId}).`,
      });
    }
    return finish({
      status: 'ambiguous', card: identified, confidence: best.confidence, margin: ranking.margin, alternatives, parsed, quad,
      features, reference: winner.reference, referenceBlob: winner.referenceBlob, referenceUrl: winner.referenceUrl,
      message: 'Não tenho certeza de qual impressão é. Escolha uma das opções ou tente de novo.',
    });
  }

  /** Referência pela memória (quadros anteriores) ou baixada agora; a memória guarda as `REFERENCE_MEMORY` mais recentes. */
  private async reference(url: string, bytes: { value: number; hits: number }): Promise<CachedReference> {
    const hit = this.references.get(url);
    if (hit) {
      this.references.delete(url);
      this.references.set(url, hit);
      bytes.hits++;
      return hit;
    }
    const loaded = await this.deps.loadReference(url);
    bytes.value += loaded.bytes;
    const entry: CachedReference = { image: loaded.image, blob: loaded.blob, features: computeFeatures(loaded.image) };
    this.references.set(url, entry);
    while (this.references.size > REFERENCE_MEMORY) {
      const oldest = this.references.keys().next().value;
      if (oldest === undefined) break;
      this.references.delete(oldest);
    }
    return entry;
  }

  private async loadCandidates(clock: StageClock, list: IndexedCandidate[], bytes: { value: number; hits: number }): Promise<LoadedCandidate[]> {
    clock.check();
    // Metadados (TCGdex) e imagem de referência (comparação visual) de até 3 candidatas ao mesmo tempo: a soma dos
    // tempos vai para cada etapa, então essas duas etapas podem somar mais que o relógio de parede.
    const loaded = await mapLimit(list, 3, async (candidate): Promise<LoadedCandidate | null> => {
      try {
        const card = await clock.timeAsync('catalog', () => this.deps.tcgdex.getCard(candidate.id));
        if (!card) return null;
        const record = recordFromTcgdex(card, candidate);
        let reference: RgbaImage | undefined;
        let referenceBlob: Blob | undefined;
        let referenceUrl: string | undefined;
        let referenceFeatures: CardFeatures | undefined;
        let referenceError: string | undefined = card.image ? undefined : 'o TCGdex não tem imagem desta carta';
        if (card.image) {
          try {
            const url = (this.deps.referenceUrl ?? ((base) => cardImageUrl(base, 'low', 'webp')))(card.image);
            referenceUrl = url;
            const ref = await clock.timeAsync('visual', () => this.reference(url, bytes));
            reference = ref.image;
            referenceBlob = ref.blob;
            referenceFeatures = ref.features;
          } catch (error) {
            // Sem imagem (rede/CORS/decodificação): essa candidata segue só pelos metadados — e o motivo fica visível.
            referenceError = error instanceof Error ? error.message : String(error);
          }
        }
        return { record, reference, referenceBlob, referenceUrl, features: referenceFeatures, prior: candidate, referenceError };
      } catch {
        return null;
      }
    });
    return loaded.filter((entry): entry is LoadedCandidate => entry !== null);
  }

  private maxCandidates(): number {
    return this.deps.maxCandidates ?? 6;
  }

  /**
   * Lê a faixa inferior direto do quadro original (retificando só a região, em resolução maior que a da
   * carta retificada inteira). Segunda tentativa nas metades esquerda/direita, com lista de caracteres,
   * só quando a primeira não achou número com total: o laboratório de OCR do CI mediu as duas.
   */
  private async readText(
    clock: StageClock, frame: RgbaImage, quad: Quad, rectified: RgbaImage, nameOnly: boolean, withSides = true, previous?: ReadResult,
  ): Promise<ReadResult> {
    if (nameOnly) {
      const region = clock.time('cropName', () => rectifyRegion(frame, quad, NAME_BOX, NAME_OCR_FULL_WIDTH) ?? cropFraction(rectified, NAME_BOX));
      const text = await clock.timeAsync('ocrName', () => this.deps.ocr.recognize(region, 'name'));
      return { bottom: {}, names: parseNameText(text), nameText: text, nameCrop: region };
    }
    // `previous`: a faixa inteira já foi lida nesta orientação; não repete a passada (cada uma custa segundos no celular).
    const strip =
      previous?.strip ?? clock.time('cropNumber', () => rectifyRegion(frame, quad, BOTTOM_STRIP_BOX, BOTTOM_OCR_FULL_WIDTH) ?? cropFraction(rectified, BOTTOM_STRIP_BOX));
    let text = previous?.bottomText ?? (await clock.timeAsync('ocrNumber', () => this.deps.ocr.recognize(strip, 'bottom')));
    let bottom = previous?.bottom ?? parseBottomText(text);
    let binaryText = previous?.binaryText;
    // Reflexo e impressão com pouco contraste às vezes derrubam a leitura em tons de cinza. Antes de recortar
    // metades ou abandonar a foto, tenta a mesma captura binarizada e limitada aos caracteres do rodapé.
    if (!bottom.number?.total && !binaryText) {
      binaryText = await clock.timeAsync('ocrNumber', () => this.deps.ocr.recognize(strip, 'bottom-binary'));
      const combined = `${text}\n${binaryText}`;
      const recovered = parseBottomText(combined);
      if (recovered.number?.total || !bottom.number) {
        text = combined;
        bottom = recovered;
      }
    }
    let sidesOut: RgbaImage[] | undefined;
    if (withSides && !bottom.number?.total) {
      const sides: string[] = [];
      const crops: RgbaImage[] = [];
      for (const box of [BOTTOM_LEFT_BOX, BOTTOM_RIGHT_BOX]) {
        const region = clock.time('cropNumber', () => rectifyRegion(frame, quad, box, Math.round(BOTTOM_OCR_FULL_WIDTH * (box[2] - box[0]))));
        if (region) {
          crops.push(region);
          sides.push(await clock.timeAsync('ocrNumber', () => this.deps.ocr.recognize(region, 'bottom-side')));
        }
      }
      if (sides.length > 0) {
        sidesOut = crops;
        const merged = [text, ...sides].join(' \n ');
        const mergedParsed = parseBottomText(merged);
        // Só adota a segunda leitura se ela melhorou (o ruído das metades pode atrapalhar o que já estava bom).
        if (mergedParsed.number?.total || !bottom.number) {
          text = merged;
          bottom = mergedParsed;
        }
      }
    }
    return { bottom, names: [], bottomText: text, binaryText, strip, sides: sidesOut };
  }

  /** Sem índice estático: pergunta ao TCGdex pelas cartas com esse número e esse total. */
  private async searchWithoutIndex(bottom: ParsedBottom): Promise<IndexedCandidate[]> {
    const number = bottom.number;
    if (!number?.total) return [];
    const results = await this.deps.tcgdex.searchByNumber(number.value, number.total.value);
    return results.slice(0, this.maxCandidates()).map((card) => ({
      id: card.id, setId: card.id.slice(0, card.id.length - card.localId.length - 1), localId: card.localId, name: card.name,
      setOfficial: number.total!.value, setTotal: number.total!.value, prior: 0.5,
    }));
  }
}
