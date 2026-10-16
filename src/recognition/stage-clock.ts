/**
 * Etapas medidas do escaneamento, na ordem do pipeline real (prompt mestre, seção 4.1). Cada leitura guarda só o
 * tempo das etapas que de fato rodaram; etapa pulada fica em `skipped` com o motivo — nunca um tempo inventado.
 */
export const SCAN_STAGES = [
  'capture', 'detect', 'stability', 'perspective', 'cropNumber', 'cropName', 'ocrNumber', 'ocrName',
  'catalog', 'visual', 'ranking', 'temporal', 'display', 'confirm', 'arInit',
] as const;
export type ScanStage = (typeof SCAN_STAGES)[number];

export const SCAN_STAGE_LABELS_PT: Record<ScanStage, string> = {
  capture: 'Captura do quadro',
  detect: 'Detecção da carta',
  stability: 'Estabilização',
  perspective: 'Correção da perspectiva',
  cropNumber: 'Recorte do número',
  cropName: 'Recorte do nome',
  ocrNumber: 'OCR do número',
  ocrName: 'OCR do nome',
  catalog: 'Busca no catálogo',
  visual: 'Comparação visual',
  ranking: 'Ordenação das candidatas',
  temporal: 'Confirmação temporal',
  display: 'Até as primeiras candidatas',
  confirm: 'Confirmação (guardar a carta)',
  arInit: 'Início do AR',
};

export type StageTimes = Partial<Record<ScanStage, number>>;

/** A leitura foi abandonada (o usuário cancelou ou recomeçou): ninguém espera mais por ela. */
export class ScanCancelled extends Error {
  constructor() {
    super('Leitura cancelada.');
    this.name = 'ScanCancelled';
  }
}

export interface StageClockOptions {
  now?: () => number;
  /** Avisado quando uma etapa começa (para a interface mostrar o que está rodando agora, sem simular nada). */
  onStage?: (stage: ScanStage) => void;
  /** false = leitura obsoleta: a próxima etapa nem começa (`ScanCancelled`). */
  isCurrent?: () => boolean;
}

export class StageClock {
  readonly times: StageTimes = {};
  readonly skipped: Partial<Record<ScanStage, string>> = {};
  private readonly now: () => number;

  constructor(private readonly options: StageClockOptions = {}) {
    this.now = options.now ?? (() => performance.now());
  }

  /** Lança `ScanCancelled` se a leitura ficou obsoleta. Chamado entre as etapas (o OCR em si não é interrompível). */
  check(): void {
    if (this.options.isCurrent && !this.options.isCurrent()) throw new ScanCancelled();
  }

  add(stage: ScanStage, ms: number): void {
    this.times[stage] = Math.round(((this.times[stage] ?? 0) + Math.max(0, ms)) * 10) / 10;
    delete this.skipped[stage];
  }

  skip(stage: ScanStage, reason: string): void {
    if (this.times[stage] === undefined) this.skipped[stage] = reason;
  }

  time<T>(stage: ScanStage, fn: () => T): T {
    this.check();
    this.options.onStage?.(stage);
    const t0 = this.now();
    try {
      return fn();
    } finally {
      this.add(stage, this.now() - t0);
    }
  }

  async timeAsync<T>(stage: ScanStage, fn: () => Promise<T>): Promise<T> {
    this.check();
    this.options.onStage?.(stage);
    const t0 = this.now();
    try {
      return await fn();
    } finally {
      this.add(stage, this.now() - t0);
    }
  }
}
