import type { TrackingEngine, TrackingInfo, TrackingUpdate } from './engine';
import { FrameRelay } from './frame-relay';

interface MindArController {
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
  missTolerance: 45,
  filterMinCF: 0.0005,
  filterBeta: 800,
} as const;

/**
 * Rastreamento com o `Controller` do MindAR (MIT). Não usamos o `MindARThree` porque ele importa
 * `sRGBEncoding`, que o Three.js r186 removeu; o `Controller` é independente do Three.js e a cena é nossa.
 * Carregado por import dinâmico: o TensorFlow.js só é baixado quando o AR é usado.
 */
export class MindArEngine implements TrackingEngine {
  private controller: MindArController | null = null;
  private relay: FrameRelay | null = null;

  async start(video: HTMLVideoElement, target: ArrayBuffer, onUpdate: (update: TrackingUpdate) => void): Promise<TrackingInfo> {
    const { Controller } = await import('mind-ar/src/image-target/controller.js');
    if (!video.videoWidth || !video.videoHeight) throw new Error('O vídeo da câmera ainda não tem imagem.');
    // O rastreador lê um canvas reduzido (ver frame-relay.ts), não o <video> diretamente.
    const relay = new FrameRelay(video);
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
