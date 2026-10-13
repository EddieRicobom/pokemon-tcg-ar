import type { TrackingEngine, TrackingInfo, TrackingUpdate } from './engine';
import { FrameRelay } from './frame-relay';

interface CropDetectorLike {
  cropSize: number;
  detector: unknown;
}

interface MindArController {
  cropDetector: CropDetectorLike;
  addImageTargetsFromBuffer(buffer: ArrayBuffer): { dimensions: [number, number][] };
  dummyRun(input: HTMLVideoElement | HTMLCanvasElement): void;
  processVideo(input: HTMLVideoElement | HTMLCanvasElement): void;
  getProjectionMatrix(): number[];
  dispose(): void;
}

/**
 * Ajustes do rastreador. Os padrões do MindAR (5 e 5) escondem a carta após ~5 quadros sem pose,
 * o que no celular (quadros lentos, mão tremendo) acontece o tempo todo. Aqui:
 * - warmupTolerance: quadros seguidos rastreados antes de mostrar (a carta já foi reconhecida, então pode ser baixo);
 * - missTolerance: quadros sem pose antes de esconder. Enquanto isso o MindAR continua devolvendo a última pose
 *   e tentando reencontrar a carta, então o Pokémon não some em perdas curtas;
 * - filterMinCF/filterBeta: filtro de suavização (One Euro); menor CF = menos tremor, mais atraso.
 */
export const TRACKING_TUNING = {
  warmupTolerance: 3,
  missTolerance: 90,
  filterMinCF: 0.0005,
  filterBeta: 800,
} as const;

/**
 * Rastreamento com o `Controller` do MindAR (MIT). Não usamos o `MindARThree` porque ele importa
 * `sRGBEncoding`, que o Three.js r186 removeu; o `Controller` é independente do Three.js e a cena é nossa.
 * Carregado por import dinâmico: o TensorFlow.js só é baixado quando o AR é usado.
 */
/** Maior potência de 2 que cabe no lado menor do quadro (limitada a 512). O padrão do MindAR usa metade do lado menor. */
export function searchWindowSize(width: number, height: number): number {
  const side = Math.min(width, height);
  let size = 64;
  while (size * 2 <= side && size < 512) size *= 2;
  return size;
}

export class MindArEngine implements TrackingEngine {
  private controller: MindArController | null = null;
  private relay: FrameRelay | null = null;

  async start(video: HTMLVideoElement, target: ArrayBuffer, onUpdate: (update: TrackingUpdate) => void, onInputChange?: () => void): Promise<TrackingInfo> {
    const { Controller } = await import('mind-ar/src/image-target/controller.js');
    if (!video.videoWidth || !video.videoHeight) throw new Error('O vídeo da câmera ainda não tem imagem.');
    // O rastreador lê um canvas reduzido (ver frame-relay.ts), não o <video> diretamente.
    const relay = new FrameRelay(video, onInputChange);
    this.relay = relay;
    const inputWidth = relay.width;
    const inputHeight = relay.height;

    const controller = new Controller({
      inputWidth,
      inputHeight,
      maxTrack: 1,
      ...TRACKING_TUNING,
      onUpdate: (data: { type: string; worldMatrix?: ArrayLike<number> | null }) => {
        if (data.type === 'updateMatrix') onUpdate({ worldMatrix: data.worldMatrix ?? null });
      },
    }) as MindArController;
    this.controller = controller;

    // Janela de busca maior: o padrão olha recortes de 128 px num quadro de 360 px de largura, e depois de uma
    // perda (reflexo, mão tremendo) a carta só era reencontrada quando caía no recorte certo.
    const { Detector } = await import('mind-ar/src/image-target/detector/detector.js');
    const size = searchWindowSize(relay.width, relay.height);
    controller.cropDetector.cropSize = size;
    controller.cropDetector.detector = new Detector(size, size);

    const { dimensions } = controller.addImageTargetsFromBuffer(target);
    const first = dimensions[0];
    if (!first) throw new Error('O alvo de AR está vazio ou é de uma versão incompatível; recompile.');
    relay.start();
    controller.dummyRun(relay.canvas);
    controller.processVideo(relay.canvas);
    return {
      markerWidth: first[0],
      markerHeight: first[1],
      projection: controller.getProjectionMatrix(),
      inputWidth,
      inputHeight,
    };
  }

  stop(): void {
    this.relay?.stop();
    this.relay = null;
    this.controller?.dispose();
    this.controller = null;
  }
}
