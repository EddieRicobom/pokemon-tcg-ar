import { describe, expect, it } from 'vitest';
import { BestFrameCapture } from './best-frame';
import type { RgbaImage } from './types';

const frame = (seed: number): RgbaImage => ({ width: 1, height: 1, data: new Uint8ClampedArray([seed, seed, seed, 255]) });
const candidate = (sharpness: number, brightness = 100, at = 0) => ({ frame: frame(sharpness), quality: { sharpness, brightness }, at });

describe('BestFrameCapture', () => {
  it('retém o quadro mais nítido e ignora uma regressão pequena entre quadros estáveis', () => {
    const capture = new BestFrameCapture();
    expect(capture.consider(candidate(10))).toBe(true);
    expect(capture.consider(candidate(10.6, 100, 40))).toBe(false);
    expect(capture.peek(50)?.quality.sharpness).toBe(10);
    expect(capture.consider(candidate(11, 100, 80))).toBe(true);
    expect(capture.peek(90)?.quality.sharpness).toBe(11);
  });

  it('não congela uma foto escura e expira a foto guardada antes de outra tentativa', () => {
    const capture = new BestFrameCapture({ maxAgeMs: 100 });
    expect(capture.consider(candidate(40, 20))).toBe(false);
    expect(capture.peek(0)).toBeNull();
    capture.consider(candidate(8, 80, 10));
    expect(capture.peek(110)?.quality.sharpness).toBe(8);
    expect(capture.peek(111)).toBeNull();
  });

  it('take entrega a foto uma vez e limpa a tentativa seguinte', () => {
    const capture = new BestFrameCapture();
    capture.consider(candidate(9, 90, 20));
    expect(capture.take(25)?.frame.data[0]).toBe(9);
    expect(capture.take(25)).toBeNull();
  });
});
