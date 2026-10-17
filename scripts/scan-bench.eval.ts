// Bancada do scanner (fora do `npm test`): roda o ScanController + RecognitionPipeline REAIS com OCR de verdade
// (Tesseract no Node) sobre uma foto real de câmera do repositório, numa sequência fixa de quadros: a carta entra
// mexendo (3 quadros deslocados) e depois fica parada. Mede o que custa chegar à carta confirmada: tempo de
// parede, passadas de OCR (cada uma custa segundos no celular), imagens de referência carregadas e quadros.
//
// Não mede acerto (o catálogo e as referências são de teste) nem desempenho de celular (é o Node num PC).
// Serve para comparar ANTES/DEPOIS com o mesmo roteiro: rode este arquivo na `main` e na branch.
//
//   npx vitest run -c vitest.eval.config.ts scripts/scan-bench.eval.ts
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { describe, it } from 'vitest';
import { ScanController } from '../src/app/scan-controller';
import { CatalogLookup } from '../src/recognition/catalog-index';
import { detectCard } from '../src/recognition/detect-card';
import { rectify } from '../src/recognition/homography';
import { ocrParams, prepareForOcr } from '../src/recognition/ocr';
import type { OcrEngine, OcrRegion } from '../src/recognition/ocr';
import { RecognitionPipeline } from '../src/recognition/pipeline';
import { sameCardScore } from '../src/recognition/snapshot';
import { TemporalAggregator } from '../src/recognition/temporal';
import { TcgdexClient } from '../src/recognition/tcgdex';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../src/recognition/types';
import type { Quad, RgbaImage } from '../src/recognition/types';
import { syntheticCard } from '../src/recognition/__fixtures__/synthetic';

const PHOTO = join(__dirname, '../src/recognition/__fixtures__/photos/meowth-jungle-56.jpg');

async function load(shiftX = 0): Promise<RgbaImage> {
  const img = sharp(PHOTO).ensureAlpha();
  const meta = await sharp(PHOTO).metadata();
  const w = meta.width!;
  const h = meta.height!;
  // Desloca o quadro (a carta "andou" na imagem) mantendo o tamanho: estende de um lado e corta do outro.
  const shifted = shiftX === 0 ? img : img.extend({ left: shiftX, background: { r: 128, g: 128, b: 128, alpha: 1 } }).extract({ left: 0, top: 0, width: w, height: h });
  const { data, info } = await shifted.raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

async function realOcr(): Promise<{ engine: OcrEngine; passes: Record<OcrRegion, number>; ms: number[]; stop: () => Promise<void> }> {
  const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
    langPath: join(__dirname, '../node_modules/@tesseract.js-data/eng/4.0.0_best_int'), cachePath: tmpdir(), gzip: true,
  });
  const passes: Record<OcrRegion, number> = { bottom: 0, 'bottom-side': 0, name: 0 };
  const ms: number[] = [];
  const engine: OcrEngine = {
    async recognize(image, region) {
      passes[region]++;
      const params = ocrParams(region);
      await worker.setParameters({
        tessedit_pageseg_mode: params.psm === '7' ? Tesseract.PSM.SINGLE_LINE : Tesseract.PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: params.whitelist,
        user_defined_dpi: '150',
      });
      const prepared = prepareForOcr(image);
      const png = await sharp(Buffer.from(prepared.data), { raw: { width: prepared.width, height: prepared.height, channels: 4 } }).png().toBuffer();
      const t0 = performance.now();
      const text = (await worker.recognize(png)).data.text;
      ms.push(performance.now() - t0);
      return text;
    },
    async dispose() {},
  };
  return { engine, passes, ms, stop: async () => void (await worker.terminate()) };
}

