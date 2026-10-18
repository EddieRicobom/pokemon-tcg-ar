import { pinFromSpec, MAX_PER_SIDE } from './pins';
import type { Difficulty, PinSpec } from './pins';
import type { Rng } from './battle';

/** Força relativa da física dos Pins; não é um atributo oficial do Pokémon. */
export function pinStrength(spec: PinSpec): number {
  const pin = pinFromSpec(spec, 1);
  return pin.mass * pin.punch * pin.shot;
}

/** Sorteia sem repetir. No difícil busca quantidade e força total próximas à equipe. */
export function randomOpponents(mine: readonly PinSpec[], pool: readonly PinSpec[], difficulty: Difficulty, rng: Rng): PinSpec[] {
  if (!mine.length || !pool.length) return [];
  const shuffled = [...new Map(pool.map((p) => [p.id, p])).values()];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const max = Math.min(MAX_PER_SIDE[1], shuffled.length);
  if (difficulty !== 'dificil') return shuffled.slice(0, Math.min(max, mine.length));
  const target = mine.reduce((sum, p) => sum + pinStrength(p), 0);
  const chosen: PinSpec[] = [];
  let total = 0;
  while (chosen.length < max && shuffled.length) {
    const score = (power: number, count: number) => Math.abs(power - target) / target + 0.15 * Math.abs(count - mine.length) / mine.length;
    let best = 0;
    for (let i = 1; i < shuffled.length; i++) {
      if (score(total + pinStrength(shuffled[i]!), chosen.length + 1) < score(total + pinStrength(shuffled[best]!), chosen.length + 1)) best = i;
    }
    const next = shuffled[best]!;
    if (chosen.length && score(total + pinStrength(next), chosen.length + 1) >= score(total, chosen.length)) break;
    chosen.push(next);
    total += pinStrength(next);
    shuffled.splice(best, 1);
  }
  return chosen;
}
