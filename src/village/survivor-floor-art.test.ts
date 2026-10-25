import { describe, expect, it } from 'vitest';
import { FLOOR_TEXTURE_SIZE, FOLIAGE_TINTS, GRASS_BASE_TONES, SURVIVOR_FLOOR_PALETTES, TALL_GRASS_TONES, floorTone, recolorGrassBase, survivorDecorTile, survivorFloorTexture, tintFoliage } from './survivor-floor-art';
import type { SurvivorDecorKind, SurvivorFloorKind } from './survivor-floor-art';

const rgbAt = (data: Uint8Array | Uint8ClampedArray, i: number) => (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;

describe('pixel art do chão da Torre', () => {
  const floors = Object.keys(SURVIVOR_FLOOR_PALETTES) as SurvivorFloorKind[];

  it('a textura base é opaca, dominada pela cor da borda dos autotiles e com marcas em toda a área', () => {
    for (const floor of floors) {
      const buf = survivorFloorTexture(floor);
      expect(buf.w).toBe(FLOOR_TEXTURE_SIZE);
      let base = 0;
      const quadrants = new Set<number>();
      for (let i = 0; i < buf.data.length; i += 4) {
        expect(buf.data[i + 3]).toBe(255);
        if (rgbAt(buf.data, i) === SURVIVOR_FLOOR_PALETTES[floor].base) base += 1;
        else {
          const p = i / 4;
          quadrants.add(Math.floor((p % buf.w) / 32) + 2 * Math.floor(p / buf.w / 32));
        }
      }
      expect(base / (buf.w * buf.h)).toBeGreaterThan(0.75);
      expect(quadrants.size, floor).toBe(4);
    }
  });

  it('é determinística e cada tipo de chão tem a própria textura', () => {
    const a = survivorFloorTexture('grass');
    expect(Array.from(a.data)).toEqual(Array.from(survivorFloorTexture('grass').data));
    expect(Array.from(a.data)).not.toEqual(Array.from(survivorFloorTexture('meadow').data));
  });

  it('os detalhes têm fundo transparente e mudam com a variante', () => {
    const kinds: SurvivorDecorKind[] = ['tuft', 'flowers', 'pebbles', 'leaves', 'drift', 'shell', 'ripple', 'crack', 'clover'];
    for (const kind of kinds) {
      const a = survivorDecorTile(kind, 'grass', 1);
      const alpha = Array.from({ length: a.w * a.h }, (_, p) => a.data[p * 4 + 3]!);
      expect(alpha.some((v) => v === 0), kind).toBe(true);
      expect(alpha.some((v) => v === 255), kind).toBe(true);
      const variants = new Set([0, 1, 2, 3, 4, 5].map((v) => Array.from(survivorDecorTile(kind, 'grass', v).data).join()));
      expect(variants.size, kind).toBeGreaterThan(1);
    }
  });

  it('troca só a grama pintada sob árvores, mato alto e borda dos autotiles pelos tons da região', () => {
    const tones = [...GRASS_BASE_TONES.keys()];
    const leaf = 0x70c88b; // folha de arbusto: verde-água, mas não é chão
    const colors = [...tones, leaf];
    const data = new Uint8Array(colors.flatMap((c) => [c >> 16, (c >> 8) & 255, c & 255, 255]));
    const source = { w: colors.length, h: 1, data };
    for (const floor of floors) {
      const out = recolorGrassBase(source, floor);
      tones.forEach((tone, i) => expect(rgbAt(out, i * 4)).toBe(SURVIVOR_FLOOR_PALETTES[floor][GRASS_BASE_TONES.get(tone)!]));
      expect(rgbAt(out, tones.length * 4)).toBe(leaf);
    }
    expect(floorTone(0x70c8a0, 'grass')).toBe(SURVIVOR_FLOOR_PALETTES.grass.base);
    expect(floorTone(0x3f6f5e, 'snow')).toBe(TALL_GRASS_TONES.get(0x3f6f5e));
  });

  it('as flores balançam no segundo quadro e voltam no terceiro', () => {
    const a = survivorDecorTile('flowers', 'grass', 2, undefined, 0);
    const b = survivorDecorTile('flowers', 'grass', 2, undefined, 1);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
    expect(Array.from(survivorDecorTile('flowers', 'grass', 2, undefined, 2).data)).toEqual(Array.from(a.data));
  });

  it('pinta só as copas das árvores no tom pedido, sem mexer no tronco nem na sombra', () => {
    const leaf = 0x7ace58, trunk = 0x403830, shadow = 0x40b088;
    const data = new Uint8Array([leaf, trunk, shadow].flatMap((c) => [c >> 16, (c >> 8) & 255, c & 255, 255]));
    expect(Array.from(tintFoliage(data, 'green'))).toEqual(Array.from(data));
    const gold = tintFoliage(data, 'gold');
    expect(rgbAt(gold, 0)).toBe(FOLIAGE_TINTS.gold[1]);
    expect(rgbAt(gold, 4)).toBe(trunk);
    expect(rgbAt(gold, 8)).toBe(shadow);
  });
});
