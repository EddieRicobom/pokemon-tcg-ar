import { describe, expect, it } from 'vitest';
import { renderScene, syntheticCard } from './__fixtures__/synthetic';
import { cardFingerprint, SAME_CARD_SIMILARITY, sameCardScore } from './snapshot';
import type { Quad } from './types';

const quad: Quad = [{ x: 200, y: 70 }, { x: 410, y: 40 }, { x: 440, y: 350 }, { x: 230, y: 330 }];
const moved: Quad = [{ x: 205, y: 72 }, { x: 414, y: 43 }, { x: 445, y: 352 }, { x: 234, y: 333 }];

describe('foto temporária do scan', () => {
  const photoFrame = renderScene(syntheticCard(1), quad, 640, 480, { noise: 8 });
  const photo = cardFingerprint(photoFrame, quad)!;

  it('a mesma carta num quadro seguinte (ruído novo, mexeu de leve) passa do limite', () => {
    const later = renderScene(syntheticCard(1), moved, 640, 480, { noise: 12 });
    expect(sameCardScore(photo, later, moved)).toBeGreaterThanOrEqual(SAME_CARD_SIMILARITY);
  });

  it('outra carta no mesmo lugar fica abaixo do limite (a foto é descartada)', () => {
    for (const seed of [2, 3]) {
      const other = renderScene(syntheticCard(seed), quad, 640, 480, { noise: 8 });
      expect(sameCardScore(photo, other, quad)).toBeLessThan(SAME_CARD_SIMILARITY);
    }
  });

  it('carta lida de cabeça para baixo: o contorno "de pé" ainda reconhece a mesma carta', () => {
    const upside: Quad = [quad[2], quad[3], quad[0], quad[1]];
    const photoUpside = cardFingerprint(photoFrame, upside)!;
    const later = renderScene(syntheticCard(1), moved, 640, 480, { noise: 12 });
    expect(sameCardScore(photoUpside, later, moved)).toBeGreaterThanOrEqual(SAME_CARD_SIMILARITY);
  });
});
