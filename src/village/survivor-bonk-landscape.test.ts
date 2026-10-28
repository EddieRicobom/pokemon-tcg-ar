import { describe, expect, it } from 'vitest';
import { bonkGroundDetail, bonkTilesetIndex } from './survivor-bonk-landscape';

describe('tilesets do cenário BONK', () => {
  it('mantém o mesmo tileset para a seed da corrida e varia entre corridas', () => {
    expect(bonkTilesetIndex(12345)).toBe(bonkTilesetIndex(12345));
    const options = new Set(Array.from({ length: 64 }, (_, seed) => bonkTilesetIndex(seed + 1)));
    expect(options.size).toBeGreaterThan(3);
  });

  it('percorre todos os estilos enquanto as regiões da mesma corrida avançam', () => {
    const styles = Array.from({ length: 9 }, (_, region) => bonkTilesetIndex(12345, region));
    expect(new Set(styles).size).toBe(styles.length);
  });

  it('agrupa a decoração em habitats com clareiras, mantendo o desenho determinístico', () => {
    const positions = Array.from({ length: 20 }, (_, row) => Array.from({ length: 24 }, (_, col) => ({ x: 80 + col * 120, y: 80 + row * 120 })));
    const flat = positions.flat();
    const first = flat.map(({ x, y }) => bonkGroundDetail(12345, x, y));
    expect(flat.map(({ x, y }) => bonkGroundDetail(12345, x, y))).toEqual(first);
    const occupied = first.filter((detail) => detail !== null);
    expect(occupied.length).toBeGreaterThan(20);
    expect(occupied.length).toBeLessThan(flat.length * 0.45);
    expect(new Set(occupied).size).toBeGreaterThanOrEqual(3);
    // Pelo menos uma mancha tem vários elementos próximos, em vez de todos ficarem isolados na grade.
    const clustered = flat.some((point, i) => first[i] !== null && flat.filter((other, j) => first[j] !== null && Math.hypot(other.x - point.x, other.y - point.y) < 220).length >= 3);
    expect(clustered).toBe(true);
  });
});
