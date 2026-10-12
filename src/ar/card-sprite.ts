import {
  DataTexture, DoubleSide, Group, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, RGBAFormat,
  SRGBColorSpace, UnsignedByteType,
} from 'three';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
import type { RgbaImage } from '../recognition/types';
import { clampLayout, DEFAULT_LAYOUT, spriteMatrix } from './anchor';
import type { SpriteLayout } from './anchor';
import { makePlaceholder } from './placeholder';

export type SpriteMode = 'empty' | 'animated' | 'static' | 'placeholder';

function asBytes(rgba: Uint8ClampedArray): Uint8Array {
  return new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
}

/**
 * Sprite 2D (plano com textura RGBA transparente) em pé sobre a carta. `group` é o espaço da carta
 * (a matriz dele vem do rastreamento: worldMatrix · postMatrix); o plano é um filho dele, tombado
 * em +90° em X, com a base na carta (veja `anchor.ts`).
 *
 * A animação do GIF é reproduzida quadro a quadro: cada quadro já composto (RGBA) é enviado à
 * mesma textura WebGL no instante certo (`frameIndexAt`), preservando os atrasos do arquivo.
 * Nunca troca a animação por uma imagem parada em silêncio: o modo "estático" só existe quando o
 * chamador pede explicitamente (porque não há GIF) e a interface diz isso.
 */
export class CardSprite {
  readonly group = new Group();
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  mode: SpriteMode = 'empty';
  private gif: DecodedGif | null = null;
  private texture: DataTexture | null = null;
  private aspect = 1;
  private layout: SpriteLayout = DEFAULT_LAYOUT;
  private startedAt = 0;
  private shownFrame = -1;
  /** Quantos quadros foram enviados à textura (diagnóstico e testes). */
  uploads = 0;

  constructor() {
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    // alphaTest em vez de blending: a transparência do GIF é binária e evita halos e problemas de ordem.
    const material = new MeshBasicMaterial({ alphaTest: 0.5, side: DoubleSide });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  setLayout(layout: SpriteLayout): void {
    this.layout = clampLayout(layout);
    this.applyLayout();
  }

  getLayout(): SpriteLayout {
    return this.layout;
  }

  private applyLayout(): void {
    this.mesh.matrix.fromArray(spriteMatrix(this.layout, this.aspect));
    this.mesh.matrixWorldNeedsUpdate = true;
  }

  private makeTexture(width: number, height: number, rgba: Uint8ClampedArray, smooth: boolean): DataTexture {
    const texture = new DataTexture(asBytes(rgba), width, height, RGBAFormat, UnsignedByteType);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = smooth ? LinearFilter : NearestFilter;
    texture.minFilter = smooth ? LinearFilter : NearestFilter;
    texture.generateMipmaps = false;
    // DataTexture guarda as linhas de cima para baixo; inverter o V evita copiar os dados.
    texture.repeat.set(1, -1);
    texture.offset.set(0, 1);
    texture.needsUpdate = true;
    return texture;
  }

  private show(texture: DataTexture, width: number, height: number, mode: SpriteMode): void {
    this.releaseTexture();
    this.texture = texture;
    this.mesh.material.map = texture;
    this.mesh.material.needsUpdate = true;
    this.aspect = width / height;
    this.mode = mode;
    this.mesh.visible = true;
    this.applyLayout();
  }

  /** GIF animado: as proporções e os atrasos vêm do arquivo. */
  setAnimation(gif: DecodedGif, nowMs = performance.now()): void {
    const first = gif.frames[0];
    if (!first) throw new Error('GIF sem quadros.');
    this.gif = gif;
    this.shownFrame = 0;
    this.startedAt = nowMs;
    this.show(this.makeTexture(gif.width, gif.height, first.rgba, false), gif.width, gif.height, 'animated');
  }

  /** Imagem parada (PNG de reserva). Só use quando o GIF não existe. */
  setStatic(image: RgbaImage): void {
    this.gif = null;
    this.show(this.makeTexture(image.width, image.height, image.data, Math.max(image.width, image.height) > 128), image.width, image.height, 'static');
  }

  /** Marcador neutro, para quando não há nenhum sprite. */
  setPlaceholder(): void {
    const image = makePlaceholder();
    this.gif = null;
    this.show(this.makeTexture(image.width, image.height, image.data, false), image.width, image.height, 'placeholder');
  }

  clear(): void {
    this.releaseTexture();
    this.gif = null;
    this.mode = 'empty';
    this.mesh.visible = false;
  }

  /** Mostra/oculta o conjunto (rastreamento perdido → oculta). */
  setTracked(tracked: boolean): void {
    this.group.visible = tracked;
  }

  /** Aplica a pose da carta (matriz do espaço da carta, ordem de colunas). */
  setCardMatrix(matrix: ArrayLike<number>): void {
    this.group.matrix.fromArray(Array.from(matrix));
    this.group.matrixWorldNeedsUpdate = true;
  }

  /** Atualiza o quadro da animação para o instante `nowMs`. Devolve true se enviou um quadro novo à textura. */
  update(nowMs: number): boolean {
    if (this.mode !== 'animated' || !this.gif || !this.texture) return false;
    const index = frameIndexAt(this.gif, nowMs - this.startedAt);
    if (index === this.shownFrame) return false;
    const frame = this.gif.frames[index];
    if (!frame) return false;
    this.shownFrame = index;
    this.texture.image.data = asBytes(frame.rgba);
    this.texture.needsUpdate = true;
    this.uploads++;
    return true;
  }

  get currentFrame(): number {
    return this.shownFrame;
  }

  /** Matriz mundial do plano (para testes e depuração). */
  worldMatrixOfPlane(): Matrix4 {
    this.group.updateMatrixWorld(true);
    return this.mesh.matrixWorld.clone();
  }

  private releaseTexture(): void {
    this.texture?.dispose();
    this.texture = null;
    this.mesh.material.map = null;
    this.mesh.material.needsUpdate = true;
  }

  dispose(): void {
    this.releaseTexture();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.group.remove(this.mesh);
  }
}
