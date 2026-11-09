/** Equipe própria da Arena: regras puras de leitura e da migração a partir da equipe da Caixa/Vila. */

import { ARENA_TEAM } from './arena-menu';

/** Tem que começar com `tcg-ar-` para entrar no backup. */
export const ARENA_TEAM_KEY = 'tcg-ar-arena-team-v1';

/**
 * Lê o que está gravado. `null` significa «não há equipe da Arena confiável» (nunca gravada ou corrompida) e dispara a
 * migração; lista vazia é uma escolha válida: a equipe automática.
 */
export function parseArenaTeam(raw: string | null): string[] | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const ids = [...new Set(parsed.filter((id): id is string => typeof id === 'string'))].slice(0, ARENA_TEAM);
  return ids.length === 0 && parsed.length > 0 ? null : ids;
}

export interface ArenaTeamSeed {
  ids: string[];
  /** `false`: a equipe da Caixa existe, mas nenhum Pokémon dela está neste aparelho agora. Não grava e tenta de novo depois. */
  settled: boolean;
}

/** A primeira equipe da Arena: os primeiros válidos da equipe da Caixa, sem mexer nela. */
export function seedArenaTeam(saved: readonly string[], known: ReadonlySet<string>): ArenaTeamSeed {
  const ids = [...new Set(saved)].filter((id) => known.has(id)).slice(0, ARENA_TEAM);
  return { ids, settled: saved.length === 0 || ids.length > 0 };
}
