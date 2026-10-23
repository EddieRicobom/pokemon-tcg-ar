/** Lógica pura da mochila 3D: quais itens cabem, onde começam, rótulos e limites da câmera. */

export interface BackpackItem {
  id: string;
  name: string;
  qty: number;
}

/** Quantos tipos de item o compartimento 3D comporta sem virar um monte de sprites sobrepostos. */
export const BACKPACK_CAPACITY = 24;

export interface BackpackPlan {
  /** Itens que aparecem soltos dentro da mochila 3D, na ordem do inventário. */
  shown: BackpackItem[];
  /** Tipos de item que não cabem no 3D (continuam na lista da mochila comum). */
  hidden: number;
}

export function planBackpack(items: readonly BackpackItem[], capacity = BACKPACK_CAPACITY): BackpackPlan {
  const owned = items.filter((item) => item.qty > 0);
  return { shown: owned.slice(0, capacity), hidden: Math.max(0, owned.length - capacity) };
}

const COLUMNS = 5;

/** Posição inicial (no espaço da mochila) do item de índice `index`: grade de 5 colunas em 3 profundidades. */
export function homeSlot(index: number): { x: number; y: number; z: number } {
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return { x: (col - (COLUMNS - 1) / 2) * 0.34, y: 1.5 + row * 0.3, z: 0.1 + (index % 3) * 0.08 };
}

/** Selo de quantidade desenhado no sprite; itens únicos não ganham selo. */
export function qtyBadge(qty: number): string | null {
  if (!Number.isFinite(qty)) return null;
  const whole = Math.floor(qty);
  if (whole <= 1) return null;
  return whole > 99 ? '99+' : `×${whole}`;
}

export function describeItem(item: BackpackItem): string {
  return `${item.name} × ${Math.max(0, Math.floor(item.qty))}`;
}

export const ORBIT_LIMITS = { yaw: 1.1, pitchMin: -0.3, pitchMax: 0.42 } as const;

/** Mantém o giro por arrasto dentro de uma faixa em que o compartimento aberto continua visível. */
export function clampOrbit(yaw: number, pitch: number): { yaw: number; pitch: number } {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return {
    yaw: clamp(yaw, -ORBIT_LIMITS.yaw, ORBIT_LIMITS.yaw),
    pitch: clamp(pitch, ORBIT_LIMITS.pitchMin, ORBIT_LIMITS.pitchMax),
  };
}
