import { describe, expect, it } from 'vitest';
import { encodeGif, type Rgb } from './__fixtures__/encode-gif';
import {
  GifDownloadError,
  composeFrames,
  decodeGif,
  describeGifError,
  frameIndexAt,
  normalizeDelay,
  type PatchFrame,
} from './gif';

const PALETTE: [Rgb, Rgb, Rgb, Rgb] = [
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
];

/** Lê o pixel (x, y) de uma imagem RGBA. */
function pixel(rgba: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return [rgba[offset] ?? -1, rgba[offset + 1] ?? -1, rgba[offset + 2] ?? -1, rgba[offset + 3] ?? -1];
}

/** Monta um quadro sintético com uma única cor opaca (ou transparente se alpha = 0). */
function solidPatch(
  left: number,
  top: number,
  width: number,
  height: number,
  color: [number, number, number, number],
  disposalType: number,
): PatchFrame {
  const patch = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) patch.set(color, i * 4);
  return { dims: { left, top, width, height }, patch, delay: 100, disposalType };
}

describe('decodeGif (arquivo GIF real gerado no teste)', () => {
  it('decodifica dimensões, atrasos e compõe quadros parciais', () => {
    const data = encodeGif(2, 2, PALETTE, [
      { left: 0, top: 0, width: 2, height: 2, indices: [1, 1, 2, 2], delayCs: 10, disposal: 1 },
      {
        left: 1,
        top: 1,
        width: 1,
        height: 1,
        indices: [3],
        delayCs: 20,
        disposal: 1,
        transparentIndex: 0,
      },
    ]);

    const gif = decodeGif(data);

    expect(gif.width).toBe(2);
    expect(gif.height).toBe(2);
    expect(gif.frames.map((frame) => frame.delayMs)).toEqual([100, 200]);
    expect(gif.durationMs).toBe(300);

    const [first, second] = gif.frames;
    expect(pixel(first!.rgba, 2, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(first!.rgba, 2, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(first!.rgba, 2, 0, 1)).toEqual([0, 255, 0, 255]);
    expect(pixel(first!.rgba, 2, 1, 1)).toEqual([0, 255, 0, 255]);

    // O segundo quadro só troca o pixel (1, 1); o resto vem do quadro anterior.
    expect(pixel(second!.rgba, 2, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(second!.rgba, 2, 0, 1)).toEqual([0, 255, 0, 255]);
    expect(pixel(second!.rgba, 2, 1, 1)).toEqual([0, 0, 255, 255]);
  });

  it('preserva a transparência do índice transparente', () => {
    const data = encodeGif(2, 1, PALETTE, [
      {
        left: 0,
        top: 0,
        width: 2,
        height: 1,
        indices: [0, 1],
        delayCs: 10,
        disposal: 1,
        transparentIndex: 0,
      },
    ]);

    const gif = decodeGif(data);

    expect(pixel(gif.frames[0]!.rgba, 2, 0, 0)[3]).toBe(0);
    expect(pixel(gif.frames[0]!.rgba, 2, 1, 0)).toEqual([255, 0, 0, 255]);
  });

  it('rejeita dados que não são um GIF', () => {
    expect(() => decodeGif(new Uint8Array([1, 2, 3, 4]).buffer)).toThrow();
  });
});

describe('composeFrames', () => {
  it('disposal 2 limpa a área do quadro anterior antes do próximo', () => {
    const frames = composeFrames(
      [
        solidPatch(0, 0, 2, 1, [255, 0, 0, 255], 2),
        solidPatch(0, 0, 1, 1, [0, 255, 0, 255], 1),
      ],
      2,
      1,
    );

    expect(pixel(frames[0]!.rgba, 2, 1, 0)).toEqual([255, 0, 0, 255]);
    // O pixel (1, 0) pertencia ao quadro 1, que foi descartado: volta a ser transparente.
    expect(pixel(frames[1]!.rgba, 2, 1, 0)[3]).toBe(0);
    expect(pixel(frames[1]!.rgba, 2, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it('disposal 3 restaura o estado anterior ao quadro descartado', () => {
    const frames = composeFrames(
      [
        solidPatch(0, 0, 1, 1, [255, 0, 0, 255], 1),
        solidPatch(1, 0, 1, 1, [0, 0, 255, 255], 3),
        solidPatch(0, 0, 1, 1, [0, 255, 0, 255], 1),
      ],
      2,
      1,
    );

    expect(pixel(frames[1]!.rgba, 2, 1, 0)).toEqual([0, 0, 255, 255]);
    // Antes do 3º quadro, o azul do 2º é desfeito e o vermelho do 1º continua.
    expect(pixel(frames[2]!.rgba, 2, 1, 0)[3]).toBe(0);
    expect(pixel(frames[2]!.rgba, 2, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it('ignora pixels transparentes do quadro novo', () => {
    const frames = composeFrames(
      [
        solidPatch(0, 0, 1, 1, [255, 0, 0, 255], 1),
        solidPatch(0, 0, 1, 1, [0, 0, 0, 0], 1),
      ],
      1,
      1,
    );

    expect(pixel(frames[1]!.rgba, 1, 0, 0)).toEqual([255, 0, 0, 255]);
  });
});

describe('describeGifError', () => {
  it('explica o 404 como nome inexistente', () => {
    expect(describeGifError(new GifDownloadError(404))).toContain('não tem um GIF');
  });

  it('cita o código HTTP nos demais erros do servidor', () => {
    expect(describeGifError(new GifDownloadError(500))).toContain('500');
  });

  it('trata TypeError (rede ou CORS) com a saída pelo arquivo local', () => {
    const message = describeGifError(new TypeError('Failed to fetch'));
    expect(message).toContain('CORS');
    expect(message).toContain('Carregar GIF do aparelho');
  });

  it('usa a mensagem genérica para dados inválidos', () => {
    expect(describeGifError(new Error('qualquer'))).toBe('O arquivo não é um GIF válido.');
  });
});

describe('normalizeDelay', () => {
  it('troca atrasos muito curtos por 100 ms e mantém os demais', () => {
    expect(normalizeDelay(0)).toBe(100);
    expect(normalizeDelay(10)).toBe(100);
    expect(normalizeDelay(20)).toBe(20);
    expect(normalizeDelay(120)).toBe(120);
  });
});

describe('frameIndexAt', () => {
  const gif = {
    frames: [
      { rgba: new Uint8ClampedArray(4), delayMs: 100 },
      { rgba: new Uint8ClampedArray(4), delayMs: 200 },
    ],
    durationMs: 300,
  };

  it('escolhe o quadro pelo tempo decorrido', () => {
    expect(frameIndexAt(gif, 0)).toBe(0);
    expect(frameIndexAt(gif, 99)).toBe(0);
    expect(frameIndexAt(gif, 100)).toBe(1);
    expect(frameIndexAt(gif, 299)).toBe(1);
  });

  it('volta ao início ao fim da animação', () => {
    expect(frameIndexAt(gif, 300)).toBe(0);
    expect(frameIndexAt(gif, 450)).toBe(1);
  });

  it('lida com tempos negativos', () => {
    expect(frameIndexAt(gif, -1)).toBe(1);
  });

  it('devolve 0 para GIF de um único quadro', () => {
    expect(frameIndexAt({ frames: [gif.frames[0]!], durationMs: 100 }, 5000)).toBe(0);
  });
});
