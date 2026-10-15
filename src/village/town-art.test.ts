import { describe, expect, it } from 'vitest';
import { HOME_DECORS, ROOFS } from '../core/village/town';
import { HOME_LANTERN, HOME_WINDOWS, paintCafe, paintFountain, paintHome, paintLamp, paintLot, paintMail, paintMuseum } from './town-art';
import type { PixelBuf } from '../box/ground-art';

const opaque = (b: PixelBuf) => {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i]! > 0) n++;
  return n;
};
const same = (a: PixelBuf, b: PixelBuf) => a.data.every((v, i) => v === b.data[i]);
const at = (b: PixelBuf, x: number, y: number) => b.data[(y * b.w + x) * 4 + 3]!;

describe('arte da cidade', () => {
  it('a casa tem desenho de verdade em cada nível, com fundo transparente e cada nível diferente', () => {
    const imgs = [0, 1, 2, 3].map((l) => paintHome(l, ROOFS[0]!.rgb, 0));
    for (const b of imgs) {
      expect([b.w, b.h]).toEqual([48, 48]);
      expect(opaque(b)).toBeGreaterThan(400);
      expect(opaque(b)).toBeLessThan(48 * 48);
    }
    for (let i = 1; i < 4; i++) expect(same(imgs[i]!, imgs[i - 1]!)).toBe(false);
    expect(opaque(imgs[3]!)).toBeGreaterThan(opaque(imgs[0]!));
  });

  it('a cor do telhado e cada enfeite mudam o desenho', () => {
    const base = paintHome(2, ROOFS[0]!.rgb, 0);
    expect(same(base, paintHome(2, ROOFS[1]!.rgb, 0))).toBe(false);
    for (const d of HOME_DECORS) expect(same(base, paintHome(2, ROOFS[0]!.rgb, d.bit)), d.name).toBe(false);
    expect(same(base, paintHome(2, ROOFS[0]!.rgb, 15))).toBe(false);
  });

  it('as janelas e o lampião ficam sobre a parede da casa (para acender à noite)', () => {
    for (let l = 0; l < 4; l++) {
      const b = paintHome(l, ROOFS[0]!.rgb, 4);
      for (const w of HOME_WINDOWS[l]!) {
        expect(at(b, w[0]!, w[1]!), `janela do nível ${l}`).toBe(255);
        expect(at(b, w[0]! + w[2]! - 1, w[1]! + w[3]! - 1)).toBe(255);
        expect(w[0]! + w[2]!).toBeLessThanOrEqual(48);
      }
      expect(at(b, HOME_LANTERN.x, HOME_LANTERN.y)).toBe(255);
    }
  });

  it('prédios, terreno, fonte e poste têm tamanho certo e desenho', () => {
    const sized: [PixelBuf, number, number][] = [[paintCafe(), 64, 48], [paintMail(), 48, 48], [paintMuseum(), 48, 48], [paintLot(), 48, 48], [paintFountain(0), 32, 40], [paintLamp(false), 16, 32]];
    for (const [b, w, h] of sized) {
      expect([b.w, b.h]).toEqual([w, h]);
      expect(opaque(b)).toBeGreaterThan(150);
      expect(opaque(b)).toBeLessThan(w * h);
    }
    expect(same(paintFountain(0), paintFountain(1))).toBe(false);
    expect(same(paintLamp(false), paintLamp(true))).toBe(false);
  });
});
