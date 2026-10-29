import { inputFromResult } from '../cache/card-cache';
import type { PrepareProgress, PrepareResult, PrepareTimings, ScanOutcome } from '../cache/card-cache';
import type { CachedCard } from '../cache/types';
import type { CardDetection } from '../recognition/detect-card';
import type { CardFeatures } from '../recognition/hash';
import { SAME_CARD_SIMILARITY } from '../recognition/snapshot';
import { BestFrameCapture } from '../recognition/best-frame';
import type { CardRecordLike, IdentifiedCard, RecognitionMetrics, RecognitionResult, RecognizeOptions } from '../recognition/pipeline';
import { qualityWarning, StabilityTracker } from '../recognition/stability';
import type { FrameQuality, StabilityState } from '../recognition/stability';
import { ScanCancelled } from '../recognition/stage-clock';
import type { ScanStage } from '../recognition/stage-clock';
import { TemporalAggregator } from '../recognition/temporal';
import type { Quad, RgbaImage } from '../recognition/types';

export type ScanPhase = 'idle' | 'scanning' | 'choosing' | 'preparing' | 'ready' | 'error';

/** Resumo da última tentativa de reconhecimento (para a interface e o diagnóstico). */
export interface LastAttempt {
  status: RecognitionResult['status'];
  message: string;
  confidence: number;
  metrics: RecognitionMetrics;
  ocrBottom?: string;
  ocrName?: string;
  cardName?: string;
  /** Onde o app achou a carta (coordenadas do quadro analisado) e o que viu; só com o diagnóstico ligado. */
  quad?: RecognitionResult['quad'];
  view?: RecognitionResult['view'];
  /** Esta leitura repete a anterior (a carta sumiu por poucos quadros). */
  reused?: boolean;
  /** Tamanho do quadro analisado (para desenhar o contorno sobre o vídeo). */
  frameSize?: { width: number; height: number };
  /** Só a detecção rodou neste quadro (carta ausente ou ainda mexendo): OCR e catálogo não rodaram de propósito. */
  gated?: boolean;
}

export interface ScanChoice {
  card: IdentifiedCard;
  confidence: number;
}

export interface ScanState {
  phase: ScanPhase;
  message: string;
  /** Quadros analisados desde que o escaneamento começou. */
  frames: number;
  last?: LastAttempt;
  /** Opções quando a identificação ficou ambígua (impressões parecidas). */
  choices?: ScanChoice[];
  progress?: PrepareProgress;
  /** Carta pronta para o AR (já guardada no cache). */
  card?: CachedCard;
  /** Como a carta foi definida: reconhecimento automático, escolha entre candidatas, ou carregada do cache. */
  origin?: 'automatico' | 'escolha' | 'cache' | 'manual';
  /** Etapa do pipeline rodando AGORA (avisada pelo próprio pipeline; nada simulado). */
  stage?: ScanStage;
  /** Estado de estabilidade da carta no último quadro (só com a detecção leve ligada). */
  stability?: StabilityState;
  /** Aviso de luz/foco do último quadro com carta (heurística; não bloqueia a leitura). */
  qualityHint?: string | null;
  /** Relógio desta leitura (ms desde o início): primeiras candidatas na tela, carta confirmada e tempo para guardá-la. */
  timeline?: { startedAt: number; firstCandidateMs?: number; confirmedMs?: number; confirmMs?: number };
  /** Partes de "guardar a carta" medidas na última preparação (referência, sprite, alvo…). */
  prepareTimings?: PrepareTimings;
  /**
   * Foto temporária (só na memória): o quadro da primeira leitura boa. Enquanto ela existe, o app não roda o OCR de
   * novo — só confere que a câmera continua mostrando a mesma carta. Some ao confirmar, cancelar ou trocar de carta.
   */
  photo?: { frame: RgbaImage; cardName?: string; matches: number; need: number };
}

