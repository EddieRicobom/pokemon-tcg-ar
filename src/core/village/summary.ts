import type { VillageState } from './life';

export interface SummaryResident { id: string; name: string }
export interface SummaryEntry {
  text: string;
  momentId?: string;
  pokemonId?: string;
  requestId?: string;
}
export interface VillageSummary { happened: SummaryEntry[]; changed: SummaryEntry[]; possible: SummaryEntry[] }

/** Resumo curto feito apenas com acontecimentos e pedidos já persistidos. */
export function villageSummary(state: VillageState, residents: readonly SummaryResident[], now: number): VillageSummary {
  const names = new Map(residents.map((r) => [r.id, r.name]));
  const recent = [...state.diary].reverse().slice(0, 3);
  const happened: SummaryEntry[] = recent.map((moment) => ({
    text: `${moment.emoji} ${moment.title} · ${moment.cast.map((c) => names.get(c.id) ?? c.name).join(', ')}`,
    momentId: moment.id,
    pokemonId: moment.cast[0]?.id,
  }));
  const changed: SummaryEntry[] = recent.flatMap((moment) => moment.result.map((result) => ({
    text: `${moment.title}: ${result}`,
    momentId: moment.id,
    pokemonId: moment.cast[0]?.id,
  }))).slice(0, 4);
  if (changed.length === 0) changed.push({ text: 'Ainda não houve uma mudança social registrada.' });
  const possible: SummaryEntry[] = [...(state.requests.story ?? []), ...state.requests.items].filter((request) => !request.done).map((request) => ({
    text: `${request.title}: ${request.detail}`,
    requestId: request.id,
    pokemonId: request.targetId,
  })).slice(0, 3);
  if (possible.length === 0) {
    const unread = state.diary.filter((moment) => moment.t > state.diaryRead && moment.t <= now).length;
    possible.push({ text: unread > 0 ? `${unread} novidade(s) esperam no Diário.` : 'Nenhum pedido ou pista pendente por enquanto.' });
  }
  return { happened, changed, possible };
}
