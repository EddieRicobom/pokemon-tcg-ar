import type { BattleResult, Fighter, Rng } from './battle';

/** Modos contínuos da Arena. Ambos são 6x6, automáticos e terminam por derrota ou desistência. */
export type EndlessArenaMode = 'formatacao' | 'restauracao';

export const ENDLESS_ARENA_LABELS: Record<EndlessArenaMode, { title: string; tutorial: string }> = {
  formatacao: {
    title: 'Formatação digital',
    tutorial: 'Sobreviva a batalhas automáticas 6×6. Seus Pokémon não se curam entre uma batalha e outra; desista quando quiser guardar o placar.',
  },
  restauracao: {
    title: 'Restauração digital',
    tutorial: 'Enfrente batalhas automáticas 6×6 sem fim. Ao vencer, sua equipe é restaurada antes do próximo treinador.',
  },
};

/** Espécies totalmente evoluídas, usadas somente como candidatos a inimigos reais. */
export const DIGITAL_ARENA_FINALISTS = [
  3, 6, 9, 18, 26, 34, 36, 38, 45, 59, 62, 65, 68, 71, 76, 80, 89, 94, 103, 110, 112, 121, 130, 131, 134, 135, 136, 141, 142, 143, 149,
  154, 157, 160, 169, 178, 181, 186, 197, 208, 212, 214, 217, 219, 227, 230, 241, 248, 254, 257, 260, 262, 272, 275, 279, 282, 289, 297,
  306, 310, 319, 323, 330, 334, 335, 340, 344, 350, 354, 359, 365, 373, 376, 389, 392, 395, 398, 405, 407, 409, 411, 419, 426, 429, 437,
  442, 445, 448, 450, 452, 457, 460, 462, 466, 467, 468, 472, 473, 475, 477, 478,
] as const;

const TRAINERS = ['Operador Pixel', 'Analista Nuvem', 'Guardiã do Núcleo', 'Veterano de Dados', 'Treinadora Prisma', 'Mestre do Backup'] as const;

export interface EndlessOpponent {
  trainer: string;
  dexIds: [number, number, number, number, number, number];
}

export interface EndlessArenaRun {
  mode: EndlessArenaMode;
  battles: number;
  wins: number;
  streak: number;
  score: number;
  /** PS da equipe para a próxima batalha. Em Restauração fica sempre cheio. */
  hp: number[];
  stopped: boolean;
}

export function startEndlessArena(mode: EndlessArenaMode, team: readonly Fighter[]): EndlessArenaRun | null {
  if (team.length !== 6) return null;
  return { mode, battles: 0, wins: 0, streak: 0, score: 0, hp: team.map((f) => f.maxHp), stopped: false };
}

/** Sorteia seis espécies diferentes; quem materializa a onda ainda precisa buscar sprite e atributos de verdade. */
export function nextEndlessOpponent(rng: Rng): EndlessOpponent {
  const pool = [...DIGITAL_ARENA_FINALISTS];
  const dexIds: number[] = [];
  while (dexIds.length < 6) {
    const index = Math.floor(rng() * pool.length);
    dexIds.push(pool.splice(index, 1)[0]!);
  }
  return { trainer: TRAINERS[Math.floor(rng() * TRAINERS.length)]!, dexIds: dexIds as EndlessOpponent['dexIds'] };
}

export function resolveEndlessBattle(run: EndlessArenaRun, team: readonly Fighter[], result: BattleResult): EndlessArenaRun {
  if (run.stopped || team.length !== 6) return run;
  const won = result.winningTeam === 0;
  const currentHp = result.hpLeft.slice(0, 6).map((hp, i) => Math.max(0, Math.min(team[i]!.maxHp, hp)));
  const hpBonus = Math.round(currentHp.reduce((sum, hp, i) => sum + hp / team[i]!.maxHp, 0) * 10);
  const wins = run.wins + (won ? 1 : 0);
  const streak = won ? run.streak + 1 : 0;
  const score = run.score + (won ? 100 + hpBonus + streak * 25 : 0);
  return {
    ...run,
    battles: run.battles + 1,
    wins,
    streak,
    score,
    hp: run.mode === 'restauracao' ? team.map((f) => f.maxHp) : currentHp,
    stopped: !won || currentHp.every((hp) => hp <= 0),
  };
}

export function abandonEndlessArena(run: EndlessArenaRun): EndlessArenaRun {
  return { ...run, stopped: true };
}
