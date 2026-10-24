import { describe, expect, it } from 'vitest';
import { CLEARING, generateVillage, tileAt } from './map';

const SEEDS = [20261014, 7, 99, 12345];

/** Fração de blocos de árvore no retângulo (x0..x1, y0..y1) do mapa. */
function density(map: ReturnType<typeof generateVillage>, x0: number, y0: number, x1: number, y1: number): number {
  let trees = 0;
  let total = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    total++;
    if (tileAt(map, x, y) === 'tree') trees++;
  }
  return trees / total;
}

describe('mata da Vila', () => {
  it('não sobra uma faixa reta de árvores da borda do mapa antigo (96×72) no meio do mapa', () => {
    for (const seed of SEEDS) {
      const map = generateVillage(seed);
      // Antes: as 4 últimas colunas (x 92–95) e linhas (y 68–71) do mapa antigo eram floresta fechada.
      expect(density(map, 92, 8, 95, 60), `leste, semente ${seed}`).toBeLessThan(0.3);
      expect(density(map, 12, 68, 85, 71), `sul, semente ${seed}`).toBeLessThan(0.3);
    }
  });

  it('a floresta fechada fica nas bordas de verdade do mapa e o miolo da cidade continua livre', () => {
    for (const seed of SEEDS) {
      const map = generateVillage(seed);
      expect(density(map, 0, 0, map.w - 1, 2), `norte, semente ${seed}`).toBe(1);
      expect(density(map, 0, 0, 2, map.h - 1)).toBe(1);
      // Perto da borda de cima a mata é mais cerrada que em volta da cidade (sem ser uma parede).
      expect(density(map, 20, 4, 70, 8), `faixa norte, semente ${seed}`).toBeGreaterThan(density(map, 20, 14, 70, 18));
      expect(density(map, 20, 4, 70, 8)).toBeLessThan(0.95);
      expect(density(map, CLEARING.x0 + 2, CLEARING.y0 + 2, CLEARING.x1 - 2, CLEARING.y1 - 2), `miolo, semente ${seed}`).toBe(0);
    }
  });

  it('a transição do miolo para a mata é irregular: a primeira árvore de cada linha está a distâncias diferentes', () => {
    for (const seed of SEEDS) {
      const map = generateVillage(seed);
      const firstTree = new Set<number>();
      for (let y = 20; y <= 60; y++) {
        for (let x = CLEARING.x0 - 1; x >= 5; x--) {
          if (tileAt(map, x, y) === 'tree') { firstTree.add(CLEARING.x0 - x); break; }
        }
      }
      expect(firstTree.size, `semente ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('o mapa é sempre o mesmo para a mesma semente', () => {
    expect(generateVillage(7).tiles).toEqual(generateVillage(7).tiles);
  });
});
