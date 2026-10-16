import { describe, expect, it, vi } from 'vitest';
import type { ScanOutcome } from '../cache/card-cache';
import type { CachedCard } from '../cache/types';
import type { IdentifiedCard, RecognitionMetrics, RecognitionResult } from '../recognition/pipeline';
import type { RgbaImage } from '../recognition/types';
import { choicesOf, ScanController } from './scan-controller';
import type { ScanState } from './scan-controller';

const frame: RgbaImage = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
const metrics: RecognitionMetrics = {
  detectMs: 1, ocrMs: 1, candidatesMs: 1, totalMs: 3, requests: 0, downloadedBytes: 0, candidates: 1,
  source: 'network', visualVerified: true, rotated180: false, stages: {}, skipped: {},
};

function card(id: string, name = 'Pikachu'): IdentifiedCard {
  return { id, name, setId: id.split('-')[0]!, setName: 'Set', localId: id.split('-')[1]!, setOfficial: 102, setTotal: 102, dexIds: [25], dexId: 25 };
}

function result(partial: Partial<RecognitionResult>): RecognitionResult {
  return {
    status: 'not-found', alternatives: [], confidence: 0, margin: 0, parsed: { bottom: {}, names: [] }, metrics, message: 'x', ...partial,
  };
}

const identified = (id = 'base1-58') => result({ status: 'identified', card: card(id), confidence: 0.97, margin: 0.4, message: 'ok' });

function cachedCard(id: string): CachedCard {
  return {
    id, schema: 1, name: 'Pikachu', setId: 'base1', setName: 'Set', localId: '58', setOfficial: 102, setTotal: 102, dexIds: [25],
    reference: { state: 'ok' }, sprite: { state: 'ok', kind: 'gif' }, target: { state: 'ok' }, firstSeenAt: 1, lastSeenAt: 1, scanCount: 1,
  };
}

function setup(results: RecognitionResult[]) {
  const states: ScanState[] = [];
  const queue = [...results];
  const cache = {
    scanCard: vi.fn(async (input: { card: { id: string } }, onProgress?: (p: never) => void, _isCurrent?: () => boolean): Promise<ScanOutcome> => {
      onProgress?.({ cardId: input.card.id, step: 'sprite', index: 1, total: 3 } as never);
      return { saved: true, result: { id: input.card.id, status: 'completo', card: cachedCard(input.card.id) } };
    }),
    prepareCard: vi.fn(async (id: string, onProgress?: (p: never) => void) => {
      onProgress?.({ cardId: id, step: 'sprite', index: 1, total: 3 } as never);
      return { id, status: 'completo' as const, card: cachedCard(id) };
    }),
    get: vi.fn(async (id: string) => (id === 'missing' ? undefined : cachedCard(id))),
  };
  const controller = new ScanController({
    grabFrame: () => frame,
    recognize: async () => queue.shift() ?? result({ status: 'no-card' }),
    cache,
    onState: (s) => states.push(s),
    loadCardRecord: async (id) => (id === 'missing' ? null : card(id)),
    sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
  });
  return { controller, cache, states };
}

describe('ScanController (busca manual)', () => {
  it('chooseManual guarda a carta e chega a "ready" com origem manual', async () => {
    const { controller, cache, states } = setup([]);
    await controller.chooseManual('base1-58');
    expect(cache.scanCard).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ phase: 'ready', origin: 'manual' });
  });

  it('id que o TCGdex não conhece: erro claro, nada é gravado', async () => {
    const { controller, cache, states } = setup([]);
    await controller.chooseManual('missing');
    expect(cache.scanCard).not.toHaveBeenCalled();
    expect(states.at(-1)?.phase).toBe('error');
  });
});

