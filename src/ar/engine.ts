/** Motor de rastreamento de imagem: dado o vídeo e o alvo, informa a pose da carta a cada quadro. */
export interface TrackingUpdate {
  /** Matriz 4×4 em ordem de colunas (mundo OpenGL), ou null se a carta foi perdida. */
  worldMatrix: ArrayLike<number> | null;
}

export interface TrackingInfo {
  markerWidth: number;
  markerHeight: number;
  /** Matriz de projeção 4×4 (ordem de colunas) do rastreador. */
  projection: ArrayLike<number>;
  inputWidth: number;
  inputHeight: number;
}

export interface TrackingEngine {
  /** Prepara o alvo (compilado) e começa a processar o vídeo. */
  start(video: HTMLVideoElement, target: ArrayBuffer, onUpdate: (update: TrackingUpdate) => void): Promise<TrackingInfo>;
  stop(): void;
}
