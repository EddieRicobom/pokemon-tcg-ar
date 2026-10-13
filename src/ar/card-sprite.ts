import {
  DataTexture, DoubleSide, Group, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, Quaternion, RGBAFormat,
  SRGBColorSpace, UnsignedByteType, Vector3,
} from 'three';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
import type { RgbaImage } from '../recognition/types';
import { clampLayout, DEFAULT_LAYOUT, spriteMatrix, yawTowardCamera } from './anchor';
import type { SpriteLayout } from './anchor';
import { makePlaceholder } from './placeholder';

/** Constante de tempo (ms) do suavizador de pose: o rastreador entrega ~10–20 poses/s e a tela desenha 60 quadros/s. */
export const POSE_SMOOTHING_MS = 60;

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
  /** Giro automático (graus) para o sprite olhar para a câmera; suavizado entre quadros. */
  private readonly targetMatrix = new Matrix4();
  private hasPose = false;
  private lastSmoothMs = 0;
  private autoYaw = 0;
  private hasAutoYaw = false;
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
    this.mesh.matrix.fromArray(spriteMatrix(this.layout, this.aspect, this.layout.faceCamera === false ? 0 : this.autoYaw));
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
    // Depois de sumir, a próxima pose aparece direto no lugar certo (sem deslizar da posição antiga).
    if (!tracked) this.hasPose = false;
  }

  /** Aplica a pose da carta (matriz do espaço da carta, ordem de colunas). */
  setCardMatrix(matrix: ArrayLike<number>): void {
    const m = Array.from(matrix);
    this.targetMatrix.fromArray(m);
    if (!this.hasPose) {
      this.group.matrix.copy(this.targetMatrix);
      this.hasPose = true;
    }
    this.group.matrixWorldNeedsUpdate = true;
    if (this.layout.faceCamera !== false) {
      const target = yawTowardCamera(m);
      if (target !== null) {
        if (!this.hasAutoYaw) this.autoYaw = target;
        else {
          // Interpola pelo caminho curto para o sprite não girar de uma vez a cada tremida do rastreamento.
          const diff = ((target - this.autoYaw + 540) % 360) - 180;
          this.autoYaw += diff * 0.3;
        }
        this.hasAutoYaw = true;
        this.applyLayout();
      }
    }
  }

  /** Atualiza o quadro da animação para o instante `nowMs`. Devolve true se enviou um quadro novo à textura. */
  update(nowMs: number): boolean {
    this.smoothPose(nowMs);
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

  private readonly tmpPos = new Vector3();
  private readonly tmpScale = new Vector3();
  private readonly tmpQuat = new Quaternion();
  private readonly tgtPos = new Vector3();
  private readonly tgtScale = new Vector3();
  private readonly tgtQuat = new Quaternion();

  /** Aproxima a pose desenhada da última pose rastreada, a cada quadro de tela (posição/escala lineares, rotação por slerp). */
  private smoothPose(nowMs: number): void {
    const dt = this.lastSmoothMs === 0 ? 0 : Math.min(100, Math.max(0, nowMs - this.lastSmoothMs));
    this.lastSmoothMs = nowMs;
    if (!this.hasPose || dt === 0) return;
    const alpha = 1 - Math.exp(-dt / POSE_SMOOTHING_MS);
    this.group.matrix.decompose(this.tmpPos, this.tmpQuat, this.tmpScale);
    this.targetMatrix.decompose(this.tgtPos, this.tgtQuat, this.tgtScale);
    this.tmpPos.lerp(this.tgtPos, alpha);
    this.tmpScale.lerp(this.tgtScale, alpha);
    this.tmpQuat.slerp(this.tgtQuat, alpha);
    this.group.matrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
    this.group.matrixWorldNeedsUpdate = true;
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
