import { ARCHETYPES, archetype } from './archetypes';
import type { ArchetypeGroup } from './archetypes';

/**
 * Animações dos arquétipos ao escanear uma carta. Cada arquétipo tem uma receita: um desenho em cel-shading (folha de
 * quadros pré-renderizada no aparelho, ver `ar/archetype-sprites.ts`) e um movimento das partículas em volta do
 * Pokémon. Os arquétipos de uma carta tocam em sequência e se sobrepõem (cada um entra `staggerMs` depois do anterior).
 * Aqui fica só a parte pura: receitas, plano e posição de cada partícula no tempo, testáveis sem WebGL.
 */

/** Desenho de uma partícula (cada um tem um pintor em `ar/archetype-sprites.ts`). */
export type FxShape =
  | 'flame' | 'drop' | 'bolt' | 'leaf' | 'crystal' | 'sparkle' | 'star' | 'burst' | 'bubble' | 'rock' | 'feather' | 'wisp'
  | 'gear' | 'heart' | 'slash' | 'hex' | 'dust' | 'coin' | 'orb' | 'scale' | 'streak' | 'rune' | 'badge';

/**
 * Movimento: `rise` sobe do chão; `fall` cai do alto; `orbit` gira em volta do Pokémon; `spiral` sobe girando; `erupt`
 * sai da base em arco; `strike` desce do alto até o Pokémon; `impact` cresce no peito do Pokémon; `pop` salta acima da
 * cabeça (selos com texto); `ring` é um círculo deitado na carta; `streak` atravessa de lado (linhas de velocidade).
 */
export type FxMotion = 'rise' | 'fall' | 'orbit' | 'spiral' | 'erupt' | 'strike' | 'impact' | 'pop' | 'ring' | 'streak';

/** Paleta em cel-shading: contorno, sombra, cor base e luz (hex `#rrggbb`). */
export type FxPalette = readonly [outline: string, shadow: string, base: string, light: string];

export interface FxRecipe {
  shape: FxShape;
  motion: FxMotion;
  palette: FxPalette;
  /** Partículas da camada. */
  count: number;
  /** Tamanho da partícula, em alturas do Pokémon. */
  size: number;
  /** Texto do selo (`shape: 'badge'`). */
  badge?: string;
  /** Tintas que se alternam entre as partículas (multiplicam a paleta; use com a paleta clara `PAL.white`). */
  tints?: readonly string[];
}

/** Paletas por tema. */
export const PAL = {
  fire: ['#3a0d06', '#c2341b', '#ff7a1a', '#ffe066'],
  water: ['#0b1f4a', '#1f5fd1', '#3fa0ff', '#c8f2ff'],
  electric: ['#3b2a00', '#d19a00', '#ffd51a', '#fffbd1'],
  grass: ['#0f3311', '#2f8a2a', '#5ccf3d', '#d4ff9e'],
  ice: ['#123147', '#59a8d6', '#a8e6ff', '#ffffff'],
  fighting: ['#3a0b0b', '#a8261e', '#e8513f', '#ffc3a1'],
  poison: ['#2a0b3a', '#7a2fa8', '#b45ce0', '#f0c2ff'],
  ground: ['#2e1a08', '#8a5a24', '#cf9a4f', '#f6dca0'],
  flying: ['#1c2440', '#7a8fcf', '#b8c8ff', '#ffffff'],
  psychic: ['#3a0828', '#c2307a', '#ff5fa8', '#ffd1ea'],
  bug: ['#1f2a05', '#6f8a10', '#a8c92a', '#eaff8a'],
  rock: ['#24180c', '#7a6640', '#b8a070', '#efe2bc'],
  ghost: ['#140a2a', '#4a2f8a', '#7d5cd1', '#d9c8ff'],
  dragon: ['#0e0b3a', '#3a2fc2', '#6f5cff', '#c8bfff'],
  dark: ['#0a0808', '#2f2626', '#5a4a48', '#a8948f'],
  steel: ['#1a2026', '#6f7f8a', '#aebcc6', '#f2f8fc'],
  fairy: ['#3a0a2a', '#e05ca8', '#ff9ed4', '#fff0fa'],
  normal: ['#2a2622', '#a89c8a', '#dcd2bf', '#ffffff'],
  gold: ['#3a2600', '#c28a00', '#ffc61a', '#fff4b8'],
  silver: ['#1e2228', '#8a95a3', '#c9d2dc', '#ffffff'],
  bronze: ['#2a1406', '#8a4a1f', '#c97a3f', '#ffd2a8'],
  red: ['#2e0610', '#b0122e', '#ff2e4f', '#ffc2cc'],
  cyan: ['#062a33', '#139aa8', '#3fe4f0', '#d8fffd'],
  violet: ['#1d0838', '#5a1fb0', '#9a5cff', '#e6d6ff'],
  amber: ['#2e1600', '#b06a00', '#ffa31a', '#ffe7b0'],
  white: ['#1d1b26', '#b4b0c4', '#e8e6f2', '#ffffff'],
} as const satisfies Record<string, FxPalette>;

