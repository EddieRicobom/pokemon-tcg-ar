import { describe, expect, it } from 'vitest';
import { ARENA_H, ARENA_W, createSurvivorState } from './survivor';
import { minimapBounds, minimapMarkers, minimapViewport, SURVIVOR_MINIMAP_WINDOW, survivorMinimapSnapshot } from './survivor-minimap';

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

  it('aproxima o mapa do jogador sem ultrapassar as bordas da arena', () => {
    expect(minimapBounds({ x: ARENA_W / 2, y: ARENA_H / 2 }, { width: ARENA_W, height: ARENA_H }))
      .toEqual({ x: (ARENA_W - SURVIVOR_MINIMAP_WINDOW.width) / 2, y: (ARENA_H - SURVIVOR_MINIMAP_WINDOW.height) / 2, ...SURVIVOR_MINIMAP_WINDOW });
    expect(minimapBounds({ x: 1, y: 1 }, { width: ARENA_W, height: ARENA_H }))
      .toEqual({ x: 0, y: 0, ...SURVIVOR_MINIMAP_WINDOW });
  });

  it('produz uma fotografia estável para a interface', () => {
    const snapshot = survivorMinimapSnapshot({ player, enemies: [], artifacts: [] }, { width: ARENA_W, height: ARENA_H }, { width: 300, height: 200 });
    expect(snapshot.markers).toEqual([{ id: 0, x: player.x, y: player.y, kind: 'player' }]);
    expect(snapshot.bounds).toEqual(minimapBounds(player, { width: ARENA_W, height: ARENA_H }));
    expect(snapshot.viewport.width).toBe(300);
    expect(snapshot.viewport.height).toBe(200);
  });

  it('marca Pokébolas encontradas como estrelas', () => {
    const artifact = { id: 77, x: player.x + 120, y: player.y + 80, kind: 'pokeball' as const };
    const snapshot = survivorMinimapSnapshot({ player, enemies: [], artifacts: [artifact] }, { width: ARENA_W, height: ARENA_H }, { width: 300, height: 200 });
    expect(snapshot.markers).toContainEqual({ ...artifact, kind: 'artifact' });
  });
});
