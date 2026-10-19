import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  MathUtils,
  NoToneMapping,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Raycaster,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Material, Texture } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BADGE_DESIGNS, counterClockwise, polishLook, slotPosition } from '../core/badges';
import type { BadgeDesign, Point } from '../core/badges';
import { isResting, restingWobble, secondDerivative, shakeOffset, stepWobble } from '../core/badge-wobble';
import type { Wobble } from '../core/badge-wobble';
import { drawBadgeFace, drawBadgeMask } from './badge-art';
import { effectiveVisual, maxVisualFps } from '../app/visual-settings';
import { isFrameDue } from '../core/frame-rate';
import { cancelGameFrame, requestGameFrame } from '../app/frame-scheduler';

/**
 * Maleta de insígnias em 3D: couro vermelho, cantos e fecho dourados, forro de veludo azul-marinho com 8 encaixes.
 * Só as insígnias conquistadas ficam nos encaixes; as outras aparecem como encaixe vazio. Tudo é gerado por código
 * (nada de modelo 3D). Interações: arrastar gira a maleta; esfregar uma insígnia pole; girar rápido, o botão
 * Chacoalhar ou sacudir o celular fazem as insígnias balançarem e baterem nos encaixes.
 * Entra só por `import()` dinâmico (Treinador › Liga › Abrir a maleta).
 */

export interface BadgeCaseOptions {
  canvas: HTMLCanvasElement;
  designs?: readonly BadgeDesign[];
  /** Nome da região da Liga, mostrado no forro da tampa. */
  regionName?: string;
  /** Ginásios vencidos (ordens). Só esses ganham insígnia no encaixe. */
  won: readonly number[];
  /** Brilho atual de cada insígnia conquistada (0 a 1). */
  polish: (order: number) => number;
  /** Esfregada de `distance` diâmetros numa insígnia; devolve o brilho novo. */
  onRub: (order: number, distance: number) => number;
  /** Insígnia sob o dedo (ou null quando o dedo sai). */
  onFocus?: (order: number | null) => void;
  /** Reflexos do metal, sombras e faíscas (pesam na GPU). */
  fx: boolean;
  sound: boolean;
}

export interface RunningBadgeCase {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  shake(): void;
  /** Volta a maleta para a posição inicial. */
  recenter(): void;
  setFx(on: boolean): void;
  setSound(on: boolean): void;
  resize(): void;
  stop(): void;
}

// Medidas em unidades de cena (1 ≈ 20 cm).
const W = 2.3;
const D = 1.46;
const BASE_H = 0.24;
const LID_H = 0.14;
const BADGE_R = 0.21;
const CLEARANCE = 0.04;
const OPEN_ANGLE = -1.9;
/** Altura do forro: um pouco acima do topo da base, para as superfícies não brigarem na profundidade. */
const LINING_Y = BASE_H + 0.006;

/** Aceleração (unidades/s²) para aceleração no encaixe (folgas/s²): ajustado a olho para o balanço parecer de metal leve. */
const ACCEL_GAIN = 2.2;
const TILT_GAIN = 140;
const DEVICE_GAIN = 22;

function slotWorld(order: number): { x: number; z: number } {
  const s = slotPosition(order);
  return { x: s.x * 1.18, z: -s.y * 0.78 + 0.06 };
}

function shapeOf(points: readonly Point[], scale = 1): Shape {
  const pts = counterClockwise(points);
  const shape = new Shape();
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x * scale, y * scale) : shape.lineTo(x * scale, y * scale)));
  shape.closePath();
  return shape;
}

/** Textura de couro: granulado claro/escuro sobre o vermelho (vira mapa de cor e de relevo). */
function leatherTexture(size = 256): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9c1f1b';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? `rgba(255,170,150,${0.05 + Math.random() * 0.06})` : `rgba(40,0,0,${0.08 + Math.random() * 0.1})`;
    const r = 0.6 + Math.random() * 1.8;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 2);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Veludo do forro, com o título da Liga em dourado na tampa. */
