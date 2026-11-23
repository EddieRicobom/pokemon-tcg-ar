/** Projeção 2D da pista do Kart para o minimapa (viewBox 0..100, sem dependências de renderização). */

import { trackPoint } from './kart-race';

export interface KartMapProjection {
  /** Caminho SVG fechado da pista. */
  path: string;
  project: (x: number, z: number) => { x: number; y: number };
}

export function kartMapProjection(samples = 96, size = 100, pad = 6): KartMapProjection {
  const count = Math.max(8, Math.floor(samples));
  const points = Array.from({ length: count }, (_, index) => trackPoint((index / count) * Math.PI * 2));
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  const scale = (size - pad * 2) / span;
  const offsetX = (size - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = (size - (maxZ - minZ) * scale) / 2 - minZ * scale;
  const project = (x: number, z: number): { x: number; y: number } => ({ x: x * scale + offsetX, y: z * scale + offsetY });
  const path = `${points.map((point, index) => {
    const p = project(point.x, point.z);
    return `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(' ')} Z`;
  return { path, project };
}
