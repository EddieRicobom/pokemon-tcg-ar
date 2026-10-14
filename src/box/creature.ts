import {
  DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector3,
  CircleGeometry,
} from 'three';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
import { upscaleSprite } from '../core/pixel-upscale';
import { applyLook, DEFAULT_LOOK, isDefaultLook, lookKey } from '../core/sprite-look';
import type { SpriteLook } from '../core/sprite-look';
import type { RgbaImage } from '../recognition/types';
import type { WanderState } from './wander';

export interface CreatureInfo {
  id: string;
  name: string;
  dexId?: number;
  /** Linha de detalhe (coleção e número da carta). */
  detail: string;
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
  private look: SpriteLook = DEFAULT_LOOK;
  private lastRgba: Uint8ClampedArray;
  private readonly gif: DecodedGif | null;
  private readonly spriteWidth: number;
  private readonly spriteHeight: number;
  private startedAt = 0;
  private shownFrame = -1;
  private flip = 1;
  /** Brilho de "foi tocado" (ms restantes). */
  private pulseMs = 0;

  constructor(readonly info: CreatureInfo, source: CreatureSource, readonly state: WanderState) {
    const first = source.kind === 'gif' ? source.gif.frames[0]?.rgba : source.image.data;
    const width = source.kind === 'gif' ? source.gif.width : source.image.width;
    const height = source.kind === 'gif' ? source.gif.height : source.image.height;
    if (!first) throw new Error('Sprite sem quadros.');
    this.gif = source.kind === 'gif' && source.gif.frames.length > 1 ? source.gif : null;
    this.spriteWidth = width;
    this.spriteHeight = height;
    this.lastRgba = first;
    this.texture = this.makeTexture(this.prepare(first));

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

  /** Quadro ampliado (×2) com o tom e o contorno escolhidos. */
  private prepare(rgba: Uint8ClampedArray): { data: Uint8ClampedArray; width: number; height: number } {
    const up = upscaleSprite(rgba, this.spriteWidth, this.spriteHeight, BOX_MAX_UPSCALE);
    if (isDefaultLook(this.look)) return up;
    return applyLook(up.data, up.width, up.height, this.look, Math.max(1, Math.round(up.factor / 2)));
  }

  private makeTexture(frame: { data: Uint8ClampedArray; width: number; height: number }): DataTexture {
    const texture = new DataTexture(asBytes(frame.data), frame.width, frame.height, RGBAFormat, UnsignedByteType);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(1, -1);
    texture.offset.set(0, 1);
    texture.needsUpdate = true;
    return texture;
  }

  /** Troca o tom de cor e o contorno (refaz a textura com o quadro atual). */
  setLook(look: SpriteLook): void {
    if (lookKey(look) === lookKey(this.look)) return;
    this.look = look;
    const old = this.texture;
    this.texture = this.makeTexture(this.prepare(this.lastRgba));
    this.mesh.material.map = this.texture;
    this.mesh.material.needsUpdate = true;
    old.dispose();
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
    this.group.position.set(base.x + s.x, base.y, base.z + s.z);
    const toCameraX = camera.x - this.group.position.x;
    const toCameraZ = camera.z - this.group.position.z;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = Math.atan2(toCameraX, toCameraZ);
    // Visto de cima, um Pokémon em pé fica achatado: inclina o sprite para a câmera (só parte do ângulo, para ainda parecer em pé).
    const elevation = Math.atan2(camera.y - this.group.position.y, Math.hypot(toCameraX, toCameraZ));
    this.mesh.rotation.x = -Math.min(MAX_LEAN_RAD, Math.max(0, elevation * LEAN_FRACTION));
    const moving = s.vx !== 0 || s.vz !== 0;
    if (moving) {
      const side = s.vx * right.x + s.vz * right.z;
      if (Math.abs(side) > 0.02) this.flip = (side > 0) === SPRITE_FACES_LEFT ? -1 : 1;
    }
    this.mesh.scale.x = this.width * this.flip;
    let hop = moving ? Math.abs(Math.sin(s.hopPhase)) * 0.05 : 0;
    if (this.pulseMs > 0) {
      this.pulseMs = Math.max(0, this.pulseMs - dtMs);
      hop += Math.sin((1 - this.pulseMs / 500) * Math.PI) * 0.12;
    }
    this.mesh.position.y = hop;
    const shadowScale = 1 - Math.min(0.3, hop * 2);
    this.shadow.scale.set(this.width * 0.8 * shadowScale, this.width * 0.45 * shadowScale, 1);

    if (this.gif) {
      if (this.startedAt === 0) this.startedAt = nowMs;
      const index = frameIndexAt(this.gif, nowMs - this.startedAt);
      if (index !== this.shownFrame) {
        const frame = this.gif.frames[index];
        if (frame) {
          this.shownFrame = index;
          this.lastRgba = frame.rgba;
          this.texture.image.data = asBytes(this.prepare(frame.rgba).data);
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
