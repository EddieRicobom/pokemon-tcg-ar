import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { OrientationFeed } from '../sensors/orientation-feed';
import { OrientationSource } from './orientation-source';

const yaw = (deg: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180);
const angle = (a: Quaternion, b: Quaternion) => a.angleTo(b);

describe('OrientationSource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('com amostras do sensor fica em modo sensor e acompanha a orientação', () => {
    const feed = new OrientationFeed();
    const source = new OrientationSource(feed);
    source.latencyMs = 0;
    source.start();
    feed.push(1000, yaw(0));
    expect(angle(source.read(1000), yaw(0))).toBeLessThan(1e-6);
    // giro rápido (passo grande): acompanha por inteiro em poucos quadros
    feed.push(1016, yaw(40));
    let q = source.read(1016);
    for (let t = 1032; t < 1200; t += 16) {
      feed.push(t, yaw(40));
      q = source.read(t);
    }
    expect(angle(q, yaw(40))).toBeLessThan(0.01);
    expect(source.mode).toBe('sensor');
    source.stop();
  });

  it('o atraso consulta uma orientação mais antiga', () => {
    const feed = new OrientationFeed();
    const source = new OrientationSource(feed);
    source.latencyMs = 100;
    source.start();
    feed.push(1000, yaw(0));
    feed.push(1100, yaw(10));
    feed.push(1200, yaw(20));
    const q = source.read(1200); // consulta t = 1100 → 10°
    expect(angle(q, yaw(10))).toBeLessThan(1e-6);
    source.stop();
  });

  it('sem nenhuma amostra em 1,5 s cai para "arrastar para olhar" e avisa', () => {
    const feed = new OrientationFeed();
    const source = new OrientationSource(feed);
    const modes: string[] = [];
    source.start((m) => modes.push(m));
    vi.advanceTimersByTime(1600);
    expect(source.mode).toBe('manual');
    expect(modes).toEqual(['manual']);
    const before = source.read(2000).clone();
    source.lookBy(100, 0);
    expect(angle(source.read(2016), before)).toBeGreaterThan(0.1);
    source.stop();
  });

  it('se o sensor acordar depois, volta ao modo sensor', () => {
    const feed = new OrientationFeed();
    const source = new OrientationSource(feed);
    const modes: string[] = [];
    source.start((m) => modes.push(m));
    vi.advanceTimersByTime(1600);
    feed.push(5000, yaw(15));
    source.read(5000);
    expect(source.mode).toBe('sensor');
    expect(modes).toEqual(['manual', 'sensor']);
    source.stop();
  });

  it('lookBy é ignorado em modo sensor e amostra velha não vale', () => {
    const feed = new OrientationFeed();
    const source = new OrientationSource(feed);
    source.latencyMs = 0;
    source.start();
    feed.push(1000, yaw(0));
    source.read(1000);
    source.lookBy(500, 500);
    expect(angle(source.read(1010), yaw(0))).toBeLessThan(1e-6);
    // 5 s depois sem amostras novas: continua onde estava (não "pula" para amostra antiga diferente)
    expect(angle(source.read(6000), yaw(0))).toBeLessThan(1e-6);
    source.stop();
  });

  it('stop solta o sensor', () => {
    const feed = new OrientationFeed();
    const source = new OrientationSource(feed);
    source.start();
    expect(feed.active).toBe(true);
    source.stop();
    expect(feed.active).toBe(false);
  });
});
