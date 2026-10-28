import { describe, expect, it } from 'vitest';
import { DOJO_WINDOWS, paintDojo } from './dojo-art';
import type { DojoLevel } from './dojo-art';

const LEVELS: readonly DojoLevel[] = [0, 1, 2, 3];
const opaque = (data: Uint8Array): number => { let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++; return n; };

describe('arte do Dojô', () => {
  it('os quatro estágios têm 96 de largura, crescem com a reforma e pisam na última linha', () => {
    let last = 0;
    for (const level of LEVELS) {
      const buf = paintDojo(level);
      expect(buf.w).toBe(96);
      expect(buf.h, `nível ${level}`).toBeGreaterThanOrEqual(Math.max(48, last));
      expect(buf.h).toBeLessThanOrEqual(96);
      last = buf.h;
      expect(opaque(buf.data), `nível ${level}`).toBeGreaterThan(300);
      let bottom = 0;
      for (let x = 0; x < buf.w; x++) if (buf.data[((buf.h - 1) * buf.w + x) * 4 + 3]! > 0) bottom++;
      expect(bottom, `nível ${level}`).toBeGreaterThan(20);
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
    LEVELS.forEach((level) => {
      const buf = paintDojo(level);
      for (const [x = -1, y = -1, w = 0, h = 0] of DOJO_WINDOWS[level]!) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(buf.w);
        expect(y + h).toBeLessThanOrEqual(buf.h);
        // Só janelas e lanternas pequenas, em cima de desenho de verdade.
        expect(w * h).toBeLessThanOrEqual(100);
        expect(buf.data[(y * buf.w + x) * 4 + 3]).toBe(255);
      }
    });
  });
});
