import { AmbientLight, BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector2, Vector3, NearestFilter, Raycaster } from 'three';
import { DEFAULT_PHONE_HEIGHT_M, FLOOR_MESSAGES, intersectFloor } from '../box/floor';
import { visibleVerticalFov } from '../box/orientation';
import { OrientationSource } from '../box/orientation-source';
import type { OrientationMode } from '../box/orientation-source';
import { VILLAGE_DIORAMA_DEPTH_M, VILLAGE_DIORAMA_WIDTH_M, normalizeVillageScale, villageMinimumDistance } from '../core/village/ar-diorama';
import { createWebglBackend } from './webgl-backend';

export { VILLAGE_DIORAMA_DEPTH_M, VILLAGE_DIORAMA_WIDTH_M } from '../core/village/ar-diorama';

export interface StartVillageArOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  /** Canvas 2D que a Vila já atualiza; vira a textura viva do diorama. */
  villageCanvas: HTMLCanvasElement;
  onModeChange?: (mode: OrientationMode) => void;
}

export type VillagePlacement = { ok: true; moved: boolean } | { ok: false; message: string };

export interface RunningVillageAr {
  readonly orientation: OrientationSource;
  placeAt(ndcX: number, ndcY: number): VillagePlacement;
  /** Reposiciona a mesa na direção atual, útil depois de mudar de lugar. */
  recenter(): VillagePlacement;
  /** Aproxima a âncora existente sem deixar a borda do diorama atravessar a câmera. */
  bringCloser(): VillagePlacement;
  /** Muda o zoom físico sem reiniciar a câmera ou perder a âncora atual. */
  setScale(scale: number): number;
  getScale(): number;
  isAnchored(): boolean;
  lookBy(dx: number, dy: number): void;
  resize(): void;
  stop(): void;
}

/**
 * Diorama da Vila sobre a câmera. Não afirma detectar mesa ou chão: a orientação fornece o plano horizontal
 * estimado e o toque do usuário escolhe onde colocá-lo. A âncora fica estável enquanto a câmera está aberta,
 * permitindo girar e inclinar a visão com o giroscópio; sem AR espacial/SLAM ela precisa ser refeita na próxima sessão.
 */
export async function startVillageAr(options: StartVillageArOptions): Promise<RunningVillageAr> {
  const scene = new Scene();
  scene.background = null;
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 0);
  scene.add(new AmbientLight(new Color(0xffffff), 1));

  const texture = new CanvasTexture(options.villageCanvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = 'srgb';
  const root = new Group();
  root.visible = false;
  const base = new Mesh(
    new BoxGeometry(VILLAGE_DIORAMA_WIDTH_M + 0.1, 0.08, VILLAGE_DIORAMA_DEPTH_M + 0.1),
    new MeshBasicMaterial({ color: 0x1c3642, transparent: true, opacity: 0.92 }),
  );
  base.position.y = -0.04;
  const map = new Mesh(
    new PlaneGeometry(VILLAGE_DIORAMA_WIDTH_M, VILLAGE_DIORAMA_DEPTH_M),
    new MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.01 }),
  );
  map.rotation.x = -Math.PI / 2;
  map.position.y = 0.003;
  root.add(base, map);
  scene.add(root);

  const renderer = createWebglBackend(options.canvas);
  const orientation = new OrientationSource();
  await orientation.requestPermission();
  orientation.start(options.onModeChange);
  const raycaster = new Raycaster();
  let running = true;
  let handle = 0;
  let phoneHeight = DEFAULT_PHONE_HEIGHT_M;
  let scale = normalizeVillageScale(0.72);

  const horizontalDirection = (point: Vector3, forward: Vector3): Vector3 => {
    const direction = new Vector3(point.x, 0, point.z);
    if (direction.lengthSq() < 0.0225) direction.set(forward.x, 0, forward.z);
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, -1);
    return direction.normalize();
  };

  const keepVillageAway = (point: Vector3, forward: Vector3): { point: Vector3; moved: boolean } => {
    const minimum = villageMinimumDistance(scale);
    const distance = Math.hypot(point.x, point.z);
    if (distance >= minimum) return { point: point.clone(), moved: false };
    const direction = horizontalDirection(point, forward);
    return { point: new Vector3(direction.x * minimum, point.y, direction.z * minimum), moved: true };
  };

  const resize = () => {
    const width = options.container.clientWidth;
    const height = options.container.clientHeight;
    if (width <= 0 || height <= 0) return;
    const videoAspect = options.video.videoWidth > 0 && options.video.videoHeight > 0 ? options.video.videoWidth / options.video.videoHeight : width / height;
    camera.aspect = width / height;
    camera.fov = visibleVerticalFov(63, videoAspect, width / height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(options.container);
  options.video.addEventListener('loadedmetadata', resize);
  resize();

  const placeAt = (ndcX: number, ndcY: number): VillagePlacement => {
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
    const floor = intersectFloor(raycaster.ray.direction, phoneHeight);
    if (!floor.ok) return { ok: false, message: FLOOR_MESSAGES[floor.reason] };
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const kept = keepVillageAway(floor.point, forward);
    root.position.copy(kept.point);
    // Gira só no eixo vertical, mantendo a planta horizontal e a frente da Vila voltada para quem a posicionou.
    root.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI;
    root.visible = true;
    return { ok: true, moved: kept.moved };
  };

  const bringCloser = (): VillagePlacement => {
    if (!root.visible) return placeAt(0, 0);
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const direction = horizontalDirection(root.position, forward);
    const minimum = villageMinimumDistance(scale);
    const wasFarther = Math.hypot(root.position.x, root.position.z) > minimum + 0.01;
    root.position.x = direction.x * minimum;
    root.position.z = direction.z * minimum;
    return { ok: true, moved: wasFarther };
  };

  const setScale = (next: number): number => {
    scale = normalizeVillageScale(next);
    root.scale.setScalar(scale);
    // Um zoom maior nunca deixa a cidade invadir a câmera.
    if (root.visible) bringCloser();
    return scale;
  };
  setScale(scale);

  const tick = (now: number) => {
    if (!running) return;
    handle = requestAnimationFrame(tick);
    camera.quaternion.copy(orientation.read(now));
    camera.updateMatrixWorld(true);
    texture.needsUpdate = true;
    renderer.render(scene, camera);
  };
  handle = requestAnimationFrame(tick);

  return {
    orientation,
    placeAt,
    recenter: () => placeAt(0, 0),
    bringCloser,
    setScale,
    getScale: () => scale,
    isAnchored: () => root.visible,
    lookBy: (dx, dy) => orientation.lookBy(dx, dy),
    resize,
    stop() {
      running = false;
      cancelAnimationFrame(handle);
      observer.disconnect();
      options.video.removeEventListener('loadedmetadata', resize);
      orientation.stop();
      texture.dispose();
      base.geometry.dispose();
      (base.material as MeshBasicMaterial).dispose();
      map.geometry.dispose();
      (map.material as MeshBasicMaterial).dispose();
      renderer.dispose();
    },
  };
}
