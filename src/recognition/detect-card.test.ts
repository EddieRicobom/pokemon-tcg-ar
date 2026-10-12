import { describe, expect, it } from 'vitest';
import { renderScene, syntheticCard, uniformImage } from './__fixtures__/synthetic';
import { convexHull, detectCard, maxAreaQuad, orderQuad, polygonArea, quadAspect } from './detect-card';
import { applyHomography, homographyFromPoints, rectify, rectifyRegion, regionQuad } from './homography';
import type { Quad } from './types';

const W = 640;
const H = 480;
const card = syntheticCard(7);

function cornerError(found: Quad, expected: Quad): number {
  return Math.max(...found.map((p, i) => Math.hypot(p.x - expected[i]!.x, p.y - expected[i]!.y)));
}

describe('geometria', () => {
  it('casco convexo e área de um retângulo com pontos internos', () => {
    const points = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 },
      { x: 5, y: 5 }, { x: 3, y: 12 },
    ];
    const hull = convexHull(points);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBe(200);
  });

  it('maxAreaQuad escolhe os 4 cantos', () => {
    const hull = convexHull([
      { x: 0, y: 0 }, { x: 5, y: 0.2 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 5, y: 19.8 }, { x: 0, y: 20 },
    ]);
    expect(polygonArea(maxAreaQuad(hull)!)).toBeGreaterThan(195);
  });

  it('orderQuad deixa o lado curto primeiro, mesmo com carta deitada', () => {
    const landscape = orderQuad([{ x: 0, y: 0 }, { x: 88, y: 0 }, { x: 88, y: 63 }, { x: 0, y: 63 }]);
    const side0 = Math.hypot(landscape[0].x - landscape[1].x, landscape[0].y - landscape[1].y);
    const side1 = Math.hypot(landscape[1].x - landscape[2].x, landscape[1].y - landscape[2].y);
    expect(side0).toBeLessThan(side1);
    expect(quadAspect(landscape)).toBeCloseTo(63 / 88, 3);
  });

  it('homografia leva os pontos de origem aos de destino', () => {
    const from = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const to = [{ x: 10, y: 10 }, { x: 50, y: 20 }, { x: 45, y: 70 }, { x: 5, y: 60 }];
    const h = homographyFromPoints(from, to)!;
    from.forEach((p, i) => {
      const q = applyHomography(h, p);
      expect(q.x).toBeCloseTo(to[i]!.x, 6);
      expect(q.y).toBeCloseTo(to[i]!.y, 6);
    });
  });

  it('homografia degenerada devolve null', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(homographyFromPoints(line, line)).toBeNull();
  });
});

describe('detectCard (cena sintética)', () => {
  const frontal: Quad = [{ x: 220, y: 60 }, { x: 420, y: 60 }, { x: 420, y: 340 }, { x: 220, y: 340 }];
  const tilted: Quad = [{ x: 200, y: 70 }, { x: 410, y: 40 }, { x: 440, y: 350 }, { x: 230, y: 330 }];

  it('encontra a carta de frente', () => {
    const found = detectCard(renderScene(card, frontal, W, H));
    expect(found).not.toBeNull();
    expect(cornerError(found!.quad, frontal)).toBeLessThan(10);
    expect(found!.aspect).toBeGreaterThan(0.55);
  });

  it('encontra a carta em perspectiva e com ruído', () => {
    const found = detectCard(renderScene(card, tilted, W, H, { noise: 10 }));
    expect(found).not.toBeNull();
    expect(cornerError(found!.quad, tilted)).toBeLessThan(14);
  });

  it('mantém a ordem dos cantos (não confunde topo e base) quando a carta está de cabeça para baixo', () => {
    const flipped: Quad = [frontal[2], frontal[3], frontal[0], frontal[1]];
    const found = detectCard(renderScene(card, flipped, W, H));
    expect(found).not.toBeNull();
    // A detecção não conhece a orientação (0° ou 180°): quem resolve é o OCR no pipeline.
    expect(cornerError(found!.quad, frontal)).toBeLessThan(10);
  });

  it('retifica a carta detectada de volta para algo próximo da carta original', () => {
    const scene = renderScene(card, tilted, W, H);
    const found = detectCard(scene)!;
    const flat = rectify(scene, found.quad, 126, 176)!;
    const reference = rectify(card, [{ x: 0, y: 0 }, { x: 629, y: 0 }, { x: 629, y: 879 }, { x: 0, y: 879 }], 126, 176)!;
    let diff = 0;
    for (let i = 0; i < flat.data.length; i += 4) diff += Math.abs(flat.data[i]! - reference.data[i]!);
    // Diferença média por pixel (canal R) pequena em relação a 255.
    expect(diff / (flat.data.length / 4)).toBeLessThan(28);
  });

  it('não detecta nada em quadro liso', () => {
    expect(detectCard(uniformImage(W, H, [90, 90, 90]))).toBeNull();
  });

  it('rejeita carta pequena demais (abaixo de 5% do quadro)', () => {
    const small: Quad = [{ x: 300, y: 200 }, { x: 340, y: 200 }, { x: 340, y: 256 }, { x: 300, y: 256 }];
    expect(detectCard(renderScene(card, small, W, H))).toBeNull();
  });

  it('rejeita retângulo com proporção implausível', () => {
    const wide: Quad = [{ x: 60, y: 150 }, { x: 580, y: 150 }, { x: 580, y: 330 }, { x: 60, y: 330 }];
    expect(detectCard(renderScene(card, wide, W, H))).toBeNull();
  });
});

describe('regiões retificadas', () => {
  const tilted: Quad = [{ x: 200, y: 70 }, { x: 410, y: 40 }, { x: 440, y: 350 }, { x: 230, y: 330 }];

  it('regionQuad da carta inteira devolve o próprio quadrilátero', () => {
    const q = regionQuad(tilted, [0, 0, 1, 1])!;
    q.forEach((p, i) => {
      expect(p.x).toBeCloseTo(tilted[i]!.x, 6);
      expect(p.y).toBeCloseTo(tilted[i]!.y, 6);
    });
  });

  it('a faixa inferior fica entre 90% e 100% da altura, sobre a borda de baixo', () => {
    const q = regionQuad(tilted, [0, 0.9, 1, 1])!;
    expect(q[3].x).toBeCloseTo(tilted[3].x, 6);
    expect(q[3].y).toBeCloseTo(tilted[3].y, 6);
    const left = Math.hypot(q[0].x - q[3].x, q[0].y - q[3].y);
    const full = Math.hypot(tilted[0].x - tilted[3].x, tilted[0].y - tilted[3].y);
    expect(left / full).toBeCloseTo(0.1, 1);
  });

  it('rectifyRegion mantém a proporção da carta e mostra o conteúdo da faixa certa', () => {
    const scene = renderScene(card, tilted, W, H);
    const strip = rectifyRegion(scene, tilted, [0, 0.9, 1, 1], 300)!;
    expect(strip.width).toBe(300);
    expect(strip.height).toBe(Math.round(300 / ((1 * 63) / (0.1 * 88))));
    // A faixa inferior da carta sintética é bege (corpo) com borda amarela: nada escuro do título.
    let dark = 0;
    for (let y = Math.round(strip.height * 0.25); y < strip.height * 0.75; y++) {
      for (let x = Math.round(strip.width * 0.2); x < strip.width * 0.8; x++) if ((strip.data[(y * strip.width + x) * 4] ?? 255) < 80) dark++;
    }
    expect(dark).toBe(0);
  });
});
