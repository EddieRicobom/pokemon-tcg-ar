import { PerspectiveCamera, Quaternion, Scene } from 'three';
import { cameraParamsFromProjection, cardSpaceMatrix, DEFAULT_LAYOUT } from './anchor';
import type { SpriteLayout } from './anchor';
import type { CardSprite } from './card-sprite';
import type { TrackingEngine, TrackingInfo, TrackingUpdate } from './engine';
import type { GyroSettings, OrientationLookup, RenderBackend } from './session';

export interface MultiSlot {
  cardId: string;
  name: string;
  sprite: CardSprite;
}

export interface MultiArState {
  phase: 'idle' | 'starting' | 'searching' | 'tracking' | 'error';
  message?: string;
  /** Ids das cartas que estão aparecendo agora (rastreadas ou seguradas na última pose). */
  visible: string[];
  trackerHz?: number;
  gyro?: boolean;
}

export interface MultiArSessionDeps {
  engine: TrackingEngine;
  renderer: RenderBackend;
  /** Um por carta, na mesma ordem dos alvos entregues ao motor. */
  slots: MultiSlot[];
  /** Quantas cartas o rastreador acompanha ao mesmo tempo. */
  maxTrack: number;
  orientation?: OrientationLookup;
  getGyroSettings?: () => GyroSettings;
  video: HTMLVideoElement;
  getContainerSize: () => { width: number; height: number };
  schedule?: (callback: (now: number) => void) => number;
  cancel?: (handle: number) => void;
  onState?: (state: MultiArState) => void;
  /** Tempo (ms) que o Pokémon continua na última pose depois que o rastreador perde a carta. */
  holdMs?: number;
  now?: () => number;
}

const DEFAULT_TRACKER_LAG_MS = 120;
const HOLD_WITH_GYRO_MS = 2500;
const HOLD_WITHOUT_GYRO_MS = 1000;
const STATS_EVERY_MS = 1000;

/**
 * Sessão de AR com várias cartas ao mesmo tempo: o motor recebe um alvo por carta e informa a pose de cada uma
 * (`TrackingUpdate.targetIndex`); cada carta tem o seu Pokémon. Mesmas regras da sessão de uma carta: pose presa ao
 * mundo pelo giroscópio, perda curta segurada na última pose. Sem painel de status (só o Pokémon sobre a carta).
 */
export class MultiArSession {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera();
  private info: TrackingInfo | null = null;
  private handle: number | null = null;
  private running = false;
  private restarting = false;
  private targets: ArrayBuffer[] = [];
  private readonly lastPoseAt: number[];
  /** Por carta: quando chegou a pose nula (o MindAR desistiu dela); null se está sendo vista. */
  private readonly lostAt: (number | null)[];
  private readonly shown: boolean[];
  private lastUpdateAt = 0;
  private intervalEmaMs = 0;
  private lastStatsAt = 0;
  private state: MultiArState = { phase: 'idle', visible: [] };

  constructor(private readonly deps: MultiArSessionDeps) {
    this.lastPoseAt = deps.slots.map(() => 0);
    this.lostAt = deps.slots.map(() => null);
    this.shown = deps.slots.map(() => false);
    for (const slot of deps.slots) {
      this.scene.add(slot.sprite.group);
      slot.sprite.setLayout(DEFAULT_LAYOUT);
    }
  }

  get currentState(): MultiArState {
    return this.state;
  }

  private setState(patch: Partial<MultiArState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.onState?.(this.state);
  }

  setLayout(layout: SpriteLayout): void {
    for (const slot of this.deps.slots) slot.sprite.setLayout(layout);
  }

  private clock(): number {
    return (this.deps.now ?? (() => performance.now()))();
  }

  private gyroOn(nowMs: number): boolean {
    const settings = this.deps.getGyroSettings?.() ?? { gyro: true, latencyMs: 70 };
    return settings.gyro && Boolean(this.deps.orientation?.isFresh(nowMs));
  }

  async start(targets: ArrayBuffer[]): Promise<void> {
    if (this.running) return;
    if (targets.length !== this.deps.slots.length) throw new Error('É preciso um alvo de rastreamento para cada carta.');
    this.targets = targets;
    this.setState({ phase: 'starting', message: 'Preparando o rastreamento…' });
    try {
      this.info = await this.engineStart();
    } catch (error) {
      this.setState({ phase: 'error', message: error instanceof Error ? error.message : 'Falha ao iniciar o rastreamento.' });
      this.deps.engine.stop();
      throw error;
    }
    this.running = true;
    this.resize();
    this.setState({ phase: 'searching', message: 'Aponte a câmera para as cartas.' });
    this.loop();
  }

  private engineStart(): Promise<TrackingInfo> {
    return this.deps.engine.start(this.deps.video, this.targets, (update) => this.onTrack(update), () => void this.restartTracking(), {
      maxTrack: Math.max(1, Math.min(this.deps.maxTrack, this.deps.slots.length)),
    });
  }

  private async restartTracking(): Promise<void> {
    if (!this.running || this.restarting) return;
    this.restarting = true;
    try {
      this.deps.engine.stop();
      this.info = await this.engineStart();
      this.resize();
      this.setState({ phase: 'searching', message: 'Aponte a câmera para as cartas.' });
    } catch (error) {
      this.setState({ phase: 'error', message: error instanceof Error ? error.message : 'Falha ao reiniciar o rastreamento.' });
    } finally {
      this.restarting = false;
    }
  }

