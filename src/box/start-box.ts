import { stageVerticalFov, VIRTUAL_YAW_RAD, virtualPitchRad } from './stage-view';
import { ARENA_MAX_DISTANCE } from './arena';
import { OrientationSource } from './orientation-source';
import type { OrientationMode } from './orientation-source';
import { BoxScene, DEFAULT_HALF_SIZE_M } from './box-scene';
import type { BattlePlanLike, BoxMode, CreatureEntry } from './box-scene';
import type { SmoothingMode } from '../core/pixel-upscale';
import type { WeatherMode } from '../core/weather';
import type { BoxCreature } from './creature';
import type { BattleHud } from './battle-director';
import type { BattleResult, Fighter } from '../core/battle';
import { DEFAULT_PHONE_HEIGHT_M, FLOOR_MESSAGES } from './floor';
import { createWebglBackend } from '../ar/webgl-backend';
import { ambientFromSample } from './fx-lights';
import { SoundEngine } from './sound';
import { sensorSettings } from '../app/sensor-settings';
import { effectiveVisual, maxVisualFps } from '../app/visual-settings';
import { isFrameDue } from '../core/frame-rate';
import { cancelGameFrame, requestGameFrame } from '../app/frame-scheduler';

/** Campo de visão vertical típico da câmera traseira de um celular em pé (ajustável na tela). */
export const DEFAULT_VIDEO_VFOV_DEG = 63;

export interface StartBoxOptions {
  /** O vídeo da câmera atrás da cena (AR). Sem ele não há corte de imagem nem luz do ambiente real. */
  video?: HTMLVideoElement;
  /**
   * Palco virtual (Arena 3D, sem câmera): o cenário do Coliseu fica em volta da caixa, a visão começa de frente para a
   * arena e só gira se o jogador arrastar; não pede nem lê os sensores. O vídeo, se vier, é ignorado.
   */
  virtual?: boolean;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  onModeChange?: (mode: OrientationMode) => void;
  /** Chamado a cada quadro durante uma batalha (e uma vez com null quando acaba). */
  onBattleHud?: (hud: BattleHud | null) => void;
}

export type PlaceResult = { ok: true; /** A caixa foi afastada da câmera para não ficar colada. */ moved?: boolean } | { ok: false; message: string };

export interface RunningBox {
  readonly orientation: OrientationSource;
  readonly scene: BoxScene;
  placeAt(ndcX: number, ndcY: number): PlaceResult;
  clearPlacement(): void;
  pick(ndcX: number, ndcY: number): BoxCreature | null;
  setCreatures(entries: CreatureEntry[]): void;
  setMode(mode: BoxMode): void;
  setSmoothing(mode: SmoothingMode): void;
  /** Luz dos golpes e do ambiente. */
  setLighting(on: boolean): void;
  /** Partículas e ondas de choque intensas nos impactos elementais. */
  setImpactEffects(on: boolean): void;
  /** Chão em pixel art e golpes que mudam o terreno. */
  setTerrain(on: boolean): void;
  setSocial(on: boolean): void;
  /** Clima da caixa (ciclo, fixo ou desligado). */
  setWeather(mode: WeatherMode): void;
  /** Liga ou desliga os sons da batalha. */
  setSound(on: boolean): void;
  /** Libera o áudio do navegador: chame direto de um toque do usuário (ex.: no clique de Batalhar). */
  unlockAudio(): void;
  /** `plan` escolhe quem luta e as equipes (modos Equipes e 3x3); sem ele, todos da caixa lutam entre si. */
  startBattle(fighters: readonly Fighter[], plan?: BattlePlanLike, rng?: () => number): BattleResult;
  stopBattle(): void;
  /** Traz a arena da batalha de volta para a frente do olhar. */
  recenterBattle(): void;
  setPhoneHeight(meters: number): void;
  setHalfSize(meters: number): void;
  setVideoFov(deg: number): void;
  resize(): void;
  stop(): void;
}

