import { Quaternion } from 'three';
import { getOrientationFeed, requestOrientationPermission } from '../sensors/orientation-feed';
import type { OrientationFeed, OrientationKind } from '../sensors/orientation-feed';
import { lookQuaternion, orientationSmoothingAlpha } from './orientation';

export type OrientationMode = 'sensor' | 'manual';
export type PermissionResult = 'granted' | 'denied' | 'unsupported';

/** Tempo esperando a primeira amostra do sensor antes de cair no modo "arrastar para olhar". */
const SENSOR_WAIT_MS = 1500;

/**
 * Orientação do celular para a Caixa, vinda da fonte compartilhada de sensores (`OrientationFeed`: sensor de
 * orientação relativa quando existe, senão `deviceorientation`). Se o aparelho não manda valores (computador,
 * sensor bloqueado), cai para "arrastar para olhar", e a interface avisa qual modo está valendo.
 */
export class OrientationSource {
  mode: OrientationMode = 'sensor';
  /** Atraso (ms) da imagem da câmera: a Caixa usa a orientação de "agora − atraso" para casar com o vídeo. */
  latencyMs = 70;
  private acquired = false;
  private target = new Quaternion();
  private current = new Quaternion();
  private hasReading = false;
  private yaw = 0;
  private pitch = -0.6;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Palco virtual: a visão é sempre a que o jogador arrasta, nunca a dos sensores. */
  private fixed = false;
  private onModeChange: ((mode: OrientationMode) => void) | null = null;

  constructor(private readonly feed: OrientationFeed = getOrientationFeed()) {}

  /** Qual sensor está entregando (para a interface). */
  get sensorKind(): OrientationKind | null {
    return this.feed.kind;
  }

  /** No iOS pede permissão (precisa vir de um toque); no Android é imediato. */
  requestPermission(): Promise<PermissionResult> {
    return requestOrientationPermission();
  }

  start(onModeChange?: (mode: OrientationMode) => void): void {
    this.stop();
    this.onModeChange = onModeChange ?? null;
    this.feed.acquire();
    this.acquired = true;
    this.timer = setTimeout(() => {
      if (!this.hasReading) {
        this.mode = 'manual';
        this.target = lookQuaternion(this.yaw, this.pitch);
        this.current.copy(this.target);
        this.onModeChange?.('manual');
      }
    }, SENSOR_WAIT_MS);
  }

  /**
   * Palco virtual (sem câmera): começa já no modo "arrastar para olhar", olhando para `yaw`/`pitch`, sem pedir nem ler
   * sensores (nem se outra tela estiver usando a fonte compartilhada).
   */
  startFixed(yaw: number, pitch: number, onModeChange?: (mode: OrientationMode) => void): void {
    this.stop();
    this.fixed = true;
    this.mode = 'manual';
    this.yaw = yaw;
    this.pitch = pitch;
    this.target = lookQuaternion(yaw, pitch);
    this.current.copy(this.target);
    this.onModeChange = onModeChange ?? null;
  }

  /** Modo manual: arrastar com o dedo gira a visão (dx, dy em pixels). */
  lookBy(dx: number, dy: number): void {
    if (this.mode !== 'manual') return;
    this.yaw -= dx * 0.005;
    this.pitch = Math.min(1.4, Math.max(-1.45, this.pitch + dy * 0.005));
    this.target = lookQuaternion(this.yaw, this.pitch);
  }

  /** Orientação suavizada; chamar uma vez por quadro. */
  read(nowMs: number = performance.now()): Quaternion {
    if (!this.fixed && this.feed.isFresh(nowMs, 1000)) {
      const sample = this.feed.at(nowMs - this.latencyMs);
      if (sample) {
        this.target = sample;
        if (!this.hasReading) {
          this.hasReading = true;
          this.current.copy(sample);
        }
        if (this.mode !== 'sensor') {
          this.mode = 'sensor';
          this.onModeChange?.('sensor');
        }
      }
    }
    if (this.mode === 'manual') this.current.copy(this.target);
    // Parado, filtra o tremor do sensor; girando, acompanha sem atraso.
    else this.current.slerp(this.target, orientationSmoothingAlpha(this.current.angleTo(this.target)));
    return this.current;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.acquired) this.feed.release();
    this.acquired = false;
    this.hasReading = false;
    this.fixed = false;
  }
}
