/**
 * Avaliação do reconhecimento com cartas REAIS do TCGdex e OCR REAL, no GitHub Actions.
 *
 * O que isto mede e o que não mede (para ninguém se enganar):
 *  - As entradas são escaneamentos oficiais das cartas (high.png do CDN do TCGdex), colocados numa cena
 *    com perspectiva, desfoque, ruído e brilho gerados por nós. NÃO são fotos tiradas por uma câmera.
 *  - A amostra é pequena e sorteada com semente fixa; o resultado NÃO vale para o catálogo inteiro.
 *  - As latências são do runner do GitHub (Node, CPU de servidor), NÃO de um celular.
 *
 *   npx vitest run --config vitest.eval.config.ts   (gera eval-results.json)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { expect, it } from 'vitest';
import { renderScene, prng } from '../src/recognition/__fixtures__/synthetic';
import { CatalogLookup } from '../src/recognition/catalog-index';
import type { CatalogIndexData } from '../src/recognition/catalog-index';
import { boxBlur } from '../src/recognition/image';
import { prepareForOcr } from '../src/recognition/ocr';
import type { OcrEngine } from '../src/recognition/ocr';
import { RecognitionPipeline } from '../src/recognition/pipeline';
import type { RecognitionResult } from '../src/recognition/pipeline';
import { TcgdexClient } from '../src/recognition/tcgdex';
import type { TcgdexCard } from '../src/recognition/tcgdex';
import type { Quad, RgbaImage } from '../src/recognition/types';

const INDEX_FILE = process.env.CATALOG_INDEX ?? 'catalog-index.json';
const OUT_FILE = process.env.EVAL_OUT ?? 'eval-results.json';
const SAMPLE_SETS = Number(process.env.EVAL_SETS ?? 42);
const LANDMARKS = ['base1-58', 'base2-60', 'sv03.5-025', 'swsh1-65', 'base1-4', 'sv01-025'];

type Level = 'facil' | 'medio' | 'dificil';
const LEVELS: Level[] = ['facil', 'medio', 'dificil'];

function decodePng(buffer: Buffer): RgbaImage {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

function encodePng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}

async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 3) throw new Error(`${url}: ${String(error)}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

function blurImage(image: RgbaImage, passes: number): RgbaImage {
  const out = new Uint8ClampedArray(image.data);
  for (let c = 0; c < 3; c++) {
    let plane: Float32Array = new Float32Array(image.width * image.height);
    for (let i = 0; i < plane.length; i++) plane[i] = image.data[i * 4 + c] ?? 0;
    for (let p = 0; p < passes; p++) plane = boxBlur(plane, image.width, image.height);
    for (let i = 0; i < plane.length; i++) out[i * 4 + c] = plane[i] ?? 0;
  }
  return { ...image, data: out };
}

/** Cena com a carta em perspectiva; a dificuldade controla inclinação, rotação, desfoque, ruído e brilho. */
function makeScene(card: RgbaImage, seed: number, level: Level): RgbaImage {
  const random = prng(seed);
  const W = 960;
  const H = 720;
  const spec = {
    facil: { tilt: 0, rotate: 0.05, blur: 0, noise: 0, light: 1, glare: 0 },
    medio: { tilt: 0.12, rotate: 0.3, blur: 1, noise: 8, light: 0.9, glare: 0.1 },
    dificil: { tilt: 0.25, rotate: 0.6, blur: 2, noise: 18, light: 0.72, glare: 0.3 },
  }[level];
  const h = 520 + random() * 60;
  const w = h * (63 / 88);
  const angle = (random() - 0.5) * 2 * spec.rotate;
  const cx = W / 2 + (random() - 0.5) * 60;
  const cy = H / 2 + (random() - 0.5) * 40;
  const corners: [number, number][] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const quad = corners.map(([x, y]) => {
    const jitterX = (random() - 0.5) * spec.tilt * w;
    const jitterY = (random() - 0.5) * spec.tilt * h;
    const rx = (x + jitterX) * Math.cos(angle) - (y + jitterY) * Math.sin(angle);
    const ry = (x + jitterX) * Math.sin(angle) + (y + jitterY) * Math.cos(angle);
    return { x: cx + rx, y: cy + ry };
  }) as Quad;
  let scene = renderScene(card, quad, W, H, { noise: spec.noise, seed, background: [70 + random() * 40, 60 + random() * 40, 50 + random() * 40] });
  if (spec.blur > 0) scene = blurImage(scene, spec.blur);
  // Brilho global e uma faixa de reflexo diagonal.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const glare = spec.glare * Math.max(0, 1 - Math.abs((x + y) / (W + H) - 0.5) * 6) * 120;
      for (let c = 0; c < 3; c++) scene.data[o + c] = (scene.data[o + c] ?? 0) * spec.light + glare;
    }
  }
  return scene;
}