const RAINBOW = ['#ff4a5a', '#ffa23a', '#ffe14a', '#5ce06a', '#4ab6ff', '#9a6bff'] as const;
const STARTER_TINTS = ['#ff8a5a', '#5ab8ff', '#7ce06a'] as const;
const PARADOX_TINTS = ['#ff5ab8', '#5affe6'] as const;

const r = (shape: FxShape, motion: FxMotion, palette: FxPalette, count: number, size: number, extra: Partial<FxRecipe> = {}): FxRecipe => ({ shape, motion, palette, count, size, ...extra });
/** Selo com texto que salta acima da cabeça. */
const badge = (text: string, palette: FxPalette): FxRecipe => r('badge', 'pop', palette, 1, 0.26, { badge: text });

const TYPE_FX: Readonly<Record<string, FxRecipe>> = {
  'tipo-normal': r('star', 'rise', PAL.normal, 7, 0.14),
  'tipo-fire': r('flame', 'rise', PAL.fire, 10, 0.22),
  'tipo-water': r('drop', 'erupt', PAL.water, 10, 0.16),
  'tipo-electric': r('bolt', 'strike', PAL.electric, 4, 0.42),
  'tipo-grass': r('leaf', 'spiral', PAL.grass, 9, 0.16),
  'tipo-ice': r('crystal', 'fall', PAL.ice, 9, 0.16),
  'tipo-fighting': r('burst', 'impact', PAL.fighting, 1, 0.7),
  'tipo-poison': r('bubble', 'rise', PAL.poison, 9, 0.15),
  'tipo-ground': r('rock', 'erupt', PAL.ground, 8, 0.15),
  'tipo-flying': r('feather', 'fall', PAL.flying, 7, 0.2),
  'tipo-psychic': r('orb', 'orbit', PAL.psychic, 6, 0.16),
  'tipo-bug': r('leaf', 'orbit', PAL.bug, 8, 0.13),
  'tipo-rock': r('rock', 'fall', PAL.rock, 7, 0.17),
  'tipo-ghost': r('wisp', 'spiral', PAL.ghost, 7, 0.22),
  'tipo-dragon': r('scale', 'spiral', PAL.dragon, 9, 0.16),
  'tipo-dark': r('slash', 'impact', PAL.dark, 1, 0.75),
  'tipo-steel': r('gear', 'orbit', PAL.steel, 5, 0.2),
  'tipo-fairy': r('sparkle', 'rise', PAL.fairy, 10, 0.15),
};

