import {
  DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector3,
  CircleGeometry,
} from 'three';
import { enableRelight } from './fx-lights';
import type { FxLights } from './fx-lights';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
import { DEFAULT_SMOOTHING, isLinearSmoothing, upscaleSprite } from '../core/pixel-upscale';
import type { SmoothingMode } from '../core/pixel-upscale';
import type { RgbaImage } from '../recognition/types';
import type { WanderState } from './wander';

export interface CreatureInfo {
  id: string;
  name: string;
  dexId?: number;
  /** Linha de detalhe (coleção e número da carta). */
  detail: string;
}

/** Efeitos de batalha aplicados por cima da animação normal (a direção da batalha escreve aqui). */
export interface CreatureFx {
  /** Deslocamento (m) somado à posição no chão. */
  dx: number;
  dy: number;
  dz: number;
  /** Escala geral e achatamento vertical (agachar antes do golpe). */
  scale: number;
  squash: number;
  /** Cor multiplicada à textura (0xffffff = normal; vermelho = levou golpe). */
  tint: number;
  /** 0 = de pé, 1 = desmaiado (tombado e escurecido). */
  faint: number;
  /** Direção em que olha (no chão); null = segue o movimento. */
  facing: { x: number; z: number } | null;
}

export function neutralFx(): CreatureFx {
  return { dx: 0, dy: 0, dz: 0, scale: 1, squash: 1, tint: 0xffffff, faint: 0, facing: null };
}

export type CreatureSource = { kind: 'gif'; gif: DecodedGif } | { kind: 'image'; image: RgbaImage };

/** Metros de altura por pixel do sprite (96 px ≈ 0,34 m): Pokémon maiores no GIF ficam maiores na caixa. */
const METERS_PER_PIXEL = 0.0035;
const MIN_HEIGHT_M = 0.18;
const MAX_HEIGHT_M = 0.9;
/** Os sprites do Showdown olham para a esquerda da tela: ao andar para a direita, espelha. */
const SPRITE_FACES_LEFT = true;
/** Ampliação dentro da caixa (×2): a tela mostra o Pokémon pequeno e há muitos ao mesmo tempo. */
const BOX_MAX_UPSCALE = 2;
/** Memória máxima de quadros suavizados por Pokémon quando a caixa tem poucos. */
const FRAME_CACHE_BYTES = 6 * 1024 * 1024;
/** Memória total (todos os Pokémon da caixa) para os quadros suavizados: com 40 na caixa, cada um fica com menos. */
export const BOX_FRAME_BUDGET_BYTES = 64 * 1024 * 1024;

/** Memória de quadros de cada Pokémon para uma caixa com `count` deles (dividida, com teto e um piso útil). */
export function frameCacheFor(count: number): number {
  const share = BOX_FRAME_BUDGET_BYTES / (Number.isFinite(count) ? Math.max(1, count) : 1);
  return Math.floor(Math.min(FRAME_CACHE_BYTES, Math.max(512 * 1024, share)));
}

interface PreparedFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
/** Inclinação do sprite para a câmera quando ela está acima: fração do ângulo de elevação, até este máximo. */
const LEAN_FRACTION = 0.6;
const MAX_LEAN_RAD = 0.75;

function asBytes(rgba: Uint8ClampedArray): Uint8Array {
  return new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
}

export function creatureHeightMeters(pixelHeight: number): number {
  return Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, pixelHeight * METERS_PER_PIXEL));
}

/**
 * Um Pokémon solto na caixa: plano em pé (sempre virado para a câmera, só girando em torno do eixo vertical),
 * sombra redonda no chão, GIF animado quadro a quadro e pulinho enquanto anda.
 */
export class BoxCreature {
  readonly group = new Group();
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly shadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly width: number;
  readonly height: number;
  private texture: DataTexture;
  private smoothing: SmoothingMode = DEFAULT_SMOOTHING;
  /** Quadros já suavizados (a conta é cara e o GIF repete os mesmos quadros o tempo todo). */
  private readonly frameCache = new Map<number, PreparedFrame>();
  private frameCacheBytes = 0;
  private lastRgba: Uint8ClampedArray;
  private readonly gif: DecodedGif | null;
  private readonly spriteWidth: number;
  private readonly spriteHeight: number;
  private startedAt = 0;
  private shownFrame = -1;
  private flip = 1;
  /** Brilho de "foi tocado" (ms restantes). */
  private pulseMs = 0;
  readonly fx: CreatureFx = neutralFx();

  constructor(readonly info: CreatureInfo, source: CreatureSource, readonly state: WanderState, private readonly frameCacheLimit = FRAME_CACHE_BYTES) {
    const first = source.kind === 'gif' ? source.gif.frames[0]?.rgba : source.image.data;
    const width = source.kind === 'gif' ? source.gif.width : source.image.width;
    const height = source.kind === 'gif' ? source.gif.height : source.image.height;
    if (!first) throw new Error('Sprite sem quadros.');
    this.gif = source.kind === 'gif' && source.gif.frames.length > 1 ? source.gif : null;
    this.spriteWidth = width;
    this.spriteHeight = height;
    this.lastRgba = first;
    this.texture = this.makeTexture(this.prepare(0, first));

    this.height = creatureHeightMeters(height);
    this.width = this.height * (width / height);
    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0); // origem nos pés
    this.mesh = new Mesh(geometry, new MeshBasicMaterial({ map: this.texture, alphaTest: 0.5, side: DoubleSide }));
    this.mesh.scale.set(this.width, this.height, 1);
    this.shadow = new Mesh(
      new CircleGeometry(0.5, 20),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    this.shadow.scale.set(this.width * 0.8, this.width * 0.45, 1);
    this.group.add(this.shadow, this.mesh);
    this.mesh.userData.creature = this;
  }

