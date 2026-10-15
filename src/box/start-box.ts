import { visibleVerticalFov } from './orientation';
import { OrientationSource } from './orientation-source';
import type { OrientationMode } from './orientation-source';
import { BoxScene, DEFAULT_HALF_SIZE_M } from './box-scene';
import type { BoxMode, CreatureEntry } from './box-scene';
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

/** Campo de visão vertical típico da câmera traseira de um celular em pé (ajustável na tela). */
export const DEFAULT_VIDEO_VFOV_DEG = 63;

export interface StartBoxOptions {
  video: HTMLVideoElement;
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
  startBattle(fighters: readonly Fighter[], plan?: { picks: readonly number[]; teams?: readonly number[]; relay?: boolean }): BattleResult;
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
  const renderer = createWebglBackend(options.canvas);
  const orientation = new OrientationSource();
  await orientation.requestPermission();
  orientation.start(options.onModeChange);

  let phoneHeight = DEFAULT_PHONE_HEIGHT_M;
  let videoFov = DEFAULT_VIDEO_VFOV_DEG;
  let running = true;
  let handle = 0;
  let lastHudAt = 0;
  let hudShown = false;

  const resize = () => {
    const width = options.container.clientWidth;
    const height = options.container.clientHeight;
    if (width === 0 || height === 0) return;
    const videoAspect = options.video.videoWidth > 0 && options.video.videoHeight > 0 ? options.video.videoWidth / options.video.videoHeight : width / height;
    scene.setView(width, height, visibleVerticalFov(videoFov, videoAspect, width / height));
    renderer.setSize(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(options.container);
  options.video.addEventListener('loadedmetadata', resize);
  resize();

  // Luz do ambiente real: uma amostra minúscula do vídeo a cada meio segundo (barato) ajusta o brilho e o tom dos sprites.
  const sampler = document.createElement('canvas');
  sampler.width = 8;
  sampler.height = 6;
  const samplerCtx = sampler.getContext('2d', { willReadFrequently: true });
  let lastSample = 0;
  const sampleAmbient = (now: number) => {
    if (!samplerCtx || now - lastSample < 500 || options.video.videoWidth === 0) return;
    lastSample = now;
    try {
      samplerCtx.drawImage(options.video, 0, 0, 8, 6);
      const a = ambientFromSample(samplerCtx.getImageData(0, 0, 8, 6).data);
      scene.setEnvironment(a.r, a.g, a.b);
    } catch {
      // Sem leitura do vídeo (permissão, navegador antigo): fica com a luz neutra.
    }
  };

  const tick = (now: number) => {
    if (!running) return;
    handle = requestAnimationFrame(tick);
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
  handle = requestAnimationFrame(tick);

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
    setTerrain: (on) => scene.setTerrain(on),
    setSocial: (on) => scene.setSocial(on),
    setWeather: (mode) => scene.setWeather(mode),
    setSound: (on) => sound.setEnabled(on),
    unlockAudio: () => sound.unlock(),
    startBattle: (fighters, plan) => scene.startBattle(fighters, undefined, plan),
    stopBattle: () => scene.stopBattle(),
    recenterBattle: () => scene.recenterBattle(),
    setPhoneHeight(meters) {
      phoneHeight = meters;
    },
    setHalfSize: (meters) => scene.setHalfSize(meters),
    setVideoFov(deg) {
      videoFov = deg;
      resize();
    },
    resize,
    stop() {
      running = false;
      cancelAnimationFrame(handle);
      observer.disconnect();
      options.video.removeEventListener('loadedmetadata', resize);
      orientation.stop();
      sound.dispose();
      scene.dispose();
      renderer.dispose();
    },
  };
}

export { DEFAULT_HALF_SIZE_M };