  private onTrack(update: TrackingUpdate): void {
    if (!this.info) return;
    const index = update.targetIndex ?? 0;
    const slot = this.deps.slots[index];
    if (!slot) return;
    const marker = this.info.markers?.[index] ?? { width: this.info.markerWidth, height: this.info.markerHeight };
    const nowMs = this.clock();
    const gyro = this.gyroOn(nowMs);
    this.recordUpdate(nowMs, gyro);
    // Pose velha repetida pelo rastreador depois de perder a carta: conta como perda (não move nem renova o Pokémon).
    if (update.worldMatrix && update.fresh !== false) {
      const poseOrientation = gyro ? this.deps.orientation!.at(update.capturedAt ?? nowMs - DEFAULT_TRACKER_LAG_MS) : null;
      slot.sprite.setCardMatrix(cardSpaceMatrix(update.worldMatrix, marker.width, marker.height), poseOrientation);
      slot.sprite.setTracked(true);
      this.lastPoseAt[index] = nowMs;
      this.lostAt[index] = null;
    } else {
      const hold = this.deps.holdMs ?? (gyro ? HOLD_WITH_GYRO_MS : HOLD_WITHOUT_GYRO_MS);
      if (nowMs - this.lastPoseAt[index]! > hold) slot.sprite.setTracked(false);
      else if (this.lostAt[index] === null) this.lostAt[index] = nowMs;
    }
    this.publishVisible();
  }

  /** Avisa a interface quando muda o conjunto de cartas que aparecem. */
  private publishVisible(): void {
    let changed = false;
    this.deps.slots.forEach((slot, i) => {
      const now = slot.sprite.group.visible;
      if (now !== this.shown[i]) {
        this.shown[i] = now;
        changed = true;
      }
    });
    if (!changed) return;
    const visible = this.deps.slots.filter((_, i) => this.shown[i]).map((slot) => slot.cardId);
    this.setState({ visible, phase: visible.length > 0 ? 'tracking' : 'searching', message: visible.length > 0 ? undefined : 'Aponte a câmera para as cartas.' });
  }

  private recordUpdate(nowMs: number, gyro: boolean): void {
    if (this.lastUpdateAt > 0) {
      const interval = nowMs - this.lastUpdateAt;
      this.intervalEmaMs = this.intervalEmaMs === 0 ? interval : this.intervalEmaMs * 0.9 + interval * 0.1;
    }
    this.lastUpdateAt = nowMs;
    if (nowMs - this.lastStatsAt >= STATS_EVERY_MS && this.intervalEmaMs > 0) {
      this.lastStatsAt = nowMs;
      this.setState({ trackerHz: Math.round((1000 / this.intervalEmaMs) * 10) / 10, gyro });
    }
  }

  resize(): void {
    if (!this.info) return;
    const { width, height } = this.deps.getContainerSize();
    if (width === 0 || height === 0) return;
    const params = cameraParamsFromProjection(this.info.projection, this.info.inputWidth, this.info.inputHeight, width, height);
    this.camera.fov = params.fovDeg;
    this.camera.near = params.near;
    this.camera.far = params.far;
    this.camera.aspect = params.aspect;
    this.camera.updateProjectionMatrix();
    this.deps.renderer.setSize(width, height);
  }

  private loop(): void {
    const schedule = this.deps.schedule ?? ((cb) => requestAnimationFrame(cb));
    const tick = (now: number) => {
      if (!this.running) return;
      this.handle = schedule(tick);
      const nowMs = this.clock();
      const settings = this.deps.getGyroSettings?.() ?? { gyro: true, latencyMs: 70 };
      const view: Quaternion | null = this.gyroOn(nowMs) ? this.deps.orientation!.at(nowMs - settings.latencyMs) : null;
      for (const slot of this.deps.slots) {
        slot.sprite.setViewOrientation(view);
        slot.sprite.update(now);
      }
      // O MindAR manda a pose nula uma vez só, ao desistir da carta: o tempo de segurar conta daí.
      const hold = this.deps.holdMs ?? (this.gyroOn(nowMs) ? HOLD_WITH_GYRO_MS : HOLD_WITHOUT_GYRO_MS);
      this.deps.slots.forEach((slot, i) => {
        const lost = this.lostAt[i];
        if (lost !== null && lost !== undefined && nowMs - lost > hold) {
          this.lostAt[i] = null;
          slot.sprite.setTracked(false);
        }
      });
      this.publishVisible();
      this.deps.renderer.render(this.scene, this.camera);
    };
    this.handle = schedule(tick);
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) (this.deps.cancel ?? ((h) => cancelAnimationFrame(h)))(this.handle);
    this.handle = null;
    this.deps.engine.stop();
    for (const slot of this.deps.slots) {
      this.scene.remove(slot.sprite.group);
      slot.sprite.dispose();
    }
    this.deps.renderer.dispose();
    this.info = null;
    this.setState({ phase: 'idle', message: undefined, visible: [] });
  }
}
