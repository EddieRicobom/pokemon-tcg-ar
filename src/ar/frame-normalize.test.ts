import { describe, expect, it, beforeAll } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { DEFAULT_NORMALIZE, FrameAlternator, normalizeLocalContrast } from './frame-normalize';

beforeAll(async () => {
  await tf.setBackend('cpu');
  await tf.ready();
});

/** Xadrez de blocos 4×4; `lo`/`hi` são os dois níveis de cinza. */
function checker(w: number, h: number, lo: number, hi: number, shadowFrom = Infinity, shadowGain = 1): Float32Array {
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = ((x >> 2) + (y >> 2)) % 2 ? hi : lo;
      a[y * w + x] = x >= shadowFrom ? v * shadowGain : v;
    }
  return a;
}

function contrastOf(values: Float32Array, w: number, x0: number, x1: number): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const x = i % w;
    if (x < x0 || x >= x1) continue;
    sum += values[i]!;
    n++;
  }
  const mean = sum / n;
  let v = 0;
  for (let i = 0; i < values.length; i++) {
    const x = i % w;
    if (x < x0 || x >= x1) continue;
    v += (values[i]! - mean) ** 2;
  }
  return Math.sqrt(v / n);
}

describe('normalizeLocalContrast', () => {
  it('mantém a forma, não altera a entrada e fica entre 0 e 255', () => {
    const w = 64;
    const h = 48;
    const data = checker(w, h, 40, 200);
    const input = tf.tensor2d(data, [h, w]);
    const out = normalizeLocalContrast(tf, input);
    expect(out.shape).toEqual([h, w]);
    const values = out.dataSync() as Float32Array;
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(255);
    expect(Array.from(input.dataSync())).toEqual(Array.from(data));
    input.dispose();
    out.dispose();
  });

  it('devolve o contraste da parte na sombra para perto do da parte iluminada', () => {
    const w = 128;
    const h = 64;
    // Metade direita com 25% da luz: o contraste cai a um quarto.
    const data = checker(w, h, 60, 200, 64, 0.25);
    const input = tf.tensor2d(data, [h, w]);
    const out = normalizeLocalContrast(tf, input);
    const before = contrastOf(data, w, 80, 120) / contrastOf(data, w, 8, 48);
    const after = contrastOf(out.dataSync() as Float32Array, w, 80, 120) / contrastOf(out.dataSync() as Float32Array, w, 8, 48);
    expect(before).toBeCloseTo(0.25, 1);
    expect(after).toBeGreaterThan(0.6);
    input.dispose();
    out.dispose();
  });

  it('limita o ganho: área lisa com um pouco de ruído não vira textura forte', () => {
    const w = 64;
    const h = 64;
    const data = new Float32Array(w * h);
    for (let i = 0; i < data.length; i++) data[i] = 100 + ((i * 7919) % 5) - 2; // ruído de ±2
    const input = tf.tensor2d(data, [h, w]);
    const out = normalizeLocalContrast(tf, input);
    const std = contrastOf(out.dataSync() as Float32Array, w, 0, w);
    // ganho ≤ 3 → desvio de saída ≤ ~3 × 1,4 × ... ; bem abaixo do alvo de 35
    expect(std).toBeLessThan(DEFAULT_NORMALIZE.targetStd * 0.5);
    input.dispose();
    out.dispose();
  });

  it('não vaza tensores', () => {
    const input = tf.tensor2d(checker(32, 32, 50, 150), [32, 32]);
    const before = tf.memory().numTensors;
    normalizeLocalContrast(tf, input).dispose();
    expect(tf.memory().numTensors).toBe(before);
    input.dispose();
  });
});

describe('FrameAlternator', () => {
  it('alterna começando por normalizar', () => {
    const a = new FrameAlternator();
    expect([a.next(), a.next(), a.next(), a.next()]).toEqual([true, false, true, false]);
  });
});
