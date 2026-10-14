import { AdditiveBlending, DataTexture, Group, LinearFilter, RGBAFormat, Sprite, SpriteMaterial, UnsignedByteType, Vector3 } from 'three';
import { TYPE_COLORS } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import type { Rng } from '../core/battle';

/** Cor do tipo como número (0xRRGGBB) para o Three.js. */
export function typeColorHex(type: PokemonType): number {
  return parseInt(TYPE_COLORS[type].slice(1), 16);
}

/** Como as partículas de cada tipo se comportam (gravidade em m/s², positiva sobe). */
export interface FxStyle {
  gravity: number;
  speed: number;
  /** ms. */
  life: number;
  /** Metros. */
  size: number;
  count: number;
}

export const FX_STYLES: Record<PokemonType, FxStyle> = {
  normal: { gravity: -1.5, speed: 1.1, life: 450, size: 0.09, count: 14 },
  fire: { gravity: 1.6, speed: 0.9, life: 650, size: 0.1, count: 22 },
  water: { gravity: -2.4, speed: 1.1, life: 600, size: 0.08, count: 24 },
  electric: { gravity: 0, speed: 2.2, life: 260, size: 0.06, count: 28 },
  grass: { gravity: -0.7, speed: 0.8, life: 800, size: 0.09, count: 20 },
  ice: { gravity: -0.5, speed: 0.7, life: 900, size: 0.07, count: 26 },
  fighting: { gravity: -3, speed: 1.3, life: 450, size: 0.09, count: 16 },
  poison: { gravity: 0.4, speed: 0.5, life: 900, size: 0.11, count: 18 },
  ground: { gravity: -4, speed: 1.4, life: 600, size: 0.09, count: 24 },
  flying: { gravity: 0.3, speed: 1.5, life: 500, size: 0.07, count: 20 },
  psychic: { gravity: 0, speed: 0.6, life: 850, size: 0.09, count: 22 },
  bug: { gravity: -1, speed: 0.9, life: 600, size: 0.06, count: 20 },
  rock: { gravity: -4.5, speed: 1.3, life: 700, size: 0.1, count: 16 },
  ghost: { gravity: 0.5, speed: 0.4, life: 1000, size: 0.1, count: 18 },
  dragon: { gravity: 0.2, speed: 1.2, life: 750, size: 0.11, count: 26 },
  dark: { gravity: 0, speed: 0.8, life: 800, size: 0.1, count: 20 },
  steel: { gravity: -2, speed: 1.5, life: 420, size: 0.06, count: 22 },
  fairy: { gravity: 0.6, speed: 0.7, life: 900, size: 0.07, count: 28 },
};

let glowTexture: DataTexture | null = null;

/** Bolinha luminosa (gradiente radial) gerada em código, sem imagem nem canvas. */
function getGlowTexture(): DataTexture {
  if (glowTexture) return glowTexture;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const a = Math.max(0, 1 - d);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * a * a);
    }
  }
  glowTexture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  glowTexture.magFilter = LinearFilter;
  glowTexture.minFilter = LinearFilter;
  glowTexture.needsUpdate = true;
  return glowTexture;
}

interface Particle {
  sprite: Sprite;
  velocity: Vector3;
  gravity: number;
  life: number;
  age: number;
  size: number;
  active: boolean;
}

export interface EmitOptions {
  position: Vector3;
  velocity: Vector3;
  /** ms. */
  life: number;
  size: number;
  color: number;
  gravity?: number;
}

/** Reserva fixa de partículas (sprites aditivos que sempre olham para a câmera). */
export class ParticleField {
  readonly group = new Group();
  private readonly items: Particle[] = [];
  private cursor = 0;

