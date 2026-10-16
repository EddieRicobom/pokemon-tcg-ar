import { describe, expect, it } from 'vitest';
import { renderScene, syntheticCard, uniformImage } from './__fixtures__/synthetic';
import { boxBlur } from './image';
import { frameQuality, qualityWarning, quadMotion, StabilityTracker } from './stability';
import type { Quad, RgbaImage } from './types';

const quad: Quad = [{ x: 200, y: 70 }, { x: 410, y: 40 }, { x: 440, y: 350 }, { x: 230, y: 330 }];
const shift = (q: Quad, dx: number, dy: number): Quad => q.map((p) => ({ x: p.x + dx, y: p.y + dy })) as Quad;

describe('estabilidade da carta', () => {
  it('movimento é relativo ao tamanho da carta', () => {
    expect(quadMotion(quad, quad)).toBe(0);
    const m = quadMotion(quad, shift(quad, 10, 0));
    expect(m).toBeGreaterThan(0.02);
    expect(m).toBeLessThan(0.05);
  });

  it('só libera o OCR depois de um par de quadros parados', () => {
    const t = new StabilityTracker();
    expect(t.push(quad).kind).toBe('moving'); // primeiro quadro: ainda não dá pra saber
    expect(t.push(shift(quad, 1, 0)).kind).toBe('stable');
    expect(t.push(shift(quad, 40, 0)).kind).toBe('moving'); // mexeu: volta a esperar
    expect(t.push(shift(quad, 40, 1)).kind).toBe('stable');
  });

  it('sem carta: volta ao começo', () => {
    const t = new StabilityTracker();
    t.push(quad);
    t.push(quad);
    expect(t.push(null)).toEqual({ kind: 'searching', motion: null, stableFrames: 0 });
    expect(t.push(quad).kind).toBe('moving');
  });

  it('pode exigir mais quadros parados', () => {
    const t = new StabilityTracker(2);
    t.push(quad);
    expect(t.push(quad).kind).toBe('moving');
    expect(t.push(quad).kind).toBe('stable');
  });
});

function blurred(image: RgbaImage, passes: number): RgbaImage {
  const out = new Uint8ClampedArray(image.data);
  for (let c = 0; c < 3; c++) {
    let plane: Float32Array = new Float32Array(image.width * image.height);
    for (let i = 0; i < plane.length; i++) plane[i] = image.data[i * 4 + c] ?? 0;
    for (let k = 0; k < passes; k++) plane = boxBlur(plane, image.width, image.height);
    for (let i = 0; i < plane.length; i++) out[i * 4 + c] = plane[i] ?? 0;
  }
  return { width: image.width, height: image.height, data: out };
}

describe('qualidade do quadro', () => {
  const scene = renderScene(syntheticCard(1), quad, 640, 480, { noise: 0 });

  it('carta nítida e iluminada: sem aviso', () => {
    const q = frameQuality(scene, quad);
    expect(q.brightness).toBeGreaterThan(45);
    expect(qualityWarning(q)).toBeNull();
  });

  it('borrar a imagem baixa a nitidez', () => {
    const sharp = frameQuality(scene, quad).sharpness;
    const soft = frameQuality(blurred(scene, 4), quad).sharpness;
    expect(soft).toBeLessThan(sharp / 2);
  });

  it('quadro escuro avisa pouca luz', () => {
    const dark = uniformImage(640, 480, [12, 12, 14]);
    expect(qualityWarning(frameQuality(dark, quad))).toMatch(/Pouca luz/);
  });

  it('cinza liso (sem detalhe) avisa possível desfoque, nunca pouca luz', () => {
    const flat = uniformImage(640, 480, [150, 150, 150]);
    expect(qualityWarning(frameQuality(flat, quad))).toMatch(/desfocada/);
  });
});
