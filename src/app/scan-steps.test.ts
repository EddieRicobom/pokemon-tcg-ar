import { describe, expect, it } from 'vitest';
import type { LastAttempt, ScanState } from './scan-controller';
import { ScanMetricsLog } from './scan-metrics';
import { scanSteps, stabilityText } from './scan-steps';

const metrics = (skipped = {}): LastAttempt['metrics'] => ({
  detectMs: 0, ocrMs: 0, candidatesMs: 0, totalMs: 0, requests: 0, downloadedBytes: 0, candidates: 0, source: 'none',
  visualVerified: false, rotated180: false, stages: {}, skipped,
});
const states = (steps: ReturnType<typeof scanSteps>) => steps.map((s) => s.state);
const scanning = (patch: Partial<ScanState>): ScanState => ({ phase: 'scanning', message: '', frames: 1, ...patch });

describe('etapas do scan na tela', () => {
  it('sem leitura ainda: só "Localizando carta" ativa', () => {
    expect(states(scanSteps(scanning({})))).toEqual(['active', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
  });

  it('carta achada mas mexendo: esperando estabilizar', () => {
    const last: LastAttempt = { status: 'no-card', message: '', confidence: 0, metrics: metrics(), quad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], gated: true };
    expect(states(scanSteps(scanning({ last }))).slice(0, 3)).toEqual(['done', 'active', 'pending']);
  });

  it('ao vivo segue a etapa que o pipeline avisou (OCR do número)', () => {
    expect(states(scanSteps(scanning({ stage: 'ocrNumber' })))).toEqual(['done', 'done', 'done', 'active', 'pending', 'pending', 'pending', 'pending']);
  });

  it('nome pulado aparece como pulado, com o motivo (nunca como atividade)', () => {
    const last: LastAttempt = { status: 'identified', message: '', confidence: 0.9, metrics: metrics({ cropName: 'o número já aponta uma única carta', ocrName: 'o número já aponta uma única carta' }) };
    const steps = scanSteps(scanning({ last }));
    const nome = steps.find((s) => s.key === 'nome')!;
    expect(nome.state).toBe('skipped');
    expect(nome.note).toMatch(/única carta/);
    expect(steps.find((s) => s.key === 'confirmar')!.state).toBe('active');
  });

  it('leitura sem resultado marca a comparação como falha, com a mensagem', () => {
    const last: LastAttempt = { status: 'not-found', message: 'Não consegui ler o número', confidence: 0, metrics: metrics(), quad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] };
    const step = scanSteps(scanning({ last })).find((s) => s.key === 'catalogo')!;
    expect(step).toMatchObject({ state: 'failed', note: 'Não consegui ler o número' });
  });

  it('pronta: tudo feito; escolhendo: a confirmação espera você', () => {
    expect(states(scanSteps({ phase: 'ready', message: '', frames: 3 })).every((s) => s === 'done')).toBe(true);
    const choosing = scanSteps({ phase: 'choosing', message: '', frames: 3 });
    expect(choosing.find((s) => s.key === 'confirmar')).toMatchObject({ state: 'failed' });
  });

  it('texto da estabilidade', () => {
    expect(stabilityText(scanning({ stability: { kind: 'moving', motion: 0.1, stableFrames: 0 } }))).toMatch(/segure parado/);
    expect(stabilityText({ phase: 'idle', message: '', frames: 0, stability: { kind: 'stable', motion: 0, stableFrames: 2 } })).toBeNull();
  });
});

describe('registro de métricas do scan', () => {
  it('mediana, p90 e última de cada etapa; etapas que não rodaram não aparecem', () => {
    const log = new ScanMetricsLog();
    for (const ms of [100, 200, 300, 400, 1000]) log.record({ ocrNumber: ms, detect: 10 });
    log.record({ detect: 12 }, 'gated');
    log.record({ confirm: 900 }, 'event');
    const byStage = Object.fromEntries(log.summary().map((s) => [s.stage, s]));
    expect(byStage.ocrNumber).toMatchObject({ count: 5, median: 300, last: 1000 });
    expect(byStage.ocrNumber!.p90).toBeGreaterThan(400);
    expect(byStage.detect!.count).toBe(6);
    expect(byStage.ocrName).toBeUndefined();
    expect(log.reads).toBe(5);
    expect(log.gated).toBe(1);
  });

  it('guarda só as últimas amostras', () => {
    const log = new ScanMetricsLog(3);
    for (const ms of [1, 2, 3, 4]) log.record({ detect: ms });
    expect(log.summary()[0]).toMatchObject({ count: 3, median: 3 });
  });
});
