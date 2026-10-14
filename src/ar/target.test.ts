import { describe, expect, it } from 'vitest';
import { mergeTargets } from './target';

type FakeData = { targetImage: { width: number; height: number }; trackingData: unknown[]; matchingData: unknown[] };

async function fakeTarget(width: number, height: number): Promise<ArrayBuffer> {
  const { CompilerBase } = await import('mind-ar/src/image-target/compiler-base.js');
  const compiler = new CompilerBase() as unknown as { data: FakeData[]; exportData(): Uint8Array };
  compiler.data = [{ targetImage: { width, height }, trackingData: [{ w: width }], matchingData: [{ h: height }] }];
  const out = compiler.exportData();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

async function read(buffer: ArrayBuffer): Promise<FakeData[]> {
  const { CompilerBase } = await import('mind-ar/src/image-target/compiler-base.js');
  return new (CompilerBase as unknown as new () => { importData(b: ArrayBuffer): FakeData[] })().importData(buffer);
}

describe('mergeTargets', () => {
  it('junta os alvos na ordem dada, mantendo o tamanho de cada carta', async () => {
    const merged = await mergeTargets([await fakeTarget(600, 840), await fakeTarget(300, 420), await fakeTarget(500, 700)]);
    const list = await read(merged);
    expect(list.map((d) => [d.targetImage.width, d.targetImage.height])).toEqual([[600, 840], [300, 420], [500, 700]]);
    expect(list[1]?.trackingData).toEqual([{ w: 300 }]);
    expect(list[2]?.matchingData).toEqual([{ h: 700 }]);
  });

  it('com um só alvo devolve o mesmo arquivo', async () => {
    const one = await fakeTarget(600, 840);
    expect(await mergeTargets([one])).toBe(one);
  });

  it('recusa lista vazia e arquivo inválido', async () => {
    await expect(mergeTargets([])).rejects.toThrow(/nenhum/i);
    const { encode } = await import('@msgpack/msgpack');
    const old = encode({ v: 1, dataList: [] });
    await expect(mergeTargets([await fakeTarget(10, 10), old.buffer.slice(old.byteOffset, old.byteOffset + old.byteLength) as ArrayBuffer])).rejects.toThrow(/incompat/i);
  });
});
