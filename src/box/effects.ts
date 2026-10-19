import {
  AdditiveBlending, BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, Group, LinearFilter, Line, LineBasicMaterial, Mesh,
  MeshBasicMaterial, RGBAFormat, RingGeometry, Sprite, SpriteMaterial, UnsignedByteType, Vector3,
} from 'three';
import { TYPE_COLORS } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import type { Rng, StatusKind } from '../core/battle';

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

  constructor(readonly capacity = 380) {
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

// ----------------------------------------------------------------------------- anéis (ondas de choque)

interface Ring {
  mesh: Mesh<RingGeometry, MeshBasicMaterial>;
  age: number;
  life: number;
  radius: number;
  active: boolean;
}

/** Ondas de choque achatadas no chão (anéis que crescem e somem). */
export class RingField {
  readonly group = new Group();
  private readonly items: Ring[] = [];
  private cursor = 0;

  constructor(capacity = 10) {
    const geometry = new RingGeometry(0.46, 0.5, 40);
    for (let i = 0; i < capacity; i++) {
      const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      const mesh = new Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.items.push({ mesh, age: 0, life: 1, radius: 1, active: false });
    }
  }

  get activeCount(): number {
    return this.items.reduce((n, r) => n + (r.active ? 1 : 0), 0);
  }

  emit(at: Vector3, color: number, radius: number, lifeMs: number): void {
    const r = this.items[this.cursor]!;
    this.cursor = (this.cursor + 1) % this.items.length;
    r.active = true;
    r.age = 0;
    r.life = Math.max(1, lifeMs);
    r.radius = radius;
    r.mesh.position.set(at.x, 0.02, at.z);
    r.mesh.material.color.setHex(color);
    r.mesh.material.opacity = 0.9;
    r.mesh.scale.setScalar(0.05);
    r.mesh.visible = true;
  }

  update(dtMs: number): void {
    for (const r of this.items) {
      if (!r.active) continue;
      r.age += Math.min(dtMs, 100);
      if (r.age >= r.life) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const u = r.age / r.life;
      r.mesh.scale.setScalar(0.05 + (r.radius * 2 - 0.05) * (1 - (1 - u) * (1 - u)));
      r.mesh.material.opacity = 0.9 * (1 - u);
    }
  }

  clear(): void {
    for (const r of this.items) {
      r.active = false;
      r.mesh.visible = false;
    }
  }

  dispose(): void {
    this.items[0]?.mesh.geometry.dispose();
    for (const r of this.items) r.mesh.material.dispose();
    this.group.clear();
    this.group.removeFromParent();
  }
}

// ----------------------------------------------------------------------------- relâmpago

/** Raio em zigue-zague (três linhas quase juntas) entre dois pontos; refeito a cada chamada de `show`. */
export class BoltLine {
  readonly group = new Group();
  private readonly lines: Line<BufferGeometry, LineBasicMaterial>[] = [];
  static readonly SEGMENTS = 10;

  constructor() {
    for (let i = 0; i < 3; i++) {
      const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array((BoltLine.SEGMENTS + 1) * 3), 3));
      const line = new Line<BufferGeometry, LineBasicMaterial>(geometry, new LineBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      line.frustumCulled = false;
      line.visible = false;
      this.group.add(line);
      this.lines.push(line);
    }
  }

  get visible(): boolean {
    return this.lines[0]!.visible;
  }

  show(from: Vector3, to: Vector3, color: number, rng: Rng, jag = 0.09): void {
    const dir = to.clone().sub(from);
    const side = new Vector3(-dir.z, 0, dir.x).normalize();
    const up = new Vector3(0, 1, 0);
    this.lines.forEach((line, k) => {
      const attr = line.geometry.getAttribute('position') as Float32BufferAttribute;
      for (let i = 0; i <= BoltLine.SEGMENTS; i++) {
        const u = i / BoltLine.SEGMENTS;
        const p = from.clone().lerp(to, u);
        const edge = i === 0 || i === BoltLine.SEGMENTS ? 0 : 1;
        p.addScaledVector(side, (rng() - 0.5) * 2 * jag * edge + (k - 1) * 0.008);
        p.addScaledVector(up, (rng() - 0.5) * 2 * jag * 0.6 * edge);
        attr.setXYZ(i, p.x, p.y, p.z);
      }
      attr.needsUpdate = true;
      line.material.color.setHex(k === 1 ? 0xffffff : color);
      line.material.opacity = k === 1 ? 1 : 0.7;
      line.visible = true;
    });
  }

  hide(): void {
    for (const line of this.lines) line.visible = false;
  }

  dispose(): void {
    for (const line of this.lines) {
      line.geometry.dispose();
      line.material.dispose();
    }
    this.group.clear();
    this.group.removeFromParent();
  }
}

