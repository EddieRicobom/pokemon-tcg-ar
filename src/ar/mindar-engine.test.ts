import { describe, expect, it } from 'vitest';
import { searchWindowSize, TRACKING_TUNING } from './mindar-engine';

describe('janela de busca do rastreador', () => {
  it('é uma potência de 2 que cabe no quadro (metade do lado menor, no máximo)', () => {
    expect(searchWindowSize(360, 640)).toBe(256);
    expect(searchWindowSize(640, 480)).toBe(256);
    expect(searchWindowSize(320, 240)).toBe(128);
  });
  it('tem limites mínimo e máximo', () => {
    expect(searchWindowSize(40, 40)).toBe(64);
    expect(searchWindowSize(4000, 3000)).toBe(512);
  });
  it('tolera ~1,5 s sem ver a carta antes de desistir', () => {
    expect(TRACKING_TUNING.missTolerance).toBeGreaterThanOrEqual(60);
  });
});