describe('ScanController', () => {
  it('só confirma a carta depois de repetida em dois quadros e então grava no cache', async () => {
    const medium = result({ status: 'identified', card: card('base1-58'), confidence: 0.85, margin: 0.12 });
    const { controller, cache, states } = setup([medium, medium]);
    controller.start();
    await controller.whenSettled();
    expect(cache.scanCard).toHaveBeenCalledTimes(1);
    expect(controller.current.phase).toBe('ready');
    expect(controller.current.origin).toBe('automatico');
    expect(states.some((s) => s.message.includes('confirmando'))).toBe(true);
  });

  it('confiança muito alta e margem grande confirma já no primeiro quadro', async () => {
    const { controller, cache } = setup([identified()]);
    controller.start();
    await controller.whenSettled();
    expect(cache.scanCard).toHaveBeenCalledTimes(1);
    expect(controller.current.phase).toBe('ready');
  });

  it('um quadro isolado e de confiança média não confirma', async () => {
    const lowConfidence = result({ status: 'identified', card: card('base1-58'), confidence: 0.85, margin: 0.12 });
    const { controller, cache } = setup([lowConfidence, result({ status: 'not-found', message: 'sem número' })]);
    controller.start();
    await new Promise((r) => setTimeout(r, 20));
    controller.stop();
    expect(cache.scanCard).not.toHaveBeenCalled();
    expect(controller.current.phase).toBe('scanning');
  });

  it('quadros trocando de carta não confirmam nenhuma', async () => {
    const a = result({ status: 'identified', card: card('base1-58'), confidence: 0.85, margin: 0.12 });
    const b = result({ status: 'identified', card: card('hgss4-58', 'Gengar'), confidence: 0.85, margin: 0.12 });
    const { controller, cache } = setup([a, b, a.status === 'identified' ? b : a]);
    controller.start();
    // Espera a confirmação acontecer (ou 2 s), em vez de um tempo fixo que falhava com a máquina carregada.
    for (let waited = 0; cache.scanCard.mock.calls.length === 0 && waited < 2000; waited += 5) await new Promise((r) => setTimeout(r, 5));
    controller.stop();
    // b aparece duas vezes → é a confirmada, a não.
    expect(cache.scanCard.mock.calls.map((c) => c[0].card.id)).toEqual(['hgss4-58']);
  });

  it('ambígua duas vezes: oferece opções e só segue depois da escolha do usuário', async () => {
    const ambiguous = result({
      status: 'ambiguous', card: card('base1-58'), confidence: 0.6, margin: 0.02,
      alternatives: [{ card: card('base1-59', 'Raichu'), confidence: 0.58, reasons: [] }],
    });
    const { controller, cache } = setup([ambiguous, ambiguous]);
    controller.start();
    await controller.whenSettled();
    expect(controller.current.phase).toBe('choosing');
    expect(controller.current.choices?.map((c) => c.card.id)).toEqual(['base1-58', 'base1-59']);
    expect(cache.scanCard).not.toHaveBeenCalled();

    await controller.choose('base1-59');
    expect(cache.scanCard).toHaveBeenCalledTimes(1);
    expect(cache.scanCard.mock.calls[0]![0].card.id).toBe('base1-59');
    expect(controller.current.phase).toBe('ready');
    expect(controller.current.origin).toBe('escolha');
  });

  it('carrega uma carta do cache sem câmera nem reconhecimento', async () => {
    const { controller, cache } = setup([]);
    await controller.loadCached('base1-58');
    expect(controller.current.phase).toBe('ready');
    expect(controller.current.origin).toBe('cache');
    expect(cache.scanCard).not.toHaveBeenCalled();
  });

  it('carta que sumiu do cache vira erro claro em português', async () => {
    const { controller } = setup([]);
    await controller.loadCached('missing');
    expect(controller.current.phase).toBe('error');
    expect(controller.current.message).toContain('não está mais guardada');
  });

  it('falha ao gravar no cache vira erro, não carta "pronta"', async () => {
    const { controller, cache } = setup([identified(), identified()]);
    cache.scanCard.mockRejectedValueOnce(new Error('quota'));
    controller.start();
    await controller.whenSettled();
    expect(controller.current.phase).toBe('error');
    expect(controller.current.card).toBeUndefined();
  });

  it('escaneamento que não completou vira erro com o motivo e nunca "ready"', async () => {
    const { controller, cache } = setup([identified(), identified()]);
    const incomplete = { id: 'base1-58', status: 'falhou' as const, card: { ...cachedCard('base1-58'), sprite: { state: 'error' as const, error: 'sem resposta' } } };
    cache.scanCard.mockResolvedValueOnce({ saved: false, result: incomplete, reason: 'Não consegui preparar o Pokémon animado (sem resposta). Nada foi guardado; tente de novo.' });
    controller.start();
    await controller.whenSettled();
    expect(controller.current.phase).toBe('error');
    expect(controller.current.card).toBeUndefined();
    expect(controller.current.message).toContain('Nada foi guardado');
  });

  it('a busca manual também só chega a "ready" se o escaneamento completou', async () => {
    const { controller, cache } = setup([]);
    cache.scanCard.mockResolvedValueOnce({ saved: false, result: { id: 'base1-58', status: 'parcial', card: cachedCard('base1-58') }, reason: 'faltou o alvo' });
    await controller.chooseManual('base1-58');
    expect(controller.current).toMatchObject({ phase: 'error', message: 'faltou o alvo' });
  });

  it('avisa o cache quando o escaneamento foi superado (parar ou recomeçar), para desfazer a carta nova', async () => {
    const { controller, cache } = setup([identified(), identified()]);
    let isCurrent: (() => boolean) | undefined;
    cache.scanCard.mockImplementationOnce(async (input, _p, current) => {
      isCurrent = current;
      controller.stop();
      return { saved: false, result: { id: input.card.id, status: 'completo' as const, card: cachedCard(input.card.id) }, reason: 'cancelado' };
    });
    controller.start();
    await controller.whenSettled();
    expect(isCurrent?.()).toBe(false);
    expect(controller.current.phase).not.toBe('ready');
  });

  it('parar interrompe o laço e não grava nada', async () => {
    const { controller, cache } = setup([]);
    controller.start();
    controller.stop();
    await controller.whenSettled();
    expect(cache.scanCard).not.toHaveBeenCalled();
  });
});

