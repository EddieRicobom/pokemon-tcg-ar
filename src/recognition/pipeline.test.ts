import { describe, expect, it } from 'vitest';
import { renderScene, syntheticCard, uniformImage } from './__fixtures__/synthetic';
import { ART_RECORD_BYTES, ArtIndex, encodeRecord, packArtIndex } from './art-index';
import { CatalogLookup } from './catalog-index';
import type { CatalogIndexData } from './catalog-index';
import { computeFeatures } from './hash';
import { rectify } from './homography';
import type { OcrEngine, OcrRegion } from './ocr';
import { RecognitionPipeline, recordFromTcgdex } from './pipeline';
import type { PipelineDeps } from './pipeline';
import { TcgdexClient } from './tcgdex';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from './types';
import type { Quad, RgbaImage } from './types';

const scans = new Map<number, RgbaImage>([[1, syntheticCard(1)], [2, syntheticCard(2)], [3, syntheticCard(3)]]);

describe('metadados da carta', () => {
  it('preserva apenas a raridade informada pelo TCGdex', () => {
    const raw = { id: 'base1-58', name: 'Pikachu', localId: '58', rarity: 'Rara', image: 'https://assets.example/card', dexId: [25], set: { id: 'base1', name: 'Base Set', cardCount: { official: 102, total: 102 } } };
    expect(recordFromTcgdex(raw)).toMatchObject({ rarity: 'Rara', localId: '58', setName: 'Base Set' });
    const unknown = { ...raw, rarity: undefined };
    expect(recordFromTcgdex(unknown)).not.toHaveProperty('rarity');
  });
});

const index: CatalogIndexData = {
  version: 1,
  generatedAt: 'teste',
  sets: [
    { id: 'base1', name: 'Base Set', official: 102, total: 102, release: '1999-01-09', cards: [['58', 'Pikachu']] },
    { id: 'hgss4', name: 'Triumphant', official: 102, total: 102, release: '2010-11-03', cards: [['58', 'Gengar']] },
    { id: 'base2', name: 'Jungle', official: 64, total: 64, release: '1999-06-16', cards: [['60', 'Pikachu']] },
  ],
};

/** Cartas "do TCGdex" do teste: id → (seed da imagem, dados). */
const api: Record<string, { seed: number; body: unknown }> = {
  'base1-58': { seed: 1, body: card('base1-58', '58', 'Pikachu', 'base1', 'Base Set', 102, [25]) },
  'hgss4-58': { seed: 2, body: card('hgss4-58', '58', 'Gengar', 'hgss4', 'Triumphant', 102, [94]) },
  'base2-60': { seed: 3, body: card('base2-60', '60', 'Pikachu', 'base2', 'Jungle', 64, [25]) },
};

function card(id: string, localId: string, name: string, setId: string, setName: string, official: number, dexId: number[]) {
  return { id, localId, name, image: `https://assets.example/${id}`, dexId, set: { id: setId, name: setName, cardCount: { official, total: official } } };
}

function makeDeps(overrides: { ocr?: OcrEngine; offline?: boolean; catalog?: boolean; local?: PipelineDeps['localReferences'] } = {}) {
  const calls = { ocr: [] as OcrRegion[], references: 0 };
  const fetchImpl = (async (input: RequestInfo | URL) => {
    if (overrides.offline) throw new TypeError('offline');
    const url = String(input);
    const id = /cards\/([^/?]+)$/.exec(url)?.[1];
    const entry = id ? api[id] : undefined;
    if (url.includes('/cards?')) {
      const m = /official=(\d+)&localId=(\w+)/.exec(url)!;
      const list = Object.values(api)
        .map((e) => e.body as ReturnType<typeof card>)
        .filter((c) => c.set.cardCount.official === Number(m[1]) && c.localId === m[2]);
      return new Response(JSON.stringify(list));
    }
    if (!entry) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(entry.body));
  }) as typeof fetch;
  const ocr: OcrEngine =
    overrides.ocr ??
    {
      async recognize(_image, region) {
        calls.ocr.push(region);
        return region === 'bottom' ? 'Illus. 58/102' : 'Pikachu HP 60';
      },
      async dispose() {},
    };
  const deps: PipelineDeps = {
    ocr,
    tcgdex: new TcgdexClient({ fetchImpl, backoffMs: 0, retries: 0 }),
    catalog: overrides.catalog === false ? null : new CatalogLookup(index),
    loadReference: async (url) => {
      calls.references++;
      const id = /assets\.example\/([^/]+)\//.exec(url)![1]!;
      return { image: scans.get(api[id]!.seed)!, bytes: 17000 };
    },
    localReferences: overrides.local,
    now: () => performance.now(),
  };
  return { deps, calls };
}