/** Receita de cada arquétipo (todo id de `ARCHETYPES` tem uma; o teste confere). */
export const ARCHETYPE_FX: Readonly<Record<string, FxRecipe>> = {
  // Mecânica da carta: o selo da mecânica salta acima da cabeça.
  'ex-antigo': badge('ex', PAL.amber),
  'lv-x': badge('LV.X', PAL.silver),
  prime: badge('Prime', PAL.cyan),
  legend: badge('LEGEND', PAL.gold),
  'ex-maiusculo': badge('EX', PAL.red),
  'mega-evolucao': badge('MEGA', PAL.violet),
  primal: badge('PRIMAL', PAL.fire),
  break: badge('BREAK', PAL.gold),
  gx: badge('GX', PAL.water),
  'tag-team': badge('TAG TEAM', PAL.red),
  prisma: badge('◇ PRISMA', PAL.violet),
  v: badge('V', PAL.silver),
  vmax: badge('VMAX', PAL.red),
  vstar: badge('VSTAR', PAL.gold),
  'v-union': badge('V-UNION', PAL.steel),
  radiante: badge('RADIANTE', PAL.gold),
  'ex-moderno': badge('ex', PAL.silver),
  tera: r('crystal', 'erupt', PAL.white, 10, 0.18, { tints: RAINBOW }),
  'golpe-unico': badge('GOLPE ÚNICO', PAL.red),
  'golpe-fluido': badge('GOLPE FLUIDO', PAL.water),
  'golpe-fusao': badge('GOLPE FUSÃO', PAL.psychic),
  sombrio: r('wisp', 'rise', PAL.dark, 8, 0.24),
  luz: r('sparkle', 'spiral', PAL.gold, 9, 0.15),
  brilhante: r('sparkle', 'orbit', PAL.white, 7, 0.17, { tints: RAINBOW }),
  estrela: r('star', 'spiral', PAL.gold, 6, 0.2),
  delta: badge('δ DELTA', PAL.cyan),
  'treinador-dono': badge('TREINADOR', PAL.bronze),
  'equipe-vilao': badge('VILÃO', PAL.red),
  // Raridade e acabamento.
  comum: r('coin', 'pop', PAL.silver, 1, 0.2),
  incomum: r('coin', 'pop', PAL.bronze, 1, 0.22),
  rara: r('star', 'pop', PAL.gold, 1, 0.26),
  holo: r('sparkle', 'orbit', PAL.white, 8, 0.13, { tints: RAINBOW }),
  'dupla-rara': r('star', 'orbit', PAL.gold, 2, 0.2),
  'ultra-rara': r('burst', 'impact', PAL.gold, 1, 0.85),
  'full-art': r('rune', 'ring', PAL.white, 1, 1.1, { tints: RAINBOW }),
  ilustracao: r('slash', 'orbit', PAL.white, 5, 0.22, { tints: ['#ffb3c8', '#b3d9ff', '#d1ffb3', '#fff0b3', '#e0b3ff'] }),
  'ilustracao-especial': r('slash', 'spiral', PAL.white, 9, 0.24, { tints: RAINBOW }),
  'arco-iris': r('star', 'fall', PAL.white, 12, 0.14, { tints: RAINBOW }),
  dourada: r('coin', 'fall', PAL.gold, 12, 0.13),
  secreta: badge('SECRETA', PAL.dark),
  'shiny-carta': r('sparkle', 'rise', PAL.gold, 10, 0.15),
  amazing: r('burst', 'impact', PAL.white, 1, 0.9, { tints: RAINBOW }),
  'ace-spec': badge('ACE SPEC', PAL.psychic),
  // Coleção.
  promo: badge('PROMO', PAL.water),
  galeria: r('star', 'orbit', PAL.white, 6, 0.15, { tints: ['#ffd1ea', '#d1f0ff', '#fff4b8'] }),
  'classica-wotc': badge('CLÁSSICA', PAL.amber),
  regulacao: r('hex', 'pop', PAL.steel, 1, 0.22),
  // Tipos.
  ...TYPE_FX,
  monotipo: r('orb', 'pop', PAL.white, 1, 0.18),
  'dois-tipos': r('orb', 'orbit', PAL.white, 2, 0.16, { tints: ['#ff9a6b', '#6bb8ff'] }),
  // Categoria da espécie.
  inicial: r('star', 'spiral', PAL.white, 6, 0.16, { tints: STARTER_TINTS }),
  bebe: r('heart', 'rise', PAL.fairy, 7, 0.15),
  fossil: r('rock', 'erupt', PAL.amber, 7, 0.15),
  'pseudo-lendario': r('scale', 'orbit', PAL.dragon, 6, 0.2),
  lendario: r('rune', 'ring', PAL.gold, 1, 1.2),
  mitico: r('rune', 'ring', PAL.fairy, 1, 1.2),
  ultracriatura: r('rune', 'ring', PAL.violet, 1, 1.2),
  paradoxo: r('gear', 'orbit', PAL.white, 4, 0.22, { tints: PARADOX_TINTS }),
  'forma-regional': badge('REGIONAL', PAL.grass),
  // Estágio.
  basico: badge('BÁSICO', PAL.normal),
  'estagio-1': badge('ESTÁGIO 1', PAL.silver),
  'estagio-2': badge('ESTÁGIO 2', PAL.gold),
  final: r('star', 'pop', PAL.red, 1, 0.2),
  // Região de origem.
  ...Object.fromEntries(['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'].map((name) => [`regiao-${name.toLowerCase()}`, badge(name.toUpperCase(), PAL.bronze)])),
  // Estilo de luta.
  'atacante-fisico': r('slash', 'impact', PAL.red, 1, 0.75),
  'atacante-especial': r('orb', 'spiral', PAL.violet, 7, 0.15),
  muralha: r('hex', 'impact', PAL.steel, 1, 0.8),
  velocista: r('streak', 'streak', PAL.white, 7, 0.32),
  tanque: r('dust', 'erupt', PAL.ground, 8, 0.2),
  vidro: r('crystal', 'erupt', PAL.cyan, 9, 0.14),
  equilibrado: r('star', 'orbit', PAL.normal, 4, 0.14),
  'peso-pesado': r('dust', 'erupt', PAL.rock, 10, 0.26),
  // Especial.
  shiny: r('sparkle', 'spiral', PAL.gold, 12, 0.16),
  mega: r('burst', 'impact', PAL.violet, 1, 0.9),
  digital: r('hex', 'rise', PAL.cyan, 8, 0.13),
  'carta-fisica': r('rune', 'ring', PAL.white, 1, 0.9),
};

