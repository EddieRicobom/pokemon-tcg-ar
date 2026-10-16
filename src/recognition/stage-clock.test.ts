import { describe, expect, it } from 'vitest';
import { ScanCancelled, StageClock } from './stage-clock';

function fakeNow() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('relógio das etapas do scan', () => {
  it('soma o tempo de cada etapa (várias passadas da mesma etapa somam)', async () => {
    const clock = fakeNow();
    const c = new StageClock({ now: clock.now });
    c.time('detect', () => clock.advance(12));
    await c.timeAsync('ocrNumber', async () => clock.advance(800));
    await c.timeAsync('ocrNumber', async () => clock.advance(700));
    expect(c.times).toEqual({ detect: 12, ocrNumber: 1500 });
  });

  it('avisa o início de cada etapa, na ordem real', async () => {
    const seen: string[] = [];
    const c = new StageClock({ onStage: (s) => seen.push(s) });
    c.time('detect', () => 0);
    c.time('perspective', () => 0);
    await c.timeAsync('ocrNumber', async () => 0);
    expect(seen).toEqual(['detect', 'perspective', 'ocrNumber']);
  });

  it('etapa pulada fica com o motivo, sem tempo; se rodar depois, o motivo some', () => {
    const c = new StageClock();
    c.skip('ocrName', 'o número já identifica a carta');
    expect(c.skipped.ocrName).toBe('o número já identifica a carta');
    expect(c.times.ocrName).toBeUndefined();
    c.add('ocrName', 5);
    expect(c.skipped.ocrName).toBeUndefined();
  });

  it('não marca como pulada uma etapa que já rodou', () => {
    const c = new StageClock();
    c.add('visual', 3);
    c.skip('visual', 'x');
    expect(c.skipped.visual).toBeUndefined();
  });

  it('leitura obsoleta não começa a próxima etapa', async () => {
    let current = true;
    const c = new StageClock({ isCurrent: () => current });
    c.time('detect', () => 0);
    current = false;
    expect(() => c.time('perspective', () => 0)).toThrow(ScanCancelled);
    await expect(c.timeAsync('ocrNumber', async () => 0)).rejects.toBeInstanceOf(ScanCancelled);
  });

  it('mede mesmo quando a etapa falha', () => {
    const clock = fakeNow();
    const c = new StageClock({ now: clock.now });
    expect(() => c.time('catalog', () => {
      clock.advance(4);
      throw new Error('falhou');
    })).toThrow('falhou');
    expect(c.times.catalog).toBe(4);
  });
});
