/**
 * Estado e tabelas do Dojô da Torre (a progressão do Survival/BONK pela Vila). Só dados e normalização; as compras
 * ficam em `dojo.ts`. Números e motivos em `docs/PROGRESSAO_TORRE.md`.
 */

export type DojoLevel = 0 | 1 | 2 | 3;
export type TrainingId = 'folego' | 'postura' | 'passada' | 'faro';
export type LessonId = 'olhar-treinado' | 'desejo' | 'recusa' | 'recusa-firme';

export const DOJO_LEVELS = [
  { level: 1, name: 'Tatame', icon: '🟫', coins: 400, cost: { tabua: 4 } },
  { level: 2, name: 'Dojô', icon: '🏯', coins: 1400, cost: { tijolo: 6, 'boneco-treino': 2 } },
  { level: 3, name: 'Dojô de pedra', icon: '⛩️', coins: 2800, cost: { tijolo: 10, vidro: 4, 'placa-armadura': 2 } },
] as const satisfies readonly { level: 1 | 2 | 3; name: string; icon: string; coins: number; cost: Readonly<Record<string, number>> }[];

/** Peças de treino, fabricadas no menu de fabricar (receitas em `catalog.ts`). */
export const TRAINING_PIECES = ['boneco-treino', 'faixa-treino', 'placa-armadura', 'sino-desejo', 'lente-foco'] as const;
export type TrainingPiece = (typeof TRAINING_PIECES)[number];

export interface TrainingDef {
  id: TrainingId;
  name: string;
  icon: string;
  /** Texto de um nível, para a tela. */
  perLevel: string;
  /** Moedas de cada nível; o tamanho do vetor é o nível máximo. Cada nível também pede 1 `piece`. */
  coins: readonly number[];
  piece: TrainingPiece;
  /** Nível do Dojô que cada nível de treino exige. */
  minDojo: readonly DojoLevel[];
}

export const TRAININGS: Record<TrainingId, TrainingDef> = {
  folego: { id: 'folego', name: 'Fôlego', icon: '❤️', perLevel: '+5 de vida máxima', coins: [180, 300, 480, 700], piece: 'boneco-treino', minDojo: [1, 1, 2, 3] },
  postura: { id: 'postura', name: 'Postura', icon: '🛡️', perLevel: '+5 de Defesa e Defesa Especial', coins: [260, 480, 720], piece: 'placa-armadura', minDojo: [1, 1, 2] },
  passada: { id: 'passada', name: 'Passada', icon: '👟', perLevel: '+2% de velocidade', coins: [260, 440, 660], piece: 'faixa-treino', minDojo: [1, 1, 2] },
  faro: { id: 'faro', name: 'Faro', icon: '🧲', perLevel: '+5% de alcance para coletar orbes', coins: [220, 360, 540], piece: 'faixa-treino', minDojo: [1, 1, 2] },
};
export const TRAINING_IDS = Object.keys(TRAININGS) as TrainingId[];

export interface LessonDef {
  id: LessonId;
  name: string;
  icon: string;
  effect: string;
  coins: number;
  piece: TrainingPiece;
  pieces: number;
  minDojo: DojoLevel;
  requires?: LessonId;
}

export const LESSONS: Record<LessonId, LessonDef> = {
  'olhar-treinado': { id: 'olhar-treinado', name: 'Olhar treinado', icon: '👁️', effect: 'A primeira escolha de upgrade da corrida mostra 1 carta a mais.', coins: 500, piece: 'faixa-treino', pieces: 1, minDojo: 1 },
  desejo: { id: 'desejo', name: 'Desejo de Jirachi', icon: '⭐', effect: 'Começa a corrida com 1 Desejo de Jirachi (troca a oferta de upgrade).', coins: 900, piece: 'sino-desejo', pieces: 1, minDojo: 1 },
  recusa: { id: 'recusa', name: 'Recusa', icon: '🚫', effect: '1 banimento por corrida: a carta banida não aparece mais naquela corrida.', coins: 1400, piece: 'placa-armadura', pieces: 2, minDojo: 2 },
  'recusa-firme': { id: 'recusa-firme', name: 'Recusa firme', icon: '⛔', effect: '+2 banimentos por corrida (3 no total).', coins: 2200, piece: 'lente-foco', pieces: 2, minDojo: 3, requires: 'recusa' },
};
export const LESSON_IDS = Object.keys(LESSONS) as LessonId[];

export interface TowerState {
  dojoLevel: DojoLevel;
  training: Partial<Record<TrainingId, number>>;
  lessons: LessonId[];
  /** Treinos e lições comprados que o jogador desligou (a "corrida pura" desliga todos de uma vez, sem mexer aqui). */
  disabled: string[];
  /** Último dia em que a carta da sorte foi lida, e se ela ainda espera a próxima corrida. */
  luckDay: string;
  luckPending: boolean;
  /** Comida reservada como marmita; fica aqui até a corrida contar ou ser devolvida. */
  lunchbox: string | null;
}

export function emptyTower(): TowerState {
  return { dojoLevel: 0, training: {}, lessons: [], disabled: [], luckDay: '', luckPending: false, lunchbox: null };
}

export function normalizeTower(raw: unknown): TowerState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof TowerState, unknown>>;
  const level = Number(r.dojoLevel);
  const dojoLevel = (Number.isInteger(level) && level >= 0 && level <= 3 ? level : 0) as DojoLevel;
  const trainingRaw = (r.training && typeof r.training === 'object' ? r.training : {}) as Record<string, unknown>;
  const training: Partial<Record<TrainingId, number>> = {};
  for (const id of TRAINING_IDS) {
    const value = Number(trainingRaw[id]);
    const owned = Number.isInteger(value) ? Math.max(0, Math.min(TRAININGS[id].coins.length, value)) : 0;
    if (owned > 0) training[id] = owned;
  }
  const lessons = (Array.isArray(r.lessons) ? r.lessons : []).filter((id): id is LessonId => typeof id === 'string' && (LESSON_IDS as string[]).includes(id));
  const known = new Set<string>([...TRAINING_IDS, ...LESSON_IDS]);
  return {
    dojoLevel,
    training,
    lessons: [...new Set(lessons)],
    disabled: [...new Set((Array.isArray(r.disabled) ? r.disabled : []).filter((id): id is string => typeof id === 'string' && known.has(id)))],
    luckDay: typeof r.luckDay === 'string' ? r.luckDay.slice(0, 12) : '',
    luckPending: r.luckPending === true,
    lunchbox: typeof r.lunchbox === 'string' && r.lunchbox.length > 0 ? r.lunchbox.slice(0, 60) : null,
  };
}
