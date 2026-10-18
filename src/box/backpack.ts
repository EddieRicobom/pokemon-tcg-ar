import {
  ACESFilmicToneMapping,
  AmbientLight,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CatmullRomCurve3 } from 'three';
import { paintItemIcon } from '../village/item-art';

export interface BackpackItem {
  id: string;
  name: string;
  qty: number;
}

export interface BackpackOptions {
  canvas: HTMLCanvasElement;
  items: readonly BackpackItem[];
  fx: boolean;
  sound: boolean;
}

export interface RunningBackpack {
  shake(): void;
  recenter(): void;
  calibrate(): Promise<void>;
  setFx(on: boolean): void;
  setSound(on: boolean): void;
  resize(): void;
  stop(): void;
}

interface LooseItem {
  sprite: Sprite;
  texture: CanvasTexture;
  home: Vector3;
  velocity: Vector3;
}

class Clinker {
  private ctx: AudioContext | null = null;
  private last = 0;
  private noise: AudioBuffer | null = null;

  play(strength: number): void {
    const now = performance.now();
    if (now - this.last < 150 || strength < 0.14) return;
    this.last = now;
    try {
      this.ctx ??= new AudioContext();
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      // A soft fabric swish, followed by a tiny wooden/leather tap. Keep each
      // transient short and quiet so tilting never turns into a constant rattle.
      this.noise ??= (() => {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.32, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        return buffer;
      })();
      const swish = ctx.createBufferSource();
      swish.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900 + strength * 900, t);
      filter.frequency.exponentialRampToValueAtTime(260, t + 0.22);
      const fabric = ctx.createGain();
      fabric.gain.setValueAtTime(0.0001, t);
      fabric.gain.linearRampToValueAtTime(0.012 + strength * 0.018, t + 0.035);
      fabric.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      swish.connect(filter).connect(fabric).connect(ctx.destination);
      swish.start(t);
      swish.stop(t + 0.25);

      const tap = ctx.createOscillator();
      const tapGain = ctx.createGain();
      tap.type = 'sine';
      tap.frequency.setValueAtTime(230 + Math.random() * 100, t + 0.025);
      tap.frequency.exponentialRampToValueAtTime(95, t + 0.11);
      tapGain.gain.setValueAtTime(0.0001, t + 0.025);
      tapGain.gain.linearRampToValueAtTime(0.012 + strength * 0.018, t + 0.03);
      tapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      tap.connect(tapGain).connect(ctx.destination);
      tap.start(t + 0.025);
      tap.stop(t + 0.14);
    } catch {
      // O desenho continua funcionando se o navegador bloquear o áudio.
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
  for (const x of [-0.78, 0.78]) {
    const strap = addMesh(new CapsuleGeometry(0.16, 1.42, 4, 8), trim, x, 1.8, -0.46);
    strap.rotation.z = x < 0 ? -0.12 : 0.12;
    const stitch = addMesh(new CapsuleGeometry(0.105, 1.28, 4, 8), fabric, x, 1.8, -0.34);
    stitch.rotation.z = strap.rotation.z;
  }
  tube([new Vector3(-0.25, 3.35, -0.48), new Vector3(-0.25, 3.72, -0.48), new Vector3(0.25, 3.72, -0.48), new Vector3(0.25, 3.35, -0.48)], 0.085, trim);

  // Main upright padded body, gently rounded at the corners.
  addMesh(rounded(2.45, 2.95, 1.18, 0.27), fabric, 0, 1.75, 0);
  addMesh(rounded(2.28, 0.28, 1.12, 0.12), trim, 0, 3.17, 0.02);
  // Open mouth and dark lining visible behind the carried items.
  addMesh(rounded(1.92, 0.16, 0.78, 0.07), lining, 0, 3.13, 0.12);
  addMesh(rounded(1.96, 0.1, 0.16, 0.06), piping, 0, 3.25, 0.49);
  // Front pocket, raised piping, zipper and two brass pulls.
  addMesh(rounded(1.8, 1.02, 0.28, 0.18), trim, 0, 1.13, 0.68);
  addMesh(rounded(1.68, 0.88, 0.22, 0.15), fabric, 0, 1.13, 0.82);
  addMesh(rounded(1.42, 0.055, 0.035, 0.025), metal, 0, 1.62, 0.95);
  for (const x of [-0.62, 0.62]) addMesh(new CapsuleGeometry(0.035, 0.14, 3, 6), metal, x, 1.56, 0.99);
  // Large top flap, curved piping, stitched seam and clasp.
  const flap = addMesh(rounded(2.02, 0.8, 0.22, 0.23), trim, 0, 2.46, 0.68);
  flap.rotation.x = -0.08;
  const panel = addMesh(rounded(1.78, 0.61, 0.12, 0.19), fabric, 0, 2.48, 0.82);
  panel.rotation.x = -0.08;
  addMesh(rounded(0.34, 0.25, 0.12, 0.05), metal, 0, 2.03, 0.92);
  addMesh(rounded(0.18, 0.1, 0.07, 0.035), trim, 0, 2.02, 1.02);
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

  const loose: LooseItem[] = [];
  const visible = options.items.slice(0, 18);
  visible.forEach((item, index) => {
    const col = index % 6;
    const row = Math.floor(index / 6);
    const home = new Vector3(-0.72 + col * 0.29, 3.34 + (index % 3) * 0.035, 0.66 + row * 0.1);
    const texture = spriteTexture(item.id);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, color: 0xffffff });
    const sprite = new Sprite(material);
    sprite.position.copy(home);
    sprite.scale.set(0.27, 0.27, 1);
    bag.add(sprite);
    loose.push({ sprite, texture, home, velocity: new Vector3() });
  });

  let fx = options.fx;
  let sound = options.sound;
  let running = true;
  let frame = 0;
  let last = performance.now();
  let shakePower = 0;
  let rotation = 0;
  let targetRotation = 0;
  let motion = { x: 0, y: 0, z: 0 };
  let orientation: { beta: number; gamma: number } | null = null;
  let calibration: { beta: number; gamma: number } | null = null;
  const clinker = new Clinker();

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
    frame = requestAnimationFrame(frameLoop);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    shakePower *= Math.pow(0.025, dt);
    if (orientation && calibration) {
      const tiltX = MathUtils.clamp((orientation.gamma - calibration.gamma) / 28, -1, 1);
      const tiltY = MathUtils.clamp((orientation.beta - calibration.beta) / 28, -1, 1);
      targetRotation = tiltX * 0.22;
      bag.rotation.z += (targetRotation - bag.rotation.z) * Math.min(1, dt * 8);
      bag.rotation.x += (tiltY * -0.12 - bag.rotation.x) * Math.min(1, dt * 8);
    } else {
      rotation += (targetRotation - rotation) * Math.min(1, dt * 7);
      bag.rotation.z = Math.sin(rotation) * 0.05;
      bag.rotation.y = rotation * 0.2;
    }
    const force = orientation && calibration
      ? new Vector3((orientation.gamma - calibration.gamma) * 0.0018, 0, -(orientation.beta - calibration.beta) * 0.0018)
      : new Vector3(motion.x * 0.035, 0, -motion.y * 0.035);
    force.x += Math.sin(now * 0.018) * shakePower * 0.055;
    force.z += Math.cos(now * 0.015) * shakePower * 0.055;
    motion = { x: motion.x * 0.78, y: motion.y * 0.78, z: motion.z * 0.78 };
    let collided = 0;
    for (const item of loose) {
      const offset = item.home.clone().sub(item.sprite.position).multiplyScalar(4.8);
      item.velocity.add(offset.multiplyScalar(dt));
      item.velocity.add(force.clone().multiplyScalar(dt * 9));
      item.velocity.multiplyScalar(Math.pow(0.12, dt));
      item.sprite.position.addScaledVector(item.velocity, dt);
      item.sprite.material.rotation += (item.velocity.x + item.velocity.z) * dt * 0.35;
      const dx = item.sprite.position.x - item.home.x;
      const dy = item.sprite.position.y - item.home.y;
      const dz = item.sprite.position.z - item.home.z;
      if (Math.abs(dx) > 0.12 || Math.abs(dy) > 0.13 || Math.abs(dz) > 0.12) {
        item.sprite.position.set(item.home.x + MathUtils.clamp(dx, -0.12, 0.12), item.home.y + MathUtils.clamp(dy, -0.13, 0.13), item.home.z + MathUtils.clamp(dz, -0.12, 0.12));
        item.velocity.multiplyScalar(-0.32);
        collided = Math.max(collided, Math.min(1, item.velocity.length() * 0.7 + 0.12));
      }
    }
    if (sound && (collided > 0 || shakePower > 0.25)) clinker.play(Math.min(1, shakePower * 0.55 + collided * 0.55));
    if (fx) {
      key.intensity = 2.6 + Math.abs(Math.sin(now * 0.0012)) * 0.7;
      bag.position.y = Math.sin(now * 0.0018) * 0.025;
      bag.rotation.y += Math.sin(now * 0.0008) * dt * 0.025;
    } else {
      bag.position.y += (0 - bag.position.y) * Math.min(1, dt * 4);
    }
    renderer.render(scene, camera);
  };

  resize();
  frame = requestAnimationFrame(frameLoop);
  return {
    shake() { shakePower = 1; targetRotation = targetRotation > 0 ? -0.35 : 0.35; },
    recenter() { targetRotation = 0; },
    async calibrate() {
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
      cancelAnimationFrame(frame);
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrientation);
      loose.forEach((item) => { item.texture.dispose(); item.sprite.material.dispose(); });
      meshes.forEach((mesh) => mesh.geometry.dispose());
      fabric.dispose(); trim.dispose(); piping.dispose(); lining.dispose(); metal.dispose();
      renderer.dispose();
      clinker.dispose();
    },
  };
}