export function fxRecipe(id: string): FxRecipe | null {
  return ARCHETYPE_FX[id] ?? null;
}

/** Ordem das camadas: o que é mais raro e chamativo na carta vem primeiro. */
const GROUP_ORDER: readonly ArchetypeGroup[] = ['mecanica', 'raridade', 'especial', 'categoria', 'tipo', 'estilo', 'estagio', 'colecao', 'regiao'];

export const FX_STAGGER_MS = 420;
/** Duração de uma camada por movimento (selos e impactos são mais curtos que as chuvas de partículas). */
const MOTION_MS: Readonly<Record<FxMotion, number>> = {
  rise: 2000, fall: 2200, orbit: 2200, spiral: 2200, erupt: 1600, strike: 1300, impact: 1000, pop: 1500, ring: 2000, streak: 1200,
};
/** Mais que isso fica poluído: com muitos arquétipos, os menos marcantes (fim da ordem) ficam de fora. */
export const FX_MAX_LAYERS = 16;

export interface FxLayer {
  id: string;
  recipe: FxRecipe;
  startMs: number;
  durationMs: number;
  /** Andar acima da cabeça dos selos (`pop`) que tocam ao mesmo tempo, para não ficarem um em cima do outro; 0 nos demais. */
  lane: number;
}

/** Altura de um andar de selos, em alturas do Pokémon. */
export const FX_LANE_HEIGHT = 0.26;

