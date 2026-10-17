import type { VillageState } from './life';

export interface SummaryResident { id: string; name: string }
export interface VillageSummary { happened: string[]; changed: string[]; possible: string[] }

/** Resumo curto feito apenas com acontecimentos e pedidos já persistidos. */
export function villageSummary(state: VillageState, residents: readonly SummaryResident[], now: number): VillageSummary {
  const names = new Map(residents.map((r) => [r.id, r.name]));
  const recent = [...state.diary].reverse().slice(0, 3);
  const happened = recent.map((moment) => `${moment.emoji} ${moment.title} · ${moment.cast.map((c) => names.get(c.id) ?? c.name).join(', ')}`);
  const changed = recent.flatMap((moment) => moment.result.map((result) => `${moment.title}: ${result}`)).slice(0, 4);
  if (changed.length === 0) changed.push('Ainda não houve uma mudança social registrada.');
  const possible = state.requests.items.filter((request) => !request.done).map((request) => `${request.title}: ${request.detail}`).slice(0, 3);
  if (possible.length === 0) {
    const unread = state.diary.filter((moment) => moment.t > state.diaryRead && moment.t <= now).length;
    possible.push(unread > 0 ? `${unread} novidade(s) esperam no Diário.` : 'Nenhum pedido ou pista pendente por enquanto.');
  }
  return { happened, changed, possible };
}
