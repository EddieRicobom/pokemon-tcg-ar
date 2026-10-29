import { describe, expect, it } from 'vitest';
import { combatMotion } from './combat-motion';

describe('ciclo visual de combate', () => {
  it('passa por preparação, impacto, descarrego e retorno antes do repouso', () => {
    expect(combatMotion(0).phase).toBe('windup');
    expect(combatMotion(100).phase).toBe('impact');
    expect(combatMotion(180).phase).toBe('follow-through');
    expect(combatMotion(320).phase).toBe('settle');
    expect(combatMotion(430).phase).toBe('idle');
  });

  it('comprime na preparação e dá peso no impacto', () => {
    expect(combatMotion(60).lunge).toBeLessThan(0);
    expect(combatMotion(100).scaleX).toBeGreaterThan(1);
    expect(combatMotion(100).scaleY).toBeLessThan(1);
  });
});
