/** Maior lado, em pixels, do quadro entregue ao rastreador. O MindAR processa todo pixel de cada quadro: 1080×1920 é lento no celular. */
export const TRACKING_MAX_SIDE = 640;

/** Atraso (ms) entre a câmera capturar um quadro e o navegador entregá-lo, quando o navegador não informa o `captureTime`. */
export const CAMERA_LATENCY_GUESS_MS = 50;

/** Tamanho do quadro de rastreamento: mantém a proporção do vídeo e nunca amplia. */
export function trackingSize(videoWidth: number, videoHeight: number, maxSide = TRACKING_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(videoWidth, videoHeight));
  return { width: Math.max(1, Math.round(videoWidth * scale)), height: Math.max(1, Math.round(videoHeight * scale)) };
}

/** A proporção do vídeo difere da do quadro de rastreamento em mais de 3%? (vídeo sem dimensões não conta) */
export function aspectChanged(canvasWidth: number, canvasHeight: number, videoWidth: number, videoHeight: number): boolean {
  if (!videoWidth || !videoHeight || !canvasWidth || !canvasHeight) return false;
  const a = canvasWidth / canvasHeight;
  const b = videoWidth / videoHeight;
  return Math.abs(a - b) / a > 0.03;
}

/**
 * Copia o vídeo para um canvas 2D reduzido, a cada quadro, e o rastreador lê esse canvas.
 * Vantagens: quadros menores (mais rápidos) e a leitura não depende de o navegador permitir textura WebGL
 * direto de <video>, o que falha em alguns navegadores/aparelhos (lá o rastreador via só preto).
 */
export class FrameRelay {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private handle: number | null = null;
  private stopped = false;

  private notified = false;
  /** Hora (performance.now) em que a câmera capturou o quadro que está no canvas. */
  frameTime = 0;

  constructor(private readonly video: HTMLVideoElement, private readonly onInputChange?: () => void) {
    const { width, height } = trackingSize(video.videoWidth, video.videoHeight);
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const context = this.canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!context) throw new Error('Canvas 2D indisponível para o rastreamento.');
    this.context = context;
    this.draw();
  }

  get width(): number {
    return this.canvas.width;
  }
  get height(): number {
    return this.canvas.height;
  }

  draw(captureTime?: number): void {
    this.frameTime = captureTime ?? performance.now() - CAMERA_LATENCY_GUESS_MS;
    // Se a câmera trocar de proporção no meio do caminho (tela girou, resolução renegociada), o quadro reduzido
    // ficaria esticado e o rastreador, descalibrado: avisa uma vez para reiniciar com o tamanho certo.
    if (!this.notified && aspectChanged(this.canvas.width, this.canvas.height, this.video.videoWidth, this.video.videoHeight)) {
      this.notified = true;
      this.onInputChange?.();
    }
    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
  }

  start(): void {
    type FrameMetadata = { captureTime?: number };
    const video = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, metadata?: FrameMetadata) => void) => number;
      cancelVideoFrameCallback?: (h: number) => void;
    };
    const tick = (_now?: number, metadata?: FrameMetadata) => {
      if (this.stopped) return;
      this.draw(metadata?.captureTime);
      this.handle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(() => tick());
    };
    this.handle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(() => tick());
  }

  stop(): void {
    this.stopped = true;
    const video = this.video as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void };
    if (this.handle !== null) {
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(this.handle);
      else cancelAnimationFrame(this.handle);
    }
    this.handle = null;
  }
}
