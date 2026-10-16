import { reactive } from 'vue';
import { SCAN_STAGES } from '../recognition/stage-clock';
import type { ScanStage, StageTimes } from '../recognition/stage-clock';

/**
 * Registro das métricas do scan nesta sessão (só números; nenhum quadro de câmera é guardado), para a tela de
 * Diagnóstico mostrar mediana e p90 de cada etapa e comparar antes/depois de uma mudança com dados reais.
 */
export interface StageSummary {
  stage: ScanStage;
  count: number;
  median: number;
  p90: number;
  last: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)) * 10) / 10;
}

export class ScanMetricsLog {
  private readonly samples = new Map<ScanStage, number[]>();
  private readonly lasts = new Map<ScanStage, number>();
  /** Leituras completas (com OCR) e quadros só de detecção, desde o início da sessão. */
  reads = 0;
  gated = 0;

  constructor(private readonly keep = 60) {}

  /** `kind`: leitura com OCR, quadro só de detecção, ou um evento fora do quadro (guardar a carta, iniciar o AR). */
  record(stages: StageTimes, kind: 'read' | 'gated' | 'event' = 'read'): void {
    if (kind === 'gated') this.gated++;
    else if (kind === 'read') this.reads++;
    for (const stage of SCAN_STAGES) {
      const value = stages[stage];
      if (value === undefined) continue;
      const list = this.samples.get(stage) ?? [];
      list.push(value);
      if (list.length > this.keep) list.shift();
      this.samples.set(stage, list);
      this.lasts.set(stage, value);
    }
  }

  summary(): StageSummary[] {
    const out: StageSummary[] = [];
    for (const stage of SCAN_STAGES) {
      const list = this.samples.get(stage);
      if (!list || list.length === 0) continue;
      const sorted = [...list].sort((a, b) => a - b);
      out.push({ stage, count: list.length, median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), last: this.lasts.get(stage) ?? 0 });
    }
    return out;
  }

  clear(): void {
    this.samples.clear();
    this.lasts.clear();
    this.reads = 0;
    this.gated = 0;
  }
}

/** Registro compartilhado entre Escanear (grava) e Diagnóstico (mostra). `version` muda a cada gravação. */
export const scanMetrics = reactive({ log: new ScanMetricsLog(), version: 0 });

export function recordScanMetrics(stages: StageTimes, kind: 'read' | 'gated' | 'event' = 'read'): void {
  scanMetrics.log.record(stages, kind);
  scanMetrics.version++;
}