  constructor(readonly capacity = 220) {
    for (let i = 0; i < capacity; i++) {
      const material = new SpriteMaterial({ map: getGlowTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false });
      const sprite = new Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);
      this.items.push({ sprite, velocity: new Vector3(), gravity: 0, life: 1, age: 0, size: 0.1, active: false });
    }
  }

  get activeCount(): number {
    return this.items.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  }

  emit(options: EmitOptions): void {
    const p = this.items[this.cursor]!;
    this.cursor = (this.cursor + 1) % this.items.length;
    p.active = true;
    p.age = 0;
    p.life = Math.max(1, options.life);
    p.size = options.size;
    p.gravity = options.gravity ?? 0;
    p.velocity.copy(options.velocity);
    p.sprite.position.copy(options.position);
    p.sprite.material.color.setHex(options.color);
    p.sprite.material.opacity = 1;
    p.sprite.scale.setScalar(options.size);
    p.sprite.visible = true;
  }

  update(dtMs: number): void {
    const dt = Math.min(dtMs, 100) / 1000;
    for (const p of this.items) {
      if (!p.active) continue;
      p.age += dt * 1000;
      if (p.age >= p.life) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      p.velocity.y += p.gravity * dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      // Nunca afunda no chão.
      if (p.sprite.position.y < 0.01 && p.gravity < 0) {
        p.sprite.position.y = 0.01;
        p.velocity.y = Math.abs(p.velocity.y) * 0.3;
      }
      const u = p.age / p.life;
      p.sprite.material.opacity = 1 - u * u;
      p.sprite.scale.setScalar(p.size * (1 + 0.6 * u));
    }
  }

  clear(): void {
    for (const p of this.items) {
      p.active = false;
      p.sprite.visible = false;
    }
  }

  dispose(): void {
    for (const p of this.items) p.sprite.material.dispose();
    this.group.clear();
    this.group.removeFromParent();
  }
}

function randomDirection(rng: Rng, upward = 0.3): Vector3 {
  const theta = rng() * Math.PI * 2;
  const y = upward + rng() * (1 - upward);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  return new Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
}

/** Explosão de impacto no tipo do golpe; `strength` (≈0,6–2) cresce com a efetividade e o crítico. */
export function emitBurst(field: ParticleField, at: Vector3, type: PokemonType, strength: number, rng: Rng): void {
  const style = FX_STYLES[type];
  const color = typeColorHex(type);
  const count = Math.round(style.count * Math.min(2.2, Math.max(0.4, strength)));
  for (let i = 0; i < count; i++) {
    const dir = randomDirection(rng, type === 'ground' || type === 'rock' ? 0.5 : -0.2);
    field.emit({
      position: at,
      velocity: dir.multiplyScalar(style.speed * (0.5 + rng() * 0.9)),
      life: style.life * (0.6 + rng() * 0.6),
      size: style.size * 1.5 * (0.7 + rng() * 0.8),
      color,
      gravity: style.gravity,
    });
  }
  // Clarão branco no centro.
  field.emit({ position: at, velocity: new Vector3(), life: 220, size: 0.45 * Math.min(1.6, strength), color: 0xffffff });
}

/** Rastro do projétil. */
export function emitTrail(field: ParticleField, at: Vector3, type: PokemonType, rng: Rng): void {
  const style = FX_STYLES[type];
  const jitter = type === 'electric' ? 0.09 : 0.03;
  field.emit({
    position: at.clone().add(new Vector3((rng() - 0.5) * jitter, (rng() - 0.5) * jitter, (rng() - 0.5) * jitter)),
    velocity: new Vector3((rng() - 0.5) * 0.2, (rng() - 0.5) * 0.2 + style.gravity * 0.05, (rng() - 0.5) * 0.2),
    life: style.life * 0.5,
    size: style.size * 0.9,
    color: typeColorHex(type),
    gravity: style.gravity * 0.3,
  });
}

/** Energia se juntando em volta de quem vai atacar. */
export function emitCharge(field: ParticleField, at: Vector3, type: PokemonType, rng: Rng): void {
  const angle = rng() * Math.PI * 2;
  const radius = 0.22 + rng() * 0.1;
  const offset = new Vector3(Math.cos(angle) * radius, (rng() - 0.3) * 0.25, Math.sin(angle) * radius);
  field.emit({
    position: at.clone().add(offset),
    velocity: offset.clone().multiplyScalar(-2.2),
    life: 300,
    size: FX_STYLES[type].size * 0.8,
    color: typeColorHex(type),
  });
}

const CONFETTI = [0xffcb05, 0xff5d73, 0x4ade80, 0x60a5fa, 0xf472b6, 0xffffff];
/** Chuva de confete da vitória. */
export function emitConfetti(field: ParticleField, over: Vector3, rng: Rng): void {
  for (let i = 0; i < 3; i++) {
    field.emit({
      position: over.clone().add(new Vector3((rng() - 0.5) * 0.6, 0.6 + rng() * 0.3, (rng() - 0.5) * 0.6)),
      velocity: new Vector3((rng() - 0.5) * 0.8, 0.5 + rng() * 0.8, (rng() - 0.5) * 0.8),
      life: 1100 + rng() * 500,
      size: 0.05 + rng() * 0.04,
      color: CONFETTI[Math.floor(rng() * CONFETTI.length)]!,
      gravity: -1.8,
    });
  }
}
