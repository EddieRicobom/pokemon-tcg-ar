import { itemDef } from './catalog';
import { availableCount, canAfford, describeCost, FISH_PER_DAY, HOUSE_LEVELS, itemName, needsWater, TALK_COINS, TALK_FRIENDSHIP } from './life';
import type { VillageState } from './life';
import { BOARD_BONUS_COINS, requestStatus } from './requests';

/** Para onde o botão "Ir até lá" leva. */
export type NextStepAction =
  | { kind: 'point'; x: number; y: number; place: string }
  | { kind: 'resident'; id: string }
  | { kind: 'mail' }
  | { kind: 'build' }
  | { kind: 'starter' }
  | { kind: 'none' };

export interface NextStep {
  icon: string;
  title: string;
  detail: string;
  action: NextStepAction;
}

export interface NextStepContext {
  state: VillageState;
  day: string;
  residents: readonly { id: string; name: string }[];
  mailUnread: number;
  board: { x: number; y: number } | null;
  fishing: { x: number; y: number } | null;
}

/** Um marcador do dia ("Conversas 2/5"), para ver quanto do dia já foi feito. */
export interface DailyMark {
  icon: string;
  label: string;
  done: number;
  total: number;
}

const point = (at: { x: number; y: number }, place: string): NextStepAction => ({ kind: 'point', x: at.x, y: at.y, place });

/**
 * A próxima coisa que vale a pena fazer, com o que ela rende, sempre a partir do estado real da Vila. A ordem põe na
 * frente o que se perde se esperar (planta com sede, entrega pronta) e deixa o que é passeio para o fim.
 */
export function nextVillageStep({ state, day, residents, mailUnread, board, fishing }: NextStepContext): NextStep {
  if (residents.length === 0) {
    return state.digital.starterGiven
      ? { icon: '🃏', title: 'Traga um morador para a Vila', detail: 'Escaneie uma carta e coloque o Pokémon na equipe: ele passa a morar aqui.', action: { kind: 'none' } }
      : { icon: '🎁', title: 'Receba seu primeiro companheiro', detail: 'Responda a seis perguntas e um Digital Pokémon vem morar na Vila.', action: { kind: 'starter' } };
  }
  const ready = state.crops.find((crop) => {
    const grows = itemDef(crop.seed)?.grows;
    return !!grows && crop.stage >= grows.stages;
  });
  if (ready) return { icon: '🧺', title: `Colha: ${itemName(itemDef(ready.seed)?.grows?.crop ?? ready.seed)}`, detail: 'A sua plantação está pronta. Fique de frente para ela e use o A.', action: point(ready, 'sua plantação') };
  const thirsty = state.crops.find(needsWater);
  if (thirsty) return { icon: '💧', title: 'Sua plantação está com sede', detail: 'Sem água ela não cresce. Fique de frente para ela e use o A.', action: point(thirsty, 'sua plantação') };

  for (const resident of residents) {
    const request = state.friends[resident.id]?.request;
    if (request && request.day === day && !request.done && availableCount(state, request.item) >= request.qty) {
      return { icon: '🎁', title: `Entregue ${request.qty} ${itemName(request.item)} a ${resident.name}`, detail: 'Atender ao pedido do dia vale +15 de amizade e um presentinho. Em Presentear, ele aparece em primeiro.', action: { kind: 'resident', id: resident.id } };
    }
  }
  const today = state.requests.day === day ? state.requests.items : [];
  const claimable = [...(state.requests.story ?? []), ...today].find((request) => !request.done && requestStatus(state, request, day).ready);
  if (claimable && board) {
    const left = today.filter((request) => !request.done).length;
    return { icon: '📌', title: `Conclua no mural: ${claimable.title}`, detail: `Rende +${claimable.rewardCoins} moedas.${left > 0 ? ` Fechando os três de hoje, +${BOARD_BONUS_COINS} moedas de bônus.` : ''}`, action: point(board, 'Mural de pedidos') };
  }
  const unspoken = residents.filter((resident) => state.friends[resident.id]?.lastTalk !== day);
  const first = unspoken[0];
  if (first) {
    return { icon: '💬', title: `Converse com ${first.name}`, detail: `A primeira conversa do dia vale +${TALK_FRIENDSHIP} de amizade e ${TALK_COINS} moedas.${unspoken.length > 1 ? ` Ainda faltam ${unspoken.length} moradores hoje.` : ''}`, action: { kind: 'resident', id: first.id } };
  }
  if (state.requests.day !== day && board) return { icon: '📌', title: 'Veja os pedidos de hoje no mural', detail: 'Três pedidos novos por dia, com moedas e materiais.', action: point(board, 'Mural de pedidos') };
  const next = HOUSE_LEVELS[state.house + 1];
  if (next && canAfford(state, next.cost)) return { icon: '🏠', title: `Construa: ${next.name}`, detail: 'Você já tem todo o material.', action: { kind: 'build' } };
  if (mailUnread > 0) return { icon: '📬', title: mailUnread === 1 ? 'Há uma carta nova' : `Há ${mailUnread} cartas novas`, detail: 'Os moradores escrevem sobre o que viveram.', action: { kind: 'mail' } };
  if (fishing && (state.fishing.day !== day || state.fishing.casts < FISH_PER_DAY)) {
    const left = state.fishing.day === day ? FISH_PER_DAY - state.fishing.casts : FISH_PER_DAY;
    return { icon: '🎣', title: 'Vá pescar', detail: `Ainda há ${left} lançamento(s) hoje: peixes vendem bem e viram comida.`, action: point(fishing, 'Pescaria') };
  }
  if (next) return { icon: '🪵', title: `Junte material para: ${next.name}`, detail: describeCost(state, next.cost), action: { kind: 'none' } };
  return { icon: '🌙', title: 'O dia na Vila está completo', detail: 'Amanhã tem pedidos, peixes e conversas novas. Até lá, passeie ou decore.', action: { kind: 'none' } };
}

/** Marcadores do dia; o mural só conta depois de aberto, porque os pedidos nascem nessa hora. */
export function dailyMarks({ state, day, residents }: Pick<NextStepContext, 'state' | 'day' | 'residents'>): DailyMark[] {
  const marks: DailyMark[] = [];
  if (residents.length > 0) marks.push({ icon: '💬', label: 'Conversas', done: residents.filter((resident) => state.friends[resident.id]?.lastTalk === day).length, total: residents.length });
  marks.push({ icon: '📌', label: 'Mural', done: state.requests.day === day ? state.requests.items.filter((request) => request.done).length : 0, total: 3 });
  marks.push({ icon: '🎣', label: 'Pesca', done: state.fishing.day === day ? state.fishing.casts : 0, total: FISH_PER_DAY });
  return marks;
}
