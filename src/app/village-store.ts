import { generateVillage } from '../core/village/map';
import { migrateLayout } from '../core/village/migrate';
import type { VillageMap } from '../core/village/map';
import { emptyVillage, normalizeVillage } from '../core/village/life';
import type { VillageState } from '../core/village/life';
import { sanitizeTown } from '../core/village/town';

/** A Vila é a mesma para todo mundo (semente fixa); o progresso de cada um fica no aparelho. */
export const VILLAGE_SEED = 20261014;
export const VILLAGE_KEY = 'tcg-ar-vila-v1';
/** Cópia do salvamento anterior, de tempos em tempos: se o principal vier corrompido, a Vila volta dela. */
export const VILLAGE_BACKUP_KEY = 'tcg-ar-vila-v1-bak';
const BACKUP_EVERY_MS = 5 * 60_000;

let cachedMap: VillageMap | null = null;
export function villageMap(): VillageMap {
  return (cachedMap ??= generateVillage(VILLAGE_SEED));
}

function parse(raw: string | null): VillageState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const state = normalizeVillage(value, VILLAGE_SEED, villageMap().spawn);
    // Save do mapa antigo (48×40): móveis para a mochila, horta para a fazenda, você no começo (ver `migrate.ts`).
    migrateLayout(state, villageMap());
    // A cidade nasceu depois de muitos saves: o que estava onde hoje há casa ou poste volta para a mochila.
    sanitizeTown(state, villageMap());
    return state;
  } catch {
    return null;
  }
}

/** Lê o progresso: o salvamento principal, ou a cópia se ele estiver ilegível; sem nada, uma Vila nova. */
export function loadVillage(): VillageState {
  const map = villageMap();
  try {
    return parse(localStorage.getItem(VILLAGE_KEY)) ?? parse(localStorage.getItem(VILLAGE_BACKUP_KEY)) ?? emptyVillage(VILLAGE_SEED, map.spawn);
  } catch {
    return emptyVillage(VILLAGE_SEED, map.spawn);
  }
}

let lastBackup = 0;

/** Grava o progresso. Devolve `false` se o aparelho recusar (espaço cheio, modo privado): quem chama avisa o jogador. */
export function saveVillage(state: VillageState, now = Date.now()): boolean {
  try {
    const next = JSON.stringify(state);
    // Antes de sobrescrever, guarda o que estava salvo (no máximo a cada 5 minutos), só se ainda for legível.
    if (now - lastBackup > BACKUP_EVERY_MS) {
      const prev = localStorage.getItem(VILLAGE_KEY);
      if (prev && parse(prev)) {
        try {
          localStorage.setItem(VILLAGE_BACKUP_KEY, prev);
          lastBackup = now;
        } catch {
          /* sem espaço para a cópia: o salvamento principal vale mais */
        }
      }
    }
    localStorage.setItem(VILLAGE_KEY, next);
    return true;
  } catch {
    return false;
  }
}

/** Pede ao navegador para não apagar os dados da Vila quando faltar espaço (melhor esforço; pode ser recusado). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    return (await navigator.storage.persisted?.()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

/** Só para os testes. */
export function resetBackupClock(): void {
  lastBackup = 0;
}
