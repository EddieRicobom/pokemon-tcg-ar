import { describe, expect, it } from 'vitest';
import { bonkTilesetIndex } from './survivor-bonk-landscape';

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
});