/** Resultado da detecção leve (contorno da carta), feita em todo quadro antes de decidir se vale rodar o OCR. */
export interface LocateResult {
  detection: CardDetection | null;
  quality?: FrameQuality;
}

export interface ScanDeps {
  grabFrame(): RgbaImage | null;
  recognize(frame: RgbaImage, options?: RecognizeOptions): Promise<RecognitionResult>;
  /**
   * Detecção leve (opcional). Com ela, o OCR (caro) só roda quando a carta está parada há pelo menos um par de
   * quadros; sem ela, cada quadro passa pelo pipeline inteiro (comportamento antigo, usado em testes).
   */
  locate?: (frame: RgbaImage) => LocateResult;
  /** Cada tentativa (inclusive as só de detecção), para o registro de métricas do Diagnóstico. */
  onAttempt?: (attempt: LastAttempt) => void;
  /**
   * Foto temporária (opcional; precisa de `locate`): semelhança visual (0–1) entre a carta da foto e a deste quadro.
   * Com ela, depois da primeira leitura boa a confirmação compara quadros em vez de rodar o OCR de novo.
   */
  sameCard?: (photo: CardFeatures, frame: RgbaImage, quad: Quad) => number;
  /** Quadros seguidos da mesma carta para confirmar pela foto (padrão 1). */
  photoMatches?: number;
  now?: () => number;
  cache: {
    /** Escaneamento completo, tudo ou nada: só guarda a carta nova se referência, sprite e alvo ficarem prontos. */
    scanCard: (input: NonNullable<ReturnType<typeof inputFromResult>>, onProgress?: (progress: PrepareProgress) => void, isCurrent?: () => boolean) => Promise<ScanOutcome>;
    prepareCard: (id: string, onProgress?: (progress: PrepareProgress) => void) => Promise<PrepareResult>;
    get: (id: string) => Promise<CachedCard | undefined>;
  };
  onState: (state: ScanState) => void;
  /** Dados completos (dexId, imagem) de uma carta pelo id; usado na busca manual. */
  loadCardRecord?: (id: string) => Promise<CardRecordLike | null>;
  sleep?: (ms: number) => Promise<void>;
  /** Intervalo mínimo entre quadros analisados (a análise pode levar mais que isso). */
  minIntervalMs?: number;
  /** Quadros ambíguos seguidos antes de oferecer as opções ao usuário. */
  ambiguousAfter?: number;
  temporal?: TemporalAggregator;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Depois de congelar uma boa foto, toleramos poucos quadros desfocados antes de concluir que a carta mudou. */
const PHOTO_UNCERTAIN_FRAME_LIMIT = 3;

/**
 * Opções de escolha de uma leitura ambígua: TODAS as candidatas comparadas, na ordem do ranking, cada uma com a
 * própria confiança. Antes a lista era cortada em 4 (a 5ª candidata nunca aparecia) e as confianças eram casadas
 * por posição depois de um filtro, o que podia trocar a porcentagem de lugar.
 */
export function choicesOf(result: Pick<RecognitionResult, 'card' | 'confidence' | 'alternatives'>): ScanChoice[] {
  const out: ScanChoice[] = [];
  if (result.card) out.push({ card: result.card, confidence: result.confidence });
  for (const alt of result.alternatives) if (!out.some((c) => c.card.id === alt.card.id)) out.push({ card: alt.card, confidence: alt.confidence });
  return out;
}

/**
 * Orquestra o escaneamento: um quadro por vez, agregação temporal (só confirma carta que se repete),
 * opções de recuperação quando ambígua, gravação no cache depois de cada identificação e preparo dos
 * arquivos (referência, sprite, alvo de AR). Não toca em câmera, canvas nem rede diretamente: isso vem
 * por `deps`, então o fluxo inteiro é testado sem navegador.
 */
export class ScanController {
  private state: ScanState = { phase: 'idle', message: '', frames: 0 };
  private running = false;
  private runId = 0;
  private lastValidResult?: RecognitionResult;
  private noCardStreak = 0;
  private ambiguousStreak = 0;
  private lastAmbiguous: RecognitionResult | null = null;
  private readonly temporal: TemporalAggregator;
  private readonly stability = new StabilityTracker();
  /** A melhor foto nítida da curta janela de estabilização, antes de gastar OCR. */
  private readonly bestFrame = new BestFrameCapture();
  /** Leitura guardada junto com a foto temporária (a que vai ser confirmada ou oferecida para escolha). */
  private photoResult: RecognitionResult | null = null;
  /** Autofoco pode borrar um ou dois quadros logo depois da captura; isso não deve reiniciar a leitura boa. */
  private photoUncertainFrames = 0;

