import type { PokemonType } from './pokemon-data';

/**
 * Desenho das 8 insígnias da Liga: cada uma é um broche de metal esmaltado com forma, metal e esmalte próprios,
 * ligados ao líder e ao tipo do Ginásio. Tudo é geometria gerada aqui (pontos num quadrado de -1 a 1, y para cima),
 * e a mesma descrição vira SVG na interface (`BadgeIcon.vue`) e peça em relevo na maleta 3D (`src/box/badge-case.ts`).
 */

export type Point = readonly [number, number];

/** Acabamento de uma camada: o metal da insígnia, três tons de esmalte, um traço escuro ou um reflexo claro. */
export type Finish = 'metal' | 'enamel' | 'enamel2' | 'enamel3' | 'dark' | 'shine';

export interface BadgeLayer {
  points: readonly Point[];
  fill: Finish;
  /** Linha aberta (nervura, contorno de vitral) em vez de área preenchida; a espessura vai em unidades do desenho. */
  line?: number;
}

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
  /** Mesma ordem do Ginásio (`GYMS[order]`). */
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
  /** Contorno externo, fechado, sentido anti-horário. É o que ganha relevo na maleta. */
  outline: readonly Point[];
  /** Camadas desenhadas sobre o metal, de baixo para cima. */
  layers: readonly BadgeLayer[];
}

const TAU = Math.PI * 2;
const deg = (d: number): number => (d * Math.PI) / 180;
const round = (n: number): number => Math.round(n * 1000) / 1000;
const pt = (x: number, y: number): Point => [round(x), round(y)];
const polar = (r: number, a: number, cx = 0, cy = 0): Point => pt(cx + r * Math.cos(a), cy + r * Math.sin(a));

/** Círculo (ou arco, de `from` a `to` em radianos) com `n` pontos. */
export function arc(r: number, cx = 0, cy = 0, n = 32, from = 0, to = TAU): Point[] {
  const closed = Math.abs(to - from - TAU) < 1e-9;
  const steps = closed ? n : n - 1;
  return Array.from({ length: n }, (_, i) => polar(r, from + ((to - from) * i) / steps, cx, cy));
}

/** Pontos em volta do centro com o raio dado por `radius(ângulo, i)`. */
function radial(n: number, radius: (a: number, i: number) => number, rot = 0): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (TAU * i) / n;
    return polar(radius(a, i), a);
  });
}

function transform(points: readonly Point[], s: number, dx = 0, dy = 0, rot = 0): Point[] {
  const c = Math.cos(rot);
  const si = Math.sin(rot);
  return points.map(([x, y]) => pt((x * c - y * si) * s + dx, (x * si + y * c) * s + dy));
}

// 0 · Roark (pedra): bloco de carvão lapidado em ferro escuro, facetas de esmalte cinza.
function coal(): Pick<BadgeDesign, 'outline' | 'layers'> {
  const radii = [0.95, 0.82, 0.93, 0.85, 0.97, 0.8, 0.9, 0.84];
  const outline = radial(8, (_, i) => radii[i] ?? 0.9, deg(22.5));
  const inner = transform(outline, 0.76);
  const center = pt(0.08, 0.1);
  const shades: Finish[] = ['enamel', 'enamel2', 'enamel3', 'enamel2', 'enamel', 'enamel3', 'enamel2', 'enamel3'];
  const facets: BadgeLayer[] = inner.map((p, i) => ({ points: [center, p, inner[(i + 1) % inner.length]!], fill: shades[i] ?? 'enamel' }));
  return { outline, layers: [...facets, { points: [pt(-0.3, 0.42), pt(-0.08, 0.6), pt(0.02, 0.44)], fill: 'shine' }] };
}

