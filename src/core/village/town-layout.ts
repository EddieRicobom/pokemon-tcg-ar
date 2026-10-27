/**
 * O desenho fixo da cidadinha da Vila (sem lógica de jogo): onde ficam os terrenos das casas dos Pokémon, os prédios da
 * praça, a fonte e os postes. O mapa é sempre o mesmo; o que muda com o nível de Treinador é quais terrenos estão
 * liberados (os outros aparecem cercados, com uma placa). Só dados e geometria, para o mapa poder usar sem ciclos.
 */

import { CAFE_TABLES } from './cafe-layout';

export type BuildingKind = 'home' | 'cafe' | 'mail' | 'museum' | 'arcade' | 'pins' | 'arena' | 'torre' | 'dojo' | 'fountain' | 'altar';

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

export type HomeExteriorStyle = 'rústico' | 'jardim' | 'festivo' | 'moderno' | 'praiano' | 'serrano' | 'tradicional' | 'noturno';
export const HOME_EXTERIOR_STYLES: readonly { id: HomeExteriorStyle; name: string; description: string; cost: number }[] = [
  { id: 'rústico', name: 'Rústico', description: 'madeira, vasos e detalhes acolhedores', cost: 0 },
  { id: 'jardim', name: 'Jardim', description: 'folhas, flores e um toque de primavera', cost: 35 },
  { id: 'festivo', name: 'Festivo', description: 'bandeirinhas e cores de comemoração', cost: 45 },
  { id: 'moderno', name: 'Moderno', description: 'linhas limpas e detalhes metálicos', cost: 55 },
  { id: 'praiano', name: 'Praiano', description: 'fachada azul e detalhes claros de cidade litorânea', cost: 55 },
  { id: 'serrano', name: 'Serrano', description: 'tijolos, madeira e telhado de montanha', cost: 60 },
  { id: 'tradicional', name: 'Tradicional', description: 'fachada quente e acabamento clássico', cost: 50 },
  { id: 'noturno', name: 'Noturno', description: 'tons rosados e telhado violeta acolhedor', cost: 65 },
];

/** Limite sul do lote sólido, antes da calçada. Toda a largura da passagem diante da porta fica livre. */
export function buildingGroundY(building: Pick<Building, 'y' | 'h'>): number {
  return building.y + building.h;
}

/**
 * O mapa grande (96×72, desde o rework da Vila): a cidade fica no meio, cercada de matas, lago, parque e fazenda.
 * Casas: 5 blocos de largura por 2 de fundo (o desenho do tileset sobe acima disso); a frente olha para baixo, para a
 * rua. Duas fileiras: a Rua das Casas (y = 50) e a Rua do Sul (y = 62). Ordem = ordem em que são liberadas (as mais
 * perto da avenida primeiro).
 */
export const LOTS: readonly { x: number; y: number; unlock: number }[] = [
  // 2 blocos livres entre uma casa e outra (o desenho do tileset é largo): dá para passar sempre entre elas.
  { x: 36, y: 48, unlock: 1 },
  { x: 51, y: 48, unlock: 1 },
  { x: 29, y: 48, unlock: 1 },
  { x: 58, y: 48, unlock: 2 },
  { x: 22, y: 48, unlock: 3 },
  { x: 65, y: 48, unlock: 3 },
  { x: 72, y: 48, unlock: 4 },
  { x: 36, y: 60, unlock: 5 },
  { x: 51, y: 60, unlock: 6 },
  { x: 29, y: 60, unlock: 7 },
  { x: 58, y: 60, unlock: 8 },
  { x: 22, y: 60, unlock: 9 },
  { x: 65, y: 60, unlock: 10 },
  { x: 72, y: 60, unlock: 12 },
];
export const HOME_W = 5;
export const HOME_H = 2;

/**
 * Os prédios, todos na Rua dos Jogos (y = 24), ao norte da praça; a largura vem do desenho de cada um no tileset.
 * Cada prédio abre um modo do app (minigames, Pin Mode, Ginásios e PvP, a Torre) ou um serviço da Vila.
 */
export const CIVIC: readonly { kind: Exclude<BuildingKind, 'home' | 'fountain'>; name: string; x: number; y: number; w: number; h: number; unlock: number }[] = [
  { kind: 'cafe', name: 'Café da Vila', x: 63, y: 22, w: 8, h: 2, unlock: 3 },
  { kind: 'mail', name: 'Correio', x: 72, y: 22, w: 5, h: 2, unlock: 5 },
  { kind: 'museum', name: 'Museu', x: 51, y: 22, w: 10, h: 2, unlock: 8 },
  { kind: 'arcade', name: 'Fliperama', x: 26, y: 22, w: 5, h: 2, unlock: 2 },
  { kind: 'pins', name: 'Pista de Pins', x: 32, y: 22, w: 5, h: 2, unlock: 4 },
  // O Coliseu: 112 px de largura (7 blocos), entre a Torre (até x = 16) e o Fliperama (desde x = 26); a porta continua em x = 21.
  { kind: 'arena', name: 'Arena', x: 18, y: 22, w: 7, h: 2, unlock: 6 },
  // Modo próprio (como a Arena e a Pista de Pins), não um minigame do Fliperama: ver `core/survivor.ts`.
  { kind: 'torre', name: 'Torre de Sobrevivência', x: 12, y: 22, w: 5, h: 2, unlock: 7 },
  // O Dojô da Torre, a oeste da Torre de Sobrevivência: o desenho muda com o nível da reforma (`state.tower.dojoLevel`).
  { kind: 'dojo', name: 'Dojô da Torre', x: 4, y: 22, w: 6, h: 2, unlock: 7 },
  { kind: 'altar', name: 'Altar da Confiança', x: 41, y: 83, w: 3, h: 2, unlock: 4 },
];

