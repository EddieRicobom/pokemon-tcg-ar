import { describe, expect, it } from 'vitest';
import { ARENA_H, ARENA_W, createSurvivorState } from './survivor';
import { minimapMarkers, minimapViewport, survivorMinimapSnapshot } from './survivor-minimap';

const player = createSurvivorState(1, { kindCount: 1 }).player;

describe('minimapa da Torre', () => {
  it('prioriza chefes e elites e limita os comuns', () => {
    const enemies = [
      { id: 1, x: 10, y: 10, grade: 'comum', boss: false },
      { id: 2, x: 20, y: 20, grade: 'comum', boss: false },
      { id: 3, x: 30, y: 30, grade: 'elite', boss: false },
      { id: 4, x: 40, y: 40, grade: 'chefao', boss: false },
      { id: 5, x: 50, y: 50, grade: 'comum', boss: true },
    ] as never[];
    const markers = minimapMarkers({ player, enemies }, 2);
    expect(markers.map((m) => m.id)).toEqual([0, 3, 4, 5, 2, 1]);
    expect(markers.map((m) => m.kind)).toEqual(['player', 'elite', 'boss', 'boss', 'enemy', 'enemy']);
  });

  it('mantém a janela da câmera dentro da arena', () => {
    expect(minimapViewport({ x: 2, y: 3 }, { width: ARENA_W, height: ARENA_H }, { width: 400, height: 300 }))
      .toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(minimapViewport({ x: ARENA_W - 2, y: ARENA_H - 3 }, { width: ARENA_W, height: ARENA_H }, { width: 400, height: 300 }))
      .toEqual({ x: ARENA_W - 400, y: ARENA_H - 300, width: 400, height: 300 });
  });

  it('produz uma fotografia estável para a interface', () => {
    const snapshot = survivorMinimapSnapshot({ player, enemies: [], artifacts: [] }, { width: ARENA_W, height: ARENA_H }, { width: 300, height: 200 });
    expect(snapshot.markers).toEqual([{ id: 0, x: player.x, y: player.y, kind: 'player' }]);
    expect(snapshot.viewport.width).toBe(300);
    expect(snapshot.viewport.height).toBe(200);
  });

  it('marca Pokébolas encontradas como estrelas', () => {
    const snapshot = survivorMinimapSnapshot({ player, enemies: [], artifacts: [{ id: 77, x: 500, y: 600, kind: 'pokeball' }] }, { width: ARENA_W, height: ARENA_H }, { width: 300, height: 200 });
    expect(snapshot.markers).toContainEqual({ id: 77, x: 500, y: 600, kind: 'artifact' });
  });
});
