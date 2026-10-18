export const BOND_ARRIVAL_MS = 4400;
const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const ease = (v: number): number => { const t = clamp(v); return t * t * (3 - 2 * t); };

/** Uma chegada em quatro tempos: selo, coluna, revelação e pouso. Sem lampejos repetidos. */
export function bondArrivalAt(elapsedMs: number): { portal: number; reveal: number; scale: number; lift: number; burst: number; done: boolean } {
  const t = Math.max(0, elapsedMs);
  const reveal = ease((t - 950) / 1600);
  const portal = ease(t / 600) * (1 - ease((t - 3100) / 1300));
  const lift = Math.sin(Math.PI * ease((t - 1200) / 2200)) * 0.24;
  const burst = Math.sin(Math.PI * clamp((t - 1900) / 1800));
  return { portal, reveal, scale: 0.03 + 0.97 * reveal, lift, burst, done: t >= BOND_ARRIVAL_MS };
}