  constructor(private readonly deps: ScanDeps) {
    this.temporal = deps.temporal ?? new TemporalAggregator();
  }

  get current(): ScanState {
    return this.state;
  }

  private set(patch: Partial<ScanState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.onState(this.state);
  }

  /** Começa (ou recomeça) a procurar uma carta. */
  start(): void {
    this.stop();
    this.temporal.reset();
    this.ambiguousStreak = 0;
    this.lastAmbiguous = null;
    this.lastValidResult = undefined;
    this.noCardStreak = 0;
    this.stability.reset();
    this.bestFrame.clear();
    this.photoResult = null;
    this.photoUncertainFrames = 0;
    this.running = true;
    const id = ++this.runId;
    this.state = { phase: 'scanning', message: 'Procurando a carta…', frames: 0, timeline: { startedAt: this.now() }, photo: undefined };
    this.deps.onState(this.state);
    void this.loop(id);
  }

  stop(): void {
    this.running = false;
    this.runId++;
    this.photoResult = null;
    this.photoUncertainFrames = 0;
    this.bestFrame.clear();
  }

  /** Descarta a foto temporária (a carta mudou): a próxima leitura volta a usar o OCR. */
  private dropPhoto(): void {
    this.photoResult = null;
    this.photoUncertainFrames = 0;
    this.temporal.reset();
    this.ambiguousStreak = 0;
    this.set({ photo: undefined });
  }

  /** O usuário cancelou a leitura: para tudo (o que estava rodando é descartado entre as etapas) e diz isso. */
  cancel(): void {
    if (this.state.phase !== 'scanning' && this.state.phase !== 'choosing') return;
    this.stop();
    this.set({ phase: 'idle', message: 'Leitura cancelada. Toque em «Escanear» para ler de novo.', stage: undefined, choices: undefined, photo: undefined });
  }

  private now(): number {
    return (this.deps.now ?? (() => performance.now()))();
  }

  private elapsed(): number {
    return Math.round(this.now() - (this.state.timeline?.startedAt ?? this.now()));
  }

  /** Quadro em que só a detecção rodou: estado honesto (procurando / segure parado) sem fingir leitura. */
  private gatedAttempt(frame: RgbaImage, frames: number, located: LocateResult, stability: StabilityState, times: { capture: number; detect: number; stability: number }): void {
    const found = located.detection !== null;
    const hint = found && located.quality ? qualityWarning(located.quality) : null;
    const metrics: RecognitionMetrics = {
      detectMs: Math.round(times.detect), ocrMs: 0, candidatesMs: 0, totalMs: Math.round(times.capture + times.detect + times.stability),
      requests: 0, downloadedBytes: 0, candidates: 0, source: 'none', visualVerified: false, rotated180: false,
      stages: { capture: times.capture, detect: times.detect, stability: times.stability },
      skipped: found
        ? { ocrNumber: 'a carta ainda está mexendo: o OCR espera ela parar' }
        : { stability: 'nenhuma carta no quadro', ocrNumber: 'nenhuma carta no quadro' },
    };
    const last: LastAttempt = {
      status: 'no-card',
      message: found ? 'Carta encontrada: segure parado um instante…' : 'Procurando a carta…',
      confidence: 0, metrics, quad: located.detection?.quad, gated: true, frameSize: { width: frame.width, height: frame.height },
    };
    this.deps.onAttempt?.(last);
    this.set({ frames, last, message: last.message, stage: undefined, stability, qualityHint: hint });
  }

