import { describe, expect, it } from 'vitest';
import { releaseWhenDetached } from './context-release';

describe('liberação do contexto WebGL', () => {
  const run = (connectedAfter: boolean) => {
    let lost = 0;
    const canvas = { isConnected: true };
    let pending: (() => void) | null = null;
    releaseWhenDetached(canvas, () => lost++, (fn) => (pending = fn));
    // Ainda na página no momento do dispose: nada acontece na hora.
    expect(lost).toBe(0);
    canvas.isConnected = connectedAfter;
    (pending as (() => void) | null)?.();
    return lost;
  };

  it('canvas que saiu da página (Escanear recria o canvas a cada carta): libera o contexto', () => {
    expect(run(false)).toBe(1);
  });

  it('canvas reaproveitado (continua na página): NÃO perde o contexto', () => {
    expect(run(true)).toBe(0);
  });
});