  /** Quadro ampliado (×2) e suavizado no modo escolhido; o resultado fica guardado até a memória acabar. */
  private prepare(index: number, rgba: Uint8ClampedArray): PreparedFrame {
    const cached = this.frameCache.get(index);
    if (cached) return cached;
    const up = upscaleSprite(rgba, this.spriteWidth, this.spriteHeight, BOX_MAX_UPSCALE, this.smoothing);
    const prepared: PreparedFrame = { data: up.data, width: up.width, height: up.height };
    if (this.frameCacheBytes + prepared.data.byteLength <= this.frameCacheLimit) {
      this.frameCache.set(index, prepared);
      this.frameCacheBytes += prepared.data.byteLength;
    }
    return prepared;
  }

  private makeTexture(frame: PreparedFrame): DataTexture {
    const texture = new DataTexture(asBytes(frame.data), frame.width, frame.height, RGBAFormat, UnsignedByteType);
    texture.colorSpace = SRGBColorSpace;
    const filter = isLinearSmoothing(this.smoothing) ? LinearFilter : NearestFilter;
    texture.magFilter = filter;
    texture.minFilter = filter;
    texture.generateMipmaps = false;
    texture.repeat.set(1, -1);
    texture.offset.set(0, 1);
    texture.needsUpdate = true;
    return texture;
  }

  /** Troca o modo de suavização dos pixels (refaz a textura com o quadro atual). */
  setSmoothing(mode: SmoothingMode): void {
    if (mode === this.smoothing) return;
    this.smoothing = mode;
    this.frameCache.clear();
    this.frameCacheBytes = 0;
    const old = this.texture;
    this.texture = this.makeTexture(this.prepare(Math.max(0, this.shownFrame), this.lastRgba));
    this.mesh.material.map = this.texture;
    this.mesh.material.needsUpdate = true;
    old.dispose();
  }

  /** Liga a iluminação dos golpes e do ambiente neste sprite (ver fx-lights.ts). */
  attachLights(lights: FxLights): void {
    enableRelight(this.mesh.material, lights);
  }

  /** Toque: o Pokémon dá um pulinho de confirmação. */
  poke(): void {
    this.pulseMs = 500;
  }

  /**
   * `base` = ponto do chão no centro da caixa; `camera` = posição da câmera; `right` = eixo "direita da tela"
   * (para decidir para que lado espelhar).
   */
  update(nowMs: number, dtMs: number, base: Vector3, camera: Vector3, right: Vector3): void {
    const s = this.state;
    const fx = this.fx;
    this.group.position.set(base.x + s.x + fx.dx, base.y, base.z + s.z + fx.dz);
    const toCameraX = camera.x - this.group.position.x;
    const toCameraZ = camera.z - this.group.position.z;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = Math.atan2(toCameraX, toCameraZ);
    // Visto de cima, um Pokémon em pé fica achatado: inclina o sprite para a câmera (só parte do ângulo, para ainda parecer em pé).
    const elevation = Math.atan2(camera.y - this.group.position.y, Math.hypot(toCameraX, toCameraZ));
    this.mesh.rotation.x = -Math.min(MAX_LEAN_RAD, Math.max(0, elevation * LEAN_FRACTION));
    const moving = s.vx !== 0 || s.vz !== 0;
    const heading = fx.facing ?? (moving ? { x: s.vx, z: s.vz } : null);
    if (heading) {
      const side = heading.x * right.x + heading.z * right.z;
      if (Math.abs(side) > 0.02) this.flip = (side > 0) === SPRITE_FACES_LEFT ? -1 : 1;
    }
    this.mesh.scale.x = this.width * this.flip * fx.scale;
    this.mesh.scale.y = this.height * fx.scale * fx.squash;
    this.mesh.rotation.z = fx.faint * 1.35 * -this.flip;
    // Desmaiado fica escuro; levar golpe tinge de vermelho.
    const dark = 1 - fx.faint * 0.6;
    this.mesh.material.color.setHex(fx.tint).multiplyScalar(dark);
    let hop = moving ? Math.abs(Math.sin(s.hopPhase)) * 0.05 : 0;
    if (this.pulseMs > 0) {
      this.pulseMs = Math.max(0, this.pulseMs - dtMs);
      hop += Math.sin((1 - this.pulseMs / 500) * Math.PI) * 0.12;
    }
    hop += fx.dy;
    this.mesh.position.y = hop;
    const shadowScale = 1 - Math.min(0.3, Math.max(0, hop) * 2);
    this.shadow.scale.set(this.width * 0.8 * shadowScale, this.width * 0.45 * shadowScale, 1);

    if (this.gif) {
      if (this.startedAt === 0) this.startedAt = nowMs;
      const index = frameIndexAt(this.gif, nowMs - this.startedAt);
      if (index !== this.shownFrame) {
        const frame = this.gif.frames[index];
        if (frame) {
          this.shownFrame = index;
          this.lastRgba = frame.rgba;
          this.texture.image.data = asBytes(this.prepare(index, frame.rgba).data);
          this.texture.needsUpdate = true;
        }
      }
    }
  }

  get currentFrame(): number {
    return this.shownFrame;
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.group.removeFromParent();
  }
}
