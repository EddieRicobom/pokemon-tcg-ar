import { PerspectiveCamera, Scene } from 'three';
import { cameraParamsFromProjection, cardSpaceMatrix, DEFAULT_LAYOUT } from './anchor';
import type { SpriteLayout } from './anchor';
import { CardSprite } from './card-sprite';
import type { TrackingEngine, TrackingInfo, TrackingUpdate } from './engine';

export type ArPhase = 'idle' | 'starting' | 'searching' | 'tracking' | 'lost' | 'error';

export interface ArState {
  phase: ArPhase;
  message?: string;
  /** Quantas vezes a carta foi encontrada desde que a sessão começou. */
  foundCount: number;
}

/** O que a sessão precisa do desenho (WebGL no navegador; falso nos testes). */
export interface RenderBackend {
  render(scene: Scene, camera: PerspectiveCamera): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

export interface ArSessionDeps {
  engine: TrackingEngine;
  renderer: RenderBackend;
  sprite: CardSprite;
  video: HTMLVideoElement;
  /** Tamanho em CSS do contêiner onde o vídeo é exibido em "cover". */
  getContainerSize: () => { width: number; height: number };
  /** Agenda o próximo quadro de desenho (requestAnimationFrame no navegador). */
  schedule?: (callback: (now: number) => void) => number;
  cancel?: (handle: number) => void;
  onState?: (state: ArState) => void;
  /** Quadros seguidos sem pose antes de declarar "carta perdida" na interface. */
  lostAfterFrames?: number;
  /** Tempo (ms) que o Pokémon continua visível, na última pose, depois que o rastreador perde a carta. */
  holdMs?: number;
  now?: () => number;
}

/**
 * Orquestra uma sessão de AR: motor de rastreamento → pose da carta → matriz do sprite → desenho.
 * Não fala com o MindAR nem com o WebGL diretamente (injetados), então a lógica de estados,
 * seguimento e limpeza é testada sem navegador. Validar com a câmera real continua sendo passo manual.
 */
export class ArSession {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera();
  private info: TrackingInfo | null = null;
  private handle: number | null = null;
  private running = false;
  private missedFrames = 0;
  private lastPoseAt = 0;
  private target: ArrayBuffer | null = null;
  private restarting = false;
  private state: ArState = { phase: 'idle', foundCount: 0 };

  constructor(private readonly deps: ArSessionDeps) {
    this.scene.add(deps.sprite.group);
    deps.sprite.setLayout(DEFAULT_LAYOUT);
  }

  get currentState(): ArState {
    return this.state;
  }

  private setState(patch: Partial<ArState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.onState?.(this.state);
  }

  setLayout(layout: SpriteLayout): void {
    this.deps.sprite.setLayout(layout);
  }

  async start(target: ArrayBuffer): Promise<void> {
    if (this.running) return;
    this.target = target;
    this.setState({ phase: 'starting', message: 'Preparando o rastreamento…' });
    try {
      this.info = await this.deps.engine.start(this.deps.video, target, (update) => this.onTrack(update), () => void this.restartTracking());
    } catch (error) {
      this.setState({ phase: 'error', message: error instanceof Error ? error.message : 'Falha ao iniciar o rastreamento.' });
      this.deps.engine.stop();
      throw error;
    }
    this.running = true;
    this.resize();
    this.setState({ phase: 'searching', message: 'Aponte a câmera para a carta.' });
    this.loop();
  }

  /** A câmera mudou de proporção: reinicia o rastreador com o novo tamanho de quadro (a sessão e o sprite continuam). */
  private async restartTracking(): Promise<void> {
    if (!this.running || this.restarting || !this.target) return;
    this.restarting = true;
    try {
      this.deps.engine.stop();
      this.info = await this.deps.engine.start(this.deps.video, this.target, (update) => this.onTrack(update), () => void this.restartTracking());
      this.resize();
      this.missedFrames = 0;
      this.setState({ phase: 'searching', message: 'Aponte a câmera para a carta.' });
    } catch (error) {
      this.setState({ phase: 'error', message: error instanceof Error ? error.message : 'Falha ao reiniciar o rastreamento.' });
    } finally {
      this.restarting = false;
    }
  }

  private clock(): number {
    return (this.deps.now ?? (() => performance.now()))();
  }

  private onTrack(update: TrackingUpdate): void {
    if (!this.info) return;
    const sprite = this.deps.sprite;
    if (update.worldMatrix) {
      sprite.setCardMatrix(cardSpaceMatrix(update.worldMatrix, this.info.markerWidth, this.info.markerHeight));
      sprite.setTracked(true);
      this.missedFrames = 0;
      this.lastPoseAt = this.clock();
      if (this.state.phase !== 'tracking') this.setState({ phase: 'tracking', message: undefined, foundCount: this.state.foundCount + 1 });
    } else {
      // Perda curta: mantém o Pokémon na última pose em vez de piscar enquanto o rastreador reencontra a carta.
      if (this.clock() - this.lastPoseAt > (this.deps.holdMs ?? 1000)) sprite.setTracked(false);
      this.missedFrames++;
      const limit = this.deps.lostAfterFrames ?? 10;
      if (this.state.phase === 'tracking' && this.missedFrames >= limit) {
        this.setState({ phase: 'lost', message: 'Perdi a carta. Aponte de novo para ela.' });
      }
    }
  }

  /** Ajusta a câmera virtual ao contêiner (chamar também ao girar/redimensionar a tela). */
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
      this.deps.sprite.update(now);
      this.deps.renderer.render(this.scene, this.camera);
    };
    this.handle = schedule(tick);
  }

  /** Para o rastreamento e o desenho e libera tudo (não fecha a câmera: ela é de quem a abriu). */
  stop(): void {
    this.running = false;
    if (this.handle !== null) (this.deps.cancel ?? ((h) => cancelAnimationFrame(h)))(this.handle);
    this.handle = null;
    this.deps.engine.stop();
    this.scene.remove(this.deps.sprite.group);
    this.deps.sprite.dispose();
    this.deps.renderer.dispose();
    this.info = null;
    this.setState({ phase: 'idle', message: undefined });
  }
}
