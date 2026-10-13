import { Quaternion } from 'three';
import { lookQuaternion, orientationQuaternion } from './orientation';

export type OrientationMode = 'sensor' | 'manual';
export type PermissionResult = 'granted' | 'denied' | 'unsupported';

interface PermissionEventClass {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** Tempo esperando o primeiro evento com valores antes de cair no modo "arrastar para olhar". */
const SENSOR_WAIT_MS = 1500;
/** Quanto a orientação suavizada anda em direção à medida por quadro (tira o tremor dos sensores). */
const SMOOTHING = 0.35;

function screenAngle(): number {
  return window.screen?.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
}

/**
 * Orientação do celular para a Caixa. Usa o `deviceorientation`; se o aparelho não manda valores (computador,
 * sensor bloqueado), cai para "arrastar para olhar", e a interface avisa qual modo está valendo.
 */
export class OrientationSource {
  mode: OrientationMode = 'sensor';
  private target = new Quaternion();
  private current = new Quaternion();
  private hasReading = false;
  private yaw = 0;
  private pitch = -0.6;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listener: ((event: DeviceOrientationEvent) => void) | null = null;

  /** No iOS pede permissão (precisa vir de um toque); no Android é imediato. */
  async requestPermission(): Promise<PermissionResult> {
    const Ctor = (window as unknown as { DeviceOrientationEvent?: PermissionEventClass }).DeviceOrientationEvent;
    if (!Ctor) return 'unsupported';
    if (typeof Ctor.requestPermission !== 'function') return 'granted';
    try {
      return (await Ctor.requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  start(onModeChange?: (mode: OrientationMode) => void): void {
    this.stop();
    this.listener = (event) => {
      if (event.alpha === null || event.beta === null || event.gamma === null) return;
      this.target = orientationQuaternion(event.alpha, event.beta, event.gamma, screenAngle());
      if (!this.hasReading) {
        this.hasReading = true;
        this.current.copy(this.target);
      }
      if (this.mode !== 'sensor') {
        this.mode = 'sensor';
        onModeChange?.('sensor');
      }
    };
    window.addEventListener('deviceorientation', this.listener);
    this.timer = setTimeout(() => {
      if (!this.hasReading) {
        this.mode = 'manual';
        this.target = lookQuaternion(this.yaw, this.pitch);
        this.current.copy(this.target);
        onModeChange?.('manual');
      }
    }, SENSOR_WAIT_MS);
  }

  /** Modo manual: arrastar com o dedo gira a visão (dx, dy em pixels). */
  lookBy(dx: number, dy: number): void {
    if (this.mode !== 'manual') return;
    this.yaw -= dx * 0.005;
    this.pitch = Math.min(1.4, Math.max(-1.45, this.pitch + dy * 0.005));
    this.target = lookQuaternion(this.yaw, this.pitch);
  }

  /** Orientação suavizada; chamar uma vez por quadro. */
  read(): Quaternion {
    this.current.slerp(this.target, this.mode === 'manual' ? 1 : SMOOTHING);
    return this.current;
  }

  stop(): void {
    if (this.listener) window.removeEventListener('deviceorientation', this.listener);
    this.listener = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.hasReading = false;
  }
}