/** O mapa: tamanho, ruas e lugares fixos (o resto — matas, lago, flores — o sorteio espalha em volta). */
export const TOWN = {
  w: 120,
  h: 96,
  /** Avenida (norte–sul, 2 blocos) e as ruas (leste–oeste, 2 blocos cada): linha de cima de cada uma. */
  avenueX: 47,
  mainStreetY: 38,
  gamesStreetY: 24,
  homesStreetY: 50,
  southStreetY: 62,
  /** A praça (piso de pedra) e a fonte no meio dela. */
  plaza: { x: 40, y: 32, w: 15, h: 10 },
  fountain: { x: 47, y: 36, w: 2, h: 2 },
  /** O terreno da sua casa e o mercado (barracas) da praça. */
  plot: { x: 30, y: 31, w: 5, h: 3 },
  shop: { x: 56, y: 34, w: 8, h: 2 },
  /** Onde você aparece (na praça, livre). */
  spawn: { x: 45, y: 41 },
  /** O lago com praia, ao nordeste. */
  lake: { x: 81, y: 11, sand: 8.6, water: 6.2 },
} as const;

/** Zonas fixas de trabalho: a mata do noroeste, a pedreira ao sul e a margem do lago. */
export const WORK_AREAS = {
  lumber: { x: 5, y: 6, w: 13, h: 9 },
  mine: { x: 5, y: 64, w: 15, h: 6 },
  fishing: { x: 72, y: 5, w: 18, h: 15 },
} as const;

export const WORK_SITES = [
  { id: 'farm', name: 'Fazenda', icon: '🌱', location: 'Leste da Vila', visit: { x: 84, y: 46 }, description: 'Plantio com sementes da caixa, rega e colheita dos canteiros. A produção vai para sua mochila.' },
  { id: 'mine', name: 'Mina', icon: '⛏️', location: 'Sul da Vila', visit: { x: 16, y: 66 }, description: 'Pedras rendem pedra e podem conter cristal (12%) e ouro (4%), como na coleta manual. Cada pedra rende uma vez por dia.' },
  { id: 'lumber', name: 'Madeireira', icon: '🪓', location: 'Noroeste da Vila', visit: { x: 15, y: 13 }, description: 'As árvores rendem madeira e podem deixar pena (12%) ou mel (5%). Cada árvore rende uma vez por dia.' },
  { id: 'fishing', name: 'Pescaria', icon: '🎣', location: 'Píer do lago, no nordeste', visit: { x: 80, y: 18 }, description: 'Usa as mesmas chances da sua pescaria: peixes, algas e achados raros; a isca também pode voltar vazia. Moradores e jogador compartilham 10 lançamentos por dia.' },
] as const;
export type WorksiteId = typeof WORK_SITES[number]['id'];

export type DecorKind = 'furniture' | 'leisure-sign' | 'cafe-table' | 'seed-box' | 'bell' | 'swing' | 'slide' | 'carousel' | 'seesaw' | 'gym' | 'board' | 'barn' | 'planter' | 'pot' | 'tree-big' | 'pine-m' | 'fence-h' | 'wall' | 'mine-entrance' | 'log-depot' | 'mine-board' | 'lumber-board' | 'fishing-board';

