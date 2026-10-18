import { Quaternion, Vector3 } from 'three';
import { orientationQuaternion } from '../box/orientation';

/**
 * Fonte única da orientação do celular (giroscópio fundido com acelerômetro), compartilhada pelo AR da carta e pela
 * Caixa. Guarda um histórico curto com a hora de cada amostra, para o AR consultar a orientação **no instante** de
 * um quadro da câmera (`at`) em vez de só a mais recente: o vídeo chega com atraso, e usar a orientação "de agora"
 * faria o Pokémon se adiantar à imagem.
 *
 * Fonte preferida: `RelativeOrientationSensor` (Generic Sensor API, Chrome/Android, até 60 Hz, sem bússola, então
 * sem os saltos magnéticos; a guinada deriva devagar, o que não importa para uso relativo). Reserva: o evento
 * `deviceorientation`. Só rotação: o celular não tem posição aqui.
 */

export type OrientationKind = 'relative' | 'deviceorientation';

export interface OrientationSample {
  t: number;
  q: Quaternion;
}

const HISTORY_MS = 1500;
const MAX_SAMPLES = 256;
/** Rotação −90° em X: do mundo com z para cima (sensores) para o mundo com y para cima (Three.js). */
const Z_UP_TO_Y_UP = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const Z_AXIS = new Vector3(0, 0, 1);
const DEG = Math.PI / 180;

export function screenAngleDeg(): number {
  return window.screen?.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
}

/**
 * Quaternion do sensor (dispositivo → referência z-para-cima, como entrega o `RelativeOrientationSensor`) para a
 * câmera traseira no mundo y-para-cima do Three.js (mesma convenção de `orientationQuaternion`).
 */
export function sensorToCameraQuaternion(sensor: ArrayLike<number>, screenAngle = 0): Quaternion {
  const q = new Quaternion(sensor[0], sensor[1], sensor[2], sensor[3]).normalize();
  q.premultiply(Z_UP_TO_Y_UP);
  q.multiply(new Quaternion().setFromAxisAngle(Z_AXIS, -screenAngle * DEG));
  return q;
}

interface RelativeSensorLike extends EventTarget {
  quaternion: ArrayLike<number> | null;
  start(): void;
  stop(): void;
}

type RelativeSensorCtor = new (options?: { frequency?: number; referenceFrame?: 'device' | 'screen' }) => RelativeSensorLike;

export class OrientationFeed {
  kind: OrientationKind | null = null;
  private samples: OrientationSample[] = [];
  private users = 0;
  private sensor: RelativeSensorLike | null = null;
  private listener: ((event: DeviceOrientationEvent) => void) | null = null;
  private onReading: (() => void) | null = null;
  private onSensorError: ((event: Event) => void) | null = null;

  get active(): boolean {
    return this.users > 0;
  }

  get hasSamples(): boolean {
    return this.samples.length > 0;
  }

  /** Começa a receber (contagem de usos: AR e Caixa podem usar ao mesmo tempo). */
  acquire(now: () => number = () => performance.now()): void {
    this.users++;
    if (this.users === 1) this.begin(now);
  }

  release(): void {
    if (this.users === 0) return;
    this.users--;
    if (this.users === 0) this.end();
  }

  /** Acrescenta uma amostra (também usado pelos testes). */
  push(t: number, q: Quaternion): void {
    const last = this.samples[this.samples.length - 1];
    if (last && t < last.t) return;
    this.samples.push({ t, q: q.clone() });
    while (this.samples.length > MAX_SAMPLES || (this.samples.length > 2 && t - this.samples[0]!.t > HISTORY_MS)) this.samples.shift();
  }

  /** Há amostra recente? (O sensor pode ter parado de entregar; amostra velha não serve para corrigir a pose.) */
  isFresh(nowMs: number, maxAgeMs = 500): boolean {
    const last = this.latest();
    return last !== null && nowMs - last.t <= maxAgeMs;
  }

  latest(): OrientationSample | null {
    return this.samples[this.samples.length - 1] ?? null;
  }

  /** Orientação no instante `t` (interpolada entre as duas amostras vizinhas; fora do histórico, a mais próxima). */
  at(t: number): Quaternion | null {
    const n = this.samples.length;
    if (n === 0) return null;
    const first = this.samples[0]!;
    const last = this.samples[n - 1]!;
    if (t <= first.t) return first.q.clone();
    if (t >= last.t) return last.q.clone();
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.samples[mid]!.t <= t) lo = mid;
      else hi = mid;
    }
    const a = this.samples[lo]!;
    const b = this.samples[hi]!;
    const span = b.t - a.t;
    return a.q.clone().slerp(b.q, span > 0 ? (t - a.t) / span : 0);
  }

  reset(): void {
    this.samples = [];
  }

  private begin(now: () => number): void {
    this.reset();
    const Sensor = (window as unknown as { RelativeOrientationSensor?: RelativeSensorCtor }).RelativeOrientationSensor;
    if (Sensor) {
      try {
        const sensor = new Sensor({ frequency: 60, referenceFrame: 'device' });
        this.onReading = () => {
          if (sensor.quaternion) {
            this.kind = 'relative';
            this.push(now(), sensorToCameraQuaternion(sensor.quaternion, screenAngleDeg()));
          }
        };
        this.onSensorError = () => {
          // Sem permissão ou sem sensor: cai para o evento antigo.
          this.stopSensor();
          if (this.users > 0 && !this.listener) this.beginDeviceOrientation(now);
        };
        sensor.addEventListener('reading', this.onReading);
        sensor.addEventListener('error', this.onSensorError);
        this.sensor = sensor;
        sensor.start();
        // Se o sensor não entregar nada logo, o evento antigo também escuta (o que chegar primeiro vale).
        this.beginDeviceOrientation(now, true);
        return;
      } catch {
        this.sensor = null;
      }
    }
    this.beginDeviceOrientation(now);
  }

  /** `passive`: só vale se o sensor moderno não estiver entregando amostras. */
  private beginDeviceOrientation(now: () => number, passive = false): void {
    if (this.listener) return;
    this.listener = (event) => {
      if (event.alpha === null || event.beta === null || event.gamma === null) return;
      if (passive && this.kind === 'relative') return;
      this.kind = 'deviceorientation';
      this.push(now(), orientationQuaternion(event.alpha, event.beta, event.gamma, screenAngleDeg()));
    };
    window.addEventListener('deviceorientation', this.listener);
  }

  private stopSensor(): void {
    if (this.sensor) {
      if (this.onReading) this.sensor.removeEventListener('reading', this.onReading);
      if (this.onSensorError) this.sensor.removeEventListener('error', this.onSensorError);
      try {
        this.sensor.stop();
      } catch {
        // Já parado.
      }
    }
    this.sensor = null;
    this.onReading = null;
    this.onSensorError = null;
  }

  private end(): void {
    this.stopSensor();
    if (this.listener) window.removeEventListener('deviceorientation', this.listener);
    this.listener = null;
    this.kind = null;
    this.reset();
  }
}

let shared: OrientationFeed | null = null;
export function getOrientationFeed(): OrientationFeed {
  shared ??= new OrientationFeed();
  return shared;
}

export { requestOrientationPermission } from '../core/orientation-permission';
