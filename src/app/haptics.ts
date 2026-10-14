/**
 * Vibração do Pin Mode. Só o padrão (lista de ms vibra/pausa) é conta; `vibrate` chama o navegador e some em silêncio
 * onde não há suporte (iPhone, computador) ou a vibração está bloqueada.
 */

export type HapticCue =
  | { kind: 'launch'; power: number }
  | { kind: 'hit'; strength: number }
  | { kind: 'bumper' }
  | { kind: 'reaction' }
  | { kind: 'out'; mine: boolean }
  | { kind: 'shrink' }
  | { kind: 'win' }
  | { kind: 'lose' };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Padrão de vibração de um sinal, ou null quando não vale a pena vibrar (batida fraca demais). */
export function hapticPattern(cue: HapticCue): number[] | null {
  switch (cue.kind) {
    case 'launch':
      return [Math.round(6 + 14 * clamp(cue.power, 0, 1))];
    case 'hit':
      return cue.strength < 0.3 ? null : [Math.round(10 + 30 * clamp(cue.strength, 0, 1))];
    case 'bumper':
      return [12];
    case 'reaction':
      return [25, 30, 25];
    case 'out':
      return cue.mine ? [70, 40, 90] : [30, 40, 30];
    case 'shrink':
      return [120, 60, 120];
    case 'win':
      return [40, 50, 40, 50, 120];
    case 'lose':
      return [200, 80, 120];
  }
}

export function vibrate(cue: HapticCue, enabled = true): boolean {
  if (!enabled) return false;
  const pattern = hapticPattern(cue);
  if (!pattern) return false;
  try {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? navigator.vibrate(pattern) : false;
  } catch {
    return false;
  }
}
