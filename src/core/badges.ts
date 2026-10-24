import { LEAGUE_REGIONS } from './league';
import type { RegionId } from './league';
import type { PokemonType } from './pokemon-data';
import { round } from './badge-geometry';
import type { BadgeLayer, Point } from './badge-geometry';
import * as S from './badge-shapes';
import type { BadgeShape } from './badge-shapes';

export { arc, counterClockwise, signedArea } from './badge-geometry';
export type { BadgeLayer, Fill, Finish, Point } from './badge-geometry';

/**
 * Desenho das insígnias da Liga (8 por região, das Gerações I a VI): cada uma é um broche de metal esmaltado no formato
 * e nas cores da insígnia dos jogos. As formas ficam em `badge-shapes.ts` (pontos num quadrado de -1 a 1, y para cima),
 * e a mesma descrição vira SVG na interface (`BadgeIcon.vue`) e peça em relevo na maleta 3D (`src/box/badge-case.ts`).
 */

export interface MetalSpec {
  /** Nome do metal em português ("bronze", "aço escovado"...). */
  name: string;
  base: string;
  light: string;
  dark: string;
  /** Parâmetros do material na maleta 3D. */
  metalness: number;
  roughness: number;
}

export interface BadgeDesign {
  /** Índice global da insígnia (Sinnoh 0–7, Kanto 8–15... ver `LeagueRegion.badgeOffset`). */
  order: number;
  name: string;
  leader: string;
  type: PokemonType;
  /** O que o desenho mostra, para leitores de tela e para o rótulo da maleta. */
  motif: string;
  metal: MetalSpec;
  /** Três tons do esmalte: principal, sombra e luz. */
  enamel: readonly [string, string, string];
  /** Cristal translúcido (Pingente): na maleta deixa passar um pouco de luz. */
  translucent?: boolean;
  /** Contorno externo, fechado. É o que ganha relevo na maleta. */
  outline: readonly Point[];
  /** Camadas desenhadas sobre o metal, de baixo para cima. */
  layers: readonly BadgeLayer[];
}

const metal = (name: string, base: string, light: string, dark: string, metalness = 0.95, roughness = 0.4): MetalSpec => ({ name, base, light, dark, metalness, roughness });
const SILVER = metal('prata', '#c3ccd5', '#f5f8fb', '#76818d', 0.95, 0.35);
const GOLD = metal('ouro', '#dcaa38', '#fff0a6', '#87600c', 1, 0.38);
const OLD_GOLD = metal('ouro velho', '#c49a3a', '#f3d98a', '#765915');
const ROSE_GOLD = metal('ouro rosé', '#d9a08a', '#ffe0d2', '#8a5444');
const BRASS = metal('latão', '#c9a648', '#f6e39a', '#7a6020', 0.95, 0.42);
const BRONZE = metal('bronze', '#b07a3e', '#e8bd82', '#64401c', 0.9, 0.45);
const COPPER = metal('cobre', '#c46a3c', '#f3ab80', '#73361a', 0.9, 0.45);
const STEEL = metal('aço escovado', '#98a4ae', '#e2e8ee', '#505a63', 1, 0.5);
const PLATINUM = metal('platina', '#dfe3e8', '#ffffff', '#8f98a3', 1, 0.3);
const IRON = metal('ferro escuro', '#5a5c62', '#a3a6ad', '#26272b', 0.85, 0.55);
const CRYSTAL = metal('cristal com prata', '#bfe7f0', '#ffffff', '#5f9fb0', 0.25, 0.2);

type Enamel = readonly [string, string, string];
/** Motivo, metal, esmalte, forma e (só o Pingente) cristal translúcido, na ordem dos Ginásios da região. */
type BadgeSpec = readonly [motif: string, metal: MetalSpec, enamel: Enamel, shape: () => BadgeShape, translucent?: boolean];

