import { inputFromResult } from '../cache/card-cache';
import type { PrepareProgress, PrepareResult, ScanOutcome } from '../cache/card-cache';
import type { CachedCard } from '../cache/types';
import type { CardRecordLike, IdentifiedCard, RecognitionMetrics, RecognitionResult } from '../recognition/pipeline';
import { TemporalAggregator } from '../recognition/temporal';
import type { RgbaImage } from '../recognition/types';

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
}

export interface ScanDeps {
  grabFrame(): RgbaImage | null;
  recognize(frame: RgbaImage): Promise<RecognitionResult>;
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
    this.running = true;
    const id = ++this.runId;
    this.state = { phase: 'scanning', message: 'Procurando a carta…', frames: 0 };
    this.deps.onState(this.state);
    void this.loop(id);
  }

  stop(): void {
    this.running = false;
    this.runId++;
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
      const frame = this.deps.grabFrame();
      if (!frame) {
        await sleep(200);
        continue;
      }
      let result: RecognitionResult;
      try {
        result = await this.deps.recognize(frame);
      } catch (error) {
        if (id !== this.runId) return;
        this.set({ message: `Erro ao analisar o quadro: ${error instanceof Error ? error.message : String(error)}` });
        await sleep(1000);
        continue;
      }
      if (!this.running || id !== this.runId) return;
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
      };

      const temporal = this.temporal.push(result);
      if (result.status === 'identified' && result.card && temporal.confirmedId === result.card.id) {
        this.running = false;
        await this.finish(id, result, result.card, 'automatico');
        return;
      }
      if (result.status === 'identified') {
        this.ambiguousStreak = 0;
        this.set({ frames, last, message: `Vi ${result.card?.name ?? 'uma carta'}; confirmando…` });
      } else if (result.status === 'ambiguous') {
        this.ambiguousStreak++;
        this.lastAmbiguous = result;
        if (this.ambiguousStreak >= (this.deps.ambiguousAfter ?? 2)) {
          this.running = false;
          const options = [result.card, ...result.alternatives.map((a) => a.card)].filter((c): c is IdentifiedCard => !!c).slice(0, 4);
          const confidences = [result.confidence, ...result.alternatives.map((a) => a.confidence)];
          this.set({
            phase: 'choosing',
            frames,
            last,
            message: 'Não tenho certeza de qual impressão é. Escolha a que está na sua mão ou tente de novo.',
            choices: options.map((card, i) => ({ card, confidence: confidences[i] ?? 0 })),
          });
          return;
        }
        this.set({ frames, last, message: result.message });
      } else {
        this.ambiguousStreak = 0;
        this.set({ frames, last, message: result.message });
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
    this.set({ phase: 'preparing', message: `${chosen.name} (${chosen.setName} ${chosen.localId}): preparando para guardar no aparelho…`, choices: undefined, origin });
    try {
      const outcome = await this.deps.cache.scanCard(
        input,
        (progress) => {
          if (id === this.runId) this.set({ progress, message: `Preparando ${progress.step}…` });
        },
        () => id === this.runId,
      );
      if (id !== this.runId) return;
      if (!outcome.saved) return this.set({ phase: 'error', progress: undefined, message: outcome.reason });
      const prepared = outcome.result;
      this.set({ phase: 'ready', card: prepared.card, progress: undefined, message: `${prepared.card.name} · ${prepared.card.setName} ${prepared.card.localId}`, origin });
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
