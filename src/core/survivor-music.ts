import { survivorRegionAt } from './survivor-regions';
import type { MusicEntry } from './music';

/** O terceiro campo distingue arranjo GBA de tratamento de uma gravação regional. */
export const SURVIVOR_TRACKS = [
  ['kanto', 'Líder de Ginásio · Kanto', true],
  ['johto', 'Campeão · Johto', true],
  ['hoenn', 'Frontier Brain · Hoenn', true],
  ['sinnoh', 'Cynthia · Sinnoh', true],
  ['unova', 'Treinador · Unova', true],
  ['kalos', 'Líder de Ginásio · Kalos (tratamento retrô)', false],
  ['alola', 'Elite dos Quatro · Alola (tratamento retrô)', false],
  ['galar', 'Líder de Ginásio · Galar (tratamento retrô)', false],
  ['paldea', 'Líder de Ginásio · Paldea (tratamento retrô)', false],
] as const;

/** Usa o mesmo relógio e a mesma curva do terreno: não depende da taxa de quadros nem do RNG. */
export function survivorMusicMix(elapsedMs: number, runSeed = 0): MusicEntry[] {
  const { current, next, blend } = survivorRegionAt(elapsedMs, runSeed);
  if (blend === 0) return [{ path: survivorMusicPath(current), gain: 1 }];
  // Curva de potência constante: evita um buraco de volume no meio da troca.
  return [{ path: survivorMusicPath(current), gain: Math.cos(blend * Math.PI / 2) }, { path: survivorMusicPath(next), gain: Math.sin(blend * Math.PI / 2) }];
}

export function survivorMusicPath(region: number): string {
  return `audio/survival/${SURVIVOR_TRACKS[region]?.[0] ?? 'kanto'}.mp3`;
}

export function survivorMusicTitle(elapsedMs: number, runSeed = 0): string { return SURVIVOR_TRACKS[survivorRegionAt(elapsedMs, runSeed).current]![1]; }

export interface SurvivorMusicSettings { enabled: boolean; volume: number }
export function normalizeSurvivorMusicSettings(raw: unknown): SurvivorMusicSettings {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    enabled: data.enabled !== false,
    volume: typeof data.volume === 'number' && Number.isFinite(data.volume) ? Math.max(0, Math.min(100, data.volume)) : 35,
  };
}