const SPECS: Readonly<Record<RegionId, readonly BadgeSpec[]>> = {
  sinnoh: [
    ['porca hexagonal com núcleo de carvão', IRON, ['#9a8166', '#5e4c3a', '#cdb89c'], S.coal],
    ['árvore de folhas em losango', BRONZE, ['#4caf50', '#1f6b2c', '#8fd48a'], S.forest],
    ['quatro pedras em losango', COPPER, ['#f08a3c', '#b9531a', '#ffc48c'], S.cobble],
    ['montanhas azuis sobre o pântano', SILVER, ['#3d8fe0', '#1d5aa6', '#f3f8fd'], S.fen],
    ['três anéis roxos entrelaçados', OLD_GOLD, ['#8e5fd6', '#3e2470', '#c6a8f0'], S.relic],
    ['esfera de placas da mina', STEEL, ['#b9b3a2', '#6e6a5f', '#e3ddcc'], S.mine],
    ['três picos de gelo', CRYSTAL, ['#7fd6ea', '#3a9fbe', '#effcff'], S.icicle, true],
    ['cúpula do farol acesa', GOLD, ['#ffd23f', '#6f7f99', '#fff8c8'], S.beacon],
  ],
  kanto: [
    ['octógono cinza lapidado', SILVER, ['#9ea4ab', '#666c74', '#d9dde1'], S.boulder],
    ["gota d'água azul", SILVER, ['#3fa7f0', '#1f6fc0', '#b6e2ff'], S.cascade],
    ['estrela laranja de oito pontas', GOLD, ['#f08a1c', '#c25e0c', '#ffd84a'], S.thunder],
    ['flor de oito pétalas coloridas', SILVER, ['#a5b8a0', '#5d6b59', '#eef3ea'], S.rainbow],
    ['coração rosa', SILVER, ['#ff6fae', '#d02a74', '#ffc4dc'], S.soul],
    ['círculos concêntricos dourados', GOLD, ['#f2b01e', '#c98a10', '#ffe27a'], S.marsh],
    ['chama vermelha de três línguas', SILVER, ['#d92b2b', '#9a1414', '#ff6f4f'], S.volcano],
    ['ramo de folhas verdes', BRASS, ['#4caf50', '#1f6b2a', '#b5e3a0'], S.earth],
  ],
  johto: [
    ['asas cinza dobradas em bloco', SILVER, ['#a3abb3', '#6f7780', '#dfe3e7'], S.zephyr],
    ['joaninha vermelha', IRON, ['#e8322b', '#a51c17', '#ff8a80'], S.hive],
    ['losango amarelo lapidado', GOLD, ['#ffd21f', '#e09a00', '#fff3a0'], S.plain],
    ['fantasma na névoa azul', SILVER, ['#3f73d6', '#1c2f72', '#eef4ff'], S.fog],
    ['punho cerrado marrom', BRONZE, ['#9a6233', '#5e3818', '#d39a62'], S.storm],
    ['octógono prateado lapidado', PLATINUM, ['#aab3c9', '#6c7590', '#e3e8f4'], S.mineral],
    ['hexágono de gelo facetado', SILVER, ['#4fd0e0', '#108fa3', '#c9f4fa'], S.glacier],
    ['cabeça de dragão negra', IRON, ['#2c2c36', '#141419', '#5c5c6c'], S.rising],
  ],
  hoenn: [
    ['duas pontas de flecha de pedra', COPPER, ['#e07b2e', '#7d4a22', '#ffc07a'], S.stone],
    ['luva de boxe azul', SILVER, ['#3d8ee6', '#1b4f9c', '#a9d4ff'], S.knuckle],
    ['disco de dínamo dourado', GOLD, ['#e6a521', '#a86b0c', '#ffe17a'], S.dynamo],
    ['chama laranja que se enrola', COPPER, ['#f05a1a', '#b13a0c', '#ffa43a'], S.heat],
    ['dois círculos ligados', SILVER, ['#a2abb5', '#c2185b', '#f48fb1'], S.balance],
    ['pena branca', SILVER, ['#e6ebf1', '#9aa5b2', '#ffffff'], S.feather],
    ['coração com anel dourado', GOLD, ['#f06aa0', '#b0185a', '#ffd7e8'], S.mind],
    ['três gotas num triângulo', SILVER, ['#2196f3', '#263046', '#eef6ff'], S.rain],
  ],
  unova: [
    ['ziguezague de três cores', GOLD, ['#e53935', '#7a5a1a', '#fff1b0'], S.trio],
    ['barra roxa de pontas douradas', GOLD, ['#7b3fbf', '#4b2180', '#c69af2'], S.basic],
    ['asa de folha verde', BRASS, ['#5fae3a', '#2f6d1e', '#a6dc6e'], S.insect],
    ['relâmpago amarelo', GOLD, ['#ffd31a', '#f08c00', '#fff6a8'], S.bolt],
    ['lâmina sísmica amarela', BRONZE, ['#f2c230', '#8a5a2b', '#fff0a0'], S.quake],
    ['asa azul enflechada', SILVER, ['#4fc3f7', '#0b7fc0', '#e1f6ff'], S.jet],
    ['cristal laranja', COPPER, ['#ff9a3c', '#c85a14', '#ffd7a8'], S.freeze],
    ['estrela negra de pontas douradas', GOLD, ['#2b2b30', '#121214', '#f0c45a'], S.legend],
  ],
  kalos: [
    ['besouro de asas verdes', BRONZE, ['#76b83f', '#7a4a2c', '#bfe68f'], S.beetle],
    ['degraus de rocha', BRONZE, ['#a0703f', '#5c3b1c', '#d9a76d'], S.cliff],
    ['punho de aço com frente vermelha', STEEL, ['#e23b3b', '#7f8890', '#d3d9de'], S.rumble],
    ['gota verde com nervuras', BRASS, ['#5cb85c', '#1b5e20', '#a5d6a7'], S.plant],
    ['estrela de seis lâminas', STEEL, ['#f57c00', '#b34700', '#ffd54f'], S.voltage],
    ['leque rosa', ROSE_GOLD, ['#f48fb1', '#c2577e', '#ffe0ec'], S.fairy],
    ['esfera dourada com espiral roxa', GOLD, ['#e8b84a', '#6a2c91', '#fff0b8'], S.psychic],
    ['iceberg num hexágono', GOLD, ['#5fb4ef', '#1a4f9c', '#f2fbff'], S.iceberg],
  ],
};

