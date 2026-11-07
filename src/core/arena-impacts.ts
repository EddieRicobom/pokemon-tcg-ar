/**
 * Impactos da luta da Arena, estilo anime: o golpe que acerta solta linhas de velocidade e um clarão; o choque de dois
 * golpes no ar faz uma estrela das duas cores, uma onda e um clarão rápido na tela inteira; os golpes fortes sacodem a
 * câmera. Só desenho: a luta não muda. A arte fica em `village/arena-impact-art.ts`; aqui, a vida de cada efeito.
 */

export type ArenaImpactKind = 'hit' | 'super' | 'clash';

export interface ArenaImpact {
  kind: ArenaImpactKind;
  /** No campo (unidades da arena). */
  x: number;
  y: number;
  colors: [string, string];
  ageMs: number;
  lifeMs: number;
  /** Semente do traçado das linhas, para cada impacto ter o seu desenho. */
  seed: number;
}

export const ARENA_IMPACT_LIFE: Record<ArenaImpactKind, number> = { hit: 260, super: 380, clash: 520 };
/** Teto de impactos ao mesmo tempo: uma rajada não enche a tela nem pesa no celular. */
export const MAX_ARENA_IMPACTS = 14;

export function addImpact(list: ArenaImpact[], kind: ArenaImpactKind, x: number, y: number, colors: [string, string], seed: number): ArenaImpact[] {
  const next = [...list, { kind, x, y, colors, ageMs: 0, lifeMs: ARENA_IMPACT_LIFE[kind], seed }];
  return next.length > MAX_ARENA_IMPACTS ? next.slice(next.length - MAX_ARENA_IMPACTS) : next;
}

export function stepImpacts(list: ArenaImpact[], dtMs: number): ArenaImpact[] {
  return list.map((impact) => ({ ...impact, ageMs: impact.ageMs + Math.max(0, dtMs) })).filter((impact) => impact.ageMs < impact.lifeMs);
}

/** Força do tremor de tela de cada impacto (em pixels de tela) no começo dele. */
const SHAKE: Record<ArenaImpactKind, number> = { hit: 0, super: 3, clash: 5 };

/** Tremor da câmera agora: o maior entre os impactos vivos, sumindo rápido. Sem tremor com o movimento reduzido. */
export function shakeOffset(list: readonly ArenaImpact[], timeMs: number, reduced: boolean): { x: number; y: number } {
  if (reduced) return { x: 0, y: 0 };
  let strength = 0;
  for (const impact of list) {
    const left = 1 - impact.ageMs / impact.lifeMs;
    strength = Math.max(strength, SHAKE[impact.kind] * left * left);
  }
  return strength < 0.2 ? { x: 0, y: 0 } : { x: Math.sin(timeMs * 0.09) * strength, y: Math.cos(timeMs * 0.13) * strength * 0.6 };
}

/** Clarão de tela inteira (0 a 1): só o choque, e só no primeiro instante. */
export function screenFlash(list: readonly ArenaImpact[]): number {
  let flash = 0;
  for (const impact of list) if (impact.kind === 'clash') flash = Math.max(flash, 1 - impact.ageMs / 90);
  return Math.max(0, Math.min(1, flash)) * 0.35;
}
