import { Vector3 } from 'three';

/** Altura padrão do celular acima do chão, em metros (segurado na mão, em pé). */
export const DEFAULT_PHONE_HEIGHT_M = 1.3;
export const PHONE_HEIGHT_RANGE = { min: 0.7, max: 2.2 } as const;
/** O raio precisa descer pelo menos isto (componente y) para contar como "apontando para o chão". */
const MIN_DOWNWARD = 0.05;

export type FloorResult =
  | { ok: true; point: Vector3; distance: number }
  | { ok: false; reason: 'acima-do-horizonte' | 'quase-horizontal' };

/**
 * Onde um raio saindo da câmera (na origem) encontra o chão: um plano horizontal `phoneHeight` metros abaixo.
 * É a detecção "semi-automática": o app sabe onde é "para baixo" pelos sensores, e o toque do usuário diz onde
 * no chão a caixa deve ficar. Sem SLAM, a altura do celular é uma estimativa (ajustável).
 */
export function intersectFloor(direction: Vector3, phoneHeight: number = DEFAULT_PHONE_HEIGHT_M): FloorResult {
  const d = direction.clone().normalize();
  if (d.y >= 0) return { ok: false, reason: 'acima-do-horizonte' };
  if (-d.y < MIN_DOWNWARD) return { ok: false, reason: 'quase-horizontal' };
  const t = phoneHeight / -d.y;
  return { ok: true, point: d.multiplyScalar(t), distance: t };
}

/** Folga mínima (m) entre a câmera e a borda mais próxima da caixa: ela nunca nasce colada em quem segura o celular. */
export const BOX_NEAR_GAP_M = 0.8;

/** Distância horizontal mínima do centro da caixa até a câmera, para uma caixa de meio-lado `half` (o quadrado pode estar girado: usa a diagonal). */
export function minBoxDistance(half: number): number {
  return half * Math.SQRT2 + BOX_NEAR_GAP_M;
}

/**
 * Afasta o ponto do chão (câmera na origem) ao longo da mesma direção horizontal até a caixa respeitar a folga mínima.
 * Se o ponto estiver quase embaixo do celular (direção indefinida), usa a direção para onde a câmera olha (`forward`).
 * Devolve o ponto e se ele foi afastado.
 */
export function keepBoxAway(point: Vector3, half: number, forward: { x: number; z: number } = { x: 0, z: -1 }): { point: Vector3; moved: boolean } {
  const required = minBoxDistance(half);
  const horizontal = Math.hypot(point.x, point.z);
  if (horizontal >= required) return { point: point.clone(), moved: false };
  let dirX = point.x;
  let dirZ = point.z;
  if (horizontal < 0.15) {
    const len = Math.hypot(forward.x, forward.z);
    dirX = len > 1e-6 ? forward.x / len : 0;
    dirZ = len > 1e-6 ? forward.z / len : -1;
  } else {
    dirX /= horizontal;
    dirZ /= horizontal;
  }
  return { point: new Vector3(dirX * required, point.y, dirZ * required), moved: true };
}

export const FLOOR_MESSAGES: Record<'acima-do-horizonte' | 'quase-horizontal', string> = {
  'acima-do-horizonte': 'Aponte o celular para baixo, para o chão, e toque de novo.',
  'quase-horizontal': 'Incline o celular um pouco mais para baixo: o chão está longe demais nessa direção.',
};
