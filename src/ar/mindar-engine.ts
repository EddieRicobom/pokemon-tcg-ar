import type { TrackingEngine, TrackingInfo, TrackingUpdate } from './engine';

interface MindArController {
  addImageTargetsFromBuffer(buffer: ArrayBuffer): { dimensions: [number, number][] };
  dummyRun(input: HTMLVideoElement): void;
  processVideo(input: HTMLVideoElement): void;
  getProjectionMatrix(): number[];
  dispose(): void;
}

/**
 * Rastreamento com o `Controller` do MindAR (MIT). Não usamos o `MindARThree` porque ele importa
 * `sRGBEncoding`, que o Three.js r186 removeu; o `Controller` é independente do Three.js e a cena é nossa.
 * Carregado por import dinâmico: o TensorFlow.js só é baixado quando o AR é usado.
 */
export class MindArEngine implements TrackingEngine {
  private controller: MindArController | null = null;

  async start(video: HTMLVideoElement, target: ArrayBuffer, onUpdate: (update: TrackingUpdate) => void): Promise<TrackingInfo> {
    const { Controller } = await import('mind-ar/src/image-target/controller.js');
    const inputWidth = video.videoWidth;
    const inputHeight = video.videoHeight;
    if (!inputWidth || !inputHeight) throw new Error('O vídeo da câmera ainda não tem imagem.');

    const controller = new Controller({
      inputWidth,
      inputHeight,
      maxTrack: 1,
      onUpdate: (data: { type: string; worldMatrix?: ArrayLike<number> | null }) => {
        if (data.type === 'updateMatrix') onUpdate({ worldMatrix: data.worldMatrix ?? null });
      },
    }) as MindArController;
    this.controller = controller;

    const { dimensions } = controller.addImageTargetsFromBuffer(target);
    const first = dimensions[0];
    if (!first) throw new Error('O alvo de AR está vazio ou é de uma versão incompatível; recompile.');
    controller.dummyRun(video);
    controller.processVideo(video);
    return {
      markerWidth: first[0],
      markerHeight: first[1],
      projection: controller.getProjectionMatrix(),
      inputWidth,
      inputHeight,
    };
  }

  stop(): void {
    this.controller?.dispose();
    this.controller = null;
  }
}
