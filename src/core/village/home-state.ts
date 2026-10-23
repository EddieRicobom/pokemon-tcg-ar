/** O bit 9 estende o nível sem deslocar os bits antigos de enfeites e telhado. */
export const homeLevel = (v: number): number => (v & 3) + ((v >> 9) & 1) * 4;
export const homeDecor = (v: number): number => (v >> 2) & 15;
export const homeRoof = (v: number): number => (v >> 6) & 7;
export function homeValue(level: number, decor: number, roof: number): number {
  const l = Math.max(0, Math.min(5, Math.floor(level)));
  return (l & 3) | ((decor & 15) << 2) | ((roof & 7) << 6) | ((l >> 2) << 9);
}
export function normalizeHomeValue(value: number): number {
  const v = Math.max(0, Math.min(1023, value));
  return homeValue(homeLevel(v), homeDecor(v), homeRoof(v));
}

export interface HomeProject {
  day: string;
  lastChangeDay: string;
  savings: number;
  completedActivities: number;
}
export type HomeProjects = Record<string, HomeProject>;
export function normalizeHomeProjects(raw: unknown): HomeProjects {
  if (!raw || typeof raw !== 'object') return {};
  const out: HomeProjects = {};
  for (const [lot, value] of Object.entries(raw).slice(0, 80)) {
    if (!/^\d{1,3}$/.test(lot) || !value || typeof value !== 'object') continue;
    const p = value as Partial<HomeProject>;
    const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? v : '';
    const amount = (v: unknown, cap: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(cap, Math.floor(v))) : 0;
    out[lot] = { day: date(p.day), lastChangeDay: date(p.lastChangeDay), savings: amount(p.savings, 5000), completedActivities: amount(p.completedActivities, 100000000) };
  }
  return out;
}
