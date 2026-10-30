import { survivorGenerationOrder } from './survivor-regions';

/**
 * Cenário de cada andar da Masmorra. Cada andar sorteia uma geração (todas aparecem uma vez a cada 9 andares antes de
 * repetir, como na Torre), e a geração decide os inimigos e o ambiente: a caverna ou o lugar mais marcante da região,
 * no jeito de Pokémon Mystery Dungeon (piso, paredes e enfeites próprios por masmorra, e casas especiais como lava e
 * água). Paleta, enfeites e partículas são só visuais; as casas especiais mudam o jogo (`dungeon.ts`).
 */

export type HazardKind = 'lava' | 'agua';
export type DecorKind = 'estalagmite' | 'pedra-lunar' | 'cogumelo' | 'cristal' | 'brasa' | 'gelo' | 'raiz' | 'trilho' | 'lanterna' | 'concha' | 'osso' | 'espelho' | 'prisma';
export type ParticleKind = 'poeira' | 'gotas' | 'brasas' | 'neve' | 'faiscas' | 'brilho' | 'luz' | 'carvao' | 'prisma';

export interface DungeonBiome {
  /** Índice da geração (0 = Kanto … 8 = Paldea). */
  gen: number;
  region: string;
  name: string;
  description: string;
  hazard: HazardKind | null;
  /** Fração das casas livres que viram casa especial. */
  hazardDensity: number;
  decor: readonly DecorKind[];
  particles: ParticleKind;
  palette: {
    floorA: string;
    floorB: string;
    speck: string;
    wallTop: string;
    wallSide: string;
    wallEdge: string;
    frame: string;
    bgA: string;
    bgB: string;
    accent: string;
  };
}

