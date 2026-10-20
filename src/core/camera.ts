export type CameraErrorCode =
  | 'insecure-context'
  | 'unsupported'
  | 'permission-denied'
  | 'not-found'
  | 'in-use'
  | 'unknown';

export function cameraErrorMessage(code: CameraErrorCode): string {
  switch (code) {
    case 'insecure-context':
      return 'A câmera só funciona em páginas HTTPS. Abra o app pelo endereço https://.';
    case 'unsupported':
      return 'Este navegador não permite acessar a câmera.';
    case 'permission-denied':
      return 'Permissão da câmera negada. Libere o acesso nas configurações do navegador e tente de novo.';
    case 'not-found':
      return 'Nenhuma câmera foi encontrada neste aparelho.';
    case 'in-use':
      return 'Não foi possível usar a câmera. Ela pode estar em uso por outro aplicativo.';
    case 'unknown':
      return 'Não foi possível abrir a câmera.';
  }
}

export class CameraError extends Error {
  readonly code: CameraErrorCode;

  constructor(code: CameraErrorCode) {
    super(cameraErrorMessage(code));
    this.name = 'CameraError';
    this.code = code;
  }
}

/** Traduz o `name` do erro de getUserMedia para um código nosso. */
export function classifyCameraError(error: unknown): CameraErrorCode {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not-found';
    case 'NotReadableError':
    case 'AbortError':
      return 'in-use';
    case 'TypeError':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

/** Subconjunto de HTMLVideoElement usado aqui, para facilitar testes. */
export interface VideoLike {
  srcObject: MediaProvider | null;
  muted: boolean;
  playsInline: boolean;
  play(): Promise<void>;
}

export interface CameraDeps {
  isSecureContext: boolean;
  mediaDevices: Pick<MediaDevices, 'getUserMedia'> | undefined;
}

export const REAR_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    // 1280×720: o rastreador trabalha com quadros de até 640 px, e reduzir 1280→640 (2:1) dá um quadro mais limpo que
    // 1920→640 (3:1, que serrilha). Também pesa menos para decodificar e atrasa menos a imagem.
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

export type CameraFacingMode = 'environment' | 'user';

export function cameraConstraints(facingMode: CameraFacingMode): MediaStreamConstraints {
  return { ...REAR_CAMERA_CONSTRAINTS, video: { ...(REAR_CAMERA_CONSTRAINTS.video as MediaTrackConstraints), facingMode: { ideal: facingMode } } };
}

function browserCameraDeps(): CameraDeps {
  return { isSecureContext: window.isSecureContext, mediaDevices: navigator.mediaDevices };
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/** Abre a câmera traseira e a liga ao elemento de vídeo. Lança CameraError em caso de falha. */
export async function startRearCamera(
  video: VideoLike,
  deps: CameraDeps = browserCameraDeps(),
): Promise<MediaStream> {
  return startCamera(video, 'environment', deps);
}

/** Abre uma câmera frontal ou traseira mantendo os ajustes compatíveis com o rastreador. */
export async function startCamera(
  video: VideoLike,
  facingMode: CameraFacingMode,
  deps: CameraDeps = browserCameraDeps(),
): Promise<MediaStream> {
  if (!deps.mediaDevices?.getUserMedia) {
    throw new CameraError(deps.isSecureContext ? 'unsupported' : 'insecure-context');
  }

  let stream: MediaStream;
  try {
    stream = await deps.mediaDevices.getUserMedia(cameraConstraints(facingMode));
  } catch (error) {
    throw new CameraError(classifyCameraError(error));
  }

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch (error) {
    stopTracks(stream);
    video.srcObject = null;
    throw new CameraError(classifyCameraError(error));
  }
  await tuneCameraForTracking(stream);
  return stream;
}

/** Modos de captura que ajudam o rastreador: a carta fica sempre nítida e bem exposta enquanto a mão se mexe. */
const CONTINUOUS_MODES = ['focusMode', 'exposureMode', 'whiteBalanceMode'] as const;

/**
 * Pede foco, exposição e balanço de branco CONTÍNUOS à câmera, nos aparelhos que informam suportar (Chrome/Android).
 * Uma carta borrada ou estourada derruba o rastreio mais do que qualquer ajuste do algoritmo. Melhor esforço:
 * onde o navegador não oferece (iPhone, por exemplo) ou recusa, não muda nada. Devolve os modos aplicados.
 */
export async function tuneCameraForTracking(stream: MediaStream): Promise<string[]> {
  const track = stream.getVideoTracks?.()[0];
  if (!track || typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') return [];
  try {
    const capabilities = track.getCapabilities() as Record<string, unknown>;
    const wanted: Record<string, string> = {};
    for (const key of CONTINUOUS_MODES) {
      const modes = capabilities[key];
      if (Array.isArray(modes) && modes.includes('continuous')) wanted[key] = 'continuous';
    }
    const applied = Object.keys(wanted);
    if (applied.length === 0) return [];
    await track.applyConstraints({ advanced: [wanted] } as MediaTrackConstraints);
    return applied;
  } catch {
    return [];
  }
}

export function stopCamera(video: VideoLike | null, stream: MediaStream | null): void {
  if (stream) stopTracks(stream);
  if (video) video.srcObject = null;
}
