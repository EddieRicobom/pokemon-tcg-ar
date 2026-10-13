// @vitest-environment node
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { describe, expect, it } from 'vitest';
import { detectCard } from './detect-card';
import { rectifyRegion } from './homography';
import { BOTTOM_OCR_FULL_WIDTH, BOTTOM_STRIP_BOX } from './layout';
import { prepareForOcr } from './ocr';
import { parseBottomText } from './parse-ocr';
import type { Quad, RgbaImage } from './types';

/**
 * Fotos REAIS (do celular do dono do projeto) e composições dessa foto sobre fundos diferentes.
 * A foto "meowth-jungle-56" é um quadro de câmera de verdade: a primeira versão do detector pegou só a
 * ilustração (24% do quadro, proporção 0,86) e a carta saiu de cabeça para baixo na leitura.
 */
const dir = join(__dirname, '__fixtures__', 'photos');

async function load(name: string): Promise<RgbaImage> {
  const { data, info } = await sharp(join(dir, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

function inPoly(q: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c > 0) pos++;
    else if (c < 0) neg++;
  }
  return pos === 0 || neg === 0;
}
function iou(a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[], w: number, h: number): number {
  let inter = 0;
  let union = 0;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const A = inPoly(a, x, y);
      const B = inPoly(b, x, y);
      if (A && B) inter++;
      if (A || B) union++;
    }
  }
  return union === 0 ? 0 : inter / union;
}

describe('detecção em fotografia real', () => {
  it('foto do celular (carta num protetor, parede cinza): acha a carta INTEIRA, não só a arte', async () => {
    const frame = await load('meowth-jungle-56.jpg');
    const det = detectCard(frame);
    expect(det).not.toBeNull();
    expect(det!.areaFraction).toBeGreaterThan(0.5);
    expect(det!.aspect).toBeGreaterThan(0.66);
    expect(det!.aspect).toBeLessThan(0.78);
    // Orientada em pé: o primeiro canto é o superior esquerdo e o lado de cima é o curto.
    const [tl, tr, br, bl] = det!.quad;
    expect(tl.y).toBeLessThan(bl.y);
    expect(tr.x).toBeGreaterThan(tl.x);
    expect(br.y).toBeGreaterThan(tr.y);
  });

  const variants = JSON.parse(readFileSync(join(dir, 'variants.json'), 'utf8')) as Record<string, number[][]>;
  for (const [name, corners] of Object.entries(variants)) {
    it(`mesma carta sobre outro fundo (${name}): quadrilátero coincide com o real`, async () => {
      const frame = await load(name);
      const det = detectCard(frame);
      expect(det, 'a carta deveria ser achada').not.toBeNull();
      const truth = corners.map(([x, y]) => ({ x: x!, y: y! }));
      expect(iou(det!.quad, truth, frame.width, frame.height)).toBeGreaterThan(0.85);
    });
  }
});

describe('OCR do número na foto real', () => {
  it('detecta → endireita → lê "56/64" na faixa de baixo, em menos de 5 s', async () => {
    const frame = await load('meowth-jungle-56.jpg');
    const det = detectCard(frame)!;
    const strip = rectifyRegion(frame, det.quad as Quad, BOTTOM_STRIP_BOX, BOTTOM_OCR_FULL_WIDTH)!;
    const prepared = prepareForOcr(strip);
    const started = performance.now();
    const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, { langPath: join(__dirname, '../../node_modules/@tesseract.js-data/eng/4.0.0_best_int'), cachePath: tmpdir(), gzip: true });
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK, user_defined_dpi: '150' });
    const png = await sharp(Buffer.from(prepared.data), { raw: { width: prepared.width, height: prepared.height, channels: 4 } }).png().toBuffer();
    const text = (await worker.recognize(png)).data.text;
    await worker.terminate();
    const parsed = parseBottomText(text);
    expect(parsed.number).toMatchObject({ value: 56, total: { value: 64 } });
    expect(performance.now() - started).toBeLessThan(5000);
  }, 30_000);
});