export const DUNGEON_BIOMES: readonly DungeonBiome[] = [
  {
    gen: 0, region: 'Kanto', name: 'Monte Lua', description: 'Caverna de rocha marrom onde as Pedras da Lua brilham no escuro e poças se juntam nos cantos.',
    hazard: 'agua', hazardDensity: 0.04, decor: ['estalagmite', 'pedra-lunar', 'pedra-lunar'], particles: 'poeira',
    palette: { floorA: '#6b5a48', floorB: '#58493a', speck: '#8a7660', wallTop: '#8d7a64', wallSide: '#3e3228', wallEdge: '#2a211a', frame: '#7c6a54', bgA: '#2c2219', bgB: '#0f0b08', accent: '#d9e6ff' },
  },
  {
    gen: 1, region: 'Johto', name: 'Gruta União', description: 'Túneis frios e úmidos cortados por água corrente, com rocha cinza-azulada.',
    hazard: 'agua', hazardDensity: 0.12, decor: ['estalagmite', 'concha', 'raiz'], particles: 'gotas',
    palette: { floorA: '#4f5a63', floorB: '#424b54', speck: '#6c7884', wallTop: '#6f7d88', wallSide: '#2b333b', wallEdge: '#1b2127', frame: '#5d6f7e', bgA: '#1a232b', bgB: '#080c10', accent: '#7cc4ff' },
  },
  {
    gen: 2, region: 'Hoenn', name: 'Monte Chaminé', description: 'Interior do vulcão: rocha escura, cinzas e rios de lava que queimam quem não é do tipo Fogo.',
    hazard: 'lava', hazardDensity: 0.1, decor: ['brasa', 'estalagmite', 'osso'], particles: 'brasas',
    palette: { floorA: '#4a2f28', floorB: '#3b241f', speck: '#6e4234', wallTop: '#6b3c2c', wallSide: '#2a1410', wallEdge: '#170907', frame: '#9a3f1e', bgA: '#3a120a', bgB: '#110403', accent: '#ff8a3d' },
  },
  {
    gen: 3, region: 'Sinnoh', name: 'Monte Coronet', description: 'A montanha sagrada: corredores de pedra azulada, neve que entra pelas frestas e um campo magnético estranho.',
    hazard: null, hazardDensity: 0, decor: ['gelo', 'estalagmite', 'gelo'], particles: 'neve',
    palette: { floorA: '#6d7889', floorB: '#5d6779', speck: '#9aa7ba', wallTop: '#a9b6c8', wallSide: '#3a4252', wallEdge: '#232835', frame: '#8ea2bd', bgA: '#1f2738', bgB: '#090c14', accent: '#e8f2ff' },
  },
  {
    gen: 4, region: 'Unova', name: 'Caverna Eletropedra', description: 'Pedras eletrificadas flutuam no ar azul-escuro e soltam faíscas entre si.',
    hazard: null, hazardDensity: 0, decor: ['cristal', 'cristal', 'estalagmite'], particles: 'faiscas',
    palette: { floorA: '#2c3550', floorB: '#232b43', speck: '#3e4c72', wallTop: '#4a5a86', wallSide: '#151a2c', wallEdge: '#0b0e19', frame: '#3fb4ff', bgA: '#0f1a36', bgB: '#03060f', accent: '#5fe3ff' },
  },
  {
    gen: 5, region: 'Kalos', name: 'Gruta Reflexo', description: 'Paredes lisas como espelho refletem a luz em tons de lilás e branco.',
    hazard: null, hazardDensity: 0, decor: ['espelho', 'cristal', 'espelho'], particles: 'brilho',
    palette: { floorA: '#6a5f7e', floorB: '#5a506d', speck: '#9488ad', wallTop: '#c4b8de', wallSide: '#3d3352', wallEdge: '#271f36', frame: '#c9a8f2', bgA: '#2a2040', bgB: '#0d0915', accent: '#fbe8ff' },
  },
  {
    gen: 6, region: 'Alola', name: 'Colina Dez Quilates', description: 'Caverna aberta para o céu: chão de areia, capim nas frestas e piscinas de água do mar.',
    hazard: 'agua', hazardDensity: 0.09, decor: ['concha', 'raiz', 'cristal'], particles: 'luz',
    palette: { floorA: '#b39d72', floorB: '#a28c62', speck: '#cdb98d', wallTop: '#8d9a5c', wallSide: '#4f4a33', wallEdge: '#302d1f', frame: '#6fb38a', bgA: '#3a4a3a', bgB: '#121812', accent: '#ffe8a3' },
  },
  {
    gen: 7, region: 'Galar', name: 'Mina de Galar', description: 'Galerias de carvão com trilhos, lampiões e esteiras que levam o minério.',
    hazard: null, hazardDensity: 0, decor: ['trilho', 'lanterna', 'estalagmite'], particles: 'carvao',
    palette: { floorA: '#4b3d33', floorB: '#3e3229', speck: '#6b5747', wallTop: '#5e4b3c', wallSide: '#231a14', wallEdge: '#140e0a', frame: '#d0782c', bgA: '#2a1c12', bgB: '#0c0805', accent: '#ffb347' },
  },
  {
    gen: 8, region: 'Paldea', name: 'Área Zero', description: 'O fundo da Grande Cratera: verde enevoado e cristais Terastal que refletem todas as cores.',
    hazard: null, hazardDensity: 0, decor: ['prisma', 'cristal', 'raiz'], particles: 'prisma',
    palette: { floorA: '#3f5e55', floorB: '#334f47', speck: '#5d8478', wallTop: '#6aa392', wallSide: '#1e3530', wallEdge: '#11201d', frame: '#9fe7d2', bgA: '#14302a', bgB: '#05100d', accent: '#ffd6f6' },
  },
];

/** A geração (0–8) sorteada para o andar: ordem embaralhada pela semente, sem repetir dentro de cada volta de 9. */
export function floorGeneration(seed: number, floor: number): number {
  const index = Math.max(0, Math.floor(floor) - 1);
  const n = DUNGEON_BIOMES.length;
  const order = survivorGenerationOrder(seed || 1, Math.floor(index / n));
  return order[index % n] ?? 0;
}

export function biomeOf(gen: number): DungeonBiome {
  return DUNGEON_BIOMES[((gen % DUNGEON_BIOMES.length) + DUNGEON_BIOMES.length) % DUNGEON_BIOMES.length]!;
}

/** Bônus de quem luta na própria região: Pokémon da geração sorteada para o andar. */
export const HOME_BONUS = 0.1;
/** Dano da lava no fim da rodada, em fração do HP máximo (Fogo e Voador não sofrem). */
export const LAVA_BURN = 0.08;