// 1 · Gardenia (grama): trevo de três folhas em bronze, esmalte verde com nervuras.
function clover(): Pick<BadgeDesign, 'outline' | 'layers'> {
  const lobe = (base: number, amp: number) => (a: number) => base + amp * Math.abs(Math.cos(1.5 * (a - Math.PI / 2))) ** 0.8;
  const outline = radial(96, lobe(0.42, 0.56));
  const leaves = radial(96, lobe(0.3, 0.52));
  const veins: BadgeLayer[] = [90, 210, 330].map((d) => ({ points: [pt(0, 0), polar(0.68, deg(d))], fill: 'dark', line: 0.05 }));
  const side: BadgeLayer[] = [90, 210, 330].flatMap((d) => [-1, 1].map((s) => ({ points: [polar(0.36, deg(d)), polar(0.56, deg(d + s * 24))], fill: 'enamel2' as Finish, line: 0.035 })));
  return { outline, layers: [{ points: leaves, fill: 'enamel' }, ...side, ...veins, { points: arc(0.13, 0, 0, 20), fill: 'metal' }, { points: arc(0.07, -0.18, 0.5, 12), fill: 'shine' }] };
}

// 2 · Maylene (lutador): punho fechado em cobre, dedos de esmalte vermelho.
function fist(): Pick<BadgeDesign, 'outline' | 'layers'> {
  const knuckles = (r: number, y: number, x0: number, w: number): Point[] =>
    Array.from({ length: 4 }, (_, k) => arc(r, x0 - w * k - w / 2, y, 9, 0, Math.PI)).flat();
  const outline: Point[] = [pt(-0.72, -0.72), pt(0.72, -0.72), pt(0.86, -0.3), pt(0.82, 0.24), ...knuckles(0.205, 0.26, 0.82, 0.41), pt(-0.86, -0.1)];
  const fingers: BadgeLayer[] = Array.from({ length: 4 }, (_, k) => {
    const cx = 0.82 - 0.41 * k - 0.205;
    return { points: [pt(cx - 0.15, -0.02), pt(cx + 0.15, -0.02), ...arc(0.15, cx, 0.26, 9, 0, Math.PI)], fill: k % 2 ? 'enamel3' : 'enamel' };
  });
  const thumb: Point[] = [pt(-0.66, -0.08), pt(0.3, -0.12), pt(0.44, -0.26), pt(0.3, -0.38), pt(-0.5, -0.36)];
  const palm: Point[] = [pt(-0.6, -0.6), pt(0.62, -0.6), pt(0.7, -0.3), pt(-0.62, -0.26)];
  return { outline, layers: [{ points: palm, fill: 'enamel2' }, ...fingers, { points: thumb, fill: 'enamel' }, { points: [pt(-0.6, -0.22), pt(0.32, -0.25)], fill: 'shine', line: 0.04 }] };
}

// 3 · Crasher Wake (água): gota de prata com esmalte azul e uma onda.
function drop(): Pick<BadgeDesign, 'outline' | 'layers'> {
  const shape = (tipY: number, cy: number, r: number, n: number): Point[] => {
    const span = Math.acos(r / (tipY - cy));
    const from = Math.PI / 2 + span;
    const to = Math.PI / 2 - span + TAU;
    return [pt(0, tipY), ...arc(r, 0, cy, n, from, to)];
  };
  const outline = shape(0.98, -0.3, 0.64, 40);
  const inner = shape(0.74, -0.27, 0.49, 36);
  const wave: Point[] = [
    ...Array.from({ length: 13 }, (_, i) => {
      const x = -0.46 + (0.92 * i) / 12;
      return pt(x, -0.2 + 0.06 * Math.sin((x + 0.46) * 9));
    }).reverse(),
    ...arc(0.47, 0, -0.27, 20, deg(188), deg(352)),
  ];
  return { outline, layers: [{ points: inner, fill: 'enamel' }, { points: wave, fill: 'enamel2' }, { points: transform(arc(0.09, 0, 0, 14), 1, -0.16, 0.18), fill: 'shine' }, { points: [pt(-0.4, -0.08), pt(-0.2, -0.02), pt(0, -0.1), pt(0.2, -0.04)], fill: 'enamel3', line: 0.04 }] };
}