/** Enfeites fixos do mapa (sólidos; o desenho sai do atlas com o mesmo nome e fica em pé sobre a base). */
export interface Decor {
  kind: DecorKind;
  item?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DECOR: readonly Decor[] = [
  ...CAFE_TABLES.map((table) => ({ kind: 'cafe-table' as const, x: table.x, y: table.y + 1, w: 2, h: 1 })),
  { kind: 'mine-entrance', x: 6, y: 64, w: 3, h: 1 },
  { kind: 'mine-board', x: 17, y: 65, w: 2, h: 1 },
  { kind: 'log-depot', x: 14, y: 7, w: 2, h: 1 },
  { kind: 'lumber-board', x: 13, y: 12, w: 2, h: 1 },
  { kind: 'fishing-board', x: 77, y: 19, w: 2, h: 1 },
  // Parquinho, a oeste da praça.
  { kind: 'swing', x: 8, y: 44, w: 4, h: 1 },
  { kind: 'slide', x: 14, y: 44, w: 1, h: 1 },
  { kind: 'carousel', x: 8, y: 48, w: 3, h: 2 },
  { kind: 'seesaw', x: 15, y: 49, w: 4, h: 1 },
  { kind: 'gym', x: 9, y: 53, w: 3, h: 1 },
  { kind: 'tree-big', x: 18, y: 46, w: 1, h: 1 },
  { kind: 'tree-big', x: 17, y: 54, w: 1, h: 1 },
  { kind: 'pine-m', x: 6, y: 57, w: 1, h: 1 },
  // O sino da praça, ao lado da fonte: tocar chama todos os Pokémon acordados (ver `VillageGame.ringBell`).
  { kind: 'bell', x: 50, y: 36, w: 1, h: 1 },
  // Praça: mural de recados e jardineiras. O mural fica encostado ao lado esquerdo da fonte.
  { kind: 'board', x: 45, y: 35, w: 2, h: 1 },
  { kind: 'planter', x: 51, y: 32, w: 3, h: 1 },
  { kind: 'planter', x: 41, y: 41, w: 3, h: 1 },
  { kind: 'pot', x: 53, y: 41, w: 1, h: 1 },
  // Fazenda, a leste: celeiro, cercas e muro de pedra.
  { kind: 'barn', x: 84, y: 42, w: 5, h: 2 },
  { kind: 'seed-box', x: 83, y: 46, w: 1, h: 1 },
  { kind: 'fence-h', x: 79, y: 46, w: 2, h: 1 },
  { kind: 'fence-h', x: 79, y: 57, w: 2, h: 1 },
  { kind: 'wall', x: 85, y: 59, w: 4, h: 1 },
  // Bosque do sul.
  { kind: 'tree-big', x: 14, y: 64, w: 1, h: 1 },
  { kind: 'pine-m', x: 80, y: 64, w: 1, h: 1 },
];

/** Canteiros da fazenda (terra arada: dá para plantar, como na grama). */
export const FIELDS: readonly { x: number; y: number; w: number; h: number }[] = [
  { x: 78, y: 48, w: 5, h: 3 },
  { x: 85, y: 48, w: 5, h: 3 },
  { x: 78, y: 53, w: 5, h: 3 },
  { x: 85, y: 53, w: 5, h: 3 },
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

/** Todos os prédios que cabem num mapa `w`×`h` (o desenho pressupõe o mapa de `TOWN.w`×`TOWN.h`). */
export function buildingsFor(w: number, h: number): Building[] {
  const out: Building[] = [];
  const fits = (b: { x: number; y: number; w: number; h: number }) => b.x >= 3 && b.y >= 3 && b.x + b.w <= w - 3 && b.y + b.h + 1 <= h - 3;
  const f = TOWN.fountain;
  if (fits(f)) out.push({ id: 'fonte', kind: 'fountain', name: 'Fonte da praça', ...f, door: { x: f.x, y: f.y + f.h }, unlock: 1 });
  LOTS.forEach((l, i) => {
    const b = { x: l.x, y: l.y, w: HOME_W, h: HOME_H };
    if (fits(b)) out.push({ id: `casa${i}`, ...b, kind: 'home', name: `Terreno ${i + 1}`, door: { x: b.x + 2, y: b.y + b.h }, unlock: l.unlock, lot: i });
  });
  for (const c of CIVIC) if (fits(c)) out.push({ id: c.kind, kind: c.kind, name: c.name, x: c.x, y: c.y, w: c.w, h: c.h, door: { x: c.x + Math.floor(c.w / 2), y: c.y + c.h }, unlock: c.unlock });
  return out;
}

/**
 * Onde ficam os postes de luz: só na beira das ruas (nunca no vão entre duas casas nem colado numa porta), para nenhum
 * poste fechar passagem.
 */
export function lampSpots(w: number, h: number): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  for (let x = 8; x < 88; x += 12) spots.push({ x, y: TOWN.mainStreetY - 1 }, { x: x + 6, y: TOWN.mainStreetY + 2 });
  for (let x = 11; x < 78; x += 11) spots.push({ x, y: TOWN.gamesStreetY + 2 });
  for (const l of LOTS) spots.push({ x: l.x + HOME_W + 1, y: l.y + HOME_H + 2 });
  for (let y = 8; y < 66; y += 12) spots.push({ x: TOWN.avenueX - 1, y }, { x: TOWN.avenueX + 2, y: y + 6 });
  // Nada de poste dentro do desenho de uma construção (o desenho sobe uns 9 blocos acima da base) nem colado nela.
  const under = (s: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) => s.x >= b.x - 1 && s.x <= b.x + b.w && s.y >= b.y - 9 && s.y <= b.y + b.h;
  const blocks = [...buildingsFor(w, h), TOWN.plot, TOWN.shop];
  return spots.filter((s) => s.x >= 3 && s.y >= 3 && s.x < w - 3 && s.y < h - 3 && !blocks.some((b) => under(s, b)));
}
