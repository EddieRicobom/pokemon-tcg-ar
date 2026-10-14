/** A equipe da Caixa: até 6 cartas escolhidas entre as guardadas. Lógica pura + persistência em localStorage. */

export const TEAM_SIZE = 6;
const TEAM_KEY = 'tcg-ar-team-v1';

export interface TeamCandidate {
  id: string;
  lastSeenAt: number;
  sprite: { state: string };
}

/** Liga/desliga uma carta na equipe, respeitando o limite. `full` = tentou entrar com a equipe cheia (nada muda). */
export function toggleMember(team: readonly string[], id: string, max: number = TEAM_SIZE): { team: string[]; full: boolean } {
  if (team.includes(id)) return { team: team.filter((member) => member !== id), full: false };
  if (team.length >= max) return { team: [...team], full: true };
  return { team: [...team, id], full: false };
}

/** Só ids de cartas que ainda existem e têm sprite, sem repetir, até o limite. */
export function sanitizeTeam(ids: unknown, cards: readonly TeamCandidate[], max: number = TEAM_SIZE): string[] {
  if (!Array.isArray(ids)) return [];
  const usable = new Set(cards.filter((card) => card.sprite.state === 'ok').map((card) => card.id));
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && usable.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Equipe que vale agora: a escolhida pelo usuário (limpa de cartas removidas) ou, se não há escolha,
 * as `max` cartas mais recentes que têm sprite. `auto` diz qual dos casos é.
 */
export function resolveTeam(saved: unknown, cards: readonly TeamCandidate[], max: number = TEAM_SIZE): { ids: string[]; auto: boolean } {
  const chosen = sanitizeTeam(saved, cards, max);
  if (chosen.length > 0) return { ids: chosen, auto: false };
  const recent = [...cards]
    .filter((card) => card.sprite.state === 'ok')
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, max)
    .map((card) => card.id);
  return { ids: recent, auto: true };
}

export function loadSavedTeam(): string[] {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(0, TEAM_SIZE) : [];
  } catch {
    return [];
  }
}

export function saveTeam(ids: readonly string[]): void {
  try {
    localStorage.setItem(TEAM_KEY, JSON.stringify(ids.slice(0, TEAM_SIZE)));
  } catch {
    // Sem armazenamento local: a equipe vale só até fechar o app.
  }
}