/** Plano da animação de uma carta: as camadas em ordem, cada uma começando `staggerMs` depois da anterior. */
export function planArchetypeFx(ids: readonly string[], staggerMs = FX_STAGGER_MS, maxLayers = FX_MAX_LAYERS): FxLayer[] {
  const known = new Set(ids);
  const ordered = GROUP_ORDER.flatMap((group) => ARCHETYPES.filter((x) => x.group === group && known.has(x.id)));
  const laneEnds: number[] = [];
  return ordered
    .slice(0, Math.max(0, maxLayers))
    .map((x, i) => {
      const recipe = ARCHETYPE_FX[x.id]!;
      const startMs = i * staggerMs;
      const durationMs = MOTION_MS[recipe.motion];
      let lane = 0;
      if (recipe.motion === 'pop') {
        // O primeiro andar livre (cujo selo anterior já terminou).
        lane = laneEnds.findIndex((end) => end <= startMs);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = startMs + durationMs;
      }
      return { id: x.id, recipe, startMs, durationMs, lane };
    });
}

export function planDurationMs(plan: readonly FxLayer[]): number {
  return plan.reduce((end, l) => Math.max(end, l.startMs + l.durationMs), 0);
}

/** Progresso (0..1) da camada no instante `elapsedMs` do plano; null antes de começar ou depois de terminar. */
export function layerProgress(layer: FxLayer, elapsedMs: number): number | null {
  const t = (elapsedMs - layer.startMs) / layer.durationMs;
  return t < 0 || t > 1 ? null : t;
}

/** Nome com ícone, para a interface (ex.: «🔥 Fogo»). */
export function fxLabel(id: string): string {
  const x = archetype(id);
  return x ? `${x.icon} ${x.name}` : id;
}

// ---------------------------------------------------------------------------------------------- movimento

/**
 * Estado de uma partícula. `x`, `y`: no chão da carta, em raios em volta do Pokémon (1 = um pouco além da largura
 * dele). `z`: altura, em alturas do Pokémon. `scale`: multiplica `recipe.size`. `frame`: fase da folha de quadros
 * (0..1). `rot`: giro na tela (radianos).
 */