function velvetTexture(title: string | null, subtitle = ''): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(256, 160, 20, 256, 160, 330);
  g.addColorStop(0, '#26336b');
  g.addColorStop(1, '#121a3d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '120,140,220' : '0,0,20'},${0.04 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 1.5, 1.5);
  }
  if (title) {
    ctx.strokeStyle = 'rgba(232,196,104,0.75)';
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, c.width - 52, c.height - 52);
    ctx.fillStyle = 'rgba(240,206,120,0.9)';
    ctx.font = '600 40px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, c.width / 2, c.height / 2 - 18);
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText(subtitle, c.width / 2, c.height / 2 + 30);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Som curto de metal batendo (duas parciais agudas que somem rápido). */
class Clinker {
  private ctx: AudioContext | null = null;
  private last = 0;
  play(strength: number): void {
    const now = performance.now();
    if (now - this.last < 45) return;
    this.last = now;
    try {
      this.ctx ??= new AudioContext();
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.05 + 0.18 * strength, t);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.18);
      gain.connect(ctx.destination);
      for (const f of [2300 + Math.random() * 900, 5100 + Math.random() * 1300]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.connect(gain);
        o.start(t);
        o.stop(t + 0.2);
      }
    } catch {
      // Sem áudio no navegador: só fica sem o tilintar.
    }
  }
  dispose(): void {
    void this.ctx?.close().catch(() => undefined);
  }
}

interface BadgeNode {
  order: number;
  design: BadgeDesign;
  group: Group;
  mesh: Mesh;
  face: MeshStandardMaterial;
  side: MeshStandardMaterial;
  canvas: HTMLCanvasElement;
  designs?: readonly BadgeDesign[];
  texture: CanvasTexture;
  polish: number;
  drawnPolish: number;
  wobble: Wobble;
}

