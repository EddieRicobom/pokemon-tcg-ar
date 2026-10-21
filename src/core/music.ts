export interface MusicEntry { path: string; gain: number }
export interface MusicSettings { enabled: boolean; volume: number; effectsVolume: number }

export function normalizeMusicSettings(raw: unknown): MusicSettings {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const volume = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : fallback;
  return { enabled: data.enabled !== false, volume: volume(data.volume, 35), effectsVolume: volume(data.effectsVolume, 70) };
}

export const VILLAGE_TRACKS = [
  ['new-bark', 'New Bark Town'], ['cherrygrove', 'Cherrygrove City'],
  ['goldenrod', 'Goldenrod City'], ['viridian', 'Viridian City'],
  ['cianwood', 'Cianwood City'], ['hearthome', 'Hearthome City'],
  ['heahea-night', 'Heahea City · noite'], ['oreburgh-night', 'Oreburgh City · noite'],
  ['canalave', 'Canalave City'], ['hearthome-night', 'Hearthome City · noite'],
  ['azalea-winter', 'Azalea Town · inverno'], ['humilau-night', 'Humilau City · noite'],
] as const;

/** Hora local e clima real da Vila; sem consumir o RNG dos moradores ou recompensas. */
export function villageMusicTrack(hour: number, weather: string | null, slot: number): typeof VILLAGE_TRACKS[number] {
  const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12;
  const pair = weather === 'neve' ? 5 : weather === 'chuva' ? 4 : h < 5 || h >= 20 ? 3 : h < 9 ? 0 : h < 17 ? 1 : 2;
  const variant = Number.isFinite(slot) ? Math.abs(Math.floor(slot)) % 2 : 0;
  return VILLAGE_TRACKS[pair * 2 + variant]!;
}

export interface MusicTransition { from: string; to: string; startedAt: number }
export const MUSIC_FADE_MS = 12_000;

/** Uma troca em andamento termina antes da próxima, mantendo no máximo duas trilhas. */
export function advanceMusicTransition(previous: MusicTransition | null, desired: string, now: number): MusicTransition {
  if (!previous) return { from: desired, to: desired, startedAt: now };
  if (previous.to === desired || now - previous.startedAt < MUSIC_FADE_MS) return previous;
  return { from: previous.to, to: desired, startedAt: now };
}

export function transitionMusicMix(state: MusicTransition, now: number): MusicEntry[] {
  if (state.from === state.to) return [{ path: state.to, gain: 1 }];
  const t = Math.max(0, Math.min(1, (now - state.startedAt) / MUSIC_FADE_MS));
  if (t === 1) return [{ path: state.to, gain: 1 }];
  return [{ path: state.from, gain: Math.cos(t * Math.PI / 2) }, { path: state.to, gain: Math.sin(t * Math.PI / 2) }];
}
