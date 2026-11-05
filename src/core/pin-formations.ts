/**
 * Formações do Pin Mode: onde cada pin começa, como uma escalação de futebol. Cada formação lista até 6 posições em
 * frações do raio da arena, e a primeira é a de quem foi escalado primeiro. `x` vai da esquerda (-1) à direita (1) e `y`
 * é a distância até a linha do meio, medida no seu lado do campo. Com menos pins, valem as primeiras posições. Lógica pura.
 */

export type FormationId = 'linha' | 'cunha' | 'muralha' | 'flancos' | 'diamante';
export const FORMATION_IDS: readonly FormationId[] = ['linha', 'cunha', 'muralha', 'flancos', 'diamante'];
export const DEFAULT_FORMATION: FormationId = 'linha';

export const FORMATION_LABELS_PT: Record<FormationId, { name: string; hint: string }> = {
  linha: { name: 'Linha', hint: 'Equilibrada: todos na mesma altura, cobrindo a largura do campo.' },
  cunha: { name: 'Cunha', hint: 'Ataque: um na ponta, perto do meio, e os outros logo atrás.' },
  muralha: { name: 'Muralha', hint: 'Defesa: fechados no fundo, longe dos adversários.' },
  flancos: { name: 'Flancos', hint: 'Abertos nas laterais: chegam mais rápido às aberturas.' },
  diamante: { name: 'Diamante', hint: 'Controle do meio: frente, fundo e dois alas.' },
};

export interface FormationSlot {
  x: number;
  y: number;
}

const SLOTS: Record<FormationId, readonly FormationSlot[]> = {
  linha: [{ x: 0, y: 0.62 }, { x: -0.2, y: 0.62 }, { x: 0.2, y: 0.62 }, { x: -0.4, y: 0.6 }, { x: 0.4, y: 0.6 }, { x: 0, y: 0.42 }],
  cunha: [{ x: 0, y: 0.22 }, { x: -0.14, y: 0.36 }, { x: 0.14, y: 0.36 }, { x: -0.28, y: 0.5 }, { x: 0.28, y: 0.5 }, { x: 0, y: 0.5 }],
  muralha: [{ x: 0, y: 0.8 }, { x: -0.18, y: 0.76 }, { x: 0.18, y: 0.76 }, { x: -0.36, y: 0.68 }, { x: 0.36, y: 0.68 }, { x: 0, y: 0.6 }],
  flancos: [{ x: -0.55, y: 0.4 }, { x: 0.55, y: 0.4 }, { x: -0.4, y: 0.6 }, { x: 0.4, y: 0.6 }, { x: 0, y: 0.62 }, { x: 0, y: 0.36 }],
  diamante: [{ x: 0, y: 0.3 }, { x: -0.25, y: 0.5 }, { x: 0.25, y: 0.5 }, { x: 0, y: 0.7 }, { x: -0.5, y: 0.5 }, { x: 0.5, y: 0.5 }],
};

/** Só o computador leva mais de 6 pins: os extras ficam numa fileira no fundo do campo. */
const EXTRA_SLOTS: readonly FormationSlot[] = [{ x: -0.24, y: 0.86 }, { x: -0.08, y: 0.88 }, { x: 0.08, y: 0.88 }, { x: 0.24, y: 0.86 }];

export const isFormationId = (value: unknown): value is FormationId => FORMATION_IDS.includes(value as FormationId);

/** As posições de `count` pins nesta formação. */
export function formationSlots(id: FormationId, count: number): FormationSlot[] {
  return [...SLOTS[id], ...EXTRA_SLOTS].slice(0, Math.max(0, count));
}
