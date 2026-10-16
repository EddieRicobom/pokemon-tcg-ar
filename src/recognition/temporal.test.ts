import { describe, expect, it } from 'vitest';
import type { IdentifiedCard, RecognitionResult } from './pipeline';
import { TemporalAggregator } from './temporal';

function frame(id: string | null, confidence = 0.85, margin = 0.15): RecognitionResult {
  const card = id ? ({ id } as IdentifiedCard) : undefined;
  return {
    status: id ? 'identified' : 'not-found', card, alternatives: [], confidence, margin, parsed: { bottom: {}, names: [] },
    metrics: { detectMs: 0, ocrMs: 0, candidatesMs: 0, totalMs: 0, requests: 0, downloadedBytes: 0, candidates: 0, source: 'none', visualVerified: true, rotated180: false, stages: {}, skipped: {} },
    message: '',
  };
}

describe('TemporalAggregator', () => {
  it('exige dois votos da mesma carta', () => {
    const t = new TemporalAggregator();
    expect(t.push(frame('a')).confirmedId).toBeNull();
    expect(t.push(frame('a')).confirmedId).toBe('a');
  });

  it('um quadro ruim no meio não derruba nem troca a carta', () => {
    const t = new TemporalAggregator();
    t.push(frame('a'));
    t.push(frame('a'));
    expect(t.push(frame('b')).confirmedId).toBe('a');
    expect(t.push(frame(null)).confirmedId).toBe('a');
  });

  it('confiança muito alta confirma de imediato', () => {
    const t = new TemporalAggregator();
    expect(t.push(frame('a', 0.97, 0.4)).confirmedId).toBe('a');
  });

  it('votos antigos saem da janela', () => {
    const t = new TemporalAggregator({ window: 3 });
    t.push(frame('a'));
    t.push(frame('a'));
    t.push(frame('b'));
    t.push(frame('b'));
    expect(t.push(frame('b')).confirmedId).toBe('b');
  });

  it('reset limpa o histórico', () => {
    const t = new TemporalAggregator();
    t.push(frame('a'));
    t.reset();
    expect(t.push(frame('a')).confirmedId).toBeNull();
  });
});
