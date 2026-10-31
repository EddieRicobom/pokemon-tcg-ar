import type { SurvivorEnemy, SurvivorState } from './survivor';

export type SurvivorMinimapMarkerKind = 'player' | 'boss' | 'elite' | 'enemy' | 'artifact';

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
  /** Recorte próximo do mundo desenhado no minimapa, centrado no jogador quando houver espaço. */
  bounds: SurvivorMinimapViewport;
  viewport: SurvivorMinimapViewport;
}

/**
 * O mapa inteiro mede 8640×5760: espremê-lo num canto transforma inimigos e
 * obstáculos em subpixels. Esta janela mostra uma área jogável próxima, grande
 * o bastante para antecipar chefes e saídas sem perder os detalhes úteis.
 */
export const SURVIVOR_MINIMAP_WINDOW = { width: 1800, height: 1200 } as const;

/**
 * Escolhe os sinais que merecem espaço no mapa sem desenhar todos os inimigos vivos.
 * Chefes e elites sempre aparecem; os demais são os mais próximos do jogador.
 */
export function minimapMarkers(state: Pick<SurvivorState, 'player' | 'enemies'> & { artifacts?: SurvivorState['artifacts'] }, limit = 36): SurvivorMinimapMarker[] {
  const special: SurvivorEnemy[] = state.enemies.filter((enemy) => enemy.boss || enemy.grade !== 'comum');
  const ordinary = state.enemies
    .filter((enemy) => !enemy.boss && enemy.grade === 'comum')
    .sort((a, b) => distanceToPlayer(a, state) - distanceToPlayer(b, state));
  const enemies = [...special, ...ordinary.slice(0, Math.max(0, limit))];
  return [
    { id: 0, x: state.player.x, y: state.player.y, kind: 'player' },
    ...(state.artifacts ?? []).filter((artifact) => artifact.kind === 'pokeball').map((artifact) => ({ id: artifact.id, x: artifact.x, y: artifact.y, kind: 'artifact' as const })),
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

/** Recorte local do minimapa. Nas bordas ele desliza para nunca mostrar fora da arena. */
export function minimapBounds(
  player: Pick<SurvivorState['player'], 'x' | 'y'>,
  arena: { width: number; height: number },
  size: { width: number; height: number } = SURVIVOR_MINIMAP_WINDOW,
): SurvivorMinimapViewport {
  const width = Math.min(arena.width, Math.max(1, size.width));
  const height = Math.min(arena.height, Math.max(1, size.height));
  return {
    x: clamp(player.x - width / 2, 0, arena.width - width),
    y: clamp(player.y - height / 2, 0, arena.height - height),
    width,
    height,
  };
}

export function survivorMinimapSnapshot(
  state: Pick<SurvivorState, 'player' | 'enemies' | 'artifacts'>,
  arena: { width: number; height: number },
  view: { width: number; height: number },
  limit = 36,
): SurvivorMinimapSnapshot {
  const bounds = minimapBounds(state.player, arena);
  const markers = minimapMarkers(state, limit).filter((marker) => (
    marker.x >= bounds.x && marker.x <= bounds.x + bounds.width
    && marker.y >= bounds.y && marker.y <= bounds.y + bounds.height
  ));
  return { markers, bounds, viewport: minimapViewport(state.player, arena, view) };
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