// ----------------------------------------------------------------------------- como cada golpe chega ao alvo

/** Golpe especial: como a energia viaja da atacante ao alvo. */
export type SpecialDelivery = 'orb' | 'bolt' | 'stream' | 'swarm' | 'beam' | 'quake';
/** Golpe físico: a coreografia do ataque corpo a corpo. */
export type PhysicalStyle = 'tackle' | 'jab' | 'dive' | 'stomp' | 'slash';

export const SPECIAL_DELIVERY: Record<PokemonType, SpecialDelivery> = {
  normal: 'orb', fire: 'orb', water: 'stream', electric: 'bolt', grass: 'swarm', ice: 'beam', fighting: 'orb', poison: 'stream',
  ground: 'quake', flying: 'swarm', psychic: 'beam', bug: 'swarm', rock: 'quake', ghost: 'orb', dragon: 'beam', dark: 'orb',
  steel: 'beam', fairy: 'swarm',
};

export const PHYSICAL_STYLE: Record<PokemonType, PhysicalStyle> = {
  normal: 'tackle', fire: 'tackle', water: 'tackle', electric: 'tackle', grass: 'slash', ice: 'tackle', fighting: 'jab', poison: 'tackle',
  ground: 'stomp', flying: 'dive', psychic: 'tackle', bug: 'slash', rock: 'stomp', ghost: 'tackle', dragon: 'slash', dark: 'slash',
  steel: 'slash', fairy: 'tackle',
};

/** Efeito extra de cada tipo no impacto, além da explosão comum. */
export type ImpactExtra = 'embers' | 'droplets' | 'sparks' | 'leaves' | 'shards' | 'debris' | 'bubbles' | 'wisps' | 'sparkles' | 'feathers' | 'swarmdots' | 'streaks' | 'none';

interface ExtraStyle {
  count: number;
  speed: number;
  life: number;
  size: number;
  gravity: number;
  /** Fração da velocidade que aponta para cima (1 = só para cima). */
  up: number;
  color?: number;
}

const EXTRA_STYLES: Record<Exclude<ImpactExtra, 'none'>, ExtraStyle> = {
  embers: { count: 14, speed: 0.7, life: 900, size: 0.05, gravity: 1.2, up: 0.9, color: 0xffd27a },
  droplets: { count: 16, speed: 1.2, life: 650, size: 0.05, gravity: -4, up: 0.8, color: 0xcfe6ff },
  sparks: { count: 18, speed: 2.8, life: 240, size: 0.04, gravity: 0, up: 0.2, color: 0xfffbcc },
  leaves: { count: 12, speed: 1.0, life: 1100, size: 0.07, gravity: -0.5, up: 0.7, color: 0xa7f070 },
  shards: { count: 16, speed: 2.2, life: 750, size: 0.06, gravity: -2.5, up: 0.5, color: 0xe6fbff },
  debris: { count: 16, speed: 1.6, life: 800, size: 0.08, gravity: -7, up: 1, color: 0x9a7b4f },
  bubbles: { count: 12, speed: 0.4, life: 1200, size: 0.09, gravity: 0.5, up: 1, color: 0xd78bff },
  wisps: { count: 10, speed: 0.35, life: 1300, size: 0.1, gravity: 0.6, up: 1, color: 0xb08cff },
  sparkles: { count: 18, speed: 0.6, life: 1100, size: 0.05, gravity: 0.3, up: 0.8, color: 0xffd6ee },
  feathers: { count: 12, speed: 1.0, life: 1000, size: 0.06, gravity: -0.4, up: 0.5, color: 0xffffff },
  swarmdots: { count: 18, speed: 1.2, life: 700, size: 0.04, gravity: 0, up: 0.3, color: 0xd9ff66 },
  streaks: { count: 14, speed: 3.0, life: 200, size: 0.035, gravity: 0, up: 0.2, color: 0xffffff },
};

export interface ImpactStyle {
  /** Raio da onda de choque no chão (0 = sem onda). */
  ring: number;
  extra: ImpactExtra;
  /** Pisca a tela toda no golpe. */
  flash: boolean;
}

