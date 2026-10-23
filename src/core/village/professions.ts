import type { VillageActivity } from './vocations';

export const PROFESSIONS = [
  { id: 'farm', name: 'Agricultura', min: 3, icon: '🌱' },
  { id: 'fishing', name: 'Pescaria', min: 4, icon: '🎣' },
  { id: 'mine', name: 'Mineração', min: 5, icon: '⛏️' },
  { id: 'lumber', name: 'Madeireira', min: 5, icon: '🪓' },
  { id: 'mail', name: 'Carteiro', min: 6, icon: '✉️' },
  { id: 'cafe', name: 'Atendimento do Café', min: 8, icon: '☕' },
] as const;
export type Profession = typeof PROFESSIONS[number]['id'];
export function professionActive(role: Profession, residents: number): boolean {
  return Number.isFinite(residents) && residents >= PROFESSIONS.find((p) => p.id === role)!.min;
}
export function workActivityActive(activity: VillageActivity, residents: number): boolean {
  const roles: Partial<Record<VillageActivity, Profession>> = { agricultura: 'farm', pesca: 'fishing', mineracao: 'mine', madeireira: 'lumber', culinaria: 'cafe' };
  const role = roles[activity];
  return !role || professionActive(role, residents);
}

/** Preferências persistidas continuam guardadas enquanto o posto está suspenso. */
export function chooseServiceResidents(ids: readonly string[], carrier: string | null, waiter: string | null): { carrier: string | null; waiter: string | null } {
  const unique = [...new Set(ids)].sort();
  const mail = professionActive('mail', unique.length) ? (carrier && unique.includes(carrier) ? carrier : unique[0]!) : null;
  const candidates = unique.filter((id) => id !== mail);
  const cafe = professionActive('cafe', unique.length) ? (waiter && candidates.includes(waiter) ? waiter : candidates[1] ?? candidates[0]!) : null;
  return { carrier: mail, waiter: cafe };
}
