import {
  ACESFilmicToneMapping,
  AmbientLight,
  AdditiveBlending,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  CanvasTexture,
  PlaneGeometry,
  Raycaster,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CatmullRomCurve3 } from 'three';
import { paintItemIcon } from '../village/item-art';
import { effectiveVisual, maxVisualFps } from '../app/visual-settings';
import { isFrameDue } from '../core/frame-rate';
import { cancelGameFrame, requestGameFrame } from '../app/frame-scheduler';
import { clampOrbit, homeSlot, planBackpack, qtyBadge, type BackpackItem } from '../core/backpack-layout';

export type { BackpackItem };

export interface BackpackOptions {
  canvas: HTMLCanvasElement;
  items: readonly BackpackItem[];
  fx: boolean;
  sound: boolean;
  /** Chamado quando o jogador seleciona (ou solta) um item tocando nele ou na lista. */
  onSelect?: (id: string | null) => void;
}

export interface RunningBackpack {
  shake(): void;
  recenter(): void;
  calibrate(): Promise<void>;
  /** Seleciona o item da lista (ou solta, se já estava selecionado). Falso se ele não está no 3D. */
  focusItem(id: string): boolean;
  setFx(on: boolean): void;
  setSound(on: boolean): void;
  resize(): void;
  stop(): void;
}

interface LooseItem {
  item: BackpackItem;
  sprite: Sprite;
  texture: CanvasTexture;
  velocity: Vector3;
  badge: Sprite | null;
  scale: number;
  appearAt: number;
}

const ITEM_SCALE = 0.31;
const SELECTED_SCALE = 0.4;

class Clinker {
  private ctx: AudioContext | null = null;
  private lastImpact = 0;
  private lastFabric = 0;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // O movimento continua funcionando se o navegador bloquear o áudio.
    }
  }

  playImpact(strength: number, kind: 'item' | 'wall' = 'item'): void {
    const now = performance.now();
    if (now - this.lastImpact < 82 || strength < 0.2) return;
    this.lastImpact = now;
    try {
      this.unlock();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      this.noise ??= (() => {
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.09), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        return buffer;
      })();
      // Each contact has a quiet, filtered thump plus a tiny textured click.
      const click = ctx.createBufferSource();
      click.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = kind === 'item' ? 1250 : 720;
      filter.Q.value = 0.8;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.0001, t);
      clickGain.gain.linearRampToValueAtTime(0.008 + strength * 0.026, t + 0.004);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
      click.connect(filter).connect(clickGain).connect(ctx.destination);
      click.start(t);
      click.stop(t + 0.09);
      const tap = ctx.createOscillator();
      const tapGain = ctx.createGain();
      tap.type = kind === 'item' ? 'triangle' : 'sine';
      tap.frequency.setValueAtTime((kind === 'item' ? 245 : 165) + Math.random() * 65, t);
      tap.frequency.exponentialRampToValueAtTime(kind === 'item' ? 105 : 82, t + 0.12);
      tapGain.gain.setValueAtTime(0.0001, t);
      tapGain.gain.linearRampToValueAtTime(0.012 + strength * 0.028, t + 0.004);
      tapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      tap.connect(tapGain).connect(ctx.destination);
      tap.start(t);
      tap.stop(t + 0.14);
    } catch {
      // O desenho continua funcionando se o navegador bloquear o áudio.
    }
  }

  playFabric(strength: number): void {
    const now = performance.now();
    if (now - this.lastFabric < 320 || strength < 0.2) return;
    this.lastFabric = now;
    try {
      this.unlock();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      this.noise ??= (() => {
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.18), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        return buffer;
      })();
      const rustle = ctx.createBufferSource();
      rustle.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1050, t);
      filter.frequency.exponentialRampToValueAtTime(320, t + 0.2);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.006 + strength * 0.014, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      rustle.connect(filter).connect(gain).connect(ctx.destination);
      rustle.start(t);
      rustle.stop(t + 0.23);
    } catch {
      // O movimento continua funcionando se o navegador bloquear o áudio.
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}

function spriteTexture(id: string): CanvasTexture {
  const icon = paintItemIcon(id);
  const canvas = document.createElement('canvas');
  canvas.width = icon.w;
  canvas.height = icon.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para o sprite da mochila.');
  const image = ctx.createImageData(icon.w, icon.h);
  image.data.set(icon.data);
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = 1003; // NearestFilter, preserva o pixel art.
  texture.colorSpace = 'srgb';
  return texture;
}

