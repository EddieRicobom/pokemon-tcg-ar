/** Motor de rastreamento de imagem: dado o vídeo e o alvo, informa a pose da carta a cada quadro. */
export interface TrackingUpdate {
  /** Matriz 4×4 em ordem de colunas (mundo OpenGL), ou null se a carta foi perdida. */
  worldMatrix: ArrayLike<number> | null;
  /** Qual alvo (carta) esta pose é, quando o rastreador tem vários; 0 com um só. */
  targetIndex?: number;
  /**
   * false quando o rastreador JÁ perdeu a carta e só repete a última pose enquanto tenta reencontrá-la (o MindAR
   * faz isso por dezenas de quadros antes de desistir). Essa pose velha não deve mover o Pokémon nem manter ele
   * "vivo": só a pose fresca vale. Ausente = fresca.
   */
  fresh?: boolean;
  /** Hora (performance.now) em que a câmera capturou o quadro de onde saiu esta pose, quando se sabe. */
  capturedAt?: number;
}

export interface TrackingInfo {
  markerWidth: number;
  markerHeight: number;
  /** Tamanho de cada alvo, na ordem em que foram dados (com um só alvo, só o primeiro). */
  markers?: { width: number; height: number }[];
  /** Matriz de projeção 4×4 (ordem de colunas) do rastreador. */
  projection: ArrayLike<number>;
  inputWidth: number;
  inputHeight: number;
}

export interface TrackingOptions {
  /** Quantas cartas podem ser rastreadas ao mesmo tempo (padrão 1). */
  maxTrack?: number;
  /** Normaliza o contraste local em quadros alternados (luz difícil). Padrão: ligado. */
  normalizeFrames?: boolean;
}

export interface TrackingEngine {
  /**
   * Prepara o(s) alvo(s) compilado(s) e começa a processar o vídeo. Com vários alvos, o índice de cada um em
   * `TrackingUpdate.targetIndex` é a posição dele na lista.
   * `onInputChange`: o quadro da câmera mudou de proporção (girou a tela, trocou a resolução); quem chamou deve reiniciar.
   */
  start(
    video: HTMLVideoElement,
    target: ArrayBuffer | readonly ArrayBuffer[],
    onUpdate: (update: TrackingUpdate) => void,
    onInputChange?: () => void,
    options?: TrackingOptions,
  ): Promise<TrackingInfo>;
  stop(): void;
}
