import type { VillageState } from './life';
import type { SocialPlan } from './social-state';

export interface SummaryResident { id: string; name: string }
export interface SummaryEntry {
  text: string;
  momentId?: string;
  pokemonId?: string;
  requestId?: string;
  planId?: string;
}
export interface VillageSummary { happened: SummaryEntry[]; changed: SummaryEntry[]; possible: SummaryEntry[] }

const PLAN_TEXT: Record<SocialPlan['kind'], string> = {
  visitar: 'vai visitar',
  ajudar: 'prometeu ajudar',
  convidar: 'vai convidar',
};

function dayStamp(now: number): string {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function planEntry(plan: SocialPlan, names: ReadonlyMap<string, string>): SummaryEntry {
  const from = names.get(plan.from) ?? plan.from;
  const to = names.get(plan.to) ?? plan.to;
  const deadline = plan.expiresDay ? ` até ${plan.expiresDay.slice(8, 10)}/${plan.expiresDay.slice(5, 7)}` : '';
  return { text: `💬 ${from} ${PLAN_TEXT[plan.kind]} ${to}${deadline}.`, planId: plan.id, pokemonId: plan.from };
}

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
  const today = dayStamp(now);
  const plans = state.plans.filter((plan) => (!today || !plan.createdDay || plan.createdDay <= today) && (!today || !plan.expiresDay || plan.expiresDay >= today)).map((plan) => planEntry(plan, names));
  const requests: SummaryEntry[] = [...(state.requests.story ?? []), ...state.requests.items].filter((request) => !request.done).map((request) => ({
    text: `${request.title}: ${request.detail}`,
    requestId: request.id,
    pokemonId: request.targetId,
  }));
  const possible: SummaryEntry[] = [...plans, ...requests].slice(0, 3);
  if (possible.length === 0) {
    const unread = state.diary.filter((moment) => moment.t > state.diaryRead && moment.t <= now).length;
    possible.push({ text: unread > 0 ? `${unread} novidade(s) esperam no Diário.` : 'Nenhum pedido ou pista pendente por enquanto.' });
  }
  return { happened, changed, possible };
}
