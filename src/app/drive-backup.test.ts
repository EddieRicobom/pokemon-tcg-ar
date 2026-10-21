import { describe, expect, it, vi } from 'vitest';
import { DriveBackup, DRIVE_SCOPE, MAX_CLOUD_BYTES } from './drive-backup';
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

describe('Google Drive — cópias privadas', () => {
  it('lista somente dados deste app na pasta privada e descarta arquivos incompletos', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ files: [{ id: 'abc', name: 'save.zip', size: '123', modifiedTime: '2026-10-21T00:00:00Z' }, { id: 'partial', name: 'sem tamanho' }] }));
    const files = await new DriveBackup('token-teste', fetcher).list();
    expect(files).toHaveLength(1);
    const request = new URL(String(fetcher.mock.calls[0]![0]));
    expect(request.searchParams.get('spaces')).toBe('appDataFolder');
    expect(request.searchParams.get('q')).toContain('pokemon-tcg-ar-backup');
    expect(fetcher.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: 'Bearer token-teste' });
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.appdata');
  });
  it('cria nova cópia por data sem atualizar nem apagar cópias antigas', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' } })).mockResolvedValueOnce(json({ id: 'new', size: '3' }));
    await new DriveBackup('token', fetcher).upload(Uint8Array.from([1, 2, 3]), new Date('2026-10-21T12:00:00Z'));
    expect(fetcher).toHaveBeenCalledTimes(2);
    const init = fetcher.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({ parents: ['appDataFolder'], name: 'pokemon-tcg-ar-2026-10-21T12-00-00-000Z.zip' });
    expect(fetcher.mock.calls[1]![1]?.method).toBe('PUT');
  });
  it('recusa confirmação de envio com tamanho incorreto', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' } })).mockResolvedValueOnce(json({ id: 'new', size: '0' }));
    await expect(new DriveBackup('token', fetcher).upload(Uint8Array.from([1]))).rejects.toThrow('arquivo completo');
  });
  it('não envia token ou conteúdo para um endereço de upload fora do Google', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { headers: { location: 'https://example.test/upload/drive/v3/files' } }));
    await expect(new DriveBackup('token', fetcher).upload(Uint8Array.from([1]))).rejects.toThrow('endereço');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('falha no envio sem reportar sucesso ou fazer novas gravações', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' } })).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(new DriveBackup('token', fetcher).upload(Uint8Array.from([1]))).rejects.toThrow('Não consegui');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 429, 500])('reporta erro HTTP %i sem expor token', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    await expect(new DriveBackup('segredo', fetcher).list()).rejects.not.toThrow('segredo');
  });
  it('baixa bytes reais e recusa tamanho maior que o limite', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(Uint8Array.from([3, 2, 1]))).mockResolvedValueOnce(new Response(null, { headers: { 'content-length': String(MAX_CLOUD_BYTES + 1) } }));
    const drive = new DriveBackup('token', fetcher);
    expect([...await drive.download('abc')]).toEqual([3, 2, 1]);
    await expect(drive.download('abc')).rejects.toThrow('512 MB');
    await expect(drive.download('../outro')).rejects.toThrow('Identificador');
  });
  it('repassa cancelamento ao sair da tela', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_, init) => { expect(init?.signal?.aborted).toBe(true); throw new DOMException('Cancelado', 'AbortError'); });
    await expect(new DriveBackup('token', fetcher, controller.signal).list()).rejects.toThrow('Cancelado');
  });
});
