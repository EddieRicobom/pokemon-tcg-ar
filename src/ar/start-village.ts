import { BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector2, Vector3, NearestFilter, Raycaster } from 'three';
import { DEFAULT_PHONE_HEIGHT_M, FLOOR_MESSAGES, intersectFloor } from '../box/floor';
import { visibleVerticalFov } from '../box/orientation';
import { OrientationSource } from '../box/orientation-source';
import type { OrientationMode } from '../box/orientation-source';
import { VILLAGE_AR_TILT_DEG, VILLAGE_DIORAMA_DEPTH_M, VILLAGE_DIORAMA_WIDTH_M, normalizeVillageScale } from '../core/village/ar-diorama';
import { createWebglBackend } from './webgl-backend';
import { maxVisualFps } from '../app/visual-settings';
import { isFrameDue } from '../core/frame-rate';
import { cancelGameFrame, requestGameFrame } from '../app/frame-scheduler';

export { VILLAGE_AR_TILT_DEG, VILLAGE_DIORAMA_DEPTH_M, VILLAGE_DIORAMA_WIDTH_M } from '../core/village/ar-diorama';

export interface StartVillageArOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  /** Chão e recortes são renderizados separadamente para formar o diorama. */
  villageFloorCanvas: HTMLCanvasElement;
  villagePropsCanvas: HTMLCanvasElement;
  onModeChange?: (mode: OrientationMode) => void;
}

export type VillagePlacement = { ok: true } | { ok: false; message: string };

export interface RunningVillageAr {
  readonly orientation: OrientationSource;
  placeAt(ndcX: number, ndcY: number): VillagePlacement;
  /** Reposiciona a Vila no ponto indicado pelo toque. */
  recenter(): VillagePlacement;
  /** Muda o tamanho físico sem reiniciar a câmera nem deslocar a âncora atual. */
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
  const textureFor = (canvas: HTMLCanvasElement) => {
    const texture = new CanvasTexture(canvas);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.colorSpace = 'srgb';
    return texture;
  };
  const floorTexture = textureFor(options.villageFloorCanvas);
  const propsTexture = textureFor(options.villagePropsCanvas);
  const root = new Group();
  root.visible = false;
  const base = new Mesh(
    new BoxGeometry(VILLAGE_DIORAMA_WIDTH_M + 0.12, 0.14, VILLAGE_DIORAMA_DEPTH_M + 0.12),
    new MeshBasicMaterial({ color: 0x172b39, transparent: true, opacity: 0.84 }),
  );
  base.position.y = -0.07;
  const floor = new Mesh(
    new PlaneGeometry(VILLAGE_DIORAMA_WIDTH_M, VILLAGE_DIORAMA_DEPTH_M),
    new MeshBasicMaterial({ map: floorTexture }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.008;
  // A camada transparente contém apenas prédios, itens e personagens. Ela
  // recua a partir dos pés, criando altura e profundidade sem parede escura
  // nem filtro na imagem inteira da Vila.
  const propsHeight = VILLAGE_DIORAMA_DEPTH_M;
  const propsLean = (18 * Math.PI) / 180;
  const props = new Mesh(
    new PlaneGeometry(VILLAGE_DIORAMA_WIDTH_M, propsHeight),
    new MeshBasicMaterial({ map: propsTexture, transparent: true, alphaTest: 0.01, depthWrite: false }),
  );
  props.rotation.x = -propsLean;
  props.position.y = Math.cos(propsLean) * propsHeight / 2 + 0.012;
  root.add(base, floor, props);
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
    // Respeita exatamente o ponto escolhido, inclusive quando fica bem perto do celular.
    root.position.copy(floor.point);
    // A base fica paralela ao chão estimado. A profundidade é da camada de
    // recortes, portanto a Vila não vira uma placa vertical no espaço.
    root.rotation.order = 'YXZ';
    root.rotation.set((-VILLAGE_AR_TILT_DEG * Math.PI) / 180, Math.atan2(forward.x, forward.z) + Math.PI, 0);
    root.visible = true;
    return { ok: true };
  };

  const setScale = (next: number): number => {
    scale = normalizeVillageScale(next);
    root.scale.setScalar(scale);
    return scale;
  };
  setScale(scale);

  let lastFrameAt = 0;
  // O canvas da Vila é uma textura grande atualizada junto da câmera. Em
  // automático, 30 fps mantém o diorama fluido sem disputar 60 fps com o
  // vídeo e sem recarregar a textura inteira a cada frame da tela.
  const renderFps = (): number => {
    const configured = maxVisualFps();
    return configured > 0 ? configured : 30;
  };
  const tick = (now: number) => {
    if (!running) return;
    handle = requestGameFrame(tick, renderFps);
    const fps = renderFps();
    if (!isFrameDue(now, lastFrameAt, fps)) return;
    lastFrameAt = now;
    camera.quaternion.copy(orientation.read(now));
    camera.updateMatrixWorld(true);
    floorTexture.needsUpdate = true;
    propsTexture.needsUpdate = true;
    renderer.render(scene, camera);
  };
  handle = requestGameFrame(tick, renderFps);

  return {
    orientation,
    placeAt,
    recenter: () => placeAt(0, 0),
    setScale,
    getScale: () => scale,
    isAnchored: () => root.visible,
    lookBy: (dx, dy) => orientation.lookBy(dx, dy),
    resize,
    stop() {
      running = false;
      cancelGameFrame(handle);
      observer.disconnect();
      options.video.removeEventListener('loadedmetadata', resize);
      orientation.stop();
      floorTexture.dispose();
      propsTexture.dispose();
      base.geometry.dispose();
       (base.material as MeshBasicMaterial).dispose();
      floor.geometry.dispose();
       (floor.material as MeshBasicMaterial).dispose();
      props.geometry.dispose();
       (props.material as MeshBasicMaterial).dispose();
      renderer.dispose();
    },
  };
}