/** Ponto de entrada da Caixa: tudo que usa Three.js passa por aqui (import dinâmico). */
export async function startBox(options: StartBoxOptions): Promise<RunningBox> {
  const scene = new BoxScene();
  const sound = new SoundEngine();
  scene.setSound(sound);
  const renderer = (() => {
    try { return createWebglBackend(options.canvas); }
    catch (error) { scene.dispose(); sound.dispose(); throw error; }
  })();
  const virtual = options.virtual === true;
  const video = virtual ? undefined : options.video;
  const orientation = new OrientationSource();
  if (virtual) {
    scene.setBackdrop('virtual');
    orientation.startFixed(VIRTUAL_YAW_RAD, virtualPitchRad(DEFAULT_PHONE_HEIGHT_M, ARENA_MAX_DISTANCE), options.onModeChange);
  } else {
    try { await orientation.requestPermission(); }
    catch (error) { orientation.stop(); renderer.dispose(); scene.dispose(); sound.dispose(); throw error; }
    orientation.start(options.onModeChange);
  }

  let phoneHeight = DEFAULT_PHONE_HEIGHT_M;
  let videoFov = DEFAULT_VIDEO_VFOV_DEG;
  let running = true;
  let handle = 0;
  let lastHudAt = 0;
  let lastFrameAt = 0;
  let hudShown = false;

  const resize = () => {
    const width = options.container.clientWidth;
    const height = options.container.clientHeight;
    if (width === 0 || height === 0) return;
    scene.setView(width, height, stageVerticalFov(width, height, videoFov, video));
    renderer.setSize(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(options.container);
  video?.addEventListener('loadedmetadata', resize);
  resize();
  // No palco virtual a arena é colocada logo ao abrir, antes do primeiro quadro: a visão inicial já precisa estar na câmera.
  if (virtual) scene.setCameraQuaternion(orientation.read(performance.now()));

  // Luz do ambiente real: uma amostra minúscula do vídeo a cada meio segundo (barato) ajusta o brilho e o tom dos sprites.
  const sampler = document.createElement('canvas');
  sampler.width = 8;
  sampler.height = 6;
  const samplerCtx = sampler.getContext('2d', { willReadFrequently: true });
  let lastSample = 0;
  const sampleAmbient = (now: number) => {
    if (!video || !samplerCtx || now - lastSample < 500 || video.videoWidth === 0) return;
    lastSample = now;
    try {
      samplerCtx.drawImage(video, 0, 0, 8, 6);
      const a = ambientFromSample(samplerCtx.getImageData(0, 0, 8, 6).data);
      scene.setEnvironment(a.r, a.g, a.b);
    } catch {
      // Sem leitura do vídeo (permissão, navegador antigo): fica com a luz neutra.
    }
  };

  const tick = (now: number) => {
    if (!running) return;
    handle = requestGameFrame(tick, maxVisualFps);
    if (document.hidden) return;
    const fps = effectiveVisual.value.frameRate === 'auto' ? 0 : Number(effectiveVisual.value.frameRate);
    if (!isFrameDue(now, lastFrameAt, fps)) return;
    lastFrameAt = now;
    sampleAmbient(now);
    orientation.latencyMs = sensorSettings.latencyMs;
    scene.setCameraQuaternion(orientation.read(performance.now()));
    scene.update(now);
    if (scene.battling) {
      // A interface redesenha ~30 vezes por segundo: o suficiente para barras e números sem pesar.
      if (now - lastHudAt >= 33) {
        lastHudAt = now;
        options.onBattleHud?.(scene.battleHud);
      }
    } else if (hudShown) {
      options.onBattleHud?.(null);
    }
    hudShown = scene.battling;
    renderer.render(scene.scene, scene.camera);
  };
  const onVisibility = () => {
    scene.resetClock();
    lastFrameAt = 0;
    sound.setPaused(document.hidden);
  };
  document.addEventListener('visibilitychange', onVisibility);
  handle = requestGameFrame(tick, maxVisualFps);

  return {
    orientation,
    scene,
    placeAt(ndcX, ndcY) {
      const result = scene.floorAt(ndcX, ndcY, phoneHeight);
      if (!result.ok) return { ok: false, message: FLOOR_MESSAGES[result.reason] };
      const { moved } = scene.place(result.point);
      return { ok: true, moved };
    },
    clearPlacement: () => scene.clearPlacement(),
    pick: (x, y) => scene.pick(x, y),
    setCreatures: (entries) => scene.setCreatures(entries),
    setMode: (mode) => scene.setMode(mode),
    setSmoothing: (mode) => scene.setSmoothing(mode),
    setLighting: (on) => scene.setLighting(on),
    setImpactEffects: (on) => scene.setImpactEffects(on),
    setTerrain: (on) => scene.setTerrain(on),
    setSocial: (on) => scene.setSocial(on),
    setWeather: (mode) => scene.setWeather(mode),
    setSound: (on) => sound.setEnabled(on),
    unlockAudio: () => sound.unlock(),
    startBattle: (fighters, plan, rng) => scene.startBattle(fighters, rng, plan),
    stopBattle: () => scene.stopBattle(),
    recenterBattle: () => scene.recenterBattle(),
    setPhoneHeight(meters) {
      // No palco virtual a câmera tem uma altura só (a pose da visão e o cenário dependem dela).
      if (!virtual) phoneHeight = meters;
    },
    setHalfSize: (meters) => scene.setHalfSize(meters),
    setVideoFov(deg) {
      videoFov = deg;
      resize();
    },
    resize,
    stop() {
      if (!running) return;
      running = false;
      cancelGameFrame(handle);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      video?.removeEventListener('loadedmetadata', resize);
      orientation.stop();
      sound.dispose();
      scene.dispose();
      renderer.dispose();
    },
  };
}

export { DEFAULT_HALF_SIZE_M };