// 4 · Fantina (fantasma): losango de vitral roxo numa moldura de ouro.
function reliquary(): Pick<BadgeDesign, 'outline' | 'layers'> {
  const outline: Point[] = [pt(0, -1), pt(0.24, -0.34), pt(0.74, 0), pt(0.24, 0.34), pt(0, 1), pt(-0.24, 0.34), pt(-0.74, 0), pt(-0.24, -0.34)];
  const top = pt(0, 0.8);
  const right = pt(0.56, 0);
  const bottom = pt(0, -0.8);
  const left = pt(-0.56, 0);
  const o = pt(0, 0);
  const panes: BadgeLayer[] = [
    { points: [o, right, top], fill: 'enamel3' },
    { points: [o, top, left], fill: 'enamel' },
    { points: [o, left, bottom], fill: 'enamel2' },
    { points: [o, bottom, right], fill: 'enamel' },
  ];
  const leads: BadgeLayer[] = [
    { points: [top, bottom], fill: 'metal', line: 0.06 },
    { points: [left, right], fill: 'metal', line: 0.06 },
  ];
  return { outline, layers: [...panes, ...leads, { points: arc(0.16, 0, 0, 20), fill: 'metal' }, { points: arc(0.09, 0, 0, 16), fill: 'enamel2' }, { points: [pt(-0.12, 0.5), pt(-0.04, 0.62)], fill: 'shine', line: 0.05 }] };
}

// 5 · Byron (aço): engrenagem de aço escovado com um escudo no meio.
function gear(): Pick<BadgeDesign, 'outline' | 'layers'> {
  const outline: Point[] = Array.from({ length: 10 }, (_, i) => {
    const c = deg(90 + i * 36);
    return [polar(0.8, c - deg(13)), polar(0.98, c - deg(8)), polar(0.98, c + deg(8)), polar(0.8, c + deg(13))];
  }).flat();
  const shield: Point[] = [pt(-0.42, 0.46), pt(0.42, 0.46), pt(0.42, 0.02), ...arc(0.42, 0, 0.02, 14, deg(0), deg(-90)).slice(1).map(([x, y]) => pt(x, y * 1.35)), ...arc(0.42, 0, 0.02, 14, deg(-90), deg(-180)).slice(1).map(([x, y]) => pt(x, y * 1.35))];
  return { outline, layers: [{ points: arc(0.68, 0, 0, 40), fill: 'enamel3' }, { points: shield, fill: 'enamel' }, { points: [pt(0, 0.46), pt(0, -0.53)], fill: 'enamel2', line: 0.06 }, { points: arc(0.12, 0, 0.06, 16), fill: 'metal' }, { points: arc(0.12, 0, 0.06, 16), fill: 'dark', line: 0.03 }, { points: [pt(-0.32, 0.38), pt(-0.12, 0.38)], fill: 'shine', line: 0.04 }] };
}

// 6 · Candice (gelo): floco de neve de cristal translúcido com filete de prata.
function snowflake(): Pick<BadgeDesign, 'outline' | 'layers'> {
  const arm: Point[] = [pt(0.32, -0.09), pt(0.55, -0.09), pt(0.68, -0.27), pt(0.77, -0.21), pt(0.66, -0.07), pt(0.9, -0.06), pt(0.98, 0), pt(0.9, 0.06), pt(0.66, 0.07), pt(0.77, 0.21), pt(0.68, 0.27), pt(0.55, 0.09), pt(0.32, 0.09)];
  const outline = Array.from({ length: 6 }, (_, i) => transform(arm, 1, 0, 0, deg(90 + i * 60))).flat();
  const spines: BadgeLayer[] = Array.from({ length: 6 }, (_, i) => ({ points: [pt(0, 0), polar(0.84, deg(90 + i * 60))], fill: 'enamel3' as Finish, line: 0.04 }));
  return { outline, layers: [{ points: radial(6, () => 0.36, deg(90)), fill: 'enamel' }, ...spines, { points: radial(6, () => 0.17, deg(90)), fill: 'enamel2' }, { points: arc(0.06, -0.06, 0.58, 10), fill: 'shine' }] };
}

// 7 · Volkner (elétrico): sol de ouro com doze raios, esmalte amarelo e um raio no centro.
function sun(): Pick<BadgeDesign, 'outline' | 'layers'> {
  const outline = radial(24, (_, i) => (i % 2 ? 0.7 : 0.98), deg(90));
  const bolt: Point[] = [pt(0.1, 0.4), pt(-0.2, -0.02), pt(-0.02, -0.02), pt(-0.12, -0.4), pt(0.2, 0.06), pt(0.02, 0.06)];
  return { outline, layers: [{ points: arc(0.6, 0, 0, 40), fill: 'enamel2' }, { points: arc(0.5, 0, 0, 40), fill: 'enamel' }, { points: bolt, fill: 'metal' }, { points: bolt, fill: 'dark', line: 0.025 }, { points: arc(0.08, -0.26, 0.26, 12), fill: 'shine' }] };
}

