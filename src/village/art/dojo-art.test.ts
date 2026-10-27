import { describe, expect, it } from 'vitest';
import { DOJO_WINDOWS, paintDojo } from './dojo-art';
import type { DojoLevel } from './dojo-art';

const LEVELS: readonly DojoLevel[] = [0, 1, 2, 3];
const opaque = (data: Uint8Array): number => { let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++; return n; };

describe('arte do Dojô', () => {
  it('os quatro estágios têm 96×48 e desenham algo', () => {
    for (const level of LEVELS) {
      const buf = paintDojo(level);
      expect([buf.w, buf.h]).toEqual([96, 48]);
      expect(opaque(buf.data), `nível ${level}`).toBeGreaterThan(300);
    }
  });

  it('cada estágio é diferente dos outros e o terreno vazio é o mais leve', () => {
    const images = LEVELS.map((level) => Buffer.from(paintDojo(level).data).toString('base64'));
    expect(new Set(images).size).toBe(4);
    expect(opaque(paintDojo(0).data)).toBeLessThanOrEqual(opaque(paintDojo(3).data));
  });

  it('as janelas iluminadas cabem no desenho e o terreno não tem nenhuma', () => {
    expect(DOJO_WINDOWS).toHaveLength(4);
    expect(DOJO_WINDOWS[0]).toEqual([]);
    for (const list of DOJO_WINDOWS) for (const [x = -1, y = -1, w = 0, h = 0] of list) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(96);
      expect(y + h).toBeLessThanOrEqual(48);
    }
  });
});
