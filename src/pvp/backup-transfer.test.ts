import { describe, expect, it } from 'vitest';
import { joinBackupChunks, splitBackupBytes } from './backup-transfer';

describe('transferência fragmentada de backup', () => {
  it('remonta bytes em mais de um fragmento', () => {
    const source = Uint8Array.from({ length: 40_000 }, (_, i) => i % 251);
    const chunks = splitBackupBytes(source);
    const result = joinBackupChunks(chunks, source.byteLength, chunks.length);
    expect(chunks.length).toBeGreaterThan(1);
    expect(result).not.toBeNull();
    expect([...result!]).toEqual([...source]);
  });

  it('recusa fragmento ausente, tamanho incorreto ou texto alterado', () => {
    const source = Uint8Array.from({ length: 100 }, (_, i) => i);
    const chunks = splitBackupBytes(source);
    expect(joinBackupChunks([...chunks.slice(0, -1), undefined], source.byteLength, chunks.length)).toBeNull();
    expect(joinBackupChunks(chunks, source.byteLength + 1, chunks.length)).toBeNull();
    expect(joinBackupChunks(chunks.map((chunk, i) => i === 0 ? chunk + '!' : chunk), source.byteLength, chunks.length)).toBeNull();
  });
});
