import { Euler, Quaternion, Vector3 } from 'three';

const DEG = Math.PI / 180;
const MINUS_90_X = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const Z_AXIS = new Vector3(0, 0, 1);

/**
 * Orientação da câmera traseira no mundo (y para cima, câmera olhando para −Z quando o celular está de pé)
 * a partir do evento `deviceorientation` (alpha/beta/gamma em graus) e do giro da tela. É a conta padrão
 * do Three.js (DeviceOrientationControls). Só rotação: o celular não tem posição aqui (3 graus de liberdade).
 */
export function orientationQuaternion(alphaDeg: number, betaDeg: number, gammaDeg: number, screenAngleDeg = 0): Quaternion {
  const q = new Quaternion().setFromEuler(new Euler(betaDeg * DEG, alphaDeg * DEG, -gammaDeg * DEG, 'YXZ'));
  q.multiply(MINUS_90_X);
  q.multiply(new Quaternion().setFromAxisAngle(Z_AXIS, -screenAngleDeg * DEG));
  return q;
}

/** Direção para onde a câmera olha (vetor unitário). */
export function lookDirection(q: Quaternion): Vector3 {
  return new Vector3(0, 0, -1).applyQuaternion(q);
}

/** Orientação a partir de guinada (yaw, em torno de Y) e inclinação (pitch, para cima positivo), para o modo "arrastar para olhar". */
export function lookQuaternion(yawRad: number, pitchRad: number): Quaternion {
  return new Quaternion().setFromEuler(new Euler(pitchRad, yawRad, 0, 'YXZ'));
}

/**
 * Campo de visão vertical realmente visível quando o vídeo (proporção largura/altura `videoAspect`, campo
 * vertical `videoVFovDeg`) é exibido em "cover" num contêiner de proporção `containerAspect`: se o contêiner é
 * mais largo que o vídeo, as bordas de cima e de baixo são cortadas.
 */
export function visibleVerticalFov(videoVFovDeg: number, videoAspect: number, containerAspect: number): number {
  if (!(videoAspect > 0) || !(containerAspect > 0)) return videoVFovDeg;
  const factor = containerAspect > videoAspect ? videoAspect / containerAspect : 1;
  return (2 * Math.atan(Math.tan((videoVFovDeg * DEG) / 2) * factor)) / DEG;
}

/**
 * Quanto a orientação suavizada anda em direção à medida a cada quadro, conforme o tamanho do passo (radianos):
 * parado (passo de décimos de grau) filtra o tremor do sensor; girando, chega a 1 e acompanha sem atraso.
 */
export function orientationSmoothingAlpha(stepRad: number): number {
  const a = 0.18 + Math.max(0, stepRad) * 9;
  return Math.min(1, Math.max(0.18, a));
}