  /** Aguarda o laço atual terminar (testes). */
  private loopDone: Promise<void> = Promise.resolve();
  whenSettled(): Promise<void> {
    return this.loopDone;
  }

  private loop(id: number): Promise<void> {
    this.loopDone = this.runLoop(id);
    return this.loopDone;
  }

  private async runLoop(id: number): Promise<void> {
    const sleep = this.deps.sleep ?? defaultSleep;
    const interval = this.deps.minIntervalMs ?? 200;
    while (this.running && id === this.runId) {
      const started = Date.now();
      const tCapture = this.now();
      const frame = this.deps.grabFrame();
      const captureMs = this.now() - tCapture;
      if (!frame) {
        await sleep(200);
        continue;
      }
      // Detecção leve em todo quadro; o OCR (caro) só com a carta parada.
      let detection: CardDetection | undefined;
      let recognitionFrame = frame;
      let gateTimes: { capture: number; detect: number; stability: number } | undefined;
      if (this.deps.locate) {
        const tDetect = this.now();
        const located = this.deps.locate(frame);
        const detectMs = this.now() - tDetect;
        const tStable = this.now();
        const stability = this.stability.push(located.detection?.quad ?? null);
        const stabilityMs = this.now() - tStable;
        gateTimes = { capture: captureMs, detect: detectMs, stability: stabilityMs };
        if (!located.detection) this.bestFrame.clear();
        // Um deslocamento real da carta invalida a foto da janela anterior; oscilações pequenas de autofoco não.
        else if (stability.motion !== null && stability.motion > 0.04) this.bestFrame.clear();
        if (located.detection && located.quality) {
          this.bestFrame.consider({ frame, quality: located.quality, detection: located.detection, at: this.now() });
        }
        if (!located.detection || stability.kind !== 'stable') {
          this.gatedAttempt(frame, this.state.frames + 1, located, stability, gateTimes);
          const spent = Date.now() - started;
          if (spent < interval) await sleep(interval - spent);
          continue;
        }
        const best = this.bestFrame.take(this.now());
        recognitionFrame = best?.frame ?? frame;
        detection = best?.detection ?? located.detection;
        this.set({ stability, qualityHint: located.quality ? qualityWarning(located.quality) : null });
        // Foto temporária: em vez de ler de novo, confere se é a mesma carta da foto (barato) e confirma.
        const photo = this.photoResult;
        if (photo?.features && this.deps.sameCard && this.state.photo) {
          const tCompare = this.now();
          // A confirmação usa o contorno do quadro atual. `detection` pode apontar para a foto mais nítida
          // escolhida para o OCR e não deve ser misturada com pixels de um quadro posterior.
          const score = this.deps.sameCard(photo.features, frame, located.detection.quad);
          const compareMs = Math.round((this.now() - tCompare) * 10) / 10;
          const frames = this.state.frames + 1;
          const last: LastAttempt = {
            status: photo.status, message: '', confidence: photo.confidence, quad: located.detection.quad, frameSize: { width: frame.width, height: frame.height },
            metrics: {
              ...photo.metrics, totalMs: Math.round(captureMs + gateTimes.detect + gateTimes.stability + compareMs),
              stages: { capture: captureMs, detect: gateTimes.detect, stability: gateTimes.stability, temporal: compareMs },
              skipped: { ocrNumber: 'foto temporária: a leitura já foi feita, só confere se a carta é a mesma', ocrName: 'foto temporária' },
            },
            gated: true,
          };
          if (score >= SAME_CARD_SIMILARITY) {
            this.photoUncertainFrames = 0;
            const matches = this.state.photo.matches + 1;
            last.message = `Mesma carta da foto (${Math.round(score * 100)}% parecida).`;
            this.deps.onAttempt?.(last);
            if (matches >= this.state.photo.need) {
              const timeline = this.state.timeline ? { ...this.state.timeline, confirmedMs: this.elapsed() } : undefined;
              if (photo.status === 'identified' && photo.card) {
                this.running = false;
                this.set({ frames, last, timeline, stage: 'temporal', photo: { ...this.state.photo, matches } });
                await this.finish(id, photo, photo.card, 'automatico');
                return;
              }
              if (photo.status === 'ambiguous') {
                this.running = false;
                this.lastAmbiguous = photo;
                this.set({
                  phase: 'choosing', frames, last, timeline, stage: undefined, photo: { ...this.state.photo, matches },
                  message: 'Não tenho certeza de qual impressão é. Escolha a que está na sua mão ou tente de novo.',
                  choices: choicesOf(photo),
                });
                return;
              }
            }
            this.set({ frames, last, stage: 'temporal', photo: { ...this.state.photo, matches }, message: `📸 Foto tirada: ${photo.card?.name ?? 'carta'}. Confirmando que é a mesma carta…` });
            const spent = Date.now() - started;
            if (spent < interval) await sleep(interval - spent);
            continue;
          }
          // Durante o autofoco a detecção ainda pode achar a carta, mas a comparação cai por poucos quadros.
          // Mantemos a foto boa por uma janela curta se a própria heurística acusa foco/luz ruins; assim o OCR já
          // concluído não é descartado por um tremor da câmera no meio da confirmação.
          const focusWarning = located.quality ? qualityWarning(located.quality) : null;
          if (focusWarning && this.photoUncertainFrames < PHOTO_UNCERTAIN_FRAME_LIMIT) {
            this.photoUncertainFrames++;
            last.message = `Foto preservada enquanto o foco estabiliza (${this.photoUncertainFrames}/${PHOTO_UNCERTAIN_FRAME_LIMIT}).`;
            this.deps.onAttempt?.(last);
            this.set({ frames, last, stage: 'temporal', message: `${focusWarning} Mantendo a foto nítida já capturada…` });
            const spent = Date.now() - started;
            if (spent < interval) await sleep(interval - spent);
            continue;
          }
          // Outra carta (ou outro ângulo demais): a foto não vale mais, volta a ler.
          last.message = `A carta mudou (${Math.round(score * 100)}% parecida com a foto): lendo de novo.`;
          this.deps.onAttempt?.(last);
          this.set({ last, message: last.message });
          this.dropPhoto();
        }
      }
      let result: RecognitionResult;
      try {
        result = await this.deps.recognize(recognitionFrame, {
          detection,
          isCurrent: () => this.running && id === this.runId,
          onStage: (stage) => {
            if (id === this.runId) this.set({ stage });
          },
        });
      } catch (error) {
        if (id !== this.runId || error instanceof ScanCancelled) return;
        this.set({ message: `Erro ao analisar o quadro: ${error instanceof Error ? error.message : String(error)}`, stage: undefined });
        await sleep(1000);
        continue;
      }
      if (!this.running || id !== this.runId) return;
      const stages = result.metrics.stages;
      if (stages) {
        stages.capture = Math.round(captureMs * 10) / 10;
        if (gateTimes) {
          stages.detect = Math.round(gateTimes.detect * 10) / 10;
          stages.stability = Math.round(gateTimes.stability * 10) / 10;
          result.metrics.detectMs = Math.round(gateTimes.detect);
        }
      }
      // Suavização temporal: se não detectou carta mas tínhamos uma leitura recente,
      // reusa o resultado anterior por até 5 quadros seguidos para evitar "piscar".
      let reused = false;
      if (result.status === 'no-card' && this.lastValidResult) {
        result = this.lastValidResult;
        reused = true;
      } else if (result.status !== 'no-card') {
        this.lastValidResult = result;
        this.noCardStreak = 0;
      } else {
        this.noCardStreak = (this.noCardStreak ?? 0) + 1;
        if (this.noCardStreak >= 5) this.lastValidResult = undefined;
      }
      const frames = this.state.frames + 1;
      const tTemporal = this.now();
      const temporal = reused ? null : this.temporal.push(result);
      if (stages && !reused) stages.temporal = Math.round((this.now() - tTemporal) * 10) / 10;
      // Primeiras candidatas na tela: o relógio desde o começo da leitura até aqui.
      const timeline = this.state.timeline ? { ...this.state.timeline } : undefined;
      if (timeline && timeline.firstCandidateMs === undefined && !reused && result.card) {
        timeline.firstCandidateMs = this.elapsed();
        if (stages) stages.display = timeline.firstCandidateMs;
      }
      const last: LastAttempt = {
        status: result.status,
        message: result.message,
        confidence: result.confidence,
        metrics: result.metrics,
        ocrBottom: result.ocrText?.bottom,
        ocrName: result.ocrText?.name,
        cardName: result.card?.name,
        quad: result.quad,
        view: result.view,
        reused,
        frameSize: { width: recognitionFrame.width, height: recognitionFrame.height },
      };
      if (!reused) this.deps.onAttempt?.(last);

      if (result.status === 'identified' && result.card && temporal?.confirmedId === result.card.id) {
        this.running = false;
        if (timeline) timeline.confirmedMs = this.elapsed();
        this.set({ frames, last, timeline, stage: 'temporal' });
        await this.finish(id, result, result.card, 'automatico');
        return;
      }
      // Foto temporária: a primeira leitura boa (identificada ou entre impressões parecidas) fica guardada e a
      // confirmação segue comparando quadros com ela, sem rodar o OCR de novo.
      if (!reused && detection && this.deps.sameCard && result.features && (result.status === 'identified' || result.status === 'ambiguous') && result.card) {
        this.photoResult = result;
        this.lastAmbiguous = result.status === 'ambiguous' ? result : this.lastAmbiguous;
        this.set({
          frames, last, timeline, stage: 'temporal',
          photo: { frame: recognitionFrame, cardName: result.card.name, matches: 0, need: this.deps.photoMatches ?? 1 },
          message: `📸 Foto tirada: ${result.card.name}. Segure a carta mais um instante para confirmar…`,
        });
      } else if (result.status === 'identified') {
        this.ambiguousStreak = 0;
        const votes = temporal ? ` (${temporal.votes} de 2 leituras iguais)` : '';
        this.set({ frames, last, timeline, stage: 'temporal', message: `Vi ${result.card?.name ?? 'uma carta'}; confirmando…${votes}` });
      } else if (result.status === 'ambiguous') {
        this.ambiguousStreak++;
        this.lastAmbiguous = result;
        if (this.ambiguousStreak >= (this.deps.ambiguousAfter ?? 2)) {
          this.running = false;
          this.set({
            phase: 'choosing',
            frames,
            last,
            timeline,
            stage: undefined,
            message: 'Não tenho certeza de qual impressão é. Escolha a que está na sua mão ou tente de novo.',
            choices: choicesOf(result),
          });
          return;
        }
        this.set({ frames, last, timeline, stage: undefined, message: result.message });
      } else {
        this.ambiguousStreak = 0;
        this.set({ frames, last, timeline, stage: undefined, message: result.message });
      }
      const spent = Date.now() - started;
      if (spent < interval) await sleep(interval - spent);
    }
  }

