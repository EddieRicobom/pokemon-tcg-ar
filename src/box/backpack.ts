import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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

  play(strength: number): void {
    const now = performance.now();
    if (now - this.last < 65) return;
    this.last = now;
    try {
      this.ctx ??= new AudioContext();
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.025 + strength * 0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.0004, t + 0.24);
      gain.connect(ctx.destination);
      for (const frequency of [1800 + Math.random() * 900, 3600 + Math.random() * 1200]) {
        const oscillator = ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(t);
        oscillator.stop(t + 0.25);
      }
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
  camera.position.set(0, 2.65, 7.8);
  camera.lookAt(0, 0.45, 0);
  scene.add(new AmbientLight(0x9ea9ff, 2.2));
  const key = new DirectionalLight(0xffe4bd, 3.2);
  key.position.set(-3, 5, 4);
  scene.add(key);

  const bag = new Group();
  scene.add(bag);
  const leather = new MeshStandardMaterial({ color: 0x743c31, roughness: 0.48, metalness: 0.08 });
  const darkLeather = new MeshStandardMaterial({ color: 0x321d2a, roughness: 0.6 });
  const lining = new MeshStandardMaterial({ color: 0x25264f, roughness: 0.9 });
  const base = new Mesh(new RoundedBoxGeometry(3.4, 0.62, 2.3, 5, 0.18), leather);
  base.position.y = 0.18;
  bag.add(base);
  const inner = new Mesh(new RoundedBoxGeometry(3.05, 0.12, 1.95, 4, 0.08), lining);
  inner.position.y = 0.52;
  bag.add(inner);
  const flap = new Mesh(new RoundedBoxGeometry(3.38, 0.12, 2.24, 5, 0.16), darkLeather);
  flap.position.set(0, 1.05, -0.95);
  flap.rotation.x = -0.22;
  bag.add(flap);
  for (const x of [-1.35, 1.35]) {
    const strap = new Mesh(new BoxGeometry(0.12, 1.05, 0.18), leather);
    strap.position.set(x, 0.62, 0.86);
    strap.rotation.x = -0.18;
    bag.add(strap);
  }

  const loose: LooseItem[] = [];
  const visible = options.items.slice(0, 18);
  visible.forEach((item, index) => {
    const col = index % 6;
    const row = Math.floor(index / 6);
    const home = new Vector3(-1.23 + col * 0.49, 0.7 + (index % 3) * 0.045, -0.65 + row * 0.53);
    const texture = spriteTexture(item.id);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, color: 0xffffff });
    const sprite = new Sprite(material);
    sprite.position.copy(home);
    sprite.scale.set(0.56, 0.56, 1);
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
      const dz = item.sprite.position.z - item.home.z;
      if (Math.abs(dx) > 0.21 || Math.abs(dz) > 0.21) {
        item.sprite.position.x = MathUtils.clamp(item.sprite.position.x, item.home.x - 0.21, item.home.x + 0.21);
        item.sprite.position.z = MathUtils.clamp(item.sprite.position.z, item.home.z - 0.21, item.home.z + 0.21);
        item.velocity.multiplyScalar(-0.45);
        collided += 1;
      }
    }
    if (sound && (collided > 0 || shakePower > 0.25)) clinker.play(Math.min(1, 0.2 + shakePower + collided * 0.12));
    if (fx) {
      key.intensity = 2.6 + Math.abs(Math.sin(now * 0.0012)) * 0.7;
      bag.children.forEach((child, index) => { if (index > 2) child.rotation.y += dt * 0.08; });
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
      base.geometry.dispose(); inner.geometry.dispose(); flap.geometry.dispose();
      leather.dispose(); darkLeather.dispose(); lining.dispose();
      renderer.dispose();
      clinker.dispose();
    },
  };
}
