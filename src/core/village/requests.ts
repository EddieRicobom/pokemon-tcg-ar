import { add, count, friendOf, itemName, pay } from './life';
import type { ItemId, VillageState } from './life';

export type VillageRequestKind = 'collect' | 'talk' | 'deliver';

export interface VillageRequest {
  id: string;
  day: string;
  kind: VillageRequestKind;
  title: string;
  detail: string;
  location: string;
  item?: ItemId;
  qty?: number;
  targetId?: string;
  targetName?: string;
  rewardCoins: number;
  rewardItem: ItemId;
  rewardQty: number;
  rewardFriend: number;
  done: boolean;
}

export interface RequestClaim { ok: boolean; message: string; coins: number; targetId?: string }

const MATERIAL_POOL: readonly { item: ItemId; place: string }[] = [
  { item: 'madeira', place: 'Bosque do Sul' }, { item: 'pedra', place: 'Pedreira' },
  { item: 'flor', place: 'Parque' }, { item: 'oran', place: 'Mata perto do lago' },
  { item: 'peixe', place: 'Lago' }, { item: 'concha', place: 'Praia do lago' },
  { item: 'mel', place: 'Bosque' }, { item: 'champignon', place: 'Bosque úmido' },
];

const hash = (text: string): number => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
const pick = <T,>(list: readonly T[], seed: number, offset: number): T => list[(seed + offset) % list.length]!;

function common(state: VillageState, day: string, index: number, title: string, detail: string, location: string, item: ItemId, qty: number, kind: VillageRequestKind, targetId?: string, targetName?: string): VillageRequest {
  const seed = hash(`${state.seed}:${day}:${index}:${item}`);
  const rewardItem = pick(['flor', 'oran', 'pecha', 'tecido', 'cristal'] as const, seed, 3);
  return { id: `${day}:${index}`, day, kind, title, detail, location, item, qty, ...(targetId ? { targetId } : {}), ...(targetName ? { targetName } : {}), rewardCoins: 12 + (seed % 4) * 4, rewardItem, rewardQty: 1 + (seed % 2), rewardFriend: kind === 'talk' || kind === 'deliver' ? 3 : 0, done: false };
}

export function makeRequests(state: VillageState, day: string, residents: readonly { id: string; name: string }[]): VillageRequest[] {
  const seed = hash(`${state.seed}:${day}`);
  const first = pick(MATERIAL_POOL, seed, 0);
  const second = pick(MATERIAL_POOL.filter((x) => x.item !== first.item), seed, 2);
  const target = residents.length > 0 ? residents[seed % residents.length]! : null;
  return [
    common(state, day, 0, `Buscar ${itemName(first.item)}`, `Traga ${itemName(first.item).toLowerCase()} para o mural.`, first.place, first.item, first.item === 'peixe' ? 1 : 2, 'collect'),
    common(state, day, 1, `Entrega no ${target ? 'bairro' : 'mural'}`, target ? `${target.name} precisa de ${itemName(second.item).toLowerCase()}.` : `Separe ${itemName(second.item).toLowerCase()} para a feira.`, target ? `Casa de ${target.name}` : 'Praça', second.item, 1 + (seed % 2), target ? 'deliver' : 'collect', target?.id, target?.name),
    target ? common(state, day, 2, `Visitar ${target.name}`, `Converse com ${target.name} e descubra como está o dia.`, `Casa de ${target.name}`, second.item, 1, 'talk', target.id, target.name) : common(state, day, 2, 'Ajudar na praça', 'Traga uma fruta para a cesta comunitária.', 'Praça da Fonte', 'oran', 1, 'collect'),
  ];
}

export function normalizeRequests(raw: unknown): { day: string; items: VillageRequest[] } {
  if (!raw || typeof raw !== 'object') return { day: '', items: [] };
  const r = raw as { day?: unknown; items?: unknown };
  const items = Array.isArray(r.items) ? r.items.filter((x): x is VillageRequest => !!x && typeof x === 'object' && typeof (x as VillageRequest).id === 'string' && typeof (x as VillageRequest).title === 'string' && typeof (x as VillageRequest).kind === 'string').slice(0, 3) : [];
  return { day: typeof r.day === 'string' ? r.day.slice(0, 12) : '', items };
}

export function ensureRequests(state: VillageState, day: string, residents: readonly { id: string; name: string }[]): VillageRequest[] {
  if (state.requests.day !== day || state.requests.items.length !== 3) state.requests = { day, items: makeRequests(state, day, residents) };
  return state.requests.items;
}

export function requestStatus(state: VillageState, request: VillageRequest, day: string): { ready: boolean; text: string } {
  if (request.done) return { ready: false, text: 'Concluído hoje' };
  if (request.day !== day) return { ready: false, text: 'Atualizando amanhã' };
  if (request.kind === 'talk') {
    const target = request.targetId ? friendOf(state, request.targetId) : null;
    return target?.lastTalk === day ? { ready: true, text: 'Pronto para receber' } : { ready: false, text: `Converse com ${request.targetName ?? 'o Pokémon'}` };
  }
  const have = count(state, request.item ?? '');
  const need = request.qty ?? 1;
  return have >= need ? { ready: true, text: 'Pronto para entregar' } : { ready: false, text: `${have}/${need} ${itemName(request.item ?? '')}` };
}

export function claimRequest(state: VillageState, requestId: string, day: string): RequestClaim {
  const request = state.requests.items.find((r) => r.id === requestId);
  if (!request) return { ok: false, message: 'Esse pedido já saiu do mural.', coins: 0 };
  const status = requestStatus(state, request, day);
  if (!status.ready) return { ok: false, message: status.text, coins: 0 };
  if (request.kind !== 'talk') pay(state, { [request.item ?? '']: request.qty ?? 1 });
  add(state, request.rewardItem, request.rewardQty);
  if (request.targetId && request.rewardFriend > 0) friendOf(state, request.targetId).points = Math.min(100, friendOf(state, request.targetId).points + request.rewardFriend);
  request.done = true;
  return { ok: true, message: `Pedido concluído! +${request.rewardCoins} moedas e ${request.rewardQty} ${itemName(request.rewardItem)}.${request.targetId ? ` ${request.targetName} ficou contente.` : ''}`, coins: request.rewardCoins, ...(request.targetId ? { targetId: request.targetId } : {}) };
}
