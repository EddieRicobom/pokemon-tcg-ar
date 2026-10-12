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
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

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
  if (!deps.mediaDevices?.getUserMedia) {
    throw new CameraError(deps.isSecureContext ? 'unsupported' : 'insecure-context');
  }

  let stream: MediaStream;
  try {
    stream = await deps.mediaDevices.getUserMedia(REAR_CAMERA_CONSTRAINTS);
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
  return stream;
}

export function stopCamera(video: VideoLike | null, stream: MediaStream | null): void {
  if (stream) stopTracks(stream);
  if (video) video.srcObject = null;
}
