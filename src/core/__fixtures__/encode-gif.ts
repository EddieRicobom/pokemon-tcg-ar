/**
 * Codificador de GIF mínimo, usado só nos testes para gerar arquivos GIF reais
 * (sem depender de rede nem de binários no repositório).
 *
 * Usa paleta global de 4 cores e LZW "sem compressão": um código de limpeza a
 * cada 2 pixels mantém o tamanho do código em 3 bits, o que dispensa um LZW completo.
 */
export type Rgb = [number, number, number];

export interface FixtureFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Índices da paleta (0–3), linha a linha. */
  indices: number[];
  delayCs: number;
  disposal: number;
  transparentIndex?: number;
}

const CLEAR_CODE = 4;
const END_CODE = 5;
const CODE_BITS = 3;

class BitWriter {
  readonly bytes: number[] = [];
  private current = 0;
  private used = 0;

  write(code: number, bits: number): void {
    this.current |= code << this.used;
    this.used += bits;
    while (this.used >= 8) {
      this.bytes.push(this.current & 0xff);
      this.current >>= 8;
      this.used -= 8;
    }
  }

  flush(): void {
    if (this.used > 0) {
      this.bytes.push(this.current & 0xff);
      this.current = 0;
      this.used = 0;
    }
  }
}

function lzwEncode(indices: number[]): number[] {
  const writer = new BitWriter();
  writer.write(CLEAR_CODE, CODE_BITS);
  indices.forEach((index, position) => {
    writer.write(index, CODE_BITS);
    if (position % 2 === 1 && position < indices.length - 1) {
      writer.write(CLEAR_CODE, CODE_BITS);
    }
  });
  writer.write(END_CODE, CODE_BITS);
  writer.flush();
  return writer.bytes;
}

export function encodeGif(
  width: number,
  height: number,
  palette: [Rgb, Rgb, Rgb, Rgb],
  frames: FixtureFrame[],
): ArrayBuffer {
  const out: number[] = [];
  const u16 = (value: number) => out.push(value & 0xff, (value >> 8) & 0xff);

  for (const char of 'GIF89a') out.push(char.charCodeAt(0));
  u16(width);
  u16(height);
  out.push(0xf1, 0, 0); // tabela global de 4 cores, cor de fundo 0, proporção 0
  for (const color of palette) out.push(...color);

  for (const frame of frames) {
    const hasTransparency = frame.transparentIndex !== undefined;
    out.push(0x21, 0xf9, 0x04, (frame.disposal << 2) | (hasTransparency ? 1 : 0));
    u16(frame.delayCs);
    out.push(frame.transparentIndex ?? 0, 0x00);

    out.push(0x2c);
    u16(frame.left);
    u16(frame.top);
    u16(frame.width);
    u16(frame.height);
    out.push(0x00, 2); // sem tabela local; tamanho mínimo do código LZW = 2

    const data = lzwEncode(frame.indices);
    for (let start = 0; start < data.length; start += 255) {
      const block = data.slice(start, start + 255);
      out.push(block.length, ...block);
    }
    out.push(0x00);
  }

  out.push(0x3b);
  return new Uint8Array(out).buffer;
}