async function createNodeOcr(): Promise<OcrEngine> {
  const require = createRequire(import.meta.url);
  const langPath = require.resolve('@tesseract.js-data/eng/package.json').replace('package.json', '4.0.0_best_int');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: 'none' });
  return {
    async recognize(image, region) {
      await worker.setParameters({
        tessedit_pageseg_mode: region === 'name' ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK,
        user_defined_dpi: '150',
      });
      const result = await worker.recognize(encodePng(prepareForOcr(image)));
      return result.data.text;
    },
    dispose: async () => {
      await worker.terminate();
    },
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

it('avalia o reconhecimento com cartas reais do TCGdex (escaneamentos distorcidos)', async () => {
  const index = JSON.parse(readFileSync(INDEX_FILE, 'utf8')) as CatalogIndexData;
  const catalog = new CatalogLookup(index);
  const random = prng(20261011);

  // Amostra: pontos de referência + uma carta sorteada em cada um de N sets sorteados.
  const ids = new Set<string>(LANDMARKS.filter((id) => catalog.hasCard(id)));
  const sets = [...index.sets].filter((s) => s.cards.length > 0).sort(() => random() - 0.5).slice(0, SAMPLE_SETS);
  for (const set of sets) {
    const [localId] = set.cards[Math.floor(random() * set.cards.length)] ?? [];
    if (localId) ids.add(`${set.id}-${localId}`);
  }

  const lookupClient = new TcgdexClient({ backoffMs: 300 });
  const ocr = await createNodeOcr();
  const tcgdex = new TcgdexClient({ backoffMs: 300 });
  const pipeline = new RecognitionPipeline({
    ocr,
    tcgdex,
    catalog,
    referenceUrl: (base) => `${base}/low.png`,
    loadReference: async (url) => {
      const buffer = await download(url);
      return { image: decodePng(buffer), bytes: buffer.byteLength };
    },
  });

  interface Row {
    id: string;
    level: Level;
    status: RecognitionResult['status'];
    predicted?: string;
    correct: boolean;
    wrongConfident: boolean;
    ocrNumberOk: boolean;
    candidates: number;
    totalMs: number;
    detectMs: number;
    ocrMs: number;
    candidatesMs: number;
    requests: number;
    bytes: number;
    visualVerified: boolean;
    confidence: number;
    bottomText?: string;
    margin: number;
  }
  const rows: Row[] = [];
  const skipped: string[] = [];
  let scanBytes = 0;

  for (const id of ids) {
    let card: TcgdexCard | null;
    try {
      card = await lookupClient.getCard(id);
    } catch {
      skipped.push(`${id} (API)`);
      continue;
    }
    if (!card?.image) {
      skipped.push(`${id} (sem imagem)`);
      continue;
    }
    let scan: RgbaImage;
    try {
      const buffer = await download(`${card.image}/high.png`);
      scanBytes += buffer.byteLength;
      scan = decodePng(buffer);
    } catch {
      skipped.push(`${id} (download)`);
      continue;
    }
    const expectedValue = Number.parseInt(card.localId.replace(/^\D*0*/, '') || '0', 10);
    for (const level of LEVELS) {
      const seed = [...id].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7) >>> 0;
      const frame = makeScene(scan, seed, level);
      const result = await pipeline.recognize(frame);
      const predicted = result.card?.id;
      rows.push({
        id, level, status: result.status, predicted,
        correct: result.status === 'identified' && predicted === id,
        wrongConfident: result.status === 'identified' && predicted !== id,
        ocrNumberOk: result.parsed.bottom.number?.value === expectedValue,
        candidates: result.metrics.candidates, totalMs: result.metrics.totalMs, detectMs: result.metrics.detectMs,
        ocrMs: result.metrics.ocrMs, candidatesMs: result.metrics.candidatesMs, requests: result.metrics.requests,
        bytes: result.metrics.downloadedBytes, visualVerified: result.metrics.visualVerified,
        confidence: Math.round(result.confidence * 100) / 100, margin: Math.round(result.margin * 100) / 100,
        bottomText: result.ocrText?.bottom?.replace(/\s+/g, ' ').trim().slice(0, 40),
      });
    }
  }
  await ocr.dispose();

  const summary = LEVELS.map((level) => {
    const set = rows.filter((r) => r.level === level);
    const n = set.length || 1;
    const rate = (f: (r: Row) => boolean) => Math.round((set.filter(f).length / n) * 1000) / 10;
    return {
      level,
      n: set.length,
      identifiedCorrectPct: rate((r) => r.correct),
      wrongConfidentPct: rate((r) => r.wrongConfident),
      ambiguousPct: rate((r) => r.status === 'ambiguous'),
      notFoundPct: rate((r) => r.status === 'not-found'),
      noCardPct: rate((r) => r.status === 'no-card'),
      ambiguousTop1Pct: rate((r) => r.status === 'ambiguous' && r.predicted === r.id),
      ocrNumberOkPct: rate((r) => r.ocrNumberOk),
      visualVerifiedPct: rate((r) => r.visualVerified),
      medianTotalMs: Math.round(median(set.map((r) => r.totalMs))),
      p95TotalMs: Math.round(percentile(set.map((r) => r.totalMs), 0.95)),
      medianOcrMs: Math.round(median(set.map((r) => r.ocrMs))),
      medianDetectMs: Math.round(median(set.map((r) => r.detectMs))),
      medianCandidatesMs: Math.round(median(set.map((r) => r.candidatesMs))),
      meanRequests: Math.round((set.reduce((s, r) => s + r.requests, 0) / n) * 10) / 10,
      meanKiB: Math.round(set.reduce((s, r) => s + r.bytes, 0) / n / 102.4) / 10,
      meanCandidates: Math.round((set.reduce((s, r) => s + r.candidates, 0) / n) * 10) / 10,
    };
  });
  const failures = rows.filter((r) => !r.correct).slice(0, 25).map((r) => ({
    id: r.id, level: r.level, status: r.status, predicted: r.predicted, ocr: r.bottomText, conf: r.confidence, cands: r.candidates,
  }));
  const report = {
    note: 'Escaneamentos oficiais distorcidos por software (NÃO são fotos de câmera); amostra pequena; latência do runner do GitHub, NÃO de celular.',
    checkedAt: new Date().toISOString(),
    cards: ids.size - skipped.length,
    skipped,
    recognitions: rows.length,
    scanDownloadMiB: Math.round(scanBytes / 1048576),
    summary,
    failures,
    rows,
  };
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  writeFileSync(OUT_FILE.replace(/\.json$/, '.summary.json'), JSON.stringify({ ...report, rows: undefined }, null, 2));
  expect(rows.length).toBeGreaterThan(0);
}, 25 * 60 * 1000);
