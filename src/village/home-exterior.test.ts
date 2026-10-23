import { describe, expect, it } from 'vitest';
import { homeTileset, renovateHomeTileset } from './home-exterior';
import { HOME_EXTERIOR_STYLES } from '../core/village/town-layout';
import { ATLAS_SOURCES } from './atlas-spec';
import { harmonizeTerrain, villageGrassSheet, villagePierTile, villageSandTile } from './ground-palette';
import { EDGE } from '../box/ground-art';

describe('fachadas e chão em pixel art', () => {
  it('todo estilo e reforma usa recortes reais de casas do mesmo atlas', () => {
    const ids = new Set(ATLAS_SOURCES.map((s) => s.id));
    for (const style of HOME_EXTERIOR_STYLES) for (let level = 0; level <= 5; level++) expect(ids.has(homeTileset(level, style.id))).toBe(true);
    expect(new Set(HOME_EXTERIOR_STYLES.map((s) => homeTileset(3, s.id))).size).toBeGreaterThanOrEqual(5);
  });
  it('a varanda muda o desenho e o solar acrescenta um andar preservando a largura, a porta e o original', () => {
    const source = { w: 80, h: 128, data: new Uint8ClampedArray(80 * 128 * 4).fill(180) };
    const original = new Uint8ClampedArray(source.data);
    const simple = renovateHomeTileset(source, 3, 'jardim', 0x708fa1);
    const balcony = renovateHomeTileset(source, 4, 'jardim', 0x708fa1);
    const solar = renovateHomeTileset(source, 5, 'jardim', 0x708fa1);
    expect([solar.w, solar.h]).toEqual([80, 152]);
    expect(simple.data).not.toEqual(balcony.data);
    expect(source.data).toEqual(original);
    expect(solar.data.slice(-80 * 4)).toEqual(source.data.slice(-80 * 4));
    expect(balcony.data.slice(-80 * 4)).toEqual(source.data.slice(-80 * 4));
  });
  it('grama e areia têm variantes discretas, sem transparência, e a doca só recebe borda no perímetro', () => {
    for (const piece of [villageGrassSheet(), villageSandTile(3, 2), villagePierTile(0, 0, 0), villagePierTile(15, 0, 0)]) {
      expect([...piece.data].filter((_, i) => i % 4 === 3).every((a) => a === 255)).toBe(true);
    }
    const middle = villagePierTile(0, 2, 3), edge = villagePierTile(EDGE.west, 2, 3);
    const color = (p: typeof middle, x: number, y: number) => [...p.data.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4)];
    expect(color(middle, 0, 6)).not.toEqual(color(edge, 0, 6));
    expect(color(middle, 8, 6)).toEqual(color(edge, 8, 6));
    const water = { w: 1, h: 1, data: new Uint8ClampedArray([70, 150, 220, 255]) };
    expect(harmonizeTerrain(water).data).toEqual(water.data);
    const clear = { w: 1, h: 1, data: new Uint8ClampedArray([70, 150, 60, 0]) };
    expect(harmonizeTerrain(clear).data).toEqual(clear.data);
  });
});