const quad: Quad = [{ x: 200, y: 70 }, { x: 410, y: 40 }, { x: 440, y: 350 }, { x: 230, y: 330 }];
const photoOf = (seed: number, q: Quad = quad) => renderScene(scans.get(seed)!, q, 640, 480, { noise: 10 });

function artIndexOf(ids: Record<string, number>): ArtIndex {
  const entries = Object.entries(ids).map(([id, seed]) => {
    const record = new Uint8Array(ART_RECORD_BYTES);
    encodeRecord(computeFeatures(scans.get(seed)!), record);
    return { id, record };
  });
  const { meta, bin } = packArtIndex(entries, 'teste');
  return ArtIndex.from(meta, bin)!;
}

describe('RecognitionPipeline', () => {
  it('busca pela ilustração (opção): acha a carta mesmo com o OCR sem número, e ainda confirma pela imagem', async () => {
    const { deps } = makeDeps({ ocr: { async recognize() { return 'ruído ilegível'; }, async dispose() {} } });
    const art = artIndexOf({ 'base1-58': 1, 'hgss4-58': 2, 'base2-60': 3 });
    const result = await new RecognitionPipeline({ ...deps, artSearch: async () => art }).recognize(photoOf(2));
    expect(result.metrics.artCandidates).toBeGreaterThan(0);
    expect(result.card?.id).toBe('hgss4-58');
    expect(result.metrics.visualVerified).toBe(true);
  });

  it('com a opção desligada (ou sem índice), nada muda: sem número, não acha', async () => {
    const { deps } = makeDeps({ ocr: { async recognize() { return 'ruído ilegível'; }, async dispose() {} } });
    for (const artSearch of [undefined, async () => null]) {
      const result = await new RecognitionPipeline({ ...deps, artSearch }).recognize(photoOf(2));
      expect(result.status).toBe('not-found');
      expect(result.metrics.artCandidates).toBeUndefined();
    }
  });

  it('número com total lido: a busca pela ilustração nem é consultada (só entra quando o texto não bastou)', async () => {
    const { deps } = makeDeps();
    let consulted = 0;
    const art = artIndexOf({ 'base1-58': 1, 'hgss4-58': 2, 'base2-60': 3 });
    const result = await new RecognitionPipeline({ ...deps, artSearch: async () => { consulted++; return art; } }).recognize(photoOf(1));
    expect(result.status).toBe('identified');
    expect(consulted).toBe(0);
    expect(result.metrics.artCandidates).toBeUndefined();
  });

  it('escolhe a impressão exata entre cartas com o mesmo número/total e devolve o dexId', async () => {
    const { deps, calls } = makeDeps();
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1));
    expect(result.status).toBe('identified');
    expect(result.card).toMatchObject({ id: 'base1-58', name: 'Pikachu', setName: 'Base Set', dexId: 25 });
    expect(result.metrics.visualVerified).toBe(true);
    expect(result.metrics.source).toBe('network');
    // 2 candidatas pelo índice: 2 detalhes + 2 imagens de referência, nunca o catálogo inteiro.
    expect(result.metrics.requests).toBe(2);
    expect(calls.references).toBe(2);
    expect(result.metrics.downloadedBytes).toBeGreaterThan(34000);
    expect(result.alternatives.map((a) => a.card.id)).toEqual(['hgss4-58']);
    expect(result.reference).toBeDefined();
    expect(result.features).toBeDefined();
  });

  it('a comparação visual corrige um nome lido errado', async () => {
    const { deps } = makeDeps({
      ocr: { async recognize(_i, region) { return region === 'bottom' ? '58/102' : 'Zzqxw'; }, async dispose() {} },
    });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(2));
    expect(result.status).toBe('identified');
    expect(result.card?.id).toBe('hgss4-58');
    expect(result.card?.dexId).toBe(94);
  });

  it('só o número e o total já bastam para filtrar (reimpressão do mesmo Pokémon em outro set)', async () => {
    const { deps } = makeDeps({
      ocr: { async recognize(_i, region) { return region === 'bottom' ? '60/64' : 'Pikachu'; }, async dispose() {} },
    });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(3));
    expect(result.card?.id).toBe('base2-60');
    // Um candidato só: o nome nem precisa ser lido pelo OCR.
    expect(result.metrics.candidates).toBe(1);
  });

  it('não lê o nome quando o número já deixa uma única candidata', async () => {
    const { deps, calls } = makeDeps({
      ocr: { async recognize(_i, region) { calls2.push(region); return '60/64'; }, async dispose() {} },
    });
    const calls2: OcrRegion[] = [];
    await new RecognitionPipeline(deps).recognize(photoOf(3));
    expect(calls2).toEqual(['bottom']);
    expect(calls.ocr).toEqual([]);
  });

  it('recupera o número da mesma foto binarizada antes de recortar metades', async () => {
    const calls2: OcrRegion[] = [];
    const { deps } = makeDeps({
      ocr: {
        async recognize(_i, region) {
          calls2.push(region);
          if (region === 'bottom') return 'ruído ilegível';
          return region === 'bottom-binary' ? '60/64' : 'Pikachu';
        },
        async dispose() {},
      },
    });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(3));
    // A recuperação usa a mesma captura estática e evita a passada mais lenta nas metades.
    expect(calls2).toEqual(['bottom', 'bottom-binary']);
    expect(result.card?.id).toBe('base2-60');
  });

  it('número mal lido (80 no lugar de 60): a segunda rodada acha a carta certa pela imagem', async () => {
    const { deps } = makeDeps({
      ocr: { async recognize(_i, region) { return region === 'bottom' ? '80/64' : 'Pikachu'; }, async dispose() {} },
    });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(3));
    expect(result.card?.id).toBe('base2-60');
    expect(result.status).toBe('identified');
    expect(result.metrics.variantRound).toBe(true);
  });

  it('número mal lido e imagem que não combina com nenhuma variante: não inventa carta', async () => {
    const { deps } = makeDeps({
      ocr: { async recognize(_i, region) { return region === 'bottom' ? '80/64' : 'Zzqxw'; }, async dispose() {} },
    });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1));
    expect(result.status).not.toBe('identified');
  });

  it('sem carta no quadro: não chama OCR nem rede', async () => {
    const { deps, calls } = makeDeps();
    const result = await new RecognitionPipeline(deps).recognize(uniformImage(640, 480, [80, 80, 80]));
    expect(result.status).toBe('no-card');
    expect(calls.ocr).toEqual([]);
    expect(result.metrics.requests).toBe(0);
  });

  it('carta de cabeça para baixo: tenta 180° quando o OCR não acha nada', async () => {
    let attempts = 0;
    const ocr: OcrEngine = {
      async recognize(image, region) {
        // Na orientação errada a faixa inferior é o topo da carta, que tem a barra escura do título.
        // Só olha o miolo da faixa: as bordas podem pegar o fundo por causa do erro de 1–2 px nos cantos.
        let dark = 0;
        let total = 0;
        for (let y = Math.round(image.height * 0.25); y < image.height * 0.75; y++) {
          for (let x = Math.round(image.width * 0.1); x < image.width * 0.5; x++) {
            total++;
            if ((image.data[(y * image.width + x) * 4] ?? 255) < 80) dark++;
          }
        }
        attempts++;
        if (dark / total > 0.1) return '';
        return region === 'bottom' ? '58/102' : 'Pikachu';
      },
      async dispose() {},
    };
    const { deps } = makeDeps({ ocr });
    const flipped: Quad = [quad[2], quad[3], quad[0], quad[1]];
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1, flipped));
    expect(result.metrics.rotated180).toBe(true);
    expect(result.card?.id).toBe('base1-58');
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('número ilegível: não inventa, pede para tentar de novo', async () => {
    const { deps } = makeDeps({ ocr: { async recognize() { return '~'; }, async dispose() {} } });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1));
    expect(result.status).toBe('not-found');
    expect(result.card).toBeUndefined();
    expect(result.message).toMatch(/número/);
  });

  it('TCGdex fora do ar: mensagem honesta, sem identificação', async () => {
    const { deps } = makeDeps({ offline: true });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1));
    expect(result.status).toBe('not-found');
    expect(result.message).toMatch(/TCGdex/);
  });

  it('imagens de referência indisponíveis: decide só por metadados e avisa', async () => {
    const { deps } = makeDeps();
    deps.loadReference = async () => { throw new Error('CORS'); };
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1));
    expect(result.card?.id).toBe('base1-58');
    expect(result.metrics.visualVerified).toBe(false);
  });

  it('cache local: reconhece sem nenhuma requisição', async () => {
    const reference = rectify(scans.get(1)!, [{ x: 0, y: 0 }, { x: CARD_WIDTH_PX - 1, y: 0 }, { x: CARD_WIDTH_PX - 1, y: CARD_HEIGHT_PX - 1 }, { x: 0, y: CARD_HEIGHT_PX - 1 }], CARD_WIDTH_PX, CARD_HEIGHT_PX)!;
    const { deps } = makeDeps({
      local: async () => [
        {
          card: { id: 'base1-58', name: 'Pikachu', setId: 'base1', setName: 'Base Set', localId: '58', setOfficial: 102, setTotal: 102, dexIds: [25] },
          features: computeFeatures(reference),
        },
      ],
    });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1));
    expect(result.status).toBe('identified');
    expect(result.metrics.source).toBe('cache');
    expect(result.metrics.requests).toBe(0);
    expect(result.metrics.downloadedBytes).toBe(0);
    expect(result.card?.dexId).toBe(25);
  });

  it('cache local sem a carta: cai para a rede', async () => {
    const { deps } = makeDeps({
      local: async () => [
        {
          card: { id: 'base2-60', name: 'Pikachu', setId: 'base2', setName: 'Jungle', localId: '60', setOfficial: 64, setTotal: 64, dexIds: [25] },
          features: computeFeatures(scans.get(3)!),
        },
      ],
    });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1));
    expect(result.metrics.source).toBe('network');
    expect(result.card?.id).toBe('base1-58');
  });

  it('sem índice estático usa a busca do TCGdex por número e total', async () => {
    const { deps } = makeDeps({ catalog: false });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1));
    expect(result.card?.id).toBe('base1-58');
    expect(result.metrics.requests).toBeGreaterThanOrEqual(3);
  });
});

