/**
 * Laboratório de OCR: qual região, modo de página, lista de caracteres e pré-processamento leem melhor o
 * número de coleção ("058/102")? Roda no CI sobre cartas reais do TCGdex em cenas de 1080p com o
 * quadrilátero VERDADEIRO (isola o OCR da detecção). Escolhe-se a configuração pela medição, não por palpite.
 *
 *   npx vitest run --config vitest.eval.config.ts scripts/ocr-lab.eval.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { prng } from '../src/recognition/__fixtures__/synthetic';
import { CatalogLookup } from '../src/recognition/catalog-index';
import type { CatalogIndexData } from '../src/recognition/catalog-index';
import { rectifyRegion } from '../src/recognition/homography';
import { parseBottomText } from '../src/recognition/parse-ocr';
import { TcgdexClient } from '../src/recognition/tcgdex';
import type { Level } from './eval-common';
import { createLabOcr, decodePng, download, makeScene, PSM } from './eval-common';

const INDEX_FILE = process.env.CATALOG_INDEX ?? 'catalog-index.json';
const OUT_FILE = process.env.LAB_OUT ?? 'ocr-lab-results.json';
const SAMPLE_SETS = Number(process.env.LAB_SETS ?? 40);
const LANDMARKS = ['base1-58', 'base2-60', 'sv03.5-025', 'swsh1-65', 'base1-4', 'sv01-025'];
const WL = '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LEVELS_LAB: Level[] = ['facil', 'medio'];

type Box = readonly [number, number, number, number];
interface Variant {
  name: string;
  boxes: Box[];
  psm: PSM;
  whitelist?: string;
  binarize: boolean;
  /** Largura de saída por carta inteira (px); a faixa usa a fração correspondente. */
  fullWidth: number;
}

const L: Box = [0, 0.945, 0.5, 0.995];
const R: Box = [0.5, 0.945, 1, 0.995];
const VARIANTS: Variant[] = [
  { name: 'atual: faixa 90-100% PSM6', boxes: [[0, 0.9, 1, 1]], psm: PSM.SINGLE_BLOCK, binarize: false, fullWidth: 630 },
  { name: 'faixa 90-100% PSM6 2x', boxes: [[0, 0.9, 1, 1]], psm: PSM.SINGLE_BLOCK, binarize: false, fullWidth: 1260 },
  { name: 'esq/dir 94,5-99,5% PSM7 wl 2x', boxes: [L, R], psm: PSM.SINGLE_LINE, whitelist: WL, binarize: false, fullWidth: 1260 },
  { name: 'esq/dir 94,5-99,5% PSM7 wl 3x', boxes: [L, R], psm: PSM.SINGLE_LINE, whitelist: WL, binarize: false, fullWidth: 1890 },
  { name: 'esq/dir 94,5-99,5% PSM7 wl 4x', boxes: [L, R], psm: PSM.SINGLE_LINE, whitelist: WL, binarize: false, fullWidth: 2520 },
  { name: 'esq/dir 94,5-99,5% PSM7 sem wl 3x', boxes: [L, R], psm: PSM.SINGLE_LINE, binarize: false, fullWidth: 1890 },
  { name: 'esq/dir 94,5-99,5% PSM7 wl binarizado 3x', boxes: [L, R], psm: PSM.SINGLE_LINE, whitelist: WL, binarize: true, fullWidth: 1890 },
  { name: 'linha inteira 94,5-99,5% PSM7 wl 3x', boxes: [[0, 0.945, 1, 0.995]], psm: PSM.SINGLE_LINE, whitelist: WL, binarize: false, fullWidth: 1890 },
  { name: 'esq/dir 93-100% PSM6 wl 3x', boxes: [[0, 0.93, 0.5, 1], [0.5, 0.93, 1, 1]], psm: PSM.SINGLE_BLOCK, whitelist: WL, binarize: false, fullWidth: 1890 },
  { name: 'esq/dir 92-100% PSM6 wl 2x', boxes: [[0, 0.92, 0.5, 1], [0.5, 0.92, 1, 1]], psm: PSM.SINGLE_BLOCK, whitelist: WL, binarize: false, fullWidth: 1260 },
];

it('compara configurações de OCR para o número de coleção', async () => {
  const index = JSON.parse(readFileSync(INDEX_FILE, 'utf8')) as CatalogIndexData;
  const catalog = new CatalogLookup(index);
  const random = prng(777);
  const ids = new Set<string>(LANDMARKS.filter((id) => catalog.hasCard(id)));
  const sets = [...index.sets].filter((s) => s.cards.length > 0).sort(() => random() - 0.5).slice(0, SAMPLE_SETS);
  for (const set of sets) {
    const [localId] = set.cards[Math.floor(random() * set.cards.length)] ?? [];
    if (localId) ids.add(`${set.id}-${localId}`);
  }

  const client = new TcgdexClient({ backoffMs: 300 });
  const ocr = await createLabOcr();
  const tally = new Map<string, { n: number; number: number; total: number; samples: string[]; ms: number }>();
  let cards = 0;

  for (const id of ids) {
    const card = await client.getCard(id).catch(() => null);
    if (!card?.image) continue;
    const scan = decodePng(await download(`${card.image}/high.png`).catch(() => Buffer.alloc(0)));
    if (!scan.width) continue;
    cards++;
    const expectedValue = Number.parseInt(card.localId.replace(/^\D*0*/, '') || '0', 10);
    const expectedTotal = card.set.cardCount?.official ?? -1;
    for (const level of LEVELS_LAB) {
      const { scene, quad } = makeScene(scan, [...id].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7) >>> 0, level);
      for (const variant of VARIANTS) {
        const started = performance.now();
        const texts: string[] = [];
        for (const box of variant.boxes) {
          const region = rectifyRegion(scene, quad, box, Math.round(variant.fullWidth * (box[2] - box[0])));
          if (!region) continue;
          texts.push(await ocr.read(region, variant.psm, variant.whitelist, variant.binarize));
        }
        const text = texts.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ');
        const parsed = parseBottomText(texts.join(' \n '));
        const key = `${level} · ${variant.name}`;
        const entry = tally.get(key) ?? { n: 0, number: 0, total: 0, samples: [], ms: 0 };
        entry.n++;
        entry.ms += performance.now() - started;
        if (parsed.number?.value === expectedValue) entry.number++;
        if (parsed.number?.total?.value === expectedTotal) entry.total++;
        if (entry.samples.length < 3) entry.samples.push(`${id}: ${text.slice(0, 48)}`);
        tally.set(key, entry);
      }
    }
  }
  await ocr.dispose();

  const results = [...tally.entries()].map(([name, e]) => ({
    name,
    n: e.n,
    numberOkPct: Math.round((e.number / e.n) * 1000) / 10,
    totalOkPct: Math.round((e.total / e.n) * 1000) / 10,
    msPerCard: Math.round(e.ms / e.n),
    samples: e.samples,
  }));
  writeFileSync(OUT_FILE, JSON.stringify({ note: 'Cenas 1080p com quadrilátero verdadeiro; escaneamentos oficiais distorcidos; latência do runner.', cards, results }, null, 2));
  expect(results.length).toBeGreaterThan(0);
}, 25 * 60 * 1000);