export async function startBadgeCase(options: BadgeCaseOptions): Promise<RunningBadgeCase> {
  const { canvas } = options;
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 50);
  const pmrem = new PMREMGenerator(renderer);
  let envMap: Texture | null = null;

  const hemi = new HemisphereLight(0xfff4e0, 0x202040, 1.1);
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(-1.6, 4.2, 2.4);
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 2;
  key.shadow.camera.bottom = -2;
  key.shadow.bias = -0.0008;
  key.shadow.radius = 3;
  scene.add(hemi, key);

  // Maleta: grupo que gira; dentro, o grupo da chacoalhada.
  const turn = new Group();
  const shakeGroup = new Group();
  turn.add(shakeGroup);
  scene.add(turn);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const leather = keep(new MeshStandardMaterial({ color: 0xffffff, map: keep(leatherTexture()), roughness: 0.62, metalness: 0 }));
  const gold = keep(new MeshStandardMaterial({ color: 0xd9a63a, roughness: 0.28, metalness: 1 }));
  const velvet = keep(new MeshStandardMaterial({ map: keep(velvetTexture(null)), roughness: 1, metalness: 0 }));
  const socketMat = keep(new MeshStandardMaterial({ color: 0x0b1130, roughness: 1, metalness: 0 }));
  const rimMat = keep(new MeshStandardMaterial({ color: 0x3a4a8a, roughness: 0.9, metalness: 0 }));

  // Base: caixa de couro com o forro afundado.
  const base = new Mesh(keep(new RoundedBoxGeometry(W, BASE_H, D, 3, 0.05)), leather);
  base.position.y = BASE_H / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  shakeGroup.add(base);
  const lining = new Mesh(keep(new PlaneGeometry(W - 0.16, D - 0.16)), velvet);
  lining.rotation.x = -Math.PI / 2;
  lining.position.y = LINING_Y;
  lining.receiveShadow = true;
  shakeGroup.add(lining);

  // Cantos dourados (base e tampa) e fecho.
  const cornerGeo = keep(new RoundedBoxGeometry(0.16, 0.1, 0.16, 2, 0.03));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const c = new Mesh(cornerGeo, gold);
      c.position.set(sx * (W / 2 - 0.05), 0.04, sz * (D / 2 - 0.05));
      c.castShadow = true;
      shakeGroup.add(c);
    }
  }
  const claspBase = new Mesh(keep(new RoundedBoxGeometry(0.3, 0.12, 0.05, 2, 0.02)), gold);
  claspBase.position.set(0, BASE_H - 0.07, D / 2 + 0.01);
  shakeGroup.add(claspBase);
  const handle = new Mesh(keep(new TorusGeometry(0.22, 0.035, 10, 24, Math.PI)), leather);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, BASE_H - 0.02, D / 2 + 0.02);
  shakeGroup.add(handle);

  // Encaixes: a silhueta de cada insígnia afundada no veludo (vazia ou com a insígnia).
  for (const design of options.designs ?? BADGE_DESIGNS) {
    const { x, z } = slotWorld(design.order);
    const rim = new Mesh(keep(new ShapeGeometry(shapeOf(design.outline, BADGE_R * 1.2))), rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(x, LINING_Y + 0.005, z);
    rim.receiveShadow = true;
    shakeGroup.add(rim);
    const socket = new Mesh(keep(new ShapeGeometry(shapeOf(design.outline, BADGE_R * 1.1))), socketMat);
    socket.rotation.x = -Math.PI / 2;
    socket.position.set(x, LINING_Y + 0.01, z);
    socket.receiveShadow = true;
    shakeGroup.add(socket);
  }

  // Tampa: gira na borda de trás.
  const lidPivot = new Group();
  lidPivot.position.set(0, BASE_H, -D / 2);
  shakeGroup.add(lidPivot);
  const lid = new Mesh(keep(new RoundedBoxGeometry(W, LID_H, D, 3, 0.05)), leather);
  lid.position.set(0, LID_H / 2, D / 2);
  lid.castShadow = true;
  lidPivot.add(lid);
  const lidLining = new Mesh(keep(new PlaneGeometry(W - 0.16, D - 0.16)), keep(new MeshStandardMaterial({ map: keep(velvetTexture('Liga Pokémon', options.regionName ? `Insígnias de ${options.regionName}` : 'Insígnias regionais')), roughness: 1 })));
  lidLining.rotation.x = Math.PI / 2;
  lidLining.position.set(0, -0.002, D / 2);
  lidPivot.add(lidLining);
  for (const sx of [-1, 1]) {
    const c = new Mesh(cornerGeo, gold);
    c.position.set(sx * (W / 2 - 0.05), LID_H - 0.03, D - 0.05);
    lidPivot.add(c);
  }
  const claspLid = new Mesh(keep(new RoundedBoxGeometry(0.22, 0.08, 0.06, 2, 0.02)), gold);
  claspLid.position.set(0, 0.03, D + 0.01);
  lidPivot.add(claspLid);

  // Insígnias conquistadas.
  const nodes: BadgeNode[] = [];
  const won = new Set(options.won);
  for (const design of options.designs ?? BADGE_DESIGNS) {
    if (!won.has(design.order)) continue;
    const geo = keep(new ExtrudeGeometry(shapeOf(design.outline), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 4 }));
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const texture = keep(new CanvasTexture(c));
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    // As UVs da face são as coordenadas do desenho (-1 a 1): leva para 0 a 1.
    texture.repeat.set(0.5, 0.5);
    texture.offset.set(0.5, 0.5);
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskCanvas.height = 128;
    drawBadgeMask(maskCanvas, design);
    const mask = keep(new CanvasTexture(maskCanvas));
    mask.wrapS = mask.wrapT = ClampToEdgeWrapping;
    mask.repeat.set(0.5, 0.5);
    mask.offset.set(0.5, 0.5);
    const face = keep(new MeshStandardMaterial({ map: texture, metalnessMap: mask, roughnessMap: mask, metalness: design.metal.metalness, roughness: design.metal.roughness }));
    const side = keep(new MeshStandardMaterial({ color: new Color(design.metal.base), metalness: design.metal.metalness, roughness: design.metal.roughness }));
    if (design.translucent) {
      face.transparent = side.transparent = true;
      face.opacity = 0.9;
      side.opacity = 0.82;
    }
    const mesh = new Mesh(geo, [face, side]);
    mesh.scale.setScalar(BADGE_R);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    mesh.userData.order = design.order;
    const group = new Group();
    const { x, z } = slotWorld(design.order);
    group.position.set(x, LINING_Y + 0.02, z);
    group.add(mesh);
    shakeGroup.add(group);
    const polish = options.polish(design.order);
    nodes.push({ order: design.order, design, group, mesh, face, side, canvas: c, texture, polish, drawnPolish: -1, wobble: restingWobble() });
  }
  const meshes = nodes.map((n) => n.mesh);

  // Faíscas do polimento.
  const SPARKS = 40;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkGeo = keep(new BufferGeometry());
  sparkGeo.setAttribute('position', new BufferAttribute(sparkPos, 3));
  const sparkMat = keep(new PointsMaterial({ color: 0xfff6d0, size: 0.045, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false }));
  const sparks = new Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  shakeGroup.add(sparks);
  let sparkCursor = 0;
  function emitSpark(at: Vector3): void {
    const i = sparkCursor++ % SPARKS;
    sparkPos.set([at.x, at.y + 0.02, at.z], i * 3);
    sparkVel.set([(Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6], i * 3);
    sparkLife[i] = 0.5 + Math.random() * 0.3;
  }

  const clinker = new Clinker();
  let fx = options.fx;
  let sound = options.sound;

  function applyFx(): void {
    if (fx && !envMap) envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = fx ? envMap : null;
    renderer.toneMapping = fx ? ACESFilmicToneMapping : NoToneMapping;
    renderer.shadowMap.enabled = fx;
    key.castShadow = fx;
    hemi.intensity = fx ? 0.45 : 1.3;
    key.intensity = fx ? 1.7 : 2.4;
    scene.environmentIntensity = 0.75;
    renderer.toneMappingExposure = 0.9;
    sparks.visible = fx;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, fx ? 2 : 1.25));
    // Sem o reflexo do ambiente, metal puro fica preto: abaixa o metal para a cor aparecer.
    for (const n of nodes) {
      const m = fx ? n.design.metal.metalness : Math.min(0.5, n.design.metal.metalness);
      n.face.metalness = n.side.metalness = m;
    }
    gold.metalness = fx ? 1 : 0.55;
    for (const m of [leather, gold, velvet, socketMat, rimMat, ...nodes.flatMap((n) => [n.face, n.side])] as Material[]) m.needsUpdate = true;
    resize();
    dirty = true;
  }

  function refreshBadge(n: BadgeNode): void {
    const look = polishLook(n.design, n.polish);
    n.face.roughness = n.side.roughness = look.roughness;
    n.face.envMapIntensity = n.side.envMapIntensity = 0.6 + 0.9 * look.gleam;
    if (Math.abs(n.drawnPolish - n.polish) > 0.015) {
      drawBadgeFace(n.canvas, n.design, n.polish);
      n.texture.needsUpdate = true;
      n.drawnPolish = n.polish;
    }
  }
  nodes.forEach(refreshBadge);

  // Estado da maleta.
  const HOME_YAW = -0.12;
  let yaw = HOME_YAW;
  let homing = false;
  let pitch = 0;
  let yawVel = 0;
  let lidAngle = 0;
  let lidTarget = OPEN_ANGLE;
  let shakeStart = -1;
  const yawHist = [yaw, yaw];
  const shakeHist = [0, 0];
  let deviceAccel = { x: 0, y: 0 };
  let dirty = true;
  let running = true;
  let handle_ = 0;
  let last = performance.now();
  let time = 0;

  function resize(): void {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Em pé (celular), afasta a câmera para a maleta caber na largura.
    const fit = Math.max(1, 1.32 / camera.aspect);
    camera.position.set(0, 3.1 * fit, 2.9 * fit);
    camera.lookAt(0, 0.3, 0.05);
    camera.updateProjectionMatrix();
    dirty = true;
  }

  // Toque: girar (fora das insígnias) ou polir (sobre uma insígnia).
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  type Drag = { id: number; mode: 'turn' | 'polish'; x: number; y: number; t: number; node: BadgeNode | null; moved: number };
  let drag: Drag | null = null;

  function hitAt(clientX: number, clientY: number): { node: BadgeNode; point: Vector3 } | null {
    if (lidAngle > OPEN_ANGLE * 0.6) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const node = nodes.find((n) => n.mesh === hit.object);
    return node ? { node, point: shakeGroup.worldToLocal(hit.point.clone()) } : null;
  }

  /** Diâmetro da insígnia na tela, em pixels (para medir a esfregada em "insígnias"). */
  function badgePixels(n: BadgeNode): number {
    const a = n.group.getWorldPosition(new Vector3());
    const b = a.clone().add(new Vector3(BADGE_R * 2, 0, 0));
    a.project(camera);
    b.project(camera);
    return Math.max(8, (Math.hypot(b.x - a.x, b.y - a.y) / 2) * canvas.clientWidth);
  }

  function onDown(e: PointerEvent): void {
    if (drag) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ponteiro que o navegador já soltou: segue sem captura.
    }
    const hit = hitAt(e.clientX, e.clientY);
    homing = false;
    drag = { id: e.pointerId, mode: hit ? 'polish' : 'turn', x: e.clientX, y: e.clientY, t: performance.now(), node: hit?.node ?? null, moved: 0 };
    if (hit) options.onFocus?.(hit.node.order);
    yawVel = 0;
  }

  function onMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const now = performance.now();
    const dt = Math.max(1, now - drag.t) / 1000;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.t = now;
    drag.moved += Math.hypot(dx, dy);
    if (drag.mode === 'turn') {
      yaw += dx * 0.011;
      pitch = MathUtils.clamp(pitch + dy * 0.006, -0.55, 0.5);
      yawVel = (dx * 0.011) / dt;
      dirty = true;
      return;
    }
    const hit = hitAt(e.clientX, e.clientY);
    if (!hit || hit.node !== drag.node) return;
    const n = hit.node;
    const dist = Math.hypot(dx, dy) / badgePixels(n);
    n.polish = options.onRub(n.order, dist);
    refreshBadge(n);
    if (fx && Math.random() < Math.min(1, dist * 6)) emitSpark(hit.point);
    dirty = true;
  }

  function onUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.id) return;
    const tap = drag.moved < 8;
    const wasTurn = drag.mode === 'turn';
    if (drag.mode === 'polish') options.onFocus?.(null);
    drag = null;
    // Toque rápido na maleta fechada abre.
    if (tap && wasTurn && lidTarget === 0) api.open();
  }

  function onMotion(e: DeviceMotionEvent): void {
    const a = e.acceleration;
    if (!a || a.x === null || a.y === null) return;
    deviceAccel = { x: (a.x ?? 0) * DEVICE_GAIN, y: -(a.y ?? 0) * DEVICE_GAIN };
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  window.addEventListener('devicemotion', onMotion);

  function frame(now: number): void {
    if (!running) return;
    handle_ = requestGameFrame(frame, maxVisualFps);
    const fps = effectiveVisual.value.frameRate === 'auto' ? 0 : Number(effectiveVisual.value.frameRate);
    if (!isFrameDue(now, last, fps)) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    time += dt;

    if (homing && !drag) {
      // O caminho mais curto até a frente.
      const target = HOME_YAW + Math.round((yaw - HOME_YAW) / (Math.PI * 2)) * Math.PI * 2;
      const k = Math.min(1, dt * 6);
      yaw += (target - yaw) * k;
      pitch += (0 - pitch) * k;
      if (Math.abs(target - yaw) < 0.002 && Math.abs(pitch) < 0.002) homing = false;
      dirty = true;
    }
    // Inércia do giro depois de soltar.
    if (!drag && Math.abs(yawVel) > 0.01) {
      yaw += yawVel * dt;
      yawVel *= Math.pow(0.04, dt);
      dirty = true;
    }
    // Tampa.
    if (Math.abs(lidAngle - lidTarget) > 0.001) {
      lidAngle += (lidTarget - lidAngle) * Math.min(1, dt * 5);
      dirty = true;
    }
    // Chacoalhada do botão.
    let sx = 0;
    let roll = 0;
    if (shakeStart >= 0) {
      const s = shakeOffset(time - shakeStart);
      if (s) {
        sx = s.x * W;
        roll = s.roll;
      } else shakeStart = -1;
      dirty = true;
    }

    // Aceleração que as insígnias sentem: giro (tangencial), chacoalhada, inclinação (gravidade) e o celular sacudido.
    const yawAcc = secondDerivative(yawHist[0]!, yawHist[1]!, yaw, dt);
    const shakeAcc = secondDerivative(shakeHist[0]!, shakeHist[1]!, sx, dt);
    yawHist[0] = yawHist[1]!;
    yawHist[1] = yaw;
    shakeHist[0] = shakeHist[1]!;
    shakeHist[1] = sx;
    const tiltX = Math.sin(roll) * TILT_GAIN;
    const tiltY = Math.sin(pitch) * TILT_GAIN * 0.4;
    let moving = false;
    for (const n of nodes) {
      const { x, z } = slotWorld(n.order);
      const ax = (shakeAcc - yawAcc * z * 0.6) * ACCEL_GAIN + tiltX + deviceAccel.x;
      const ay = (yawAcc * x * 0.6) * ACCEL_GAIN + tiltY + deviceAccel.y;
      // A física roda por insígnia (com a fase da ordem, para cada uma balançar do seu jeito).
      const clinks = stepWobble([n.wobble], { x: ax, y: ay }, dt, [n.order]);
      if (sound) for (const c of clinks) clinker.play(c.strength);
      const w = n.wobble;
      n.group.position.x = x + w.x * CLEARANCE;
      n.group.position.z = z + w.y * CLEARANCE;
      n.group.rotation.z = MathUtils.clamp(-w.vx * 0.012, -0.3, 0.3);
      n.group.rotation.x = MathUtils.clamp(w.vy * 0.012, -0.3, 0.3);
      if (!isResting(w)) moving = true;
    }
    deviceAccel = { x: deviceAccel.x * 0.5, y: deviceAccel.y * 0.5 };
    if (moving) dirty = true;

    // Faíscas.
    let sparking = false;
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i]! <= 0) continue;
      sparking = true;
      sparkLife[i] = sparkLife[i]! - dt;
      sparkPos[i * 3] = sparkPos[i * 3]! + sparkVel[i * 3]! * dt;
      sparkPos[i * 3 + 1] = sparkPos[i * 3 + 1]! + sparkVel[i * 3 + 1]! * dt;
      sparkPos[i * 3 + 2] = sparkPos[i * 3 + 2]! + sparkVel[i * 3 + 2]! * dt;
      sparkVel[i * 3 + 1] = sparkVel[i * 3 + 1]! - 1.4 * dt;
      if (sparkLife[i]! <= 0) sparkPos[i * 3 + 1] = -99;
    }
    if (sparking) {
      sparkGeo.attributes.position!.needsUpdate = true;
      dirty = true;
    }
    // Insígnias bem polidas cintilam de vez em quando (só com reflexos ligados).
    if (fx) {
      for (const n of nodes) {
        if (n.polish < 0.75) continue;
        const twinkle = Math.max(0, Math.sin(time * 1.3 + n.order * 2.1)) ** 24;
        n.face.emissive.setRGB(twinkle * 0.25, twinkle * 0.22, twinkle * 0.15);
        if (twinkle > 0.001) dirty = true;
      }
    }

    if (!dirty) return;
    dirty = false;
    turn.rotation.set(0.32 + pitch, yaw, 0);
    shakeGroup.position.x = sx;
    shakeGroup.rotation.z = roll;
    lidPivot.rotation.x = lidAngle;
    renderer.render(scene, camera);
  }

  const api: RunningBadgeCase = {
    get isOpen() {
      return lidTarget !== 0;
    },
    open() {
      lidTarget = OPEN_ANGLE;
      dirty = true;
    },
    close() {
      lidTarget = 0;
      dirty = true;
    },
    toggle() {
      lidTarget = lidTarget === 0 ? OPEN_ANGLE : 0;
      dirty = true;
    },
    shake() {
      shakeStart = time;
      dirty = true;
    },
    recenter() {
      // Volta girando (um salto faria as insígnias baterem com força).
      homing = true;
      yawVel = 0;
      dirty = true;
    },
    setFx(on) {
      fx = on;
      applyFx();
    },
    setSound(on) {
      sound = on;
    },
    resize,
    stop() {
      running = false;
      cancelGameFrame(handle_);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      window.removeEventListener('devicemotion', onMotion);
      for (const d of disposables) d.dispose();
      envMap?.dispose();
      pmrem.dispose();
      clinker.dispose();
      renderer.dispose();
    },
  };

  applyFx();
  // Abre devagar ao entrar (a maleta começa fechada).
  lidAngle = 0;
  handle_ = requestGameFrame(frame, maxVisualFps);
  return api;
}