export const ALL_BADGE_DESIGNS: readonly BadgeDesign[] = LEAGUE_REGIONS.flatMap((r) =>
  r.gyms.map((g): BadgeDesign => {
    const [motif, metalSpec, enamel, shape, translucent] = SPECS[r.id][g.order]!;
    const { outline, layers } = shape();
    return { order: r.badgeOffset + g.order, name: g.badge!.name, leader: g.leader, type: g.type!, motif, metal: metalSpec, enamel, ...(translucent ? { translucent } : {}), outline, layers };
  }),
).sort((a, b) => a.order - b.order);

/** As 8 de Sinnoh (índices 0–7, os primeiros salvos). */
export const BADGE_DESIGNS: readonly BadgeDesign[] = ALL_BADGE_DESIGNS.slice(0, 8);

export function badgeDesign(order: number): BadgeDesign | null {
  return ALL_BADGE_DESIGNS[order] ?? null;
}

/** `d` de um `<path>` SVG (o SVG tem y para baixo, então o desenho é espelhado). */
export function pathData(points: readonly Point[], closed = true): string {
  if (points.length === 0) return '';
  const body = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)} ${round(-y)}`).join(' ');
  return closed ? `${body} Z` : body;
}

/** Como a insígnia aparece com um certo polimento (0 a 1): aspereza do metal, poeira por cima e brilho. */
export interface PolishLook {
  roughness: number;
  /** Opacidade da poeira/fosco sobre o desenho. */
  dust: number;
  /** Força do brilho que passa e das faíscas. */
  gleam: number;
}

export function polishLook(design: BadgeDesign, polish: number): PolishLook {
  const p = Math.min(1, Math.max(0, polish));
  const roughness = design.metal.roughness + (0.06 - design.metal.roughness) * p;
  return { roughness: round(roughness), dust: round(0.55 * (1 - p) ** 1.4), gleam: round(p ** 1.6) };
}

/** Posição do encaixe de cada insígnia no forro da maleta: 2 fileiras de 4, em unidades do forro (-1 a 1). */
export function slotPosition(order: number): { x: number; y: number } {
  const col = order % 4;
  const row = Math.floor((order % 8) / 4);
  return { x: round(-0.75 + col * 0.5), y: round(row === 0 ? 0.42 : -0.42) };
}
