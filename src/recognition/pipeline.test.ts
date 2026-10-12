import { describe, expect, it } from 'vitest';
import { renderScene, syntheticCard, uniformImage } from './__fixtures__/synthetic';
import { CatalogLookup } from './catalog-index';
import type { CatalogIndexData } from './catalog-index';
import { computeFeatures } from './hash';
import { rectify } from './homography';
import type { OcrEngine, OcrRegion } from './ocr';
import { RecognitionPipeline } from './pipeline';
import type { PipelineDeps } from './pipeline';
import { TcgdexClient } from './tcgdex';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from './types';
import type { Quad, RgbaImage } from './types';

const scans = new Map<number, RgbaImage>([[1, syntheticCard(1)], [2, syntheticCard(2)], [3, syntheticCard(3)]]);

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

describe('RecognitionPipeline', () => {
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

  it('segunda tentativa nas metades da faixa quando a leitura inteira não acha o número', async () => {
    const calls2: OcrRegion[] = [];
    const { deps } = makeDeps({
      ocr: {
        async recognize(_i, region) {
          calls2.push(region);
          if (region === 'bottom') return 'ruído ilegível';
          return region === 'bottom-side' ? '60/64' : 'Pikachu';
        },
        async dispose() {},
      },
    });
    const result = await new RecognitionPipeline(deps).recognize(photoOf(3));
    expect(calls2.slice(0, 3)).toEqual(['bottom', 'bottom-side', 'bottom-side']);
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
