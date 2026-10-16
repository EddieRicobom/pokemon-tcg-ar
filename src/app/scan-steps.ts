import type { ScanState } from './scan-controller';
import type { ScanStage } from '../recognition/stage-clock';

/**
 * As 8 etapas que o usuário vê enquanto o app lê a carta (prompt mestre, seção 4.3), derivadas do estado REAL do
 * controlador: a etapa ativa é a que o pipeline avisou que começou; etapa pulada aparece como pulada (com o motivo),
 * nunca como atividade falsa. Puro e testável.
 */
export type StepKey = 'localizar' | 'estabilizar' | 'perspectiva' | 'numero' | 'nome' | 'catalogo' | 'confirmar' | 'identificada';
export type StepState = 'pending' | 'active' | 'done' | 'skipped' | 'failed';

export interface ScanStep {
  key: StepKey;
  label: string;
  state: StepState;
  /** Por que a etapa foi pulada ou falhou. */
  note?: string;
}

const STEPS: readonly { key: StepKey; label: string; stages: readonly ScanStage[] }[] = [
  { key: 'localizar', label: 'Localizando carta', stages: ['capture', 'detect'] },
  { key: 'estabilizar', label: 'Estabilizando imagem', stages: ['stability'] },
  { key: 'perspectiva', label: 'Corrigindo perspectiva', stages: ['perspective'] },
  { key: 'numero', label: 'Lendo número', stages: ['cropNumber', 'ocrNumber'] },
  { key: 'nome', label: 'Lendo nome', stages: ['cropName', 'ocrName'] },
  { key: 'catalogo', label: 'Comparando com o catálogo', stages: ['catalog', 'visual', 'ranking'] },
  { key: 'confirmar', label: 'Confirmando identificação', stages: ['temporal', 'display', 'confirm'] },
  { key: 'identificada', label: 'Carta identificada', stages: [] },
];

function indexOfStage(stage: ScanStage | undefined): number {
  if (!stage) return -1;
  return STEPS.findIndex((step) => step.stages.includes(stage));
}

export function scanSteps(state: ScanState): ScanStep[] {
  const steps: ScanStep[] = STEPS.map(({ key, label }) => ({ key, label, state: 'pending' }));
  const mark = (upTo: number, as: StepState = 'done') => {
    for (let i = 0; i < upTo; i++) if (steps[i]!.state === 'pending') steps[i]!.state = as;
  };
  if (state.phase === 'ready') {
    steps.forEach((s) => (s.state = 'done'));
    return applySkips(steps, state);
  }
  if (state.phase === 'preparing' || state.phase === 'choosing') {
    mark(6);
    steps[6]!.state = state.phase === 'choosing' ? 'failed' : 'active';
    if (state.phase === 'choosing') steps[6]!.note = 'impressões parecidas: escolha a sua';
    return applySkips(steps, state);
  }
  if (state.phase !== 'scanning') return steps;

  const last = state.last;
  // Ao vivo: o pipeline disse qual etapa começou.
  const live = indexOfStage(state.stage);
  if (live >= 0) {
    mark(live);
    steps[live]!.state = 'active';
    return applySkips(steps, state);
  }
  // Entre leituras: onde o último quadro parou.
  if (!last || (last.status === 'no-card' && !last.quad)) {
    steps[0]!.state = 'active';
    return steps;
  }
  if (last.gated) {
    steps[0]!.state = 'done';
    steps[1]!.state = 'active';
    return steps;
  }
  if (last.status === 'identified') {
    mark(6);
    steps[6]!.state = 'active';
    return applySkips(steps, state);
  }
  // Leu mas não achou: a etapa do catálogo falhou; volta a procurar no próximo quadro.
  mark(5);
  steps[5]!.state = 'failed';
  steps[5]!.note = last.message;
  return applySkips(steps, state);
}

/** Etapa que o pipeline pulou de propósito na última leitura fica marcada como pulada, com o motivo. */
function applySkips(steps: ScanStep[], state: ScanState): ScanStep[] {
  const skipped = state.last?.metrics.skipped ?? {};
  for (const def of STEPS) {
    if (def.stages.length === 0) continue;
    const reasons = def.stages.map((stage) => skipped[stage]).filter((r): r is string => !!r);
    const step = steps.find((s) => s.key === def.key)!;
    if (reasons.length === def.stages.length && step.state !== 'active') {
      step.state = 'skipped';
      step.note = reasons[0];
    }
  }
  return steps;
}

/** Texto curto do estado da carta (o que o usuário precisa fazer agora), ou null. */
export function stabilityText(state: ScanState): string | null {
  const s = state.stability;
  if (!s || state.phase !== 'scanning') return null;
  if (s.kind === 'searching') return 'Nenhuma carta no quadro';
  if (s.kind === 'moving') return 'Carta mexendo: segure parado';
  return 'Carta parada';
}