describe('RecognitionPipeline: instrumentação e diagnóstico (Fase A)', () => {
  it('mede cada etapa que rodou e diz o motivo das que pulou', async () => {
    const { deps } = makeDeps();
    const stages: string[] = [];
    const result = await new RecognitionPipeline(deps).recognize(photoOf(1), { onStage: (s) => stages.push(s) });
    const t = result.metrics.stages;
    for (const stage of ['detect', 'perspective', 'cropNumber', 'ocrNumber', 'catalog', 'visual', 'ranking'] as const) {
      expect(t[stage], stage).toBeGreaterThanOrEqual(0);
    }
    // A ordem em que as etapas começaram é a do pipeline real.
    expect(stages.indexOf('detect')).toBeLessThan(stages.indexOf('perspective'));
    expect(stages.indexOf('perspective')).toBeLessThan(stages.indexOf('ocrNumber'));
    expect(stages.indexOf('ocrNumber')).toBeLessThan(stages.indexOf('ranking'));
    // 58/102 bate em duas cartas: o nome foi lido, então não aparece como pulado.
    expect(t.ocrName).toBeDefined();
    expect(result.metrics.skipped.ocrName).toBeUndefined();
  });

  it('quando o número já aponta uma carta só, o nome é pulado — com o motivo, sem tempo inventado', async () => {
    const { deps, calls } = makeDeps({
      ocr: { async recognize(_i, region) { calls.ocr.push(region); return region === 'bottom' ? '60/64' : 'Pikachu'; }, async dispose() {} },
    });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(3));
    expect(result.card?.id).toBe('base2-60');
    expect(calls.ocr).not.toContain('name');
    expect(result.metrics.stages.ocrName).toBeUndefined();
    expect(result.metrics.skipped.ocrName).toMatch(/única carta/);
  });

  it('a imagem de referência é reaproveitada no quadro seguinte (não baixa nem decodifica de novo)', async () => {
    const { deps, calls } = makeDeps();
    const pipeline = new RecognitionPipeline(deps);
    const first = await pipeline.recognize(photoOf(1));
    expect(calls.references).toBe(2);
    expect(first.metrics.referenceCacheHits).toBe(0);
    const second = await pipeline.recognize(photoOf(1));
    expect(calls.references).toBe(2);
    expect(second.metrics.referenceCacheHits).toBe(2);
    expect(second.card?.id).toBe('base1-58');
    expect(second.metrics.downloadedBytes).toBe(0);
  });

  it('usa a detecção feita pelo controlador (não detecta de novo)', async () => {
    const { deps } = makeDeps();
    const pipeline = new RecognitionPipeline(deps);
    const located = await pipeline.recognize(photoOf(1));
    const detection = { quad: located.quad!, areaFraction: 0.3, aspect: 0.7, fillRatio: 0.9, score: 1 };
    const result = await pipeline.recognize(photoOf(1), { detection });
    expect(result.metrics.stages.detect).toBeUndefined();
    expect(result.card?.id).toBe('base1-58');
  });

  it('leitura obsoleta para entre as etapas (cancelar/recomeçar)', async () => {
    const { deps, calls } = makeDeps();
    let current = true;
    const pending = new RecognitionPipeline(deps).recognize(photoOf(1), {
      isCurrent: () => current,
      onStage: (s) => { if (s === 'ocrNumber') current = false; },
    });
    await expect(pending).rejects.toMatchObject({ name: 'ScanCancelled' });
    expect(calls.references).toBe(0);
  });

  it('diagnóstico: áreas exatas lidas no quadro, recortes do OCR e veredito de TODAS as candidatas', async () => {
    const { deps } = makeDeps();
    const result = await new RecognitionPipeline({ ...deps, captureDebug: () => true }).recognize(photoOf(1));
    const view = result.view!;
    expect(view.regions?.number).toHaveLength(1);
    expect(view.regions?.name).toBeDefined();
    expect(view.strip).toBeDefined();
    expect(view.nameCrop).toBeDefined();
    expect(view.quality?.brightness).toBeGreaterThan(0);
    // A faixa do número fica na parte de baixo da carta achada.
    const numberYs = view.regions!.number[0]!.map((p) => p.y);
    const cardYs = result.quad!.map((p) => p.y);
    expect(Math.min(...numberYs)).toBeGreaterThan((Math.min(...cardYs) + Math.max(...cardYs)) / 2);
    expect(view.candidates?.map((c) => c.id)).toEqual(['base1-58', 'hgss4-58']);
    expect(view.candidates?.[0]).toMatchObject({ verdict: 'aceita' });
    expect(view.candidates?.[1]?.why).toMatch(/atrás da melhor|abaixo de/);
  });

  it('diz quantas cartas do índice combinaram, mesmo além do limite baixado', async () => {
    const { deps } = makeDeps({ ocr: { async recognize(_i, region) { return region === 'bottom' ? '58/102' : ''; }, async dispose() {} } });
    const result = await new RecognitionPipeline({ ...deps, maxCandidates: 1 }).recognize(photoOf(1));
    expect(result.metrics.catalogMatches).toBe(2);
  });
});
