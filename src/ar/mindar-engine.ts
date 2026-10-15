import type { TrackingEngine, TrackingInfo, TrackingOptions, TrackingUpdate } from './engine';
import { mergeTargets } from './target';
import { FrameRelay } from './frame-relay';
import { FrameAlternator, normalizeLocalContrast } from './frame-normalize';
import type * as TF from '@tensorflow/tfjs';

interface CropDetectorLike {
  cropSize: number;
  detector: unknown;
}

interface MindArController {
  cropDetector: CropDetectorLike;
  addImageTargetsFromBuffer(buffer: ArrayBuffer): { dimensions: [number, number][] };
  inputLoader: { loadInput(input: unknown): unknown };
  dummyRun(input: HTMLVideoElement | HTMLCanvasElement): void;
  processVideo(input: HTMLVideoElement | HTMLCanvasElement): void;
  getProjectionMatrix(): number[];
  /** Estado por alvo; `isTracking` é falso quando a carta foi perdida e a pose repetida é a velha. */
  trackingStates?: { isTracking: boolean }[];
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
 * A pose que o MindAR acabou de entregar é de uma leitura de verdade (a carta está sendo rastreada) ou a repetição
 * da última pose enquanto ele tenta reencontrar a carta? Sem informação do estado, vale como fresca.
 */
export function isFreshPose(states: { isTracking: boolean }[] | undefined, targetIndex: number): boolean {
  return states?.[targetIndex]?.isTracking ?? true;
}

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

  async start(
    video: HTMLVideoElement,
    target: ArrayBuffer | readonly ArrayBuffer[],
    onUpdate: (update: TrackingUpdate) => void,
    onInputChange?: () => void,
    options: TrackingOptions = {},
  ): Promise<TrackingInfo> {
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
      maxTrack: Math.max(1, Math.floor(options.maxTrack ?? 1)),
      ...TRACKING_TUNING,
      onUpdate: (data: { type: string; targetIndex?: number; worldMatrix?: ArrayLike<number> | null }) => {
        if (data.type !== 'updateMatrix') return;
        const targetIndex = data.targetIndex ?? 0;
        // Enquanto o MindAR "segura" a carta (missTolerance) ele repete a última pose mesmo sem estar rastreando.
        const fresh = isFreshPose(this.controller?.trackingStates, targetIndex);
        onUpdate({ worldMatrix: data.worldMatrix ?? null, targetIndex, capturedAt: iterationFrameTime, fresh });
      },
    }) as MindArController;
    this.controller = controller;
    // Hora de captura do quadro que a iteração atual do rastreador está processando (o MindAR lê o canvas
    // no começo de cada iteração): serve para casar a pose com a orientação do giroscópio naquele instante.
    let iterationFrameTime = relay.frameTime;
    const loader = controller.inputLoader;
    const loadInput = loader.loadInput.bind(loader);
    // Luz difícil (sombra, contra-luz): quadros alternados com contraste local normalizado (ver frame-normalize.ts).
    // Se a normalização falhar (memória da GPU, por exemplo), segue com o quadro cru como o MindAR original.
    const tf = options.normalizeFrames === false ? null : await import('@tensorflow/tfjs');
    const alternator = new FrameAlternator();
    let normalizeBroken = false;
    loader.loadInput = (input: unknown) => {
      iterationFrameTime = relay.frameTime;
      const raw = loadInput(input);
      if (!tf || normalizeBroken || !alternator.next()) return raw;
      try {
        const normalized = normalizeLocalContrast(tf, raw as TF.Tensor2D);
        (raw as TF.Tensor2D).dispose();
        return normalized;
      } catch {
        normalizeBroken = true;
        return raw;
      }
    };

    // Janela de busca maior: o padrão olha recortes de 128 px num quadro de 360 px de largura, e depois de uma
    // perda (reflexo, mão tremendo) a carta só era reencontrada quando caía no recorte certo.
    const { Detector } = await import('mind-ar/src/image-target/detector/detector.js');
    const size = searchWindowSize(relay.width, relay.height);
    controller.cropDetector.cropSize = size;
    controller.cropDetector.detector = new Detector(size, size);

    const buffer = Array.isArray(target) ? await mergeTargets(target as readonly ArrayBuffer[]) : (target as ArrayBuffer);
    const { dimensions } = controller.addImageTargetsFromBuffer(buffer);
    const first = dimensions[0];
    if (!first) throw new Error('O alvo de AR está vazio ou é de uma versão incompatível; recompile.');
    relay.start();
    controller.dummyRun(relay.canvas);
    controller.processVideo(relay.canvas);
    return {
      markerWidth: first[0],
      markerHeight: first[1],
      markers: dimensions.map(([width, height]) => ({ width, height })),
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
