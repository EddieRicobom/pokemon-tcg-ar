import {
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
  WebGLRenderer,
} from 'three';
import { frameIndexAt, type DecodedGif } from '../core/gif';
import { maxVisualFps } from '../app/visual-settings';
import { cancelGameFrame, requestGameFrame } from '../app/frame-scheduler';

/** Altura visível da cena em unidades (de -1 a 1). */
const VIEW_HALF_HEIGHT = 1;
/** Altura do sprite e posição da base dele, em unidades da cena. */
const SPRITE_HEIGHT = 1.1;
const SPRITE_BASE_Y = -0.75;

function asBytes(rgba: Uint8ClampedArray): Uint8Array {
  return new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
}

/**
 * Renderizador transparente (Three.js) que desenha um GIF animado sobre o vídeo da câmera.
 *
 * Nesta fase o sprite fica FIXO na tela: serve para validar o pipeline de
 * decodificação, a transparência e o desenho em WebGL. Não há rastreamento de
 * carta aqui; a pose virá da Fase 5 do plano de implementação.
 */
export class SpriteOverlay {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, VIEW_HALF_HEIGHT, -VIEW_HALF_HEIGHT, 0.1, 10);
  private readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private gif: DecodedGif | null = null;
  private texture: DataTexture | null = null;
  private startedAt = 0;
  private shownFrame = -1;
  private animationId = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false });
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.z = 5;

    // alphaTest em vez de blending: a transparência do GIF é binária (0 ou 255).
    const material = new MeshBasicMaterial({ alphaTest: 0.5 });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    this.resize();
  }

  setGif(gif: DecodedGif | null): void {
    this.releaseTexture();
    this.gif = gif;
    this.shownFrame = -1;

    if (!gif) {
      this.mesh.visible = false;
      return;
    }

    const first = gif.frames[0];
    if (!first) throw new Error('GIF sem quadros.');

    const texture = new DataTexture(asBytes(first.rgba), gif.width, gif.height, RGBAFormat, UnsignedByteType);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    // DataTexture guarda as linhas de cima para baixo; inverter o V evita copiar os dados.
    texture.repeat.set(1, -1);
    texture.offset.set(0, 1);
    texture.needsUpdate = true;

    this.texture = texture;
    this.mesh.material.map = texture;
    this.mesh.material.needsUpdate = true;

    const aspect = gif.width / gif.height;
    this.mesh.scale.set(SPRITE_HEIGHT * aspect, SPRITE_HEIGHT, 1);
    this.mesh.position.set(0, SPRITE_BASE_Y + SPRITE_HEIGHT / 2, 0);
    this.mesh.visible = true;
    this.startedAt = performance.now();
  }

  /** Ajusta o canvas e a câmera ao tamanho atual do elemento. */
  resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);

    const aspect = width / height;
    this.camera.left = -aspect * VIEW_HALF_HEIGHT;
    this.camera.right = aspect * VIEW_HALF_HEIGHT;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.animationId !== 0) return;
    const loop = (now: number) => {
      this.animationId = requestGameFrame(loop, maxVisualFps);
      this.renderFrame(now);
    };
    this.animationId = requestGameFrame(loop, maxVisualFps);
  }

  stop(): void {
    if (this.animationId !== 0) cancelGameFrame(this.animationId);
    this.animationId = 0;
  }

  dispose(): void {
    this.stop();
    this.releaseTexture();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private renderFrame(now: number): void {
    if (this.gif && this.texture) {
      const index = frameIndexAt(this.gif, now - this.startedAt);
      const frame = this.gif.frames[index];
      if (frame && index !== this.shownFrame) {
        this.shownFrame = index;
        this.texture.image.data = asBytes(frame.rgba);
        this.texture.needsUpdate = true;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  private releaseTexture(): void {
    this.texture?.dispose();
    this.texture = null;
    this.mesh.material.map = null;
    this.mesh.material.needsUpdate = true;
  }
}
