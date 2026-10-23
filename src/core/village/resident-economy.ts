import type { VillageState } from './life';
import type { Profession } from './professions';

export interface ResidentWallet { coins: number; earned: number; spent: number; day: string; paidToday: number; receipts: string[] }
export type ResidentEconomy = Record<string, ResidentWallet>;
export const RESIDENT_ECONOMY_RULES = { dailyWageCap: 80, walletCap: 5000, receiptLimit: 80, cafePrice: 12, cafeWage: 4 } as const;
export function walletOf(s: VillageState, id: string): ResidentWallet {
  return s.residentEconomy[id] ??= { coins: 0, earned: 0, spent: 0, day: '', paidToday: 0, receipts: [] };
}
export function normalizeResidentEconomy(raw: unknown): ResidentEconomy {
  if (!raw || typeof raw !== 'object') return {};
  const result: ResidentEconomy = {};
  for (const [id, value] of Object.entries(raw).slice(0, 200)) {
    if (!id || id.length > 128 || !value || typeof value !== 'object') continue;
    const w = value as Partial<ResidentWallet>;
    const n = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
    result[id] = { coins: n(w.coins, 5000), earned: n(w.earned, 100000000), spent: n(w.spent, 100000000), day: typeof w.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.day) ? w.day : '', paidToday: n(w.paidToday, 80), receipts: Array.isArray(w.receipts) ? [...new Set(w.receipts.filter((r): r is string => typeof r === 'string' && r.length <= 200))].slice(-80) : [] };
  }
  return result;
}

/** Chamado SOMENTE após uma tarefa terminar. Repetir uma entrega ou reabrir a tela não cria renda. */
export function payResidentWork(s: VillageState, id: string, role: Profession, receipt: string, day: string, amount = 8): number {
  if (!id || !receipt || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(amount) || amount <= 0) return 0;
  const wallet = walletOf(s, id), key = `${day}:${role}:${receipt}`;
  if (wallet.receipts.includes(key) || wallet.day > day) return 0;
  if (wallet.day !== day) { wallet.day = day; wallet.paidToday = 0; }
  const paid = Math.min(Math.floor(amount), RESIDENT_ECONOMY_RULES.dailyWageCap - wallet.paidToday, RESIDENT_ECONOMY_RULES.walletCap - wallet.coins);
  wallet.receipts.push(key); wallet.receipts = wallet.receipts.slice(-RESIDENT_ECONOMY_RULES.receiptLimit);
  wallet.coins += paid; wallet.earned += paid; wallet.paidToday += paid;
  return paid;
}
export function spendResidentCoins(s: VillageState, id: string, amount: number): boolean {
  if (!Number.isInteger(amount) || amount < 0 || (s.residentEconomy[id]?.coins ?? 0) < amount) return false;
  const wallet = walletOf(s, id); wallet.coins -= amount; wallet.spent += amount; return true;
}
export function householdFunds(s: VillageState, ids: readonly string[]): number {
  return [...new Set(ids)].reduce((sum, id) => sum + (s.residentEconomy[id]?.coins ?? 0), 0);
}
/** Uma compra pode ser dividida pelos moradores da mesma casa, sem crédito nem gasto parcial em caso de falta. */
export function spendHousehold(s: VillageState, ids: readonly string[], amount: number): boolean {
  if (!Number.isInteger(amount) || amount < 0 || householdFunds(s, ids) < amount) return false;
  let left = amount;
  for (const id of [...new Set(ids)].sort()) {
    const pay = Math.min(left, s.residentEconomy[id]?.coins ?? 0);
    if (pay) spendResidentCoins(s, id, pay);
    left -= pay; if (!left) break;
  }
  return true;
}
