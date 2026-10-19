import type { SurvivorEnemy, SurvivorState } from './survivor';

export type SurvivorMinimapMarkerKind = 'player' | 'boss' | 'elite' | 'enemy';

export interface SurvivorMinimapMarker {
  id: number;
  x: number;
  y: number;
  kind: SurvivorMinimapMarkerKind;
}

export interface SurvivorMinimapViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SurvivorMinimapSnapshot {
  markers: SurvivorMinimapMarker[];
  viewport: SurvivorMinimapViewport;
}

/**
 * Escolhe os sinais que merecem espaço no mapa sem desenhar todos os inimigos vivos.
 * Chefes e elites sempre aparecem; os demais são os mais próximos do jogador.
 */
export function minimapMarkers(state: Pick<SurvivorState, 'player' | 'enemies'>, limit = 36): SurvivorMinimapMarker[] {
  const special: SurvivorEnemy[] = state.enemies.filter((enemy) => enemy.boss || enemy.grade !== 'comum');
  const ordinary = state.enemies
    .filter((enemy) => !enemy.boss && enemy.grade === 'comum')
    .sort((a, b) => distanceToPlayer(a, state) - distanceToPlayer(b, state));
  const enemies = [...special, ...ordinary.slice(0, Math.max(0, limit))];
  return [
    { id: 0, x: state.player.x, y: state.player.y, kind: 'player' },
    ...enemies.map((enemy) => ({ id: enemy.id, x: enemy.x, y: enemy.y, kind: markerKind(enemy) })),
  ];
}

/** Retorna a janela da arena que a câmera mostra, em coordenadas da arena. */
export function minimapViewport(
  player: Pick<SurvivorState['player'], 'x' | 'y'>,
  arena: { width: number; height: number },
  view: { width: number; height: number },
): SurvivorMinimapViewport {
  const width = Math.min(arena.width, Math.max(1, view.width));
  const height = Math.min(arena.height, Math.max(1, view.height));
  return {
    x: clamp(player.x - width / 2, 0, arena.width - width),
    y: clamp(player.y - height / 2, 0, arena.height - height),
    width,
    height,
  };
}

export function survivorMinimapSnapshot(
  state: Pick<SurvivorState, 'player' | 'enemies'>,
  arena: { width: number; height: number },
  view: { width: number; height: number },
  limit = 36,
): SurvivorMinimapSnapshot {
  return { markers: minimapMarkers(state, limit), viewport: minimapViewport(state.player, arena, view) };
}

function markerKind(enemy: SurvivorEnemy): SurvivorMinimapMarkerKind {
  return enemy.boss || enemy.grade === 'chefao' ? 'boss' : enemy.grade === 'elite' ? 'elite' : 'enemy';
}

function distanceToPlayer(enemy: SurvivorEnemy, state: Pick<SurvivorState, 'player'>): number {
  return (enemy.x - state.player.x) ** 2 + (enemy.y - state.player.y) ** 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