export const IMPACT_STYLES: Record<PokemonType, ImpactStyle> = {
  normal: { ring: 0.55, extra: 'streaks', flash: false },
  fire: { ring: 0.4, extra: 'embers', flash: false },
  water: { ring: 0.6, extra: 'droplets', flash: false },
  electric: { ring: 0.35, extra: 'sparks', flash: true },
  grass: { ring: 0, extra: 'leaves', flash: false },
  ice: { ring: 0.5, extra: 'shards', flash: false },
  fighting: { ring: 0.7, extra: 'streaks', flash: false },
  poison: { ring: 0.35, extra: 'bubbles', flash: false },
  ground: { ring: 0.85, extra: 'debris', flash: false },
  flying: { ring: 0.5, extra: 'feathers', flash: false },
  psychic: { ring: 0.9, extra: 'sparkles', flash: false },
  bug: { ring: 0, extra: 'swarmdots', flash: false },
  rock: { ring: 0.7, extra: 'debris', flash: false },
  ghost: { ring: 0.45, extra: 'wisps', flash: false },
  dragon: { ring: 1.0, extra: 'sparks', flash: true },
  dark: { ring: 0.6, extra: 'wisps', flash: false },
  steel: { ring: 0.5, extra: 'streaks', flash: false },
  fairy: { ring: 0.6, extra: 'sparkles', flash: false },
};

/** Tinge o Pokémon que levou o golpe na cor do tipo (misturada ao branco, para a textura ainda aparecer). */
export function hitTint(type: PokemonType): number {
  return new Color(0xffffff).lerp(new Color(typeColorHex(type)), 0.6).getHex();
}

export function emitExtra(field: ParticleField, at: Vector3, kind: ImpactExtra, type: PokemonType, strength: number, rng: Rng): void {
  if (kind === 'none') return;
  const style = EXTRA_STYLES[kind];
  const color = style.color ?? typeColorHex(type);
  const count = Math.round(style.count * Math.min(1.8, Math.max(0.5, strength)));
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const horizontal = Math.sqrt(Math.max(0, 1 - style.up * style.up)) * (0.4 + rng() * 0.8);
    const velocity = new Vector3(Math.cos(theta) * horizontal, style.up * (0.5 + rng() * 0.7), Math.sin(theta) * horizontal).multiplyScalar(style.speed);
    field.emit({ position: at, velocity, life: style.life * (0.6 + rng() * 0.6), size: style.size * (0.7 + rng() * 0.8), color, gravity: style.gravity });
  }
}

/** Impacto completo: explosão comum + extra do tipo + onda de choque. */
export function emitImpact(field: ParticleField, rings: RingField, at: Vector3, type: PokemonType, strength: number, rng: Rng, intensity = 1): void {
  const dramatic = Math.max(1, Math.min(1.7, Number.isFinite(intensity) ? intensity : 1));
  emitBurst(field, at, type, strength * dramatic, rng);
  const style = IMPACT_STYLES[type];
  emitExtra(field, at, style.extra, type, strength * dramatic, rng);
  if (style.ring > 0) {
    rings.emit(at, typeColorHex(type), style.ring * Math.min(1.8, (0.7 + strength * 0.4) * dramatic), 520 + (dramatic - 1) * 200);
    if (type === 'dragon') rings.emit(at, 0xffffff, style.ring * 0.6, 420);
  }
  if (dramatic > 1.05) {
    // Uma segunda onda clara dá escala ao impacto e torna o elemento legível mesmo sem luz dinâmica.
    const radius = Math.max(0.42, style.ring * 0.82) * dramatic;
    rings.emit(at, 0xffffff, radius, 620 + (dramatic - 1) * 220);
    if (style.ring === 0) rings.emit(at, typeColorHex(type), radius * 0.7, 520);
  }
}

/** Marcas de corte (arco de partículas atravessando o alvo na diagonal). */
export function emitSlash(field: ParticleField, at: Vector3, type: PokemonType, rng: Rng, flip = 1): void {
  const color = type === 'steel' ? 0xe8f0ff : typeColorHex(type);
  for (let i = 0; i < 14; i++) {
    const u = i / 13 - 0.5;
    field.emit({
      position: new Vector3(at.x + u * 0.34 * flip, at.y + u * -0.32, at.z + (rng() - 0.5) * 0.04),
      velocity: new Vector3(u * 0.5 * flip, -u * 0.4, 0),
      life: 260,
      size: 0.07 * (1 - Math.abs(u) * 0.8),
      color: i % 3 === 0 ? 0xffffff : color,
    });
  }
}

// --- entregas dos golpes especiais (chamadas a cada quadro; `u` = progresso 0–1 do trajeto)