function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível para a mochila.');
  paint(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = 'srgb';
  return texture;
}

/** Mancha redonda que some nas bordas: serve de sombra no chão e de brilho do item selecionado. */
function radialTexture(rgb: string, alpha: number): CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    gradient.addColorStop(0.55, `rgba(${rgb}, ${alpha * 0.45})`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function badgeTexture(text: string): CanvasTexture {
  return canvasTexture(96, 48, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(22, 6);
    ctx.arcTo(92, 6, 92, 24, 18);
    ctx.arcTo(92, 42, 74, 42, 18);
    ctx.arcTo(4, 42, 4, 24, 18);
    ctx.arcTo(4, 6, 22, 6, 18);
    ctx.closePath();
    ctx.fillStyle = 'rgba(9, 15, 24, 0.86)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 228, 154, 0.9)';
    ctx.stroke();
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff6d6';
    ctx.fillText(text, 48, 25);
  });
}

export async function startBackpack(options: BackpackOptions): Promise<RunningBackpack> {
  const canvas = options.canvas;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new Scene();
  scene.background = new Color(0x101327);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 2.7, 9.5);
  camera.lookAt(0, 1.85, 0);
  scene.add(new AmbientLight(0x9ea9ff, 2.2));
  const key = new DirectionalLight(0xffe4bd, 3.2);
  key.position.set(-3, 5, 4);
  scene.add(key);
  const rim = new DirectionalLight(0x7fdcc8, 1.5);
  rim.position.set(3.5, 4, -4);
  scene.add(rim);

  // Sombra suave no chão: sem ela a mochila parece flutuar no fundo escuro.
  const shadowTexture = radialTexture('0, 0, 0', 0.6);
  const shadowGeometry = new PlaneGeometry(4.4, 2.6);
  const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.22, 0.05);
  scene.add(shadow);

  const bag = new Group();
  scene.add(bag);
  const fabric = new MeshStandardMaterial({ color: 0x347b73, roughness: 0.92 });
  const trim = new MeshStandardMaterial({ color: 0x174b49, roughness: 0.78 });
  const piping = new MeshStandardMaterial({ color: 0x82b7a0, roughness: 0.68 });
  const lining = new MeshStandardMaterial({ color: 0x172a32, roughness: 1 });
  const metal = new MeshStandardMaterial({ color: 0xd6b56e, roughness: 0.32, metalness: 0.72 });
  const meshes: Mesh[] = [];
  const addMesh = (geometry: import('three').BufferGeometry, material: MeshStandardMaterial, x: number, y: number, z: number, parent = bag) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const rounded = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 5, r);
  const tube = (points: Vector3[], radius: number, material: MeshStandardMaterial) =>
    addMesh(new TubeGeometry(new CatmullRomCurve3(points), 24, radius, 8, false), material, 0, 0, 0);

  // Two padded shoulder straps and a grab handle make the silhouette read as a backpack.
  for (const x of [-1.25, 1.25]) {
    const strap = addMesh(new CapsuleGeometry(0.16, 1.42, 4, 8), trim, x, 1.8, -0.36);
    strap.rotation.z = x < 0 ? -0.12 : 0.12;
    const stitch = addMesh(new CapsuleGeometry(0.105, 1.28, 4, 8), fabric, x, 1.8, -0.18);
    stitch.rotation.z = strap.rotation.z;
  }
  tube([new Vector3(-0.25, 3.35, -0.48), new Vector3(-0.25, 3.72, -0.48), new Vector3(0.25, 3.72, -0.48), new Vector3(0.25, 3.35, -0.48)], 0.085, trim);

  // Build the shell as a back, gussets and bottom, leaving the front upper
  // half open so the camera can look into the lined compartment.
  addMesh(rounded(2.45, 2.95, 0.28, 0.22), fabric, 0, 1.75, -0.42);
  addMesh(rounded(2.03, 2.55, 0.08, 0.06), lining, 0, 1.76, -0.245);
  for (const side of [-1, 1]) {
    addMesh(rounded(0.28, 2.82, 1.02, 0.12), fabric, side * 1.08, 1.75, 0.02);
    addMesh(rounded(0.09, 2.55, 0.76, 0.04), lining, side * 0.925, 1.78, 0.04);
  }
  addMesh(rounded(2.12, 0.24, 1.05, 0.08), trim, 0, 0.43, 0.03);
  addMesh(rounded(2.06, 0.12, 0.9, 0.04), lining, 0, 0.57, 0.02);
  // Raised inner shelf and low front wall keep the contents visible in the cutaway.
  addMesh(rounded(2.06, 0.16, 0.86, 0.05), lining, 0, 1.28, 0.02);
  addMesh(rounded(2.28, 0.72, 0.24, 0.1), fabric, 0, 0.78, 0.47);
  addMesh(rounded(2.36, 0.11, 0.2, 0.045), trim, 0, 1.17, 0.47);
  // The padded top collar follows the open mouth instead of covering it.
  for (const side of [-1, 1]) addMesh(rounded(0.12, 0.12, 0.94, 0.05), piping, side * 0.93, 3.13, 0.02);
  addMesh(rounded(1.9, 0.12, 0.11, 0.05), piping, 0, 3.13, -0.36);

  // The lid is hinged behind the mouth and folded back, clearly exposing the lining.
  const lidHinge = new Group();
  lidHinge.position.set(0, 3.08, -0.42);
  lidHinge.rotation.x = -0.82;
  bag.add(lidHinge);
  addMesh(rounded(2.12, 0.72, 0.16, 0.18), trim, 0, 0.38, 0, lidHinge);
  addMesh(rounded(1.84, 0.48, 0.06, 0.14), fabric, 0, 0.38, 0.105, lidHinge);
  addMesh(rounded(1.24, 0.045, 0.035, 0.02), metal, 0, 0.12, 0.15, lidHinge);

  // Front pocket, raised piping, zipper and two brass pulls.
  addMesh(rounded(1.82, 0.64, 0.2, 0.12), trim, 0, 0.75, 0.64);
  addMesh(rounded(1.68, 0.5, 0.15, 0.1), fabric, 0, 0.75, 0.76);
  addMesh(rounded(1.42, 0.05, 0.035, 0.02), metal, 0, 1.02, 0.86);
  for (const x of [-0.62, 0.62]) addMesh(new CapsuleGeometry(0.035, 0.14, 3, 6), metal, x, 0.98, 0.89);
  addMesh(rounded(0.34, 0.22, 0.1, 0.04), metal, 0, 1.13, 0.61);

  // Side gussets and bottle pockets.
  for (const side of [-1, 1]) {
    const pocket = addMesh(rounded(0.36, 0.92, 0.42, 0.16), trim, side * 1.16, 1.14, 0.12);
    pocket.rotation.z = side * -0.04;
    addMesh(rounded(0.29, 0.76, 0.36, 0.13), fabric, side * 1.16, 1.17, 0.18);
    addMesh(rounded(0.38, 0.11, 0.44, 0.05), piping, side * 1.16, 1.61, 0.12);
    tube([new Vector3(side * 1.02, 3.02, 0.2), new Vector3(side * 1.08, 3.13, 0.27), new Vector3(side * 1.22, 3.13, 0.27), new Vector3(side * 1.28, 3.02, 0.2)], 0.018, piping);
  }
  // Quiet stitch accents and a reinforced bottom panel.
  addMesh(rounded(2.05, 0.17, 1.02, 0.08), trim, 0, 0.34, 0.04);
  for (const side of [-1, 1]) {
    tube([new Vector3(side * 0.98, 0.72, 0.85), new Vector3(side * 0.98, 1.42, 0.88), new Vector3(side * 0.86, 1.54, 0.89)], 0.012, piping);
    tube([new Vector3(side * 0.89, 2.9, 0.55), new Vector3(side * 0.96, 2.5, 0.63), new Vector3(side * 0.96, 2.13, 0.67)], 0.012, piping);
  }

  // Ordem de desenho dos sprites: brilho, depois o item, depois o selo de quantidade.
  const loose: LooseItem[] = [];
  const badgeTextures = new Map<string, CanvasTexture>();
  const badgeMaterials: SpriteMaterial[] = [];
  const bornAt = performance.now();
  planBackpack(options.items).shown.forEach((item, index) => {
    const home = homeSlot(index);
    const texture = spriteTexture(item.id);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, color: 0xffffff });
    const sprite = new Sprite(material);
    sprite.position.set(home.x, home.y, home.z);
    sprite.scale.set(0.001, 0.001, 1);
    sprite.renderOrder = 2;
    bag.add(sprite);
    let badge: Sprite | null = null;
    const label = qtyBadge(item.qty);
    if (label) {
      let badgeMap = badgeTextures.get(label);
      if (!badgeMap) {
        badgeMap = badgeTexture(label);
        badgeTextures.set(label, badgeMap);
      }
      const badgeMaterial = new SpriteMaterial({ map: badgeMap, transparent: true, depthWrite: false });
      badgeMaterials.push(badgeMaterial);
      badge = new Sprite(badgeMaterial);
      // Filho do sprite: acompanha o item e a escala dele.
      badge.position.set(0.36, -0.4, 0);
      badge.scale.set(0.7, 0.35, 1);
      badge.renderOrder = 3;
      sprite.add(badge);
    }
    loose.push({ item, sprite, texture, velocity: new Vector3(), badge, scale: 0.001, appearAt: bornAt + 180 + index * 45 });
  });

  const haloTexture = radialTexture('255, 232, 150', 0.95);
  const haloMaterial = new SpriteMaterial({ map: haloTexture, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 });
  const halo = new Sprite(haloMaterial);
  halo.scale.set(0.8, 0.8, 1);
  halo.renderOrder = 1;
  halo.visible = false;
  bag.add(halo);

  let fx = options.fx;
  let sound = options.sound;
  let running = true;
  let frame = 0;
  let last = performance.now();
  let shakePower = 0;
  let rotation = 0;
  let targetRotation = 0;
  let tiltX = 0;
  let sway = 0;
  let yaw = 0;
  let pitch = 0;
  let yawVelocity = 0;
  let recentering = false;
  let selected: LooseItem | null = null;
  let drag: { id: number; startX: number; startY: number; x: number; y: number; time: number; moved: boolean } | null = null;
  let motion = { x: 0, y: 0, z: 0 };
  let orientation: { beta: number; gamma: number } | null = null;
  let calibration: { beta: number; gamma: number } | null = null;
  const clinker = new Clinker();
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const spriteList = loose.map((item) => item.sprite);
  const force = new Vector3();
  const delta = new Vector3();
  const relative = new Vector3();

  const select = (next: LooseItem | null): void => {
    selected = next;
    if (next) {
      // Um tapinha: o item pula para frente e faz barulho, então dá para achá-lo no meio dos outros.
      next.velocity.y += 1.4;
      next.velocity.z += 0.5;
      if (sound) clinker.playImpact(0.55, 'item');
    }
    options.onSelect?.(next ? next.item.id : null);
  };
  const toggle = (item: LooseItem | null): void => select(item && item === selected ? null : item);
  const pick = (clientX: number, clientY: number): LooseItem | null => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(spriteList, false)[0]?.object;
    return loose.find((item) => item.sprite === hit) ?? null;
  };
  const onPointerDown = (event: PointerEvent) => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    clinker.unlock();
    recentering = false;
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, time: event.timeStamp, moved: false };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* o arrasto funciona sem captura */ }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    drag.moved = true;
    const next = clampOrbit(yaw + (event.clientX - drag.x) * 0.006, pitch + (event.clientY - drag.y) * 0.003);
    const seconds = Math.max(0.008, (event.timeStamp - drag.time) / 1000);
    yawVelocity = MathUtils.clamp(yawVelocity * 0.5 + ((next.yaw - yaw) / seconds) * 0.5, -4, 4);
    yaw = next.yaw;
    pitch = next.pitch;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.time = event.timeStamp;
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const tap = !drag.moved && event.type === 'pointerup';
    drag = null;
    if (tap) toggle(pick(event.clientX, event.clientY));
  };
  const onContextLost = (event: Event) => event.preventDefault();
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('webglcontextlost', onContextLost);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || canvas.clientWidth || 320);
    const height = Math.max(1, rect.height || canvas.clientHeight || 300);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const onMotion = (event: DeviceMotionEvent) => {
    const a = event.accelerationIncludingGravity ?? event.acceleration;
    if (!a) return;
    motion = { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 };
  };
  const onOrientation = (event: DeviceOrientationEvent) => {
    if (typeof event.beta !== 'number' || typeof event.gamma !== 'number') return;
    orientation = { beta: event.beta, gamma: event.gamma };
  };
  window.addEventListener('devicemotion', onMotion);
  window.addEventListener('deviceorientation', onOrientation);

  const frameLoop = (now: number): void => {
    if (!running) return;
    frame = requestGameFrame(frameLoop, maxVisualFps);
    const fps = effectiveVisual.value.frameRate === 'auto' ? 0 : Number(effectiveVisual.value.frameRate);
    if (!isFrameDue(now, last, fps)) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    shakePower *= Math.pow(0.16, dt);
    // Giro por arrasto: segue o dedo, continua com inércia ao soltar e volta ao centro em "Centralizar".
    if (!drag) {
      if (recentering) {
        yaw += (0 - yaw) * Math.min(1, dt * 6);
        pitch += (0 - pitch) * Math.min(1, dt * 6);
        yawVelocity = 0;
        if (Math.abs(yaw) < 0.002 && Math.abs(pitch) < 0.002) recentering = false;
      } else {
        const next = clampOrbit(yaw + yawVelocity * dt, pitch);
        if (next.yaw !== yaw + yawVelocity * dt) yawVelocity = 0;
        yaw = next.yaw;
      }
    }
    yawVelocity *= Math.pow(drag ? 0.0005 : 0.04, dt);
    sway += ((fx ? 1 : 0) - sway) * Math.min(1, dt * 3);
    let tiltZ: number;
    if (orientation && calibration) {
      const sideways = MathUtils.clamp((orientation.gamma - calibration.gamma) / 28, -1, 1);
      const forward = MathUtils.clamp((orientation.beta - calibration.beta) / 28, -1, 1);
      tiltZ = sideways * 0.22;
      tiltX += (forward * -0.12 - tiltX) * Math.min(1, dt * 8);
    } else {
      rotation += (targetRotation - rotation) * Math.min(1, dt * 7);
      tiltZ = Math.sin(rotation) * 0.05;
      tiltX += (0 - tiltX) * Math.min(1, dt * 8);
    }
    bag.rotation.z += (tiltZ - bag.rotation.z) * Math.min(1, dt * 8);
    bag.rotation.x = tiltX + pitch;
    bag.rotation.y = yaw + rotation * 0.2 + Math.sin(now * 0.0006) * 0.035 * sway;
    if (orientation && calibration) {
      force.set((orientation.gamma - calibration.gamma) / 28 * 2.4, 0, -(orientation.beta - calibration.beta) / 28 * 2.4);
    } else {
      force.set(motion.x * 0.08, 0, -motion.y * 0.08);
    }
    // Girar a mochila faz os itens balançarem de lado, como numa mochila de verdade.
    force.x += yawVelocity * 0.9;
    force.x += Math.sin(now * 0.032) * shakePower * 4.2;
    force.y += Math.max(0, Math.sin(now * 0.025)) * shakePower * 2.3;
    force.z += Math.cos(now * 0.029) * shakePower * 3.4;
    motion = { x: motion.x * 0.78, y: motion.y * 0.78, z: motion.z * 0.78 };
    const radius = 0.16;
    const bounds = { minX: -0.94, maxX: 0.94, minY: 1.36, maxY: 3.08, minZ: -0.1, maxZ: 0.5 };
    let itemImpact = 0;
    let wallImpact = 0;
    for (const item of loose) {
      item.velocity.addScaledVector(force, dt);
      item.velocity.y -= 1.4 * dt;
      item.velocity.multiplyScalar(Math.pow(0.12, dt));
      item.sprite.position.addScaledVector(item.velocity, dt);
      // Gira ao ser empurrado, mas volta aos poucos para a posição em pé, para dar para ler o ícone.
      item.sprite.material.rotation = (item.sprite.material.rotation + (item.velocity.x + item.velocity.z) * dt * 0.35) * Math.pow(0.4, dt);
      const targetScale = now < item.appearAt ? 0.001 : item === selected ? SELECTED_SCALE : ITEM_SCALE;
      item.scale += (targetScale - item.scale) * Math.min(1, dt * 10);
      item.sprite.scale.set(item.scale, item.scale, 1);

      if (item.sprite.position.x < bounds.minX + radius) {
        item.sprite.position.x = bounds.minX + radius;
        wallImpact = Math.max(wallImpact, Math.abs(item.velocity.x));
        item.velocity.x = Math.abs(item.velocity.x) * 0.42;
      } else if (item.sprite.position.x > bounds.maxX - radius) {
        item.sprite.position.x = bounds.maxX - radius;
        wallImpact = Math.max(wallImpact, Math.abs(item.velocity.x));
        item.velocity.x = -Math.abs(item.velocity.x) * 0.42;
      }
      if (item.sprite.position.y < bounds.minY + radius) {
        item.sprite.position.y = bounds.minY + radius;
        wallImpact = Math.max(wallImpact, Math.abs(item.velocity.y));
        item.velocity.y = Math.abs(item.velocity.y) * 0.32;
      } else if (item.sprite.position.y > bounds.maxY - radius) {
        item.sprite.position.y = bounds.maxY - radius;
        wallImpact = Math.max(wallImpact, Math.abs(item.velocity.y));
        item.velocity.y = -Math.abs(item.velocity.y) * 0.32;
      }
      if (item.sprite.position.z < bounds.minZ + radius) {
        item.sprite.position.z = bounds.minZ + radius;
        wallImpact = Math.max(wallImpact, Math.abs(item.velocity.z));
        item.velocity.z = Math.abs(item.velocity.z) * 0.38;
      } else if (item.sprite.position.z > bounds.maxZ - radius) {
        item.sprite.position.z = bounds.maxZ - radius;
        wallImpact = Math.max(wallImpact, Math.abs(item.velocity.z));
        item.velocity.z = -Math.abs(item.velocity.z) * 0.38;
      }
    }
    for (let i = 0; i < loose.length; i++) {
      const first = loose[i]!;
      for (let j = i + 1; j < loose.length; j++) {
        const second = loose[j]!;
        delta.copy(second.sprite.position).sub(first.sprite.position);
        const distance = delta.length();
        if (distance >= radius * 2) continue;
        const normal = distance > 0.0001 ? delta.multiplyScalar(1 / distance) : delta.set(1, 0, 0);
        const overlap = radius * 2 - distance;
        first.sprite.position.addScaledVector(normal, -overlap * 0.5);
        second.sprite.position.addScaledVector(normal, overlap * 0.5);
        const relativeSpeed = relative.copy(second.velocity).sub(first.velocity).dot(normal);
        if (relativeSpeed < 0) {
          const impulse = -(1 + 0.38) * relativeSpeed * 0.5;
          first.velocity.addScaledVector(normal, -impulse);
          second.velocity.addScaledVector(normal, impulse);
          itemImpact = Math.max(itemImpact, -relativeSpeed);
        }
      }
    }
    if (sound) {
      if (itemImpact > 0.2) clinker.playImpact(Math.min(1, itemImpact * 0.55), 'item');
      if (wallImpact > 0.26) clinker.playImpact(Math.min(1, wallImpact * 0.42), 'wall');
      if (shakePower > 0.2) clinker.playFabric(shakePower);
    }
    if (selected) {
      halo.visible = true;
      halo.position.copy(selected.sprite.position);
      haloMaterial.opacity = 0.6 + Math.sin(now * 0.006) * 0.2;
    } else {
      halo.visible = false;
    }
    if (fx) {
      key.intensity = 2.6 + Math.abs(Math.sin(now * 0.0012)) * 0.7;
      bag.position.y = Math.sin(now * 0.0018) * 0.025;
    } else {
      bag.position.y += (0 - bag.position.y) * Math.min(1, dt * 4);
    }
    renderer.render(scene, camera);
  };

  resize();
  frame = requestGameFrame(frameLoop, maxVisualFps);
  return {
    shake() { clinker.unlock(); shakePower = 1; targetRotation = targetRotation > 0 ? -0.35 : 0.35; },
    recenter() { targetRotation = 0; recentering = true; },
    focusItem(id) {
      const item = loose.find((entry) => entry.item.id === id);
      if (!item) return false;
      clinker.unlock();
      toggle(item);
      return true;
    },
    async calibrate() {
      clinker.unlock();
      const ctor = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
      if (typeof ctor.requestPermission === 'function') {
        try { await ctor.requestPermission(); } catch { /* o sensor continua opcional */ }
      }
      calibration = orientation ? { ...orientation } : null;
      targetRotation = 0;
      bag.rotation.set(0, 0, 0);
    },
    setFx(on) { fx = on; },
    setSound(on) { sound = on; },
    resize,
    stop() {
      running = false;
      cancelGameFrame(frame);
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrientation);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      loose.forEach((item) => { item.texture.dispose(); item.sprite.material.dispose(); });
      badgeMaterials.forEach((material) => material.dispose());
      badgeTextures.forEach((texture) => texture.dispose());
      haloTexture.dispose(); haloMaterial.dispose();
      shadowTexture.dispose(); shadowGeometry.dispose(); shadowMaterial.dispose();
      meshes.forEach((mesh) => mesh.geometry.dispose());
      fabric.dispose(); trim.dispose(); piping.dispose(); lining.dispose(); metal.dispose();
      renderer.dispose();
      clinker.dispose();
    },
  };
}
