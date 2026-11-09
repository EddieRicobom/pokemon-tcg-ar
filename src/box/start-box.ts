import { ARENA_MAX_DISTANCE, stageVerticalFov, VIRTUAL_YAW_RAD, virtualHalfSize, virtualPitchRad } from './stage-view';
import { OrientationSource } from './orientation-source';
import type { OrientationMode } from './orientation-source';
import { BoxScene, DEFAULT_HALF_SIZE_M } from './box-scene';
import type { BoxMode, CreatureEntry } from './box-scene';
import type { SmoothingMode } from '../core/pixel-upscale';
import type { WeatherMode } from '../core/weather';
import type { BoxCreature } from './creature';
import { DEFAULT_PHONE_HEIGHT_M, FLOOR_MESSAGES } from './floor';
import { createWebglBackend } from '../ar/webgl-backend';
import { ambientFromSample } from './fx-lights';
import { hourOf, skyFor } from './sky';
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
   * Palco virtual (Arena, sem câmera): o cenário do Coliseu fica em volta da caixa, a visão começa de frente para a
   * arena e só gira se o jogador arrastar; não pede nem lê os sensores. O vídeo, se vier, é ignorado.
   */
  virtual?: boolean;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  /** O céu atrás do canvas transparente (palco virtual): a cena pinta nele a hora do dia e o clima. */
  sky?: HTMLElement | null;
  onModeChange?: (mode: OrientationMode) => void;
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
  /** Luz do ambiente nos sprites e no chão. */
  setLighting(on: boolean): void;
  /** Chão em pixel art. */
  setTerrain(on: boolean): void;
  /** Muro, arquibancada e tochas do Coliseu (palco virtual); desligado fica só a areia. */
  setScenery(on: boolean): void;
  setSocial(on: boolean): void;
  /** Clima da caixa (ciclo, fixo ou desligado). */
  setWeather(mode: WeatherMode): void;
  setPhoneHeight(meters: number): void;
  setHalfSize(meters: number): void;
  setVideoFov(deg: number): void;
  resize(): void;
  stop(): void;
}

/** Ponto de entrada da Caixa: tudo que usa Three.js passa por aqui (import dinâmico). */
export async function startBox(options: StartBoxOptions): Promise<RunningBox> {
  const scene = new BoxScene();
  const renderer = (() => {
    // No Modo Rotom a economia vale até na densidade de pixels.
    try { return createWebglBackend(options.canvas, effectiveVisual.value.rotomMode ? 1 : 1.5); }
    catch (error) { scene.dispose(); throw error; }
  })();
  const virtual = options.virtual === true;
  const video = virtual ? undefined : options.video;
  const orientation = new OrientationSource();
  if (virtual) {
    scene.setBackdrop('virtual');
    orientation.startFixed(VIRTUAL_YAW_RAD, virtualPitchRad(DEFAULT_PHONE_HEIGHT_M, ARENA_MAX_DISTANCE), options.onModeChange);
  } else {
    try { await orientation.requestPermission(); }
    catch (error) { orientation.stop(); renderer.dispose(); scene.dispose(); throw error; }
    orientation.start(options.onModeChange);
  }

  let phoneHeight = DEFAULT_PHONE_HEIGHT_M;
  let videoFov = DEFAULT_VIDEO_VFOV_DEG;
  let running = true;
  let handle = 0;
  let lastFrameAt = 0;

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
  const sampler = video ? document.createElement('canvas') : null;
  if (sampler) {
    sampler.width = 8;
    sampler.height = 6;
  }
  const samplerCtx = sampler?.getContext('2d', { willReadFrequently: true }) ?? null;
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

  // O céu do Coliseu acompanha a hora do aparelho e o clima (uma vez por segundo, e só mexe no CSS se a cor mudou).
  const skyEl = virtual ? (options.sky ?? null) : null;
  let lastSky = -Infinity;
  let paintedSky = '';
  const clearSky = () => {
    if (!skyEl) return;
    skyEl.style.removeProperty('background');
    skyEl.style.removeProperty('--stars');
    paintedSky = '';
  };
  const updateSky = (now: number) => {
    if (!virtual || now - lastSky < 1000) return;
    lastSky = now;
    if (!effectiveVisual.value.lighting) {
      scene.setDaylight(1, 1, 1, 0);
      clearSky();
      return;
    }
    const weather = scene.weatherNow?.state;
    const look = skyFor(hourOf(new Date()), weather?.cloud ?? 0, weather?.rain ?? 0);
    scene.setDaylight(look.ambient[0], look.ambient[1], look.ambient[2], look.night);
    const background = `linear-gradient(180deg, ${look.top} 0%, ${look.mid} 40%, ${look.low} 100%)`;
    if (!skyEl || background === paintedSky) return;
    paintedSky = background;
    skyEl.style.background = background;
    skyEl.style.setProperty('--stars', look.stars.toFixed(2));
  };

  // Movimento reduzido vem do sistema e pode mudar com a tela aberta.
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  const applyMotion = () => scene.setCalm(motionQuery?.matches === true);
  applyMotion();
  motionQuery?.addEventListener?.('change', applyMotion);

  const tick = (now: number) => {
    if (!running) return;
    handle = requestGameFrame(tick, maxVisualFps);
    if (document.hidden) return;
    const fps = effectiveVisual.value.frameRate === 'auto' ? 0 : Number(effectiveVisual.value.frameRate);
    if (!isFrameDue(now, lastFrameAt, fps)) return;
    lastFrameAt = now;
    sampleAmbient(now);
    updateSky(now);
    orientation.latencyMs = sensorSettings.latencyMs;
    scene.setCameraQuaternion(orientation.read(performance.now()));
    scene.setCinematicShadows(effectiveVisual.value.renderProfile === 'cinema' && effectiveVisual.value.shadow && !effectiveVisual.value.rotomMode);
    scene.update(now);
    renderer.render(scene.scene, scene.camera);
  };
  const onVisibility = () => {
    scene.resetClock();
    lastFrameAt = 0;
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
    setCreatures: (entries) => scene.setCreatures(entries, { entrance: true }),
    setMode: (mode) => scene.setMode(mode),
    setSmoothing: (mode) => scene.setSmoothing(mode),
    setLighting: (on) => scene.setLighting(on),
    setTerrain: (on) => scene.setTerrain(on),
    setScenery: (on) => scene.setScenery(on),
    setSocial: (on) => scene.setSocial(on),
    setWeather: (mode) => scene.setWeather(mode),
    setPhoneHeight(meters) {
      // No palco virtual a câmera tem uma altura só (a pose da visão e o cenário dependem dela).
      if (!virtual) phoneHeight = meters;
    },
    // No palco virtual a caixa tem um limite de tamanho (o cenário e a câmera fixa precisam caber).
    setHalfSize: (meters) => scene.setHalfSize(virtual ? virtualHalfSize(meters) : meters),
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
      motionQuery?.removeEventListener?.('change', applyMotion);
      clearSky();
      orientation.stop();
      scene.dispose();
      renderer.dispose();
    },
  };
}

export { DEFAULT_HALF_SIZE_M };
