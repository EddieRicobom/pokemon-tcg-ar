/** Google Drive direto do navegador: apenas a pasta privada de dados deste app. */
const BACKUP_MIME = 'application/octet-stream';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const MAX_CLOUD_BYTES = 512 * 1024 * 1024;
const API = 'https://www.googleapis.com/drive/v3/files';
const FIELDS = 'id,name,modifiedTime,size';
export interface CloudCopy { id: string; name: string; modifiedTime: string; size: number }

export class DriveBackup {
  constructor(private readonly token: string, private readonly fetcher: typeof fetch = fetch, private readonly signal?: AbortSignal) {}
  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetcher(url, { ...init, signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000), cache: 'no-store', headers: { ...init.headers, Authorization: `Bearer ${this.token}` } });
    if (response.status === 401) throw new Error('A autorização expirou. Desconecte e conecte ao Google Drive novamente.');
    if (response.status === 403) throw new Error('O Google Drive recusou o acesso. Confira a permissão e o espaço disponível.');
    if (response.status === 429) throw new Error('O Google Drive recebeu muitas solicitações. Aguarde e tente novamente.');
    if (!response.ok) throw new Error('Não consegui concluir a operação no Google Drive. Seus dados locais continuam guardados.');
    return response;
  }
  async list(): Promise<CloudCopy[]> {
    const query = new URLSearchParams({ spaces: 'appDataFolder', q: "trashed = false and appProperties has { key='app' and value='pokemon-tcg-ar-backup' }", pageSize: '20', orderBy: 'modifiedTime desc', fields: `files(${FIELDS})` });
    const value: unknown = await (await this.request(`${API}?${query}`)).json();
    if (!value || typeof value !== 'object' || !('files' in value) || !Array.isArray(value.files)) throw new Error('O Google Drive devolveu uma lista inválida.');
    return value.files.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return [];
      const file = entry as Record<string, unknown>, size = Number(file.size);
      return typeof file.id === 'string' && typeof file.name === 'string' && typeof file.modifiedTime === 'string' && Number.isSafeInteger(size) && size > 0 && size <= MAX_CLOUD_BYTES
        ? [{ id: file.id, name: file.name, modifiedTime: file.modifiedTime, size }] : [];
    });
  }
  async upload(bytes: Uint8Array, now = new Date()): Promise<void> {
    if (!bytes.length || bytes.length > MAX_CLOUD_BYTES) throw new Error('O backup está vazio ou ultrapassa o limite de 512 MB.');
    const started = await this.request(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${FIELDS}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': BACKUP_MIME, 'X-Upload-Content-Length': String(bytes.length) },
      body: JSON.stringify({ name: `pokemon-tcg-ar-${now.toISOString().replace(/[:.]/g, '-')}.dat`, parents: ['appDataFolder'], appProperties: { app: 'pokemon-tcg-ar-backup' } }),
    });
    const location = started.headers.get('location');
    if (!location) throw new Error('O Google Drive não iniciou o envio. Tente novamente.');
    const target = new URL(location);
    if (target.origin !== 'https://www.googleapis.com' || !target.pathname.startsWith('/upload/drive/')) throw new Error('O Google Drive devolveu um endereço de envio inválido.');
    // Protocolo resumable em uma transferência; se falhar, mantém as cópias antigas e permite tentar de novo.
    const finished = await this.request(target.href, { method: 'PUT', headers: { 'Content-Type': BACKUP_MIME }, body: new Blob([bytes.slice().buffer], { type: BACKUP_MIME }) });
    const saved = await finished.json() as { id?: unknown; size?: unknown };
    if (typeof saved.id !== 'string' || Number(saved.size) !== bytes.length) throw new Error('O Google Drive não confirmou o arquivo completo. Atualize a lista antes de tentar novamente.');
  }
  async download(id: string): Promise<Uint8Array> {
    if (!/^[\w-]{1,200}$/.test(id)) throw new Error('Identificador de backup inválido.');
    const response = await this.request(`${API}/${encodeURIComponent(id)}?alt=media`);
    const size = Number(response.headers.get('content-length'));
    if (size > MAX_CLOUD_BYTES) throw new Error('O backup ultrapassa o limite de 512 MB.');
    if (!response.body) throw new Error('O Google Drive devolveu um arquivo vazio.');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.length;
        if (total > MAX_CLOUD_BYTES) { await reader.cancel(); throw new Error('O backup ultrapassa o limite de 512 MB.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const result = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  }
}
