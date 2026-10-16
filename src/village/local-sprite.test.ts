import { describe, expect, it } from 'vitest';
import { contentBounds, sliceDirectionFrames } from './local-sprite';
import type { DirectionRow, LocalSpriteAnim } from './local-sprite-meta';
import type { RgbaImage } from '../recognition/types';
import type { DecodedGif, GifFrame } from '../core/gif';

/** Um quadro `w`×`h` todo transparente, exceto o retângulo opaco dado (pra testar `contentBounds`). */
function frameWithOpaqueBox(w: number, h: number, box: { x0: number; y0: number; x1: number; y1: number }): GifFrame {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      rgba[(y * w + x) * 4 + 3] = 255;
    }
  }
  return { rgba, delayMs: 100 };
}

/** Folha sintética: cada quadro (coluna × linha) é pintado com uma cor única, só com (quadro, direção) nos canais R/G. */
function syntheticSheet(anim: LocalSpriteAnim): RgbaImage {
  const width = anim.w * anim.n;
  const height = anim.h * anim.r;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let dir = 0; dir < anim.r; dir++) {
    for (let frame = 0; frame < anim.n; frame++) {
      for (let y = 0; y < anim.h; y++) {
        for (let x = 0; x < anim.w; x++) {
          const px = ((dir * anim.h + y) * width + frame * anim.w + x) * 4;
          data[px] = frame * 10;
          data[px + 1] = dir * 10;
          data[px + 2] = 200;
          data[px + 3] = 255;
        }
      }
    }
  }
  return { width, height, data };
}

const anim: LocalSpriteAnim = { w: 4, h: 3, n: 3, r: 8, d: [40, 6, 6] };

describe('sliceDirectionFrames', () => {
  it('recorta os quadros certos da direção pedida (pixel de cada quadro bate com (quadro, direção))', () => {
    const sheet = syntheticSheet(anim);
    const gif = sliceDirectionFrames(sheet, anim, 2);
    expect(gif.width).toBe(4);
    expect(gif.height).toBe(3);
    expect(gif.frames).toHaveLength(3);
    gif.frames.forEach((frame, i) => {
      expect(frame.rgba[0]).toBe(i * 10); // R = índice do quadro
      expect(frame.rgba[1]).toBe(2 * 10); // G = direção pedida (2)
      expect(frame.rgba.length).toBe(4 * 3 * 4);
    });
  });

  it('direções diferentes devolvem quadros diferentes da mesma folha', () => {
    const sheet = syntheticSheet(anim);
    const down = sliceDirectionFrames(sheet, anim, 0);
    const left = sliceDirectionFrames(sheet, anim, 6);
    expect(down.frames[0]!.rgba[1]).toBe(0);
    expect(left.frames[0]!.rgba[1]).toBe(60);
  });

  it('converte a duração de ticks (60 fps) para milissegundos', () => {
    const sheet = syntheticSheet(anim);
    const gif = sliceDirectionFrames(sheet, anim, 0);
    expect(gif.frames.map((f) => f.delayMs)).toEqual([667, 100, 100]);
    expect(gif.durationMs).toBe(867);
  });

  it('rejeita folha com tamanho diferente do esperado pelos metadados (não finge que cortou certo)', () => {
    const wrong: RgbaImage = { width: 10, height: 10, data: new Uint8ClampedArray(10 * 10 * 4) };
    expect(() => sliceDirectionFrames(wrong, anim, 0)).toThrow(/tamanho inesperado/);
  });

  it('rejeita direção fora do intervalo de linhas da folha', () => {
    const sheet = syntheticSheet(anim);
    // Fora do tipo DirectionRow de propósito: a validação em runtime é o que protege um chamador descuidado.
    expect(() => sliceDirectionFrames(sheet, anim, 8 as unknown as DirectionRow)).toThrow(/fora do intervalo/);
  });
});

describe('contentBounds', () => {
  it('acha a caixa dos pixels opacos, ignorando a margem transparente', () => {
    const gif: DecodedGif = {
      width: 20,
      height: 20,
      durationMs: 100,
      frames: [frameWithOpaqueBox(20, 20, { x0: 5, y0: 8, x1: 15, y1: 18 })],
    };
    const bounds = contentBounds(gif);
    expect(bounds.top).toBeCloseTo(8 / 20);
    expect(bounds.bottom).toBeCloseTo(18 / 20);
    expect(bounds.left).toBeCloseTo(5 / 20);
    expect(bounds.right).toBeCloseTo(15 / 20);
  });

  it('junta a caixa de todos os quadros (a animação não muda o tamanho medido)', () => {
    const gif: DecodedGif = {
      width: 20,
      height: 20,
      durationMs: 100,
      frames: [
        frameWithOpaqueBox(20, 20, { x0: 5, y0: 10, x1: 15, y1: 18 }), // quadro "no alto do pulo"
        frameWithOpaqueBox(20, 20, { x0: 5, y0: 2, x1: 15, y1: 10 }), // quadro "no fundo do pulo"
      ],
    };
    const bounds = contentBounds(gif);
    expect(bounds.top).toBeCloseTo(2 / 20);
    expect(bounds.bottom).toBeCloseTo(18 / 20);
  });

  it('sem nenhum pixel opaco, devolve o quadro inteiro (não finge que mediu algo)', () => {
    const gif: DecodedGif = { width: 10, height: 10, durationMs: 100, frames: [{ rgba: new Uint8ClampedArray(10 * 10 * 4), delayMs: 100 }] };
    expect(contentBounds(gif)).toEqual({ top: 0, bottom: 1, left: 0, right: 1 });
  });
});
