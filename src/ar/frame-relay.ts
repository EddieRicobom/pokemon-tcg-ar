/** Maior lado, em pixels, do quadro entregue ao rastreador. O MindAR processa todo pixel de cada quadro: 1080×1920 é lento no celular. */
export const TRACKING_MAX_SIDE = 640;

/** Tamanho do quadro de rastreamento: mantém a proporção do vídeo e nunca amplia. */
export function trackingSize(videoWidth: number, videoHeight: number, maxSide = TRACKING_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(videoWidth, videoHeight));
  return { width: Math.max(1, Math.round(videoWidth * scale)), height: Math.max(1, Math.round(videoHeight * scale)) };
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

  constructor(private readonly video: HTMLVideoElement) {
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

  draw(): void {
    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
  }

  start(): void {
    const video = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void };
    const tick = () => {
      if (this.stopped) return;
      this.draw();
      this.handle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    this.handle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
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