export interface FxParticle {
  x: number;
  y: number;
  z: number;
  scale: number;
  alpha: number;
  frame: number;
  rot: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
/** Pseudoaleatório fixo por partícula: a mesma carta anima sempre igual (nada é sorteado a cada quadro). */
export function fxHash(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
const GOLDEN = 2.39996323;
/** Sobe rápido, segura e some: envelope de opacidade das camadas. */
const envelope = (t: number, inEnd = 0.15, outStart = 0.75): number => Math.min(clamp01(t / inEnd), clamp01((1 - t) / (1 - outStart)));
/** Exagero elástico ao aparecer (pose de desenho animado). */
const backOut = (t: number): number => {
  const u = clamp01(t) - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
};
/** Progresso local de uma partícula que começa atrasada (`delay`) e vive `life` da camada. */
const local = (t: number, delay: number, life: number): number => (t - delay) / life;

const HIDDEN: FxParticle = { x: 0, y: 0, z: 0, scale: 0, alpha: 0, frame: 0, rot: 0 };

/** Posição da partícula `i` (de `n`) da camada no progresso `t` (0..1). Pura e determinística. */
export function particleAt(motion: FxMotion, i: number, n: number, t: number): FxParticle {
  const h1 = fxHash(i, 1);
  const h2 = fxHash(i, 2);
  const h3 = fxHash(i, 3);
  const angle0 = i * GOLDEN + h1 * 0.6;
  switch (motion) {
    case 'rise': {
      const u = local(t, h1 * 0.35, 0.65);
      if (u < 0 || u > 1) return HIDDEN;
      const radius = 0.45 + h2 * 0.55;
      const wobble = Math.sin(u * Math.PI * 3 + i) * 0.08;
      return { x: Math.cos(angle0) * radius + wobble, y: Math.sin(angle0) * radius, z: u * (0.9 + h3 * 0.4), scale: 0.6 + 0.4 * Math.sin(Math.PI * u), alpha: Math.sin(Math.PI * u), frame: u, rot: wobble };
    }
    case 'fall': {
      const u = local(t, h1 * 0.4, 0.6);
      if (u < 0 || u > 1) return HIDDEN;
      const radius = 0.2 + h2 * 0.9;
      const sway = Math.sin(u * Math.PI * 2 + i * 1.7) * 0.18;
      return { x: Math.cos(angle0) * radius + sway, y: Math.sin(angle0) * radius, z: 1.35 - u * 1.35, scale: 1, alpha: envelope(u, 0.15, 0.8), frame: (u * 3 + h3) % 1, rot: sway * 2 };
    }
    case 'orbit': {
      const angle = (i / Math.max(1, n)) * Math.PI * 2 + t * Math.PI * 2.4;
      const radius = 0.8 + Math.sin(t * Math.PI * 2 + i) * 0.06;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0.45 + Math.sin(angle * 2) * 0.12, scale: backOut(t * 5), alpha: envelope(t), frame: (t * 4 + i / Math.max(1, n)) % 1, rot: 0 };
    }
    case 'spiral': {
      const u = local(t, (i / Math.max(1, n)) * 0.3, 0.7);
      if (u < 0 || u > 1) return HIDDEN;
      const angle = angle0 + u * Math.PI * 3;
      const radius = 0.9 - u * 0.45;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: u * 1.25, scale: 0.7 + 0.5 * Math.sin(Math.PI * u), alpha: Math.sin(Math.PI * u), frame: (u * 2) % 1, rot: angle * 0.5 };
    }
    case 'erupt': {
      const u = local(t, h1 * 0.25, 0.75);
      if (u < 0 || u > 1) return HIDDEN;
      const radius = 0.15 + u * (0.7 + h2 * 0.5);
      const peak = 0.55 + h3 * 0.55;
      return { x: Math.cos(angle0) * radius, y: Math.sin(angle0) * radius, z: 4 * peak * u * (1 - u), scale: 1 - 0.3 * u, alpha: 1 - u * u * u, frame: u, rot: u * (h2 - 0.5) * 8 };
    }
    case 'strike': {
      const u = local(t, (i / Math.max(1, n)) * 0.55, 0.45);
      if (u < 0 || u > 1) return HIDDEN;
      const travel = clamp01(u / 0.3);
      const spread = (h2 - 0.5) * 0.8;
      return { x: spread, y: (h3 - 0.5) * 0.4, z: 1.7 - travel * 1.2, scale: 1, alpha: travel < 1 ? 1 : 1 - clamp01((u - 0.3) / 0.7), frame: u, rot: spread * 0.4 };
    }
    case 'impact':
      return { x: 0, y: 0, z: 0.5, scale: backOut(t * 3.5) * (1 + t * 0.15), alpha: envelope(t, 0.06, 0.6), frame: t, rot: (h1 - 0.5) * 0.6 };
    case 'pop': {
      // Vários num arco acima da cabeça; um só fica no centro.
      const x = n > 1 ? ((i / (n - 1)) - 0.5) * 0.9 : 0;
      const hop = Math.sin(Math.PI * clamp01(t / 0.25)) * 0.1;
      return { x, y: 0, z: 1.12 + hop, scale: backOut(t * 4) * (t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1), alpha: envelope(t, 0.05, 0.8), frame: (t * 3) % 1, rot: 0 };
    }
    case 'ring':
      return { x: 0, y: 0, z: 0, scale: 0.35 + 0.75 * (1 - (1 - t) * (1 - t)), alpha: envelope(t, 0.12, 0.65), frame: t, rot: t * Math.PI * 0.8 };
    case 'streak': {
      const u = local(t, h1 * 0.5, 0.45);
      if (u < 0 || u > 1) return HIDDEN;
      const dir = i % 2 ? 1 : -1;
      return { x: dir * (1.3 - u * 2.6), y: (h2 - 0.5) * 0.6, z: 0.15 + h3 * 0.8, scale: 1, alpha: Math.sin(Math.PI * u), frame: u, rot: 0 };
    }
  }
}
