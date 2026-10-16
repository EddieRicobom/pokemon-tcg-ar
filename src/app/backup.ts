/**
 * Backup completo do progresso e dos ajustes num único arquivo JSON — pra trocar de aparelho ou guardar uma
 * cópia de segurança fora do navegador. Sem servidor nenhum (como tudo no projeto): o arquivo é gerado e lido
 * inteiramente no aparelho.
 *
 * O que entra: tudo que representa progresso ou escolha do jogador (Treinador, Vila — incluindo Digital Pokémon
 * e Encontros lendários —, perfil, equipe, roster, Liga, Pin Mode, modo de batalha, sensores, ajustes visuais e
 * alguns ajustes pequenos do Scanner).
 *
 * O que fica de fora, de propósito: as imagens de referência e os alvos de AR das cartas escaneadas (guardados
 * no IndexedDB do aparelho, não no localStorage) e qualquer cache de dados do PokeAPI/TCGdex (nomes, atributos,
 * golpes) — tudo isso é refeito sozinho na próxima vez que precisar, então entrar no backup só deixaria o
 * arquivo maior sem guardar nada que não dê pra buscar de novo. Quem restaura um backup num aparelho novo
 * precisa escanear as cartas físicas de novo para elas aparecerem na Vila e na Caixa.
 */

export const BACKUP_FORMAT = 'pokemon-tcg-ar-backup';
export const BACKUP_VERSION = 1;

/** Toda chave do localStorage com progresso ou ajuste do jogador — nunca um cache de API, que se refaz sozinho. */
export const BACKUP_KEYS: readonly string[] = [
  'tcg-ar-trainer-v1',
  'tcg-ar-vila-v1',
  'tcg-ar-perfil-v1',
  'tcg-ar-team-v1',
  'tcg-ar-roster-v1',
  'tcg-ar-liga-v1',
  'tcg-ar-pins-setup-v1',
  'tcg-ar-battle-mode-v1',
  'tcg-ar-sensor-v1',
  'tcg-ar-visual-v2',
  'tcg-ar-scan-debug-v1',
  'tcg-ar-art-search-v1',
  'tcg-ar-layout-v3',
];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** ISO; só informativo (mostrado na hora de confirmar uma importação). */
  exportedAt: string;
  /** Uma entrada por chave de `BACKUP_KEYS`; `null` quando a chave não existia no aparelho de origem. */
  data: Record<string, string | null>;
}

/** Lê cada chave conhecida do `storage` (sem tocar em nada) e monta o arquivo de backup. */
export function buildBackup(storage: Pick<Storage, 'getItem'>, now: string = new Date().toISOString()): BackupFile {
  const data: Record<string, string | null> = {};
  for (const key of BACKUP_KEYS) data[key] = storage.getItem(key);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, data };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

export type BackupParseError = 'json-invalido' | 'formato-desconhecido';

/** Lê o texto de um arquivo de backup; nunca lança — um erro vem como `BackupParseError`, nunca inventa dados. */
export function parseBackup(raw: string): BackupFile | BackupParseError {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return 'json-invalido';
  }
  if (!value || typeof value !== 'object') return 'formato-desconhecido';
  const v = value as Partial<BackupFile>;
  if (v.format !== BACKUP_FORMAT || typeof v.version !== 'number' || !v.data || typeof v.data !== 'object') return 'formato-desconhecido';
  const rawData = v.data as Record<string, unknown>;
  const data: Record<string, string | null> = {};
  for (const key of BACKUP_KEYS) {
    const entry = rawData[key];
    data[key] = typeof entry === 'string' ? entry : null;
  }
  return { format: BACKUP_FORMAT, version: v.version, exportedAt: typeof v.exportedAt === 'string' ? v.exportedAt : '', data };
}

/**
 * Restaura um backup já lido (`parseBackup`) no `storage`: cada chave conhecida é gravada com o valor do
 * backup, ou removida se o backup não tinha nada ali. Só toca nas chaves de `BACKUP_KEYS` — nada mais no
 * aparelho (incluindo o cache de cartas escaneadas, no IndexedDB) é afetado.
 */
export function applyBackup(file: BackupFile, storage: Pick<Storage, 'setItem' | 'removeItem'>): void {
  for (const key of BACKUP_KEYS) {
    const value = file.data[key];
    if (typeof value === 'string') storage.setItem(key, value);
    else storage.removeItem(key);
  }
}

/** Nome do arquivo sugerido pro download, com a data de hoje (`AAAA-MM-DD`). */
export function backupFileName(now = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `pokemon-tcg-ar-backup-${iso}.json`;
}
