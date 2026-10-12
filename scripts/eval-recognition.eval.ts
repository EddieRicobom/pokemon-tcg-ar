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
import { expect, it } from 'vitest';
import { prng } from '../src/recognition/__fixtures__/synthetic';
import { createNodeOcr, decodePng, download, LEVELS, makeScene } from './eval-common';
import type { Level } from './eval-common';
import { detectCard } from '../src/recognition/detect-card';
import { rectify } from '../src/recognition/homography';
import { cropFraction } from '../src/recognition/image';
import { BOTTOM_STRIP_BOX } from '../src/recognition/layout';
import { parseBottomText } from '../src/recognition/parse-ocr';
import { CatalogLookup } from '../src/recognition/catalog-index';
import type { CatalogIndexData } from '../src/recognition/catalog-index';
import { RecognitionPipeline } from '../src/recognition/pipeline';
import type { RecognitionResult } from '../src/recognition/pipeline';
import { TcgdexClient } from '../src/recognition/tcgdex';
import type { TcgdexCard } from '../src/recognition/tcgdex';
import type { Quad, RgbaImage } from '../src/recognition/types';

const INDEX_FILE = process.env.CATALOG_INDEX ?? 'catalog-index.json';
const OUT_FILE = process.env.EVAL_OUT ?? 'eval-results.json';
const SAMPLE_SETS = Number(process.env.EVAL_SETS ?? 42);
const LANDMARKS = ['base1-58', 'base2-60', 'sv03.5-025', 'swsh1-65', 'base1-4', 'sv01-025'];


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
    detected: boolean;
    cornerErrPct?: number;
    gtNumberOk: boolean;
    gtTotalOk: boolean;
    gtText?: string;
    confidence: number;
    bottomText?: string;
    margin: number;
  }
  const rows: Row[] = [];
  const skipped: string[] = [];
  const scanReads: { id: string; text: string; numberOk: boolean; totalOk: boolean }[] = [];
  let scanBytes = 0;
  const flat = (w: number, h: number): Quad => [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }];

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
    const expectedTotal = card.set.cardCount?.official ?? -1;
    // Controle: o OCR direto sobre o escaneamento, sem cena nenhuma (isola o OCR e o recorte da faixa).
    {
      const canonical = rectify(scan, flat(scan.width, scan.height), 630, 880);
      if (canonical) {
        const text = await ocr.recognize(cropFraction(canonical, BOTTOM_STRIP_BOX), 'bottom');
        const parsed = parseBottomText(text);
        scanReads.push({
          id, text: text.replace(/\s+/g, ' ').trim().slice(0, 40),
          numberOk: parsed.number?.value === expectedValue, totalOk: parsed.number?.total?.value === expectedTotal,
        });
      }
    }
    for (const level of LEVELS) {
      const seed = [...id].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7) >>> 0;
      const { scene: frame, quad: trueQuad } = makeScene(scan, seed, level);
      // Diagnóstico 1: o quadrilátero detectado está perto do verdadeiro?
      const detection = detectCard(frame);
      let cornerErrPct: number | undefined;
      if (detection) {
        const cardHeight = Math.hypot(trueQuad[0].x - trueQuad[3].x, trueQuad[0].y - trueQuad[3].y);
        const rotated: Quad = [trueQuad[2], trueQuad[3], trueQuad[0], trueQuad[1]];
        const err = (q: Quad) => Math.max(...q.map((p, i) => Math.hypot(p.x - detection.quad[i]!.x, p.y - detection.quad[i]!.y)));
        cornerErrPct = Math.round((Math.min(err(trueQuad), err(rotated)) / cardHeight) * 1000) / 10;
      }
      // Diagnóstico 2: com o quadrilátero VERDADEIRO, o OCR da faixa inferior acerta?
      const trueFlat = rectify(frame, trueQuad, 630, 880);
      const gtText = trueFlat ? await ocr.recognize(cropFraction(trueFlat, BOTTOM_STRIP_BOX), 'bottom') : '';
      const gtParsed = parseBottomText(gtText);
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
        detected: detection !== null, cornerErrPct,
        gtNumberOk: gtParsed.number?.value === expectedValue, gtTotalOk: gtParsed.number?.total?.value === expectedTotal,
        gtText: gtText.replace(/\s+/g, ' ').trim().slice(0, 40),
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
      detectedPct: rate((r) => r.detected),
      medianCornerErrPct: Math.round(median(set.filter((r) => r.cornerErrPct !== undefined).map((r) => r.cornerErrPct!)) * 10) / 10,
      gtNumberOkPct: rate((r) => r.gtNumberOk),
      gtTotalOkPct: rate((r) => r.gtTotalOk),
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
    scanControl: {
      n: scanReads.length,
      numberOkPct: Math.round((scanReads.filter((r) => r.numberOk).length / (scanReads.length || 1)) * 1000) / 10,
      totalOkPct: Math.round((scanReads.filter((r) => r.totalOk).length / (scanReads.length || 1)) * 1000) / 10,
      samples: scanReads.slice(0, 14),
    },
    failures: failures.slice(0, 12),
    rows,
  };
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  writeFileSync(OUT_FILE.replace(/\.json$/, '.summary.json'), JSON.stringify({ ...report, rows: undefined }, null, 2));
  expect(rows.length).toBeGreaterThan(0);
}, 25 * 60 * 1000);
