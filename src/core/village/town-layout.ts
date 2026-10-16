/**
 * O desenho fixo da cidadinha da Vila (sem lógica de jogo): onde ficam os terrenos das casas dos Pokémon, os prédios da
 * praça, a fonte e os postes. O mapa é sempre o mesmo; o que muda com o nível de Treinador é quais terrenos estão
 * liberados (os outros aparecem cercados, com uma placa). Só dados e geometria, para o mapa poder usar sem ciclos.
 */

export type BuildingKind = 'home' | 'cafe' | 'mail' | 'museum' | 'arcade' | 'pins' | 'arena' | 'torre' | 'fountain';

export interface Building {
  id: string;
  kind: BuildingKind;
  name: string;
  /** Canto superior esquerdo do chão ocupado (sólido). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Bloco da calçada bem à frente da porta (de onde você conversa com o prédio). */
  door: { x: number; y: number };
  /** Nível de Treinador em que o prédio (ou o terreno) é liberado. */
  unlock: number;
  /** Número do terreno, para as casas. */
  lot?: number;
}

/** Casas: 3 blocos de largura por 2 de fundo; a frente olha para baixo. Ordem = ordem em que são liberadas. */
export const LOTS: readonly { x: number; y: number; unlock: number }[] = [
  { x: 20, y: 17, unlock: 1 },
  { x: 28, y: 25, unlock: 1 },
  { x: 16, y: 17, unlock: 1 },
  { x: 20, y: 25, unlock: 2 },
  { x: 32, y: 25, unlock: 3 },
  { x: 12, y: 17, unlock: 3 },
  { x: 16, y: 25, unlock: 4 },
  { x: 36, y: 25, unlock: 5 },
  { x: 8, y: 17, unlock: 6 },
  { x: 12, y: 25, unlock: 7 },
  { x: 40, y: 25, unlock: 8 },
  { x: 4, y: 17, unlock: 9 },
  { x: 8, y: 25, unlock: 10 },
  { x: 4, y: 25, unlock: 12 },
];

export const CIVIC: readonly { kind: Exclude<BuildingKind, 'home' | 'fountain'>; name: string; x: number; y: number; w: number; h: number; unlock: number }[] = [
  { kind: 'cafe', name: 'Café da Vila', x: 32, y: 17, w: 4, h: 2, unlock: 3 },
  { kind: 'mail', name: 'Correio', x: 37, y: 17, w: 3, h: 2, unlock: 5 },
  { kind: 'museum', name: 'Museu', x: 41, y: 17, w: 3, h: 2, unlock: 8 },
  // O bairro dos jogos, ao norte da praça: cada prédio abre um modo do app (minigames, Pin Mode, Ginásios e PvP).
  { kind: 'arcade', name: 'Fliperama', x: 19, y: 12, w: 4, h: 2, unlock: 2 },
  { kind: 'pins', name: 'Pista de Pins', x: 14, y: 12, w: 4, h: 2, unlock: 4 },
  { kind: 'arena', name: 'Arena', x: 9, y: 12, w: 4, h: 2, unlock: 6 },
  // Modo próprio (como a Arena e a Pista de Pins), não um minigame do Fliperama: ver `core/survivor.ts`.
  { kind: 'torre', name: 'Torre de Sobrevivência', x: 5, y: 12, w: 3, h: 2, unlock: 7 },
];

/** Os níveis da cidade (pelo nível de Treinador), com o que cada um traz. */
export const TOWN_STAGES: readonly { level: number; name: string }[] = [
  { level: 1, name: 'Povoado' },
  { level: 3, name: 'Vilarejo' },
  { level: 5, name: 'Vila' },
  { level: 8, name: 'Cidadezinha' },
  { level: 12, name: 'Cidade' },
  { level: 17, name: 'Metrópole' },
];

export function townStage(level: number): { index: number; name: string; next: { level: number; name: string } | null } {
  let index = 0;
  for (let i = 0; i < TOWN_STAGES.length; i++) if (level >= TOWN_STAGES[i]!.level) index = i;
  return { index, name: TOWN_STAGES[index]!.name, next: TOWN_STAGES[index + 1] ?? null };
}

/** Todos os prédios que cabem num mapa `w`×`h`: o chão do mapa de 48×40 é o que o desenho pressupõe. */
export function buildingsFor(w: number, h: number): Building[] {
  const out: Building[] = [];
  const fits = (b: { x: number; y: number; w: number; h: number }) => b.x >= 3 && b.y >= 3 && b.x + b.w <= w - 3 && b.y + b.h + 1 <= h - 3;
  // A fonte, bem no meio da praça.
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  out.push({ id: 'fonte', kind: 'fountain', name: 'Fonte da praça', x: cx, y: cy, w: 2, h: 2, door: { x: cx, y: cy + 2 }, unlock: 1 });
  LOTS.forEach((l, i) => {
    const b = { x: l.x, y: l.y, w: 3, h: 2 };
    if (fits(b)) out.push({ id: `casa${i}`, ...b, kind: 'home', name: `Terreno ${i + 1}`, door: { x: b.x + 1, y: b.y + 2 }, unlock: l.unlock, lot: i });
  });
  for (const c of CIVIC) if (fits(c)) out.push({ id: c.kind, kind: c.kind, name: c.name, x: c.x, y: c.y, w: c.w, h: c.h, door: { x: c.x + Math.floor(c.w / 2), y: c.y + c.h }, unlock: c.unlock });
  return out;
}

/** Os dois blocos de rua extras: a rua de baixo (duas faixas) é gerada pelo mapa a partir desta linha. */
export function lowerStreetRow(h: number): number {
  return Math.floor(h / 2) + 8;
}

/** Onde ficam os postes de luz: nas frestas entre as casas, de frente para a rua. */
export function lampSpots(w: number, h: number): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  const north = [7, 11, 15, 19, 23, 36, 40];
  const south = [7, 11, 15, 19, 23, 27, 31, 35, 39, 43];
  for (const x of north) spots.push({ x, y: 19 });
  for (const x of south) spots.push({ x, y: 27 });
  return spots.filter((s) => s.x >= 3 && s.x < w - 3 && s.y < h - 3);
}
