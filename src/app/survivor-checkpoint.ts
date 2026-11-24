/**
 * Checkpoint da Torre: guarda a build, o tempo e o progresso da corrida para continuar depois.
 * Entidades do mapa (inimigos, projéteis, orbes) não entram: ao voltar, a onda recomeça do tempo salvo.
 */

export interface SurvivorCheckpointOptions {
  dexId: number;
  name: string;
  picked?: string;
  infinite: boolean;
  bonk: boolean;
  companion: unknown;
  preparation: string;
  supportCandidates: unknown[];
  typeAffinityChoices: string[];
  fast: boolean;
  shiny: boolean;
  accessory: string | null;
  mega: unknown;
  swapped: boolean;
  omegaCategory?: string;
}

export interface SurvivorCheckpoint {
  version: 1;
  at: number;
  label: string;
  options: SurvivorCheckpointOptions;
  state: Record<string, unknown>;
}

const KEY = 'tcg-ar-survivor-checkpoint-v1';

export function writeSurvivorCheckpoint(checkpoint: SurvivorCheckpoint): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(checkpoint));
    return true;
  } catch {
    return false;
  }
}

export function readSurvivorCheckpoint(): SurvivorCheckpoint | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SurvivorCheckpoint> | null;
    if (!raw || raw.version !== 1) return null;
    const options = raw.options;
    if (!options || !Number.isInteger(options.dexId) || typeof options.name !== 'string') return null;
    if (!raw.state || typeof raw.state !== 'object') return null;
    return {
      version: 1,
      at: Number(raw.at) || 0,
      label: typeof raw.label === 'string' ? raw.label.slice(0, 80) : 'Corrida salva',
      options: {
        dexId: options.dexId,
        name: options.name.slice(0, 24),
        picked: typeof options.picked === 'string' ? options.picked : undefined,
        infinite: options.infinite === true,
        bonk: options.bonk === true,
        companion: options.companion ?? null,
        preparation: typeof options.preparation === 'string' ? options.preparation : 'classica',
        supportCandidates: Array.isArray(options.supportCandidates) ? options.supportCandidates : [],
        typeAffinityChoices: Array.isArray(options.typeAffinityChoices) ? options.typeAffinityChoices.filter((t): t is string => typeof t === 'string') : [],
        fast: options.fast === true,
        shiny: options.shiny === true,
        accessory: typeof options.accessory === 'string' ? options.accessory : null,
        mega: options.mega ?? null,
        swapped: options.swapped === true,
        omegaCategory: typeof options.omegaCategory === 'string' ? options.omegaCategory : undefined,
      },
      state: raw.state as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export function clearSurvivorCheckpoint(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada a limpar.
  }
}
