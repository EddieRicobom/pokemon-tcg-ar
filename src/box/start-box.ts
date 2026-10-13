import { visibleVerticalFov } from './orientation';
import { OrientationSource } from './orientation-source';
import type { OrientationMode } from './orientation-source';
import { BoxScene, DEFAULT_HALF_SIZE_M } from './box-scene';
import type { CreatureEntry } from './box-scene';
import type { BoxCreature } from './creature';
import { DEFAULT_PHONE_HEIGHT_M, FLOOR_MESSAGES } from './floor';
import { createWebglBackend } from '../ar/webgl-backend';

/** Campo de visão vertical típico da câmera traseira de um celular em pé (ajustável na tela). */
export const DEFAULT_VIDEO_VFOV_DEG = 63;

export interface StartBoxOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  onModeChange?: (mode: OrientationMode) => void;
}

export type PlaceResult = { ok: true } | { ok: false; message: string };

export interface RunningBox {
  readonly orientation: OrientationSource;
  readonly scene: BoxScene;
  placeAt(ndcX: number, ndcY: number): PlaceResult;
  clearPlacement(): void;
  pick(ndcX: number, ndcY: number): BoxCreature | null;
  setCreatures(entries: CreatureEntry[]): void;
  setPhoneHeight(meters: number): void;
  setHalfSize(meters: number): void;
  setVideoFov(deg: number): void;
  resize(): void;
  stop(): void;
}

/** Ponto de entrada da Caixa: tudo que usa Three.js passa por aqui (import dinâmico). */
export async function startBox(options: StartBoxOptions): Promise<RunningBox> {
  const scene = new BoxScene();
  const renderer = createWebglBackend(options.canvas);
  const orientation = new OrientationSource();
  await orientation.requestPermission();
  orientation.start(options.onModeChange);

  let phoneHeight = DEFAULT_PHONE_HEIGHT_M;
  let videoFov = DEFAULT_VIDEO_VFOV_DEG;
  let running = true;
  let handle = 0;

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

  const tick = (now: number) => {
    if (!running) return;
    handle = requestAnimationFrame(tick);
    scene.setCameraQuaternion(orientation.read());
    scene.update(now);
    renderer.render(scene.scene, scene.camera);
  };
  handle = requestAnimationFrame(tick);

  return {
    orientation,
    scene,
    placeAt(ndcX, ndcY) {
      const result = scene.floorAt(ndcX, ndcY, phoneHeight);
      if (!result.ok) return { ok: false, message: FLOOR_MESSAGES[result.reason] };
      scene.place(result.point);
      return { ok: true };
    },
    clearPlacement: () => scene.clearPlacement(),
    pick: (x, y) => scene.pick(x, y),
    setCreatures: (entries) => scene.setCreatures(entries),
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
      scene.dispose();
      renderer.dispose();
    },
  };
}

export { DEFAULT_HALF_SIZE_M };
