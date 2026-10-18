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
  velocity: Vector3;
}

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

  const loose: LooseItem[] = [];
  const visible = options.items.slice(0, 18);
  visible.forEach((item, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const home = new Vector3(-0.63 + col * 0.42, 1.62 + row * 0.28, 0.1 + (index % 3) * 0.08);
    const texture = spriteTexture(item.id);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, color: 0xffffff });
    const sprite = new Sprite(material);
    sprite.position.copy(home);
    sprite.scale.set(0.31, 0.31, 1);
    bag.add(sprite);
    loose.push({ sprite, texture, velocity: new Vector3() });
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
    shakePower *= Math.pow(0.16, dt);
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
      ? new Vector3((orientation.gamma - calibration.gamma) / 28 * 2.4, 0, -(orientation.beta - calibration.beta) / 28 * 2.4)
      : new Vector3(motion.x * 0.08, 0, -motion.y * 0.08);
    force.x += Math.sin(now * 0.032) * shakePower * 4.2;
    force.y += Math.max(0, Math.sin(now * 0.025)) * shakePower * 2.3;
    force.z += Math.cos(now * 0.029) * shakePower * 3.4;
    motion = { x: motion.x * 0.78, y: motion.y * 0.78, z: motion.z * 0.78 };
    const radius = 0.16;
    const bounds = { minX: -0.94, maxX: 0.94, minY: 1.36, maxY: 3.08, minZ: -0.1, maxZ: 0.5 };
    let itemImpact = 0;
    let wallImpact = 0;
    for (const item of loose) {
      item.velocity.add(force.clone().multiplyScalar(dt));
      item.velocity.y -= 1.4 * dt;
      item.velocity.multiplyScalar(Math.pow(0.12, dt));
      item.sprite.position.addScaledVector(item.velocity, dt);
      item.sprite.material.rotation += (item.velocity.x + item.velocity.z) * dt * 0.35;

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
        const delta = second.sprite.position.clone().sub(first.sprite.position);
        const distance = delta.length();
        if (distance >= radius * 2) continue;
        const normal = distance > 0.0001 ? delta.multiplyScalar(1 / distance) : new Vector3(1, 0, 0);
        const overlap = radius * 2 - distance;
        first.sprite.position.addScaledVector(normal, -overlap * 0.5);
        second.sprite.position.addScaledVector(normal, overlap * 0.5);
        const relativeSpeed = second.velocity.clone().sub(first.velocity).dot(normal);
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
    shake() { clinker.unlock(); shakePower = 1; targetRotation = targetRotation > 0 ? -0.35 : 0.35; },
    recenter() { targetRotation = 0; },
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
