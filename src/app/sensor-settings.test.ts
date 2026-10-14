import { describe, expect, it } from 'vitest';
import { normalizeSensor } from './sensor-settings';

describe('ajustes do giroscópio', () => {
  it('padrão: ligado, 70 ms', () => {
    expect(normalizeSensor(null)).toEqual({ gyro: true, latencyMs: 70 });
  });
  it('limita o atraso e aceita desligar', () => {
    expect(normalizeSensor({ gyro: false, latencyMs: 999 })).toEqual({ gyro: false, latencyMs: 160 });
    expect(normalizeSensor({ latencyMs: -5 }).latencyMs).toBe(0);
    expect(normalizeSensor({ latencyMs: 'x' as never }).latencyMs).toBe(70);
  });
});