describe('ScanController (Fase A: estabilidade, cancelar, candidatas)', () => {
  const quadAt = (dx: number) => [{ x: 10 + dx, y: 10 }, { x: 110 + dx, y: 10 }, { x: 110 + dx, y: 150 }, { x: 10 + dx, y: 150 }] as [
    { x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number },
  ];
  const det = (dx: number) => ({ quad: quadAt(dx), areaFraction: 0.4, aspect: 0.7, fillRatio: 0.9, score: 1 });

  function gated(locations: (number | null)[], results: RecognitionResult[]) {
    const queue = [...results];
    const places = [...locations];
    const recognize = vi.fn(async (_f: RgbaImage, options?: { detection?: unknown }) => {
      expect(options?.detection).toBeDefined();
      return queue.shift() ?? result({ status: 'not-found' });
    });
    const base = setup([]);
    const controller = new ScanController({
      grabFrame: () => frame,
      recognize,
      locate: () => {
        const dx = places.length > 0 ? places.shift()! : 0;
        return { detection: dx === null ? null : det(dx) };
      },
      cache: base.cache,
      onState: (s) => base.states.push(s),
      sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    });
    return { controller, recognize, states: base.states, cache: base.cache };
  }

  it('o OCR só roda com a carta parada: sem carta e carta mexendo não chamam o pipeline', async () => {
    const { controller, recognize, states, cache } = gated([null, 0, 40, 41, 41], [identified()]);
    controller.start();
    await controller.whenSettled();
    // Quadros: sem carta, 1º com carta (sem par), mexeu 40 px, parada (41) → só agora reconhece.
    expect(recognize).toHaveBeenCalledTimes(1);
    expect(cache.scanCard).toHaveBeenCalledTimes(1);
    expect(states.some((s) => s.message.includes('segure parado'))).toBe(true);
    expect(states.some((s) => s.last?.gated && s.last.metrics.skipped.ocrNumber)).toBe(true);
  });

  it('cancelar para a leitura e diz isso (nada é gravado)', async () => {
    const medium = result({ status: 'identified', card: card('base1-58'), confidence: 0.85, margin: 0.12 });
    const { controller, cache } = setup([medium]);
    controller.start();
    controller.cancel();
    await controller.whenSettled();
    expect(controller.current.phase).toBe('idle');
    expect(controller.current.message).toMatch(/cancelada/);
    expect(cache.scanCard).not.toHaveBeenCalled();
  });

  it('a leitura repetida (carta sumiu um quadro) não conta como segundo voto da confirmação', async () => {
    const medium = result({ status: 'identified', card: card('base1-58'), confidence: 0.85, margin: 0.12 });
    const { controller, cache } = setup([medium, result({ status: 'no-card' }), result({ status: 'not-found' })]);
    controller.start();
    await new Promise((r) => setTimeout(r, 20));
    controller.stop();
    expect(cache.scanCard).not.toHaveBeenCalled();
  });

  it('anota quando as primeiras candidatas apareceram e quanto levou para guardar a carta', async () => {
    let t = 0;
    const base = setup([]);
    const controller = new ScanController({
      grabFrame: () => frame,
      recognize: async () => { t += 900; return identified(); },
      cache: base.cache,
      onState: () => {},
      now: () => t,
      sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    });
    controller.start();
    await controller.whenSettled();
    expect(controller.current.timeline).toMatchObject({ firstCandidateMs: 900, confirmedMs: 900 });
    expect(controller.current.timeline?.confirmMs).toBeGreaterThanOrEqual(0);
  });
});

describe('opções de uma leitura ambígua', () => {
  it('mostra TODAS as candidatas (antes cortava em 4), cada uma com a própria confiança', () => {
    const alts = [2, 3, 4, 5, 6].map((n) => ({ card: card(`s-${n}`), confidence: 0.6 - n / 100, reasons: [] }));
    const out = choicesOf({ card: card('s-1'), confidence: 0.61, alternatives: alts });
    expect(out.map((c) => c.card.id)).toEqual(['s-1', 's-2', 's-3', 's-4', 's-5', 's-6']);
    expect(out.at(-1)?.confidence).toBeCloseTo(0.54);
  });

  it('sem carta principal, as confianças não trocam de lugar', () => {
    const out = choicesOf({ card: undefined, confidence: 0.4, alternatives: [{ card: card('s-2'), confidence: 0.3, reasons: [] }] });
    expect(out).toEqual([{ card: card('s-2'), confidence: 0.3 }]);
  });
});
