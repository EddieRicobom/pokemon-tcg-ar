import { describe, expect, it } from 'vitest';
import { abandonEndlessArena, nextEndlessOpponent, resolveEndlessBattle, startEndlessArena } from './endless-arena';
import { buildFighter, seededRng } from './battle';

const team = () => Array.from({ length: 6 }, (_, i) => buildFighter({ id: `p${i}`, name: `P${i}`, profile: null, card: null, gameMoves: [] }));
const won = (hp: number[]) => ({ turns: [], winner: 0, hpLeft: [...hp, 0, 0, 0, 0, 0], reason: 'ko' as const, teams: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], winningTeam: 0 });

describe('Arena contínua', () => {
  it('exige uma equipe completa e não repete inimigos numa onda', () => {
    expect(startEndlessArena('formatacao', team().slice(0, 5))).toBeNull();
    const wave = nextEndlessOpponent(seededRng(8));
    expect(wave.dexIds).toHaveLength(6);
    expect(new Set(wave.dexIds).size).toBe(6);
  });

  it('Formatação conserva os PS e Restauração cura entre vitórias', () => {
    const fighters = team();
    const hp = fighters.map((f, i) => f.maxHp - i * 5);
    const format = resolveEndlessBattle(startEndlessArena('formatacao', fighters)!, fighters, won(hp));
    const restore = resolveEndlessBattle(startEndlessArena('restauracao', fighters)!, fighters, won(hp));
    expect(format.hp).toEqual(hp);
    expect(restore.hp).toEqual(fighters.map((f) => f.maxHp));
    expect(format.score).toBeGreaterThan(100);
  });

  it('marca a corrida como encerrada ao desistir', () => {
    expect(abandonEndlessArena(startEndlessArena('formatacao', team())!).stopped).toBe(true);
  });
});
