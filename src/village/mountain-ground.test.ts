import { describe, expect, it } from 'vitest';
import { generateVillage } from '../core/village/map';
import { MEW_STATUE_FRONT, TERRACES } from '../core/village/mountain';
import { mountainPiece, mountainPieceKey, paintMountainPiece } from './mountain-ground';

const map = generateVillage(20261014);
const opaque = (b: { data: Uint8ClampedArray }) => b.data.filter((_, i) => i % 4 === 3 && b.data[i] === 255).length;

describe('chão do Monte Miragem', () => {
  it('reconhece patamar, paredão (linha de cima e de baixo), degraus e a sombra no pé do paredão', () => {
    const t = TERRACES[0]!;
    expect(mountainPiece(map, MEW_STATUE_FRONT.x, MEW_STATUE_FRONT.y)).toMatchObject({ kind: 'ground' });
    expect(mountainPiece(map, t.x0 + 1, t.y1 - 1)).toMatchObject({ kind: 'cliff', part: 'face-top', upper: true });
    expect(mountainPiece(map, t.x0 + 1, t.y1)).toMatchObject({ kind: 'cliff', part: 'face-bottom', upper: false });
    expect(mountainPiece(map, t.stairsX, t.y1 - 1)).toEqual({ kind: 'stairs', part: 'face-top' });
    expect(mountainPiece(map, t.stairsX, t.y1 + 1)).toMatchObject({ kind: 'ground', shadow: true });
    // Longe do monte, o chão continua o da cidade.
    expect(mountainPiece(map, map.spawn.x, map.spawn.y)).toBeNull();
  });

  it('todo desenho do monte é um bloco cheio de 16×16', () => {
    const t = TERRACES[1]!;
    const seen = new Set<string>();
    for (let y = t.y0 - 2; y <= t.y1 + 2; y++) for (let x = t.x0 - 1; x <= t.x1 + 1; x++) {
      const p = mountainPiece(map, x, y);
      if (!p || seen.has(mountainPieceKey(p))) continue;
      seen.add(mountainPieceKey(p));
      expect(opaque(paintMountainPiece(p, x, y)), mountainPieceKey(p)).toBe(256);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});
