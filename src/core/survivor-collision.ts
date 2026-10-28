/** Colisão circular contra uma grade repetida de obstáculos da paisagem da Torre. */
export interface SurvivorCollisionGrid {
  cols: number;
  rows: number;
  cellSize: number;
  solid: Uint8Array;
}

export interface SurvivorPoint { x: number; y: number }

function modulo(value: number, size: number): number {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
}

/** A mesma grade se repete nos nove setores; nunca deixa o jogador atravessar o tronco ou a rocha. */
export function survivorCircleHitsLandscape(grid: SurvivorCollisionGrid, x: number, y: number, radius: number): boolean {
  const tileW = grid.cols * grid.cellSize;
  const tileH = grid.rows * grid.cellSize;
  const localX = modulo(x, tileW);
  const localY = modulo(y, tileH);
  const minCol = Math.floor((localX - radius) / grid.cellSize);
  const maxCol = Math.floor((localX + radius) / grid.cellSize);
  const minRow = Math.floor((localY - radius) / grid.cellSize);
  const maxRow = Math.floor((localY + radius) / grid.cellSize);
  for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) {
    const wrappedCol = modulo(col, grid.cols);
    const wrappedRow = modulo(row, grid.rows);
    if (!grid.solid[wrappedRow * grid.cols + wrappedCol]) continue;
    const left = col * grid.cellSize;
    const top = row * grid.cellSize;
    const nearX = Math.max(left, Math.min(localX, left + grid.cellSize));
    const nearY = Math.max(top, Math.min(localY, top + grid.cellSize));
    if ((localX - nearX) ** 2 + (localY - nearY) ** 2 < radius ** 2) return true;
  }
  return false;
}

/** Encontra uma clareira próxima quando a troca de região coloca uma árvore sob o jogador. */
export function nearestSurvivorLandscapeFreePoint(grid: SurvivorCollisionGrid, point: SurvivorPoint, radius: number): SurvivorPoint {
  if (!survivorCircleHitsLandscape(grid, point.x, point.y, radius)) return point;
  const step = Math.max(1, grid.cellSize);
  for (let distance = step; distance <= step * 12; distance += step) {
    for (let dx = -distance; dx <= distance; dx += step) {
      for (const y of [point.y - distance, point.y + distance]) {
        const x = point.x + dx;
        if (!survivorCircleHitsLandscape(grid, x, y, radius)) return { x, y };
      }
    }
    for (let dy = -distance + step; dy < distance; dy += step) {
      for (const x of [point.x - distance, point.x + distance]) {
        const y = point.y + dy;
        if (!survivorCircleHitsLandscape(grid, x, y, radius)) return { x, y };
      }
    }
  }
  return point;
}

/**
 * Anda em passos curtos e separa os eixos. Assim o Pokémon desliza pela borda
 * de árvores e pedras, sem atravessá-las em um quadro lento.
 */
export function resolveSurvivorLandscapeMove(grid: SurvivorCollisionGrid, from: SurvivorPoint, to: SurvivorPoint, radius: number): SurvivorPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(1, grid.cellSize / 2)));
  const start = nearestSurvivorLandscapeFreePoint(grid, from, radius);
  let x = start.x;
  let y = start.y;
  for (let step = 1; step <= steps; step++) {
    // Avança a partir da posição já resolvida. Usar a posição original aqui
    // permitiria pular para o outro lado depois de um passo bloqueado.
    const targetX = x + dx / steps;
    const targetY = y + dy / steps;
    if (!survivorCircleHitsLandscape(grid, targetX, y, radius)) x = targetX;
    if (!survivorCircleHitsLandscape(grid, x, targetY, radius)) y = targetY;
  }
  return { x, y };
}
