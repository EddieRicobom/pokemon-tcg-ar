/**
 * Fragmentação segura do ZIP de backup para o canal P2P.
 *
 * O canal do PvP transporta mensagens JSON; cada fragmento fica pequeno o
 * bastante para não ultrapassar o limite de validação de `wire.ts`. O ZIP
 * continua compactado pelo módulo de backup e só é remontado depois de todos
 * os fragmentos chegarem.
 */
export const BACKUP_TRANSFER_CHUNK_BYTES = 12 * 1024;
export const MAX_BACKUP_TRANSFER_BYTES = 512 * 1024 * 1024;
export const MAX_BACKUP_TRANSFER_CHUNKS = Math.ceil(MAX_BACKUP_TRANSFER_BYTES / BACKUP_TRANSFER_CHUNK_BYTES);

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBackupChunk(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function splitBackupBytes(bytes: Uint8Array): string[] {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BACKUP_TRANSFER_BYTES) throw new Error('backup grande demais para a sala');
  const chunks: string[] = [];
  for (let start = 0; start < bytes.byteLength; start += BACKUP_TRANSFER_CHUNK_BYTES) {
    chunks.push(toBase64Url(bytes.subarray(start, Math.min(bytes.byteLength, start + BACKUP_TRANSFER_CHUNK_BYTES))));
  }
  return chunks;
}

export function joinBackupChunks(chunks: readonly (string | undefined)[], expectedBytes: number, expectedChunks: number): Uint8Array | null {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > MAX_BACKUP_TRANSFER_BYTES) return null;
  if (!Number.isSafeInteger(expectedChunks) || expectedChunks <= 0 || expectedChunks > MAX_BACKUP_TRANSFER_CHUNKS || chunks.length !== expectedChunks) return null;
  const decoded: Uint8Array[] = [];
  let total = 0;
  for (const chunk of chunks) {
    if (!chunk) return null;
    const bytes = decodeBackupChunk(chunk);
    if (!bytes) return null;
    total += bytes.byteLength;
    if (total > expectedBytes) return null;
    decoded.push(bytes);
  }
  if (total !== expectedBytes) return null;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const bytes of decoded) {
    result.set(bytes, offset);
    offset += bytes.byteLength;
  }
  return result;
}
