import {
  DataTexture, DoubleSide, Group, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, Quaternion, RGBAFormat,
  SRGBColorSpace, UnsignedByteType, Vector3,
} from 'three';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
import { upscaleSprite } from '../core/pixel-upscale';
import { applyLook, DEFAULT_LOOK, isDefaultLook, lookKey, normalizeLook } from '../core/sprite-look';
import type { SpriteLook } from '../core/sprite-look';
import type { RgbaImage } from '../recognition/types';
import { clampLayout, DEFAULT_LAYOUT, spriteMatrix, yawTowardCamera } from './anchor';
import type { SpriteLayout, SpritePlacement } from './anchor';
import { makePlaceholder } from './placeholder';
import { adaptiveTauMs, smoothingAlpha } from './smoothing';


/** Memória máxima (bytes) para guardar os quadros já ampliados; acima disso, amplia de novo a cada troca de quadro. */
const FRAME_CACHE_BYTES = 32 * 1024 * 1024;

export interface CardSpriteOptions {
  /** Limite da memória dos quadros ampliados (várias cartas dividem a memória do aparelho). */
  frameCacheBytes?: number;
}

export type SpriteMode = 'empty' | 'animated' | 'static' | 'placeholder';

/** Quadro como vai para a GPU (ampliado, com o visual aplicado). */
interface PreparedFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

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
  /** Pose suavizada, no quadro de referência em que foi medida (câmera, ou mundo quando há giroscópio). */
  private readonly smoothed = new Matrix4();
  /** Rotação inversa da câmera atual (só vale com giroscópio): leva a pose do mundo de volta para a câmera. */
  private readonly viewRotation = new Matrix4();
  private worldFrame = false;
  private hasPose = false;
  private lastSmoothMs = 0;
  private autoYaw = 0;
  private hasAutoYaw = false;
  /** Quantos quadros foram enviados à textura (diagnóstico e testes). */
  uploads = 0;
  /** Suavização ligada (padrão): ver `SpriteLayout.smooth`. */
  private smooth = true;
  private staticImage: RgbaImage | null = null;
  private look: SpriteLook = DEFAULT_LOOK;
  private readonly frameCache = new Map<number, PreparedFrame>();
  private frameCacheBytes = 0;

  private readonly frameCacheLimit: number;

  constructor(options: CardSpriteOptions = {}) {
    this.frameCacheLimit = options.frameCacheBytes ?? FRAME_CACHE_BYTES;
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
    const before = `${this.smooth}/${lookKey(this.look)}`;
    this.layout = clampLayout(layout);
    this.smooth = this.layout.smooth !== false;
    this.look = normalizeLook(this.layout);
    if (before !== `${this.smooth}/${lookKey(this.look)}`) this.rebuildTexture();
    this.applyLayout();
  }

  /** A suavização mudou: refaz a textura do sprite atual sem reiniciar a animação. */
  private rebuildTexture(): void {
    if (this.mode === 'animated' && this.gif) {
      const startedAt = this.startedAt;
      this.setAnimation(this.gif, startedAt);
      this.shownFrame = -1;
    } else if (this.mode === 'static' && this.staticImage) {
      this.setStatic(this.staticImage);
    }
  }

  /** Quadro como vai para a GPU: ampliado e com bordas preparadas (suavização), com tom e contorno, ou o original. */
  private frameData(index: number, rgba: Uint8ClampedArray, width: number, height: number): PreparedFrame {
    if (!this.smooth && isDefaultLook(this.look)) return { data: rgba, width, height };
    const cached = this.frameCache.get(index);
    if (cached) return cached;
    const base = this.smooth ? upscaleSprite(rgba, width, height) : { data: rgba, width, height, factor: 1 };
    let prepared: PreparedFrame = { data: base.data, width: base.width, height: base.height };
    if (!isDefaultLook(this.look)) prepared = applyLook(base.data, base.width, base.height, this.look, Math.max(1, Math.round(base.factor / 2)));
    if (this.frameCacheBytes + prepared.data.byteLength <= this.frameCacheLimit) {
      this.frameCache.set(index, prepared);
      this.frameCacheBytes += prepared.data.byteLength;
    }
    return prepared;
  }

  private clearFrameCache(): void {
    this.frameCache.clear();
    this.frameCacheBytes = 0;
  }

  getLayout(): SpriteLayout {
    return this.layout;
  }

  /** Ponto do chão sob o centro da ilustração, giro total e tamanho (o painel de status se posiciona por aqui). */
  get placement(): SpritePlacement {
    const yaw = this.layout.yawDeg + (this.layout.faceCamera === false ? 0 : this.autoYaw);
    return { x: this.layout.offsetX, y: this.layout.offsetY, yawDeg: yaw, heightRatio: this.layout.heightRatio };
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
    this.staticImage = null;
    this.clearFrameCache();
    this.shownFrame = 0;
    this.startedAt = nowMs;
    const frame = this.frameData(0, first.rgba, gif.width, gif.height);
    this.show(this.makeTexture(frame.width, frame.height, frame.data, this.smooth), frame.width, frame.height, 'animated');
  }

  /** Imagem parada (PNG de reserva). Só use quando o GIF não existe. */
  setStatic(image: RgbaImage): void {
    this.gif = null;
    this.staticImage = image;
    this.clearFrameCache();
    const frame = this.frameData(0, image.data, image.width, image.height);
    const linear = this.smooth || Math.max(image.width, image.height) > 128;
    this.show(this.makeTexture(frame.width, frame.height, frame.data, linear), frame.width, frame.height, 'static');
  }

  /** Marcador neutro, para quando não há nenhum sprite. */
  setPlaceholder(): void {
    const image = makePlaceholder();
    this.gif = null;
    this.staticImage = null;
    this.show(this.makeTexture(image.width, image.height, image.data, false), image.width, image.height, 'placeholder');
  }

  clear(): void {
    this.releaseTexture();
    this.gif = null;
    this.staticImage = null;
    this.clearFrameCache();
    this.mode = 'empty';
    this.mesh.visible = false;
  }

  /** Mostra/oculta o conjunto (rastreamento perdido → oculta). */
  setTracked(tracked: boolean): void {
    this.group.visible = tracked;
    // Depois de sumir, a próxima pose aparece direto no lugar certo (sem deslizar da posição antiga).
    if (!tracked) this.hasPose = false;
  }

  /**
   * Aplica a pose da carta (matriz do espaço da carta, ordem de colunas, no quadro da câmera).
   * `poseOrientation` = orientação da câmera no instante do quadro (giroscópio): a pose passa a ser guardada no
   * "mundo" e, a cada quadro de tela, volta para a câmera pela orientação atual (`setViewOrientation`). Assim o
   * Pokémon acompanha o giro do celular na hora, sem esperar o próximo resultado do rastreador.
   */
  setCardMatrix(matrix: ArrayLike<number>, poseOrientation?: Quaternion | null): void {
    const m = Array.from(matrix);
    this.targetMatrix.fromArray(m);
    const world = Boolean(poseOrientation);
    if (poseOrientation) this.targetMatrix.premultiply(new Matrix4().makeRotationFromQuaternion(poseOrientation));
    if (!this.hasPose || world !== this.worldFrame) {
      this.smoothed.copy(this.targetMatrix);
      this.hasPose = true;
    }
    if (world !== this.worldFrame) this.viewRotation.identity();
    this.worldFrame = world;
    this.applyGroupMatrix();
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
    this.texture.image.data = asBytes(this.frameData(index, frame.rgba, this.gif.width, this.gif.height).data);
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

  /** Orientação atual da câmera (giroscópio, já atrasada para casar com a imagem). Sem efeito se a pose não veio com orientação. */
  setViewOrientation(q: Quaternion | null): void {
    if (q && this.worldFrame) this.viewRotation.makeRotationFromQuaternion(this.tmpQuat.copy(q).invert());
    else this.viewRotation.identity();
    this.applyGroupMatrix();
  }

  /** group.matrix = (volta do mundo para a câmera) · pose suavizada. */
  private applyGroupMatrix(): void {
    this.group.matrix.multiplyMatrices(this.viewRotation, this.smoothed);
    this.group.matrixWorldNeedsUpdate = true;
  }

  /**
   * Aproxima a pose suavizada da última pose rastreada, a cada quadro de tela (posição/escala lineares, rotação
   * por slerp). A constante de tempo se adapta: parado, filtra o tremor; em movimento, não fica para trás.
   */
  private smoothPose(nowMs: number): void {
    const dt = this.lastSmoothMs === 0 ? 0 : Math.min(100, Math.max(0, nowMs - this.lastSmoothMs));
    this.lastSmoothMs = nowMs;
    if (!this.hasPose || dt === 0) return;
    this.smoothed.decompose(this.tmpPos, this.tmpQuat, this.tmpScale);
    this.targetMatrix.decompose(this.tgtPos, this.tgtQuat, this.tgtScale);
    const widthUnits = Math.max(1e-6, this.tgtScale.x);
    const error = this.tmpPos.distanceTo(this.tgtPos) / widthUnits;
    const angle = this.tmpQuat.angleTo(this.tgtQuat);
    const alpha = smoothingAlpha(dt, adaptiveTauMs(error, angle));
    this.tmpPos.lerp(this.tgtPos, alpha);
    this.tmpScale.lerp(this.tgtScale, alpha);
    this.tmpQuat.slerp(this.tgtQuat, alpha);
    this.smoothed.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
    this.applyGroupMatrix();
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
