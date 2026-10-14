import { afterEach, describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { orientationQuaternion } from '../box/orientation';
import { OrientationFeed, sensorToCameraQuaternion } from './orientation-feed';

const DEG = Math.PI / 180;
const angleBetween = (a: Quaternion, b: Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));

/** Quaternion que o sensor entregaria para os ângulos do W3C: Z(alfa) · X(beta) · Y(gama), dispositivo → terra. */
function sensorQuaternion(alpha: number, beta: number, gamma: number): number[] {
  const q = new Quaternion().setFromEuler(new Euler(beta * DEG, gamma * DEG, alpha * DEG, 'ZXY'));
  return [q.x, q.y, q.z, q.w];
}

describe('quaternion do sensor → câmera', () => {
  it('equivale à conta do deviceorientation para várias poses e giros de tela', () => {
    const poses: [number, number, number][] = [[0, 90, 0], [30, 70, 10], [200, 120, -15], [310, 45, 5], [90, 100, 20]];
    for (const [a, b, g] of poses) {
      for (const screen of [0, 90, 270]) {
        const fromSensor = sensorToCameraQuaternion(sensorQuaternion(a, b, g), screen);
        const fromEvent = orientationQuaternion(a, b, g, screen);
        expect(angleBetween(fromSensor, fromEvent)).toBeLessThan(1e-6);
      }
    }
  });

  it('celular de pé aponta a câmera na horizontal', () => {
    const q = sensorToCameraQuaternion(sensorQuaternion(0, 90, 0));
    const dir = new Vector3(0, 0, -1).applyQuaternion(q);
    expect(Math.abs(dir.y)).toBeLessThan(1e-6);
  });
});

describe('histórico de orientação', () => {
  const yaw = (deg: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), deg * DEG);

  it('at() interpola entre as amostras vizinhas', () => {
    const feed = new OrientationFeed();
    feed.push(1000, yaw(0));
    feed.push(1100, yaw(20));
    const mid = feed.at(1050)!;
    expect(angleBetween(mid, yaw(10))).toBeLessThan(1e-6);
  });

  it('fora do histórico devolve a amostra mais próxima e sem amostras devolve null', () => {
    const feed = new OrientationFeed();
    expect(feed.at(5)).toBeNull();
    feed.push(1000, yaw(0));
    feed.push(1100, yaw(20));
    expect(angleBetween(feed.at(900)!, yaw(0))).toBeLessThan(1e-6);
    expect(angleBetween(feed.at(5000)!, yaw(20))).toBeLessThan(1e-6);
  });

  it('descarta amostras antigas e ignora amostras fora de ordem', () => {
    const feed = new OrientationFeed();
    for (let t = 0; t <= 4000; t += 10) feed.push(t, yaw(t / 100));
    feed.push(10, yaw(99)); // fora de ordem: ignorada
    expect(feed.latest()!.t).toBe(4000);
    // o histórico é curto: pedir um instante muito antigo devolve o começo do que sobrou, não o de t=0
    expect(angleBetween(feed.at(0)!, yaw(0))).toBeGreaterThan(0.1);
  });
});

describe('fontes', () => {
  afterEach(() => {
    delete (window as unknown as { RelativeOrientationSensor?: unknown }).RelativeOrientationSensor;
  });

  it('usa o evento deviceorientation quando não há sensor moderno', () => {
    const feed = new OrientationFeed();
    let t = 100;
    feed.acquire(() => t);
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 10, beta: 80, gamma: 0 }));
    t = 120;
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 12, beta: 80, gamma: 0 }));
    expect(feed.kind).toBe('deviceorientation');
    expect(feed.latest()!.t).toBe(120);
    feed.release();
    expect(feed.hasSamples).toBe(false);
  });

  it('prefere o RelativeOrientationSensor e ignora o evento antigo enquanto ele entrega', () => {
    class FakeSensor extends EventTarget {
      static last: FakeSensor | null = null;
      quaternion: number[] | null = null;
      started = false;
      constructor() {
        super();
        FakeSensor.last = this;
      }
      start() {
        this.started = true;
      }
      stop() {
        this.started = false;
      }
    }
    (window as unknown as { RelativeOrientationSensor: unknown }).RelativeOrientationSensor = FakeSensor;
    const feed = new OrientationFeed();
    feed.acquire(() => 50);
    const sensor = FakeSensor.last!;
    expect(sensor.started).toBe(true);
    sensor.quaternion = sensorQuaternion(0, 90, 0);
    sensor.dispatchEvent(new Event('reading'));
    expect(feed.kind).toBe('relative');
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 99, beta: 10, gamma: 10 }));
    expect(feed.kind).toBe('relative');
    expect(feed.latest()!.t).toBe(50);
    feed.release();
    expect(sensor.started).toBe(false);
  });

  it('erro do sensor moderno cai para o deviceorientation', () => {
    class BrokenSensor extends EventTarget {
      static last: BrokenSensor | null = null;
      quaternion = null;
      constructor() {
        super();
        BrokenSensor.last = this;
      }
      start() {}
      stop() {}
    }
    (window as unknown as { RelativeOrientationSensor: unknown }).RelativeOrientationSensor = BrokenSensor;
    const feed = new OrientationFeed();
    feed.acquire(() => 10);
    BrokenSensor.last!.dispatchEvent(new Event('error'));
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 1, beta: 80, gamma: 0 }));
    expect(feed.kind).toBe('deviceorientation');
    feed.release();
  });

  it('contagem de usos: só para quando o último solta', () => {
    const feed = new OrientationFeed();
    feed.acquire(() => 1);
    feed.acquire(() => 1);
    feed.release();
    expect(feed.active).toBe(true);
    feed.release();
    expect(feed.active).toBe(false);
  });
});
