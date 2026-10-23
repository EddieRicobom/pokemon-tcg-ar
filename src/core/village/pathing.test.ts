import { afterEach, describe, expect, it } from 'vitest';
import { makeWalker, stepVillager } from './actors';
import { generateVillage, isWalkable } from './map';
import { PATH_DEFERRED, PathBudget, pathBudget, pathStep, pathStepBudgeted } from './pathing';

const map = generateVillage(20261014);

/** Dois blocos livres e distantes do mapa real, com caminho entre eles. */
function farPair(): { from: { x: number; y: number }; goal: { x: number; y: number } } {
  const from = { x: map.spawn.x, y: map.spawn.y };
  for (let x = map.w - 6; x > 0; x--) {
    const goal = { x, y: map.spawn.y };
    if (isWalkable(map, goal.x, goal.y) && pathStep(map, from, goal, () => false)) return { from, goal };
  }
  throw new Error('sem par de blocos');
}

afterEach(() => pathBudget.reset(Number.POSITIVE_INFINITY));

describe('orçamento de buscas de caminho', () => {
  it('sem reset o limite é infinito', () => {
    const budget = new PathBudget();
    for (let i = 0; i < 1000; i++) expect(budget.take()).toBe(true);
  });

  it('acaba depois do número de buscas e volta no próximo quadro', () => {
    const budget = new PathBudget();
    budget.reset(2);
    expect([budget.take(), budget.take(), budget.take()]).toEqual([true, true, false]);
    budget.reset(2);
    expect(budget.take()).toBe(true);
  });

  it('pathStepBudgeted adia quando acabou e responde normalmente quando há vez', () => {
    const { from, goal } = farPair();
    pathBudget.reset(1);
    const first = pathStepBudgeted(map, from, goal, () => false);
    expect(first).not.toBe(PATH_DEFERRED);
    expect(first).toBe(pathStep(map, from, goal, () => false));
    expect(pathStepBudgeted(map, from, goal, () => false)).toBe(PATH_DEFERRED);
  });

  it('ao lado do destino não gasta busca nenhuma', () => {
    pathBudget.reset(0);
    expect(pathStepBudgeted(map, { x: 5, y: 5 }, { x: 6, y: 5 }, () => false)).toBeNull();
  });

  it('o morador sem vez fica parado no quadro e anda quando a busca volta', () => {
    const { from, goal } = farPair();
    const w = makeWalker('a', from.x, from.y, 2.6);
    pathBudget.reset(0);
    stepVillager(w, 0.1, map, () => false, () => 0, goal);
    expect([w.x, w.y, w.tx, w.ty]).toEqual([from.x, from.y, from.x, from.y]);
    pathBudget.reset(1);
    stepVillager(w, 0.1, map, () => false, () => 0, goal);
    expect(w.tx !== from.x || w.ty !== from.y).toBe(true);
  });

  it('quem joga (pathStep) nunca depende do orçamento', () => {
    const { from, goal } = farPair();
    pathBudget.reset(0);
    expect(pathStep(map, from, goal, () => false)).not.toBeNull();
  });
});

describe('busca de caminho', () => {
  it('buscas seguidas dão sempre a mesma resposta (buffers reaproveitados não vazam estado)', () => {
    const { from, goal } = farPair();
    const first = pathStep(map, from, goal, () => false);
    for (let i = 0; i < 5; i++) expect(pathStep(map, from, goal, () => false)).toBe(first);
    // Outra busca no meio não muda a anterior.
    pathStep(map, goal, from, () => false);
    expect(pathStep(map, from, goal, () => false)).toBe(first);
  });

  it('contorna um bloco ocupado e, sem caminho livre, cai no do mapa sem eles', () => {
    const { from, goal } = farPair();
    const direct = pathStep(map, from, goal, () => false)!;
    const delta = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[direct]!;
    const blockedTile = { x: from.x + delta[0]!, y: from.y + delta[1]! };
    const around = pathStep(map, from, goal, (x, y) => x === blockedTile.x && y === blockedTile.y);
    expect(around).not.toBeNull();
    // Tudo ocupado: usa o caminho do mapa sem os ocupantes (o passo só acontece quando o bloco liberar).
    expect(pathStep(map, from, goal, () => true)).toBe(direct);
  });
});