async function bench(label: string, movingShifts: number[], twoReads = false): Promise<void> {
  {
    const stable = await load(0);
    const moving = await Promise.all(movingShifts.map((dx) => load(dx)));
    const frames = [...moving, stable];
    const det = detectCard(stable)!;
    const reference = rectify(stable, det.quad as Quad, CARD_WIDTH_PX, CARD_HEIGHT_PX)!;
    const catalog = new CatalogLookup({
      version: 1, generatedAt: 'bancada',
      sets: [
        { id: 'base2', name: 'Jungle', official: 64, total: 64, release: '1999-06-16', cards: [['56', 'Meowth']] },
        { id: 'xx1', name: 'Outra coleção', official: 64, total: 64, release: '2001-01-01', cards: [['56', 'Rattata']] },
      ],
    });
    const api: Record<string, unknown> = {
      'base2-56': { id: 'base2-56', localId: '56', name: 'Meowth', image: 'https://x/base2-56', dexId: [52], set: { id: 'base2', name: 'Jungle', cardCount: { official: 64, total: 64 } } },
      'xx1-56': { id: 'xx1-56', localId: '56', name: 'Rattata', image: 'https://x/xx1-56', dexId: [19], set: { id: 'xx1', name: 'Outra', cardCount: { official: 64, total: 64 } } },
    };
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const id = /cards\/([^/?]+)$/.exec(String(input))?.[1];
      return id && api[id] ? new Response(JSON.stringify(api[id])) : new Response('{}', { status: 404 });
    }) as typeof fetch;
    let referenceLoads = 0;
    const ocr = await realOcr();
    const pipeline = new RecognitionPipeline({
      ocr: ocr.engine,
      tcgdex: new TcgdexClient({ fetchImpl, backoffMs: 0, retries: 0 }),
      catalog,
      loadReference: async (url) => {
        referenceLoads++;
        return { image: url.includes('base2-56') ? reference : syntheticCard(7), bytes: 20000 };
      },
    });
    let next = 0;
    let analyzed = 0;
    const started = performance.now();
    let done: () => void = () => {};
    const finished = new Promise<void>((resolve) => (done = resolve));
    const deps = {
      grabFrame: () => {
        analyzed++;
        return frames[Math.min(next++, frames.length - 1)]!;
      },
      recognize: (frame: RgbaImage, options?: object) => (pipeline.recognize as (f: RgbaImage, o?: object) => ReturnType<RecognitionPipeline['recognize']>)(frame, options),
      // Só a versão nova usa isto (a antiga ignora): detecção leve em todo quadro.
      locate: (frame: RgbaImage) => ({ detection: detectCard(frame) }),
      // Só a versão com foto temporária usa isto (as anteriores ignoram).
      sameCard: sameCardScore,
      // "Exige 2 leituras": desliga a confirmação instantânea (caso comum de confiança média).
      ...(twoReads ? { temporal: new TemporalAggregator({ instantConfidence: 1.01 }) } : {}),
      cache: {
        scanCard: async (input: { card: { id: string } }) => ({ saved: true as const, result: { id: input.card.id, status: 'completo' as const, card: { id: input.card.id, name: 'x' } as never } }),
        prepareCard: async () => { throw new Error('não usado'); },
        get: async () => undefined,
      },
      onState: (state: { phase: string }) => {
        if (state.phase === 'ready' || state.phase === 'choosing' || state.phase === 'error') done();
      },
    };
    const controller = new ScanController(deps as never);
    controller.start();
    await Promise.race([finished, new Promise((r) => setTimeout(r, 120_000))]);
    controller.stop();
    const wallMs = Math.round(performance.now() - started);
    await ocr.stop();
    const sum = ocr.ms.reduce((a, b) => a + b, 0);
    const report = {
      fase: controller.current.phase,
      carta: (controller.current as { card?: { id: string } }).card?.id,
      tempoAteConfirmarMs: wallMs,
      quadrosAnalisados: analyzed,
      passadasOcr: ocr.passes,
      totalPassadasOcr: ocr.ms.length,
      tempoTotalOcrMs: Math.round(sum),
      mediaPorPassadaOcrMs: Math.round(sum / Math.max(1, ocr.ms.length)),
      referenciasCarregadas: referenceLoads,
    };
    console.log(`BANCADA ${label} ` + JSON.stringify(report));
  }
}

describe('bancada do scanner', () => {
  it('foto real: carta mexendo 3 quadros e depois parada', () => bench('mexendo', [60, 30, 12]), 180_000);
  it('foto real: carta já parada desde o 1º quadro', () => bench('parada', []), 180_000);
  it('foto real: parada, confiança média (exige confirmação em 2 quadros)', () => bench('duas-leituras', [], true), 180_000);
});