export const BADGE_DESIGNS: readonly BadgeDesign[] = [
  { order: 0, name: 'Insígnia Carvão', leader: 'Roark', type: 'rock', motif: 'bloco de carvão lapidado', metal: { name: 'ferro escuro', base: '#5a5c62', light: '#a3a6ad', dark: '#26272b', metalness: 0.85, roughness: 0.55 }, enamel: ['#8a8070', '#625b50', '#aea493'], ...coal() },
  { order: 1, name: 'Insígnia Floresta', leader: 'Gardenia', type: 'grass', motif: 'trevo de três folhas', metal: { name: 'bronze', base: '#b07a3e', light: '#e8bd82', dark: '#64401c', metalness: 0.9, roughness: 0.45 }, enamel: ['#3f9d4a', '#2a7334', '#74c77b'], ...clover() },
  { order: 2, name: 'Insígnia Punho', leader: 'Maylene', type: 'fighting', motif: 'punho fechado', metal: { name: 'cobre', base: '#c46a3c', light: '#f3ab80', dark: '#73361a', metalness: 0.9, roughness: 0.45 }, enamel: ['#c0392b', '#8c271d', '#e45c4d'], ...fist() },
  { order: 3, name: 'Insígnia Pântano', leader: 'Crasher Wake', type: 'water', motif: 'gota com uma onda', metal: { name: 'prata', base: '#c3ccd5', light: '#f5f8fb', dark: '#76818d', metalness: 0.95, roughness: 0.35 }, enamel: ['#2f7fd8', '#1b56a3', '#8ac8f7'], ...drop() },
  { order: 4, name: 'Insígnia Relíquia', leader: 'Fantina', type: 'ghost', motif: 'vitral roxo em losango', metal: { name: 'ouro velho', base: '#c49a3a', light: '#f3d98a', dark: '#765915', metalness: 0.95, roughness: 0.4 }, enamel: ['#7e57c2', '#55369a', '#b9a2e0'], ...reliquary() },
  { order: 5, name: 'Insígnia Mina', leader: 'Byron', type: 'steel', motif: 'engrenagem com escudo', metal: { name: 'aço escovado', base: '#98a4ae', light: '#e2e8ee', dark: '#505a63', metalness: 1, roughness: 0.5 }, enamel: ['#6c7883', '#4a545d', '#bcc6cf'], ...gear() },
  { order: 6, name: 'Insígnia Pingente', leader: 'Candice', type: 'ice', motif: 'floco de neve de cristal', metal: { name: 'cristal com prata', base: '#bfe7f0', light: '#ffffff', dark: '#5f9fb0', metalness: 0.25, roughness: 0.2 }, enamel: ['#80deea', '#47aebf', '#e3f8fb'], translucent: true, ...snowflake() },
  { order: 7, name: 'Insígnia Farol', leader: 'Volkner', type: 'electric', motif: 'sol de doze raios com um raio', metal: { name: 'ouro', base: '#dcaa38', light: '#fff0a6', dark: '#87600c', metalness: 1, roughness: 0.38 }, enamel: ['#ffcb05', '#f08c12', '#fff3b0'], ...sun() },
];

export function badgeDesign(order: number): BadgeDesign | null {
  return BADGE_DESIGNS[order] ?? null;
}

/** `d` de um `<path>` SVG (o SVG tem y para baixo, então o desenho é espelhado). */
export function pathData(points: readonly Point[], closed = true): string {
  if (points.length === 0) return '';
  const body = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)} ${round(-y)}`).join(' ');
  return closed ? `${body} Z` : body;
}

/** Área com sinal (positiva no sentido anti-horário, com y para cima). */
export function signedArea(points: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Contorno no sentido anti-horário (o que o Three.js espera para a face da frente). */
export function counterClockwise(points: readonly Point[]): Point[] {
  return signedArea(points) < 0 ? [...points].reverse() : [...points];
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
  const row = Math.floor(order / 4);
  return { x: round(-0.75 + col * 0.5), y: round(row === 0 ? 0.42 : -0.42) };
}
