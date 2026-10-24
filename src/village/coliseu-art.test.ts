import { describe, expect, it } from 'vitest';
import { CIVIC } from '../core/village/town-layout';
import { buildingsFor, TOWN } from '../core/village/town-layout';
import { COLISEU_GLOWS, COLISEU_H, COLISEU_W, paintColiseu } from './coliseu-art';
import type { PixelBuf } from '../box/ground-art';

const alpha = (b: PixelBuf, x: number, y: number) => b.data[(y * b.w + x) * 4 + 3]!;
const rgb = (b: PixelBuf, x: number, y: number) => (b.data[(y * b.w + x) * 4]! << 16) | (b.data[(y * b.w + x) * 4 + 1]! << 8) | b.data[(y * b.w + x) * 4 + 2]!;

describe('arte do Coliseu', () => {
  const art = paintColiseu();

  it('tem o tamanho anunciado, fundo transparente e desenho de verdade', () => {
    expect([art.w, art.h]).toEqual([COLISEU_W, COLISEU_H]);
    let opaque = 0;
    for (let i = 3; i < art.data.length; i += 4) if (art.data[i]! > 0) opaque++;
    expect(opaque).toBeGreaterThan(COLISEU_W * COLISEU_H * 0.6);
    expect(opaque).toBeLessThan(COLISEU_W * COLISEU_H);
    expect(alpha(art, 0, 0)).toBe(0);
  });

  it('pisa no chão: a última linha tem pedra e o desenho sobe daí', () => {
    let bottom = 0;
    for (let x = 0; x < art.w; x++) if (alpha(art, x, art.h - 1) > 0) bottom++;
    expect(bottom).toBeGreaterThan(90);
  });

  it('mostra as duas equipes: vermelho de um lado e azul do outro', () => {
    const count = (test: (r: number, g: number, b: number) => boolean, from: number, to: number) => {
      let n = 0;
      for (let y = 0; y < art.h; y++) for (let x = from; x < to; x++) {
        const c = rgb(art, x, y);
        if (alpha(art, x, y) > 0 && test((c >> 16) & 255, (c >> 8) & 255, c & 255)) n++;
      }
      return n;
    };
    const red = (r: number, g: number, b: number) => r > 180 && g < 90 && b < 80;
    const blue = (r: number, _g: number, b: number) => b > 170 && r < 90;
    expect(count(red, 0, 40)).toBeGreaterThan(80);
    expect(count(blue, 72, art.w)).toBeGreaterThan(80);
    expect(count(blue, 0, 40)).toBeLessThan(10);
    expect(count(red, 72, art.w)).toBeLessThan(10);
  });

  it('é simétrico no eixo do portão e o portão fica na porta do prédio', () => {
    const arena = buildingsFor(TOWN.w, TOWN.h).find((b) => b.kind === 'arena')!;
    // O portão fica no meio do desenho, e o desenho no meio da área sólida: o bloco da porta é o da frente do portão.
    expect(arena.x * 16 + (arena.w * 16) / 2).toBe(arena.door.x * 16 + 8);
    expect(COLISEU_W).toBe(arena.w * 16);
    for (let y = 60; y < 70; y++) expect(alpha(art, COLISEU_W / 2 - 1, y)).toBe(alpha(art, COLISEU_W / 2, y));
  });

  it('cabe entre a Torre e o Fliperama sem encostar em nenhum dos dois', () => {
    const arena = CIVIC.find((c) => c.kind === 'arena')!;
    const torre = CIVIC.find((c) => c.kind === 'torre')!;
    const arcade = CIVIC.find((c) => c.kind === 'arcade')!;
    expect(arena.x).toBeGreaterThanOrEqual(torre.x + torre.w);
    expect(arena.x + arena.w).toBeLessThanOrEqual(arcade.x);
    expect(arena.y).toBe(torre.y);
    expect(arena.y).toBe(arcade.y);
  });

  it('as luzes da noite caem dentro do desenho, em cima de pedra', () => {
    expect(COLISEU_GLOWS.length).toBeGreaterThan(0);
    for (const g of COLISEU_GLOWS) {
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.y).toBeGreaterThanOrEqual(0);
      expect(g.x + g.w).toBeLessThanOrEqual(COLISEU_W);
      expect(g.y + g.h).toBeLessThanOrEqual(COLISEU_H);
      expect(alpha(art, g.x, g.y)).toBe(255);
    }
  });

  it('é sempre o mesmo desenho (sem sorteio)', () => {
    expect(paintColiseu().data).toEqual(art.data);
  });
});
