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

export const FLOOR_MESSAGES: Record<'acima-do-horizonte' | 'quase-horizontal', string> = {
  'acima-do-horizonte': 'Aponte o celular para baixo, para o chão, e toque de novo.',
  'quase-horizontal': 'Incline o celular um pouco mais para baixo: o chão está longe demais nessa direção.',
};