  /** O usuário escolheu entre as candidatas de uma identificação ambígua. */
  async choose(cardId: string): Promise<void> {
    const result = this.lastAmbiguous;
    const choice = this.state.choices?.find((c) => c.card.id === cardId);
    if (!result || !choice) return;
    const id = ++this.runId;
    await this.finish(id, result, choice.card, 'escolha');
  }

  private async finish(id: number, result: RecognitionResult, chosen: IdentifiedCard, origin: 'automatico' | 'escolha'): Promise<void> {
    const input = inputFromResult(result, chosen);
    if (!input) return;
    this.set({ phase: 'preparing', message: `${chosen.name} (${chosen.setName} ${chosen.localId}): preparando para guardar no aparelho…`, choices: undefined, origin, stage: 'confirm' });
    const tConfirm = this.now();
    try {
      const outcome = await this.deps.cache.scanCard(
        input,
        (progress) => {
          if (id === this.runId) this.set({ progress, message: `Preparando ${progress.step}…` });
        },
        () => id === this.runId,
      );
      if (id !== this.runId) return;
      const timeline = this.state.timeline ? { ...this.state.timeline, confirmMs: Math.round(this.now() - tConfirm) } : undefined;
      if (!outcome.saved) return this.set({ phase: 'error', progress: undefined, message: outcome.reason, stage: undefined, timeline });
      const prepared = outcome.result;
      this.set({ phase: 'ready', card: prepared.card, progress: undefined, message: `${prepared.card.name} · ${prepared.card.setName} ${prepared.card.localId}`, origin, stage: undefined, timeline, prepareTimings: prepared.timings });
    } catch (error) {
      if (id !== this.runId) return;
      this.set({ phase: 'error', message: `Não consegui guardar a carta: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  /** O usuário achou a carta pela busca manual (a leitura automática falhou). Fica registrado como escolha dele. */
  async chooseManual(cardId: string): Promise<void> {
    this.stop();
    const id = ++this.runId;
    this.set({ phase: 'preparing', message: 'Buscando os dados da carta…', choices: undefined, card: undefined, origin: 'manual' });
    try {
      const record = await this.deps.loadCardRecord?.(cardId);
      if (!record) {
        this.set({ phase: 'error', message: 'Não consegui obter essa carta no TCGdex. Verifique a conexão e tente de novo.' });
        return;
      }
      const outcome = await this.deps.cache.scanCard(
        { card: record },
        (progress) => {
          if (id === this.runId) this.set({ progress, message: `Preparando ${progress.step}…` });
        },
        () => id === this.runId,
      );
      if (id !== this.runId) return;
      if (!outcome.saved) return this.set({ phase: 'error', progress: undefined, message: outcome.reason });
      const prepared = outcome.result;
      this.set({ phase: 'ready', card: prepared.card, progress: undefined, origin: 'manual', message: `${prepared.card.name} · ${prepared.card.setName} ${prepared.card.localId}` });
    } catch (error) {
      if (id !== this.runId) return;
      this.set({ phase: 'error', message: `Não consegui guardar a carta: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  /** Abre uma carta já guardada (tela "Carregar"): sem câmera nem reconhecimento. */
  async loadCached(cardId: string): Promise<void> {
    this.stop();
    const id = ++this.runId;
    this.set({ phase: 'preparing', message: 'Abrindo a carta guardada…', origin: 'cache', choices: undefined, card: undefined });
    try {
      const card = await this.deps.cache.get(cardId);
      if (!card) {
        this.set({ phase: 'error', message: 'Essa carta não está mais guardada neste aparelho.' });
        return;
      }
      const prepared = await this.deps.cache.prepareCard(cardId, (progress) => {
        if (id === this.runId) this.set({ progress, message: `Preparando ${progress.step}…` });
      });
      if (id !== this.runId) return;
      this.set({ phase: 'ready', card: prepared.card, progress: undefined, origin: 'cache', message: `${prepared.card.name} · ${prepared.card.setName} ${prepared.card.localId}` });
    } catch (error) {
      if (id !== this.runId) return;
      this.set({ phase: 'error', message: `Não consegui abrir a carta: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
}