export function emitStreamStep(field: ParticleField, from: Vector3, to: Vector3, travelMs: number, type: PokemonType, rng: Rng): void {
  const color = type === 'poison' ? 0xc06bff : typeColorHex(type);
  const velocity = to.clone().sub(from).multiplyScalar(1000 / travelMs);
  for (let i = 0; i < 4; i++) {
    field.emit({
      position: from.clone().add(new Vector3((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05)),
      velocity: velocity.clone().multiplyScalar(0.85 + rng() * 0.3).add(new Vector3((rng() - 0.5) * 0.35, 0.1 + rng() * 0.25, (rng() - 0.5) * 0.35)),
      life: travelMs * 0.95,
      size: 0.06 + rng() * 0.04,
      color: i % 3 === 0 ? 0xffffff : color,
    });
  }
}

export function emitSwarmStep(field: ParticleField, from: Vector3, to: Vector3, u: number, type: PokemonType, phase: number, rng: Rng): void {
  const center = from.clone().lerp(to, u);
  const color = type === 'fairy' ? 0xffb6e1 : type === 'bug' ? 0xd9ff66 : type === 'flying' ? 0xe8f4ff : typeColorHex(type);
  const side = new Vector3(-(to.z - from.z), 0, to.x - from.x).normalize();
  for (let i = 0; i < 3; i++) {
    const a = phase + i * ((Math.PI * 2) / 3);
    const r = 0.09 + 0.03 * Math.sin(phase * 2 + i);
    field.emit({
      position: center.clone().addScaledVector(side, Math.cos(a) * r).add(new Vector3(0, Math.sin(a) * r, 0)),
      velocity: new Vector3((rng() - 0.5) * 0.15, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.15),
      life: 320,
      size: type === 'bug' ? 0.045 : 0.065,
      color,
    });
  }
}

export function emitBeamStep(field: ParticleField, from: Vector3, to: Vector3, headU: number, type: PokemonType, rng: Rng): void {
  const color = type === 'steel' ? 0xdfe8f5 : typeColorHex(type);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * Math.min(1, headU);
    const p = from.clone().lerp(to, u);
    p.add(new Vector3((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.03, (rng() - 0.5) * 0.03));
    field.emit({ position: p, velocity: new Vector3(), life: 110, size: 0.08 + 0.04 * Math.sin(u * 20 + headU * 12), color: i % 2 === 0 ? 0xffffff : color });
  }
}

/** Poeira e pedras correndo pelo chão (golpes de Terra e Pedra). */
export function emitQuakeStep(field: ParticleField, from: Vector3, to: Vector3, u: number, type: PokemonType, rng: Rng): void {
  const p = from.clone().lerp(to, u);
  p.y = 0.03;
  const color = type === 'rock' ? 0xb6a136 : 0xc9a063;
  for (let i = 0; i < 4; i++) {
    field.emit({
      position: p.clone().add(new Vector3((rng() - 0.5) * 0.2, 0, (rng() - 0.5) * 0.2)),
      velocity: new Vector3((rng() - 0.5) * 0.3, 0.6 + rng() * 0.8, (rng() - 0.5) * 0.3),
      life: 480,
      size: 0.07 + rng() * 0.04,
      color,
      gravity: -4,
    });
  }
}

// ----------------------------------------------------------------------------- condições (efeito contínuo sobre o Pokémon)

export const STATUS_TINTS: Record<StatusKind, number> = { burn: 0xffb08a, poison: 0xe2b8ff, paralysis: 0xfff2a0, freeze: 0xa8dcff };
export const STATUS_COLORS_CSS: Record<StatusKind, string> = { burn: '#fb923c', poison: '#c084fc', paralysis: '#facc15', freeze: '#7dd3fc' };

/** Um pouco de efeito do estado do Pokémon (chamar algumas vezes por segundo). `at` = meio do corpo. */
export function emitStatusAmbient(field: ParticleField, at: Vector3, status: StatusKind, rng: Rng, height: number): void {
  const spot = at.clone().add(new Vector3((rng() - 0.5) * 0.2, (rng() - 0.3) * height * 0.8, (rng() - 0.5) * 0.2));
  switch (status) {
    case 'burn':
      field.emit({ position: spot, velocity: new Vector3(0, 0.5, 0), life: 600, size: 0.07, color: rng() < 0.5 ? 0xff7a2a : 0xffd04a, gravity: 0.8 });
      break;
    case 'poison':
      field.emit({ position: spot, velocity: new Vector3(0, 0.3, 0), life: 900, size: 0.08, color: 0xb04fe0, gravity: 0.3 });
      break;
    case 'paralysis':
      for (let i = 0; i < 2; i++) {
        field.emit({ position: spot, velocity: new Vector3((rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6), life: 140, size: 0.045, color: 0xfff27a });
      }
      break;
    case 'freeze':
      field.emit({ position: spot, velocity: new Vector3(0, -0.1, 0), life: 800, size: 0.05, color: 0xcdf1ff, gravity: -0.2 });
      break;
  }
}

export { getGlowTexture as glowMap };
