import { afterEach, describe, expect, it, vi } from 'vitest';
import { hapticPattern, vibrate } from './haptics';
import type { HapticCue } from './haptics';

const CUES: HapticCue[] = [
  { kind: 'launch', power: 0.2 }, { kind: 'launch', power: 1 }, { kind: 'hit', strength: 0.5 }, { kind: 'hit', strength: 1 }, { kind: 'bumper' },
  { kind: 'reaction' }, { kind: 'out', mine: true }, { kind: 'out', mine: false }, { kind: 'shrink' }, { kind: 'win' }, { kind: 'lose' },
];

describe('vibração', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('todo padrão é uma lista curta de tempos positivos', () => {
    for (const cue of CUES) {
      const pattern = hapticPattern(cue)!;
      expect(pattern.length, JSON.stringify(cue)).toBeGreaterThan(0);
      expect(pattern.length).toBeLessThanOrEqual(6);
      for (const ms of pattern) expect(ms).toBeGreaterThan(0);
      expect(pattern.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(500);
    }
  });

  it('batida forte vibra mais que a fraca e a batida mínima nem vibra', () => {
    expect(hapticPattern({ kind: 'hit', strength: 1 })![0]).toBeGreaterThan(hapticPattern({ kind: 'hit', strength: 0.4 })![0]!);
    expect(hapticPattern({ kind: 'hit', strength: 0.1 })).toBeNull();
    expect(hapticPattern({ kind: 'launch', power: 1 })![0]).toBeGreaterThan(hapticPattern({ kind: 'launch', power: 0.1 })![0]!);
  });

  it('cair é mais marcante quando o pin é seu', () => {
    const sum = (mine: boolean) => hapticPattern({ kind: 'out', mine })!.reduce((a, b) => a + b, 0);
    expect(sum(true)).toBeGreaterThan(sum(false));
  });

  it('chama o navegador só quando ligada e com suporte', () => {
    const spy = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate: spy });
    expect(vibrate({ kind: 'bumper' })).toBe(true);
    expect(spy).toHaveBeenCalledWith([12]);
    expect(vibrate({ kind: 'bumper' }, false)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(vibrate({ kind: 'hit', strength: 0.05 })).toBe(false);
    vi.stubGlobal('navigator', {});
    expect(vibrate({ kind: 'bumper' })).toBe(false);
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('bloqueado'); } });
    expect(vibrate({ kind: 'bumper' })).toBe(false);
  });
});
