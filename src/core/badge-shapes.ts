import {
  arc, band, centroid, deg, drop, ellipse, heart, hull, inset, lens, poly, polar, pt, radial, rect, rhombus, shrink, spiral, star, transform,
} from './badge-geometry';
import type { BadgeLayer, Fill, Point } from './badge-geometry';

/**
 * As 48 insígnias (Gerações I a VI) desenhadas como broches de metal esmaltado, no formato e nas cores das insígnias
 * dos jogos. Cada função devolve o contorno (a peça de metal, que ganha relevo na maleta 3D) e as camadas de esmalte
 * por cima, de baixo para cima.
 */

export interface BadgeShape {
  outline: readonly Point[];
  layers: readonly BadgeLayer[];
}

const L = (points: readonly Point[], fill: Fill, line?: number): BadgeLayer => (line === undefined ? { points, fill } : { points, fill, line });
const shine = (cx: number, cy: number, rx: number, ry: number, rot = deg(35)): BadgeLayer => L(ellipse(rx, ry, cx, cy, 20, rot), 'shine');
const mirrorX = (points: readonly Point[]): Point[] => points.map(([x, y]) => pt(-x, y));
/** Contorno simétrico a partir da metade direita, de cima para baixo (os pontos no eixo ficam uma vez só). */
const symmetric = (right: readonly Point[]): Point[] => [...right, ...mirrorX(right.slice(1, -1)).reverse()];
const spin = (layers: readonly BadgeLayer[], rot: number): BadgeLayer[] => layers.map((l) => ({ ...l, points: transform(l.points, 1, 0, 0, rot) }));

/** Tom da faceta pela direção: a luz vem de cima, à esquerda. */
function shade(angle: number): Fill {
  const c = Math.cos(angle - deg(135));
  return c > 0.35 ? 'enamel3' : c < -0.35 ? 'enamel2' : 'enamel';
}

/** Facetas de gema entre um contorno e a "mesa" de dentro (mesmo número de vértices, na mesma ordem). */
function facets(outer: readonly Point[], inner: readonly Point[]): BadgeLayer[] {
  const [cx, cy] = centroid(outer);
  return outer.map((p, i) => {
    const j = (i + 1) % outer.length;
    const q = outer[j]!;
    return L([p, q, inner[j]!, inner[i]!], shade(Math.atan2((p[1] + q[1]) / 2 - cy, (p[0] + q[0]) / 2 - cx)));
  });
}

/** Esmalte abaulado: base mais escura e um degrau mais claro puxado para a luz. */
function dome(outline: readonly Point[], rim = 0.08, k = 0.8): BadgeLayer[] {
  const base = inset(outline, rim);
  return [L(base, 'enamel2'), L(shrink(base, k, -0.04, 0.05), 'enamel')];
}

// ───────────────────────── Kanto (I) ─────────────────────────

/** Rocha: octógono cinza lapidado como pedra preciosa. */
export function boulder(): BadgeShape {
  const outline = radial(8, () => 0.95, deg(22.5));
  const rim = inset(outline, 0.09);
  const table = radial(8, () => 0.46, deg(22.5));
  return {
    outline,
    layers: [...facets(rim, table), L(table, 'enamel'), L(shrink(table, 0.55, -0.05, 0.05), 'enamel3'), ...rim.map((p, i) => L([p, table[i]!], 'dark', 0.018)), shine(-0.34, 0.44, 0.16, 0.06)],
  };
}

/** Cascata: gota d'água azul. */
export function cascade(): BadgeShape {
  const outline = drop(0.98, -0.3, 0.64);
  return {
    outline,
    layers: [...dome(outline, 0.08, 0.78), L(poly(-0.38, -0.32, -0.18, -0.22, 0, -0.32, 0.2, -0.24, 0.38, -0.34), 'enamel3', 0.045), shine(-0.18, 0.18, 0.08, 0.18, deg(-20))],
  };
}

/** Trovão: estrela laranja de oito pontas com miolo amarelo. */
export function thunder(): BadgeShape {
  const outline = star(8, 0.97, 0.76);
  return {
    outline,
    layers: [
      L(inset(outline, 0.08), 'enamel'), L(star(8, 0.66, 0.54), 'enamel2'), L(arc(0.47, 0, 0, 40), 'enamel3'),
      L(star(8, 0.32, 0.22, deg(112.5)), 'enamel'), L(arc(0.1, 0, 0, 16), 'metal'), shine(-0.3, 0.32, 0.14, 0.06),
    ],
  };
}

const RAINBOW: readonly Fill[] = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#5e35b1', '#d81b60'];

/** Arco-íris: flor de oito pétalas, cada uma de uma cor. */
export function rainbow(): BadgeShape {
  const petals = Array.from({ length: 8 }, (_, i) => polar(0.58, deg(90 + i * 45)));
  const outline = hull(petals.map(([x, y]) => arc(0.37, x, y, 24)), 160);
  return {
    outline,
    layers: [
      ...petals.map(([x, y], i) => L(arc(0.28, x, y, 24), RAINBOW[i]!)),
      ...petals.map(([x, y]) => L(ellipse(0.1, 0.05, x - 0.08, y + 0.1, 12, deg(30)), 'shine')),
      L(arc(0.32, 0, 0, 32), 'metal'), L(arc(0.25, 0, 0, 28), 'enamel'), L(arc(0.11, -0.05, 0.05, 16), 'enamel3'),
    ],
  };
}

/** Alma: coração rosa. */
export function soul(): BadgeShape {
  const outline = heart(1.9);
  return { outline, layers: [...dome(outline, 0.08, 0.78), shine(-0.42, 0.42, 0.15, 0.08, deg(30))] };
}

/** Pântano: círculos concêntricos dourados. */
export function marsh(): BadgeShape {
  return {
    outline: arc(0.96, 0, 0, 64),
    layers: [
      L(arc(0.86, 0, 0, 56), 'enamel'), L(arc(0.66, 0, 0, 48), 'enamel2'), L(arc(0.56, 0, 0, 48), 'enamel'),
      L(arc(0.34, 0, 0, 40), 'enamel2'), L(arc(0.24, 0, 0, 32), 'enamel3'), shine(-0.45, 0.5, 0.18, 0.07, deg(40)),
    ],
  };
}

/** Vulcão: chama vermelha de três línguas. */
export function volcano(): BadgeShape {
  const outline = hull([arc(0.6, 0, -0.32, 40), poly(-0.5, -0.05, -0.6, 0.72, -0.12, 0.22), poly(-0.28, 0.1, 0.04, 0.97, 0.3, 0.12), poly(0.12, 0.08, 0.62, 0.66, 0.55, -0.12)], 160, [0, -0.15]);
  const inner = inset(outline, 0.08);
  return { outline, layers: [L(inner, 'enamel'), L(shrink(inner, 0.62, 0, -0.14), 'enamel3'), L(ellipse(0.2, 0.26, 0, -0.4, 24), '#ffd54f'), shine(-0.36, 0, 0.1, 0.18, deg(-10))] };
}

/** Terra: ramo de folhas verdes. */
export function earth(): BadgeShape {
  const leaves: readonly (readonly [number, number, number])[] = [[0.05, 0.12, 0.42], [0.42, 0.42, 0.36], [-0.32, 0.44, 0.3], [0.44, -0.18, 0.3], [0.64, 0.7, 0.2]];
  const stem = band([pt(-0.8, -0.85), pt(-0.1, -0.1)], 0.1);
  const outline = hull([...leaves.map(([x, y, r]) => arc(r, x, y, 28)), stem], 180, [0.05, 0.05]);
  return {
    outline,
    layers: [
      L(inset(outline, 0.08), 'enamel2'),
      ...leaves.map(([x, y, r]) => L(arc(r - 0.12, x - 0.03, y + 0.03, 24), 'enamel')),
      L([pt(-0.72, -0.77), pt(0.05, 0.12), pt(0.42, 0.42), pt(0.62, 0.68)], 'enamel3', 0.045),
      L([pt(0.05, 0.12), pt(-0.3, 0.42)], 'enamel3', 0.035), L([pt(0.05, 0.12), pt(0.42, -0.16)], 'enamel3', 0.035),
      shine(-0.3, 0.46, 0.1, 0.05),
    ],
  };
}

// ───────────────────────── Johto (II) ─────────────────────────

/** Zéfiro: bloco cinza de asas dobradas, com as penas em sulcos. */
export function zephyr(): BadgeShape {
  const outline = radial(6, () => 0.94, deg(90));
  const inner = inset(outline, 0.08);
  const [top, ul, ll, bottom, lr, ur] = inner as [Point, Point, Point, Point, Point, Point];
  const c = pt(0, 0);
  const R = top[1];
  const w = Math.abs(ul[0]);
  const grooves = [0.33, 0.66].flatMap((f) => {
    const x = w * f;
    return [L([pt(-x, 0.577 * x - 0.06), pt(-x, -R + 0.577 * x + 0.06)], 'dark', 0.03), L([pt(x, 0.577 * x - 0.06), pt(x, -R + 0.577 * x + 0.06)], 'dark', 0.03)];
  });
  return {
    outline,
    layers: [
      L([top, ul, c, ur], 'enamel3'), L([ul, ll, bottom, c], 'enamel'), L([c, bottom, lr, ur], 'enamel2'),
      ...grooves, L([ul, c, ur], 'metal', 0.03), L([c, bottom], 'metal', 0.03), shine(-0.2, 0.56, 0.16, 0.05, deg(25)),
    ],
  };
}

const INK: Fill = '#1d1d22';

/** Colmeia: joaninha vermelha de pintas pretas. */
export function hive(): BadgeShape {
  const outline = hull([arc(0.84, 0, -0.1, 48), arc(0.32, 0, 0.62, 24)], 160);
  const spots: readonly (readonly [number, number, number])[] = [[-0.4, 0.1, 0.14], [0.4, 0.1, 0.14], [-0.33, -0.42, 0.13], [0.33, -0.42, 0.13]];
  return {
    outline,
    layers: [
      L(inset(outline, 0.08), 'enamel'), L(arc(0.25, 0, 0.62, 24), INK), L([pt(0, 0.42), pt(0, -0.86)], INK, 0.05),
      ...spots.map(([x, y, r]) => L(arc(r, x, y, 20), INK)),
      L(arc(0.05, -0.1, 0.67, 10), 'shine'), L(arc(0.05, 0.1, 0.67, 10), 'shine'), shine(-0.48, 0.38, 0.14, 0.06),
    ],
  };
}

/** Planície: losango amarelo lapidado. */
export function plain(): BadgeShape {
  const outline = poly(0, 0.97, -0.76, 0, 0, -0.97, 0.76, 0);
  const rim = inset(outline, 0.09);
  const table = shrink(rim, 0.45);
  return { outline, layers: [...facets(rim, table), L(table, 'enamel'), ...rim.map((p, i) => L([p, table[i]!], 'enamel2', 0.02)), shine(-0.2, 0.46, 0.14, 0.05, deg(50))] };
}

/** Névoa: círculo azul com um fantasminha. */
export function fog(): BadgeShape {
  const ghost = [...arc(0.4, 0, 0.02, 20, 0, Math.PI), ...poly(-0.4, -0.32, -0.27, -0.2, -0.13, -0.32, 0, -0.2, 0.13, -0.32, 0.27, -0.2, 0.4, -0.32)];
  return {
    outline: arc(0.95, 0, 0, 56),
    layers: [
      L(arc(0.86, 0, 0, 56), 'enamel2'), L(arc(0.75, 0, 0, 24, deg(200), deg(250)), 'enamel', 0.035), L(arc(0.75, 0, 0, 24, deg(20), deg(70)), 'enamel', 0.035),
      L(arc(0.64, 0, 0, 48), 'enamel'), L(ghost, 'enamel3'), L(ellipse(0.055, 0.1, -0.14, 0.08, 12), 'enamel2'), L(ellipse(0.055, 0.1, 0.14, 0.08, 12), 'enamel2'),
      shine(-0.42, 0.5, 0.16, 0.06),
    ],
  };
}

/** Tempestade: punho cerrado marrom. */
export function storm(): BadgeShape {
  const xs = [-0.48, -0.16, 0.16, 0.48];
  const outline = hull([...xs.map((x) => arc(0.21, x, 0.36, 20)), arc(0.47, -0.33, -0.22, 32), arc(0.47, 0.33, -0.22, 32), rect(-0.66, -0.2, 0.66, 0.38)], 160);
  return {
    outline,
    layers: [
      L(inset(outline, 0.08), 'enamel'), ...xs.map((x) => L(arc(0.12, x - 0.02, 0.39, 16), 'enamel3')),
      ...[-0.32, 0, 0.32].map((x) => L([pt(x, 0.3), pt(x, 0.02)], 'enamel2', 0.04)),
      L([pt(-0.66, -0.08), pt(-0.3, -0.16), pt(0.1, -0.12), pt(0.32, -0.02)], 'enamel2', 0.05), shine(-0.5, -0.3, 0.14, 0.06, deg(-30)),
    ],
  };
}

/** Mineral: octógono prateado alongado, lapidado. */
export function mineral(): BadgeShape {
  const outline = poly(-0.34, 0.95, -0.72, 0.55, -0.72, -0.55, -0.34, -0.95, 0.34, -0.95, 0.72, -0.55, 0.72, 0.55, 0.34, 0.95);
  const rim = inset(outline, 0.08);
  const table = shrink(rim, 0.5);
  return { outline, layers: [...facets(rim, table), L(table, 'enamel'), L(shrink(table, 0.5, -0.05, 0.08), 'enamel3'), shine(-0.36, 0.5, 0.14, 0.05, deg(60))] };
}

/** Geleira: hexágono de gelo com facetas em estrela. */
export function glacier(): BadgeShape {
  const outline = radial(6, () => 0.93, 0);
  const rim = inset(outline, 0.08);
  const center = radial(6, () => 0.38, 0);
  return {
    outline,
    layers: [...facets(rim, center), L(center, 'enamel3'), ...center.map((p) => L([pt(0, 0), p], 'enamel2', 0.03)), L(radial(6, () => 0.16, deg(30)), 'enamel'), shine(-0.4, 0.42, 0.16, 0.05)],
  };
}

/** Ascendente: cabeça de dragão negra com chifres e olhos vermelhos. */
export function rising(): BadgeShape {
  const outline = symmetric(poly(0, 0.5, 0.16, 0.58, 0.42, 0.96, 0.4, 0.55, 0.6, 0.44, 0.88, 0.62, 0.74, 0.22, 0.62, -0.1, 0.46, -0.46, 0.22, -0.8, 0, -0.94));
  const both = (points: Point[], fill: Fill, line?: number): BadgeLayer[] => [L(points, fill, line), L(mirrorX(points), fill, line)];
  const red: Fill = '#d32f2f';
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel'), ...both(poly(0.2, 0.6, 0.38, 0.86, 0.36, 0.58), red), ...both(poly(0.62, 0.46, 0.8, 0.56, 0.7, 0.3), red),
      ...both(poly(0.1, 0.12, 0.44, 0.24, 0.38, 0.02), '#ff3b30'), ...both([pt(0.08, 0.22), pt(0.46, 0.34)], 'metal', 0.035),
      L(poly(-0.2, -0.5, 0.2, -0.5, 0.12, -0.75, -0.12, -0.75), 'enamel2'), L(arc(0.04, -0.08, -0.58, 8), red), L(arc(0.04, 0.08, -0.58, 8), red),
      shine(-0.3, -0.1, 0.1, 0.05, deg(60)),
    ],
  };
}

// ───────────────────────── Hoenn (III) ─────────────────────────

/** Pedra: duas pontas de flecha, laranja em cima e marrom embaixo. */
export function stone(): BadgeShape {
  const raw = poly(-0.95, 0, -0.36, 0.56, -0.36, 0.26, 0.36, 0.26, 0.36, 0.56, 0.95, 0, 0.36, -0.56, 0.36, -0.26, -0.36, -0.26, -0.36, -0.56);
  const upper = poly(-0.84, 0.02, -0.4, 0.44, -0.4, 0.19, 0.4, 0.19, 0.4, 0.44, 0.84, 0.02);
  const rot = deg(30);
  return {
    outline: transform(raw, 1, 0, 0, rot),
    layers: spin([L(inset(raw, 0.07), 'enamel2'), L(upper, 'enamel'), L([pt(-0.8, 0), pt(0.8, 0)], 'enamel3', 0.04), shine(-0.45, 0.24, 0.14, 0.05, 0)], rot),
  };
}

/** Punho: luva azul redonda com punho de faixas laranja. */
export function knuckle(): BadgeShape {
  const outline = hull([arc(0.6, -0.3, 0.04, 40), rect(0, -0.36, 0.92, 0.36)], 160, [-0.12, 0]);
  const orange: Fill = '#f08a24';
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel2'), L(arc(0.48, -0.33, 0.06, 36), 'enamel'), L(rect(0.26, -0.27, 0.84, 0.27), 'enamel'),
      L(rect(0.3, -0.28, 0.44, 0.28), orange), L(rect(0.62, -0.28, 0.7, 0.28), orange), shine(-0.5, 0.3, 0.15, 0.09, deg(40)), L(arc(0.05, -0.17, 0.27, 10), 'shine'),
    ],
  };
}

/** Dínamo: disco dourado com um botão de corda. */
export function dynamo(): BadgeShape {
  const outline = hull([arc(0.84, 0.06, -0.06, 56), arc(0.22, -0.6, 0.62, 20)], 160);
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel'), L(arc(0.6, 0.06, -0.06, 48), 'enamel3'), L(arc(0.44, 0.06, -0.06, 40), 'enamel2', 0.05),
      L(spiral(0.06, -0.06, 0.06, 0.05, 1, 30), 'enamel2', 0.035), L(arc(0.12, -0.6, 0.62, 16), 'enamel3'), shine(-0.34, 0.4, 0.16, 0.06),
    ],
  };
}

/** Calor: chama laranja que sobe enrolando. */
export function heat(): BadgeShape {
  const outline = hull([arc(0.58, 0, -0.36, 40), poly(-0.5, -0.1, 0.42, 0.97, 0.55, -0.1), poly(-0.62, -0.15, -0.6, 0.42, -0.15, 0.05)], 160, [0, -0.2]);
  const inner = inset(outline, 0.08);
  return { outline, layers: [L(inner, 'enamel'), L(shrink(inner, 0.64, 0.02, -0.14), 'enamel3'), L(ellipse(0.2, 0.26, 0, -0.42, 24), '#ffe24a'), shine(-0.36, -0.08, 0.09, 0.16, deg(-15))] };
}

/** Equilíbrio: dois círculos ligados por uma barra. */
export function balance(): BadgeShape {
  const a = pt(-0.44, -0.42);
  const b = pt(0.44, 0.42);
  const outline = hull([arc(0.46, a[0], a[1], 36), arc(0.46, b[0], b[1], 36), band([a, b], 0.15)], 180);
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel'), L([pt(-0.2, -0.19), pt(0.2, 0.19)], 'metal', 0.06),
      ...[a, b].flatMap(([x, y]) => [L(arc(0.29, x, y, 28), 'enamel3'), L(arc(0.13, x, y, 20), 'enamel2'), L(ellipse(0.08, 0.04, x - 0.12, y + 0.14, 12, deg(30)), 'shine')]),
    ],
  };
}

/** Pena: pena branca com nervura e barbas. */
export function feather(): BadgeShape {
  const outline = poly(-0.75, -0.9, -0.86, -0.3, -0.7, 0.3, -0.36, 0.74, 0.08, 0.97, 0.3, 0.8, 0.14, 0.62, 0.55, 0.55, 0.38, 0.32, 0.76, 0.2, 0.55, -0.02, 0.8, -0.16, 0.34, -0.42, -0.46, -0.76);
  return {
    outline,
    layers: [
      L(inset(outline, 0.06), 'enamel'), L(shrink(inset(outline, 0.06), 0.7, -0.08, 0.05), 'enamel3'),
      ...[[-0.42, -0.15, 0.35, -0.22], [-0.25, 0.15, 0.45, 0.12], [-0.08, 0.45, 0.32, 0.42], [-0.6, -0.5, 0.05, -0.6]].map(([x0, y0, x1, y1]) => L([pt(x0!, y0!), pt(x1!, y1!)], 'enamel2', 0.03)),
      L([pt(-0.62, -0.78), pt(-0.45, -0.2), pt(-0.15, 0.35), pt(0.08, 0.82)], 'metal', 0.05),
    ],
  };
}

/** Mente: coração rosa com um anel dourado no meio. */
export function mind(): BadgeShape {
  const outline = heart(1.84, 0.02);
  return { outline, layers: [...dome(outline, 0.08, 0.8), L(arc(0.36, 0, 0.08, 36), 'metal'), L(arc(0.27, 0, 0.08, 32), 'enamel3'), L(arc(0.15, 0, 0.08, 24), 'enamel2'), shine(-0.42, 0.44, 0.14, 0.07, deg(30))] };
}

/** Chuva: triângulo escuro com três gotas (azul, branca e rosa). */
export function rain(): BadgeShape {
  const corners = radial(3, () => 0.8, deg(90));
  const outline = hull([...corners.map(([x, y]) => arc(0.17, x, y, 16)), corners], 160);
  const d = drop(0.42, -0.08, 0.27, 24);
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel2'), L(transform(d, 1, -0.28, -0.12, deg(20)), 'enamel'), L(transform(d, 1, 0.28, -0.12, deg(-20)), '#f06292'),
      L(transform(d, 0.9, 0, 0.3), 'enamel3'), shine(-0.36, 0.2, 0.1, 0.04, deg(60)),
    ],
  };
}

// ───────────────────────── Sinnoh (IV) ─────────────────────────

/** Carvão: porca hexagonal com o carvão no meio. */
export function coal(): BadgeShape {
  const outline = radial(6, () => 0.96, 0);
  const rim = inset(outline, 0.08);
  const hole = radial(6, () => 0.46, 0);
  return { outline, layers: [...facets(rim, hole), L(hole, '#2a2320'), L(shrink(hole, 0.6, -0.03, 0.03), '#3d332d'), L([...hole, hole[0]!], 'metal', 0.035), shine(-0.44, 0.52, 0.16, 0.05, deg(0))] };
}

/** Floresta: árvore de três folhas em losango, com tronco. */
export function forest(): BadgeShape {
  const leaves = [rhombus(0, 0.38, 0.28, 0.48), rhombus(-0.4, -0.24, 0.26, 0.46, deg(35)), rhombus(0.4, -0.24, 0.26, 0.46, deg(-35))];
  const outline = hull([rhombus(0, 0.38, 0.38, 0.58), rhombus(-0.4, -0.24, 0.36, 0.56, deg(35)), rhombus(0.4, -0.24, 0.36, 0.56, deg(-35)), rect(-0.15, -0.97, 0.15, -0.2)], 180, [0, 0.05]);
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel2'), L(rect(-0.07, -0.88, 0.07, -0.3), '#7a5230'),
      ...leaves.flatMap(([top, left, bottom, right]) => [L([top!, left!, bottom!], 'enamel3'), L([top!, bottom!, right!], 'enamel'), L([top!, bottom!], 'enamel2', 0.03)]),
    ],
  };
}

/** Pedregulho: losango de quatro pedras laranja. */
export function cobble(): BadgeShape {
  const tiles: readonly (readonly [number, number, Fill])[] = [[0, 0.45, 'enamel3'], [-0.45, 0, 'enamel'], [0, -0.45, 'enamel2'], [0.45, 0, 'enamel']];
  return {
    outline: poly(0, 0.96, -0.96, 0, 0, -0.96, 0.96, 0),
    layers: [...tiles.map(([x, y, fill]) => L(rhombus(x, y, 0.36, 0.36), fill)), ...tiles.map(([x, y]) => L(rhombus(x - 0.04, y + 0.06, 0.12, 0.08), 'shine'))],
  };
}

/** Pântano (Sinnoh): montanhas azuis sobre a água, num círculo de prata. */
export function fen(): BadgeShape {
  const jag = poly(-0.84, -0.05, -0.55, 0.42, -0.32, 0.08, 0, 0.6, 0.32, 0.08, 0.55, 0.42, 0.84, -0.05);
  return {
    outline: arc(0.94, 0, 0, 60),
    layers: [
      L(arc(0.84, 0, 0, 56), 'enamel3'), L([...jag, ...arc(0.84, 0, 0, 30, deg(-3.4), deg(-176.6))], 'enamel'),
      L([pt(-0.74, -0.4), ...arc(0.84, 0, 0, 24, deg(-28.4), deg(-151.6))], 'enamel2'),
      L(poly(-0.14, 0.38, 0, 0.6, 0.14, 0.38), 'enamel3'), L(poly(-0.66, 0.24, -0.55, 0.42, -0.44, 0.24), 'enamel3'), L(poly(0.44, 0.24, 0.55, 0.42, 0.66, 0.24), 'enamel3'),
      L(Array.from({ length: 13 }, (_, i) => pt(-0.72 + i * 0.12, -0.24 + 0.04 * Math.sin(i * 1.6))), 'enamel3', 0.035), shine(-0.4, 0.56, 0.14, 0.05),
    ],
  };
}

/** Relíquia: três anéis roxos entrelaçados. */
export function relic(): BadgeShape {
  const centers: readonly Point[] = [pt(-0.42, 0.28), pt(0.42, 0.28), pt(0, -0.44)];
  const outline = hull(centers.map(([x, y]) => arc(0.5, x, y, 36)), 160, [0, 0.04]);
  return {
    outline,
    layers: [L(inset(outline, 0.06), 'enamel2'), ...centers.flatMap(([x, y]) => [L(arc(0.42, x, y, 32), 'metal'), L(arc(0.31, x, y, 28), 'enamel'), L(ellipse(0.1, 0.05, x - 0.1, y + 0.12, 12, deg(30)), 'shine')])],
  };
}

/** Mina: esfera facetada, de placas como uma porca de mina. */
export function mine(): BadgeShape {
  const outline = radial(12, () => 0.94, deg(15));
  const hex = radial(6, () => 0.33, deg(90));
  const tiles = hex.map((p, k) => {
    const a = deg(90 + k * 60);
    const b = a + deg(60);
    return L(shrink([p, polar(0.78, a + deg(6)), polar(0.78, b - deg(6)), hex[(k + 1) % 6]!], 0.86), k % 2 ? 'enamel3' : 'enamel');
  });
  return { outline, layers: [L(inset(outline, 0.07), 'enamel2'), ...tiles, L(shrink(hex, 0.86), 'enamel'), L(shrink(hex, 0.45, -0.03, 0.03), 'enamel3'), shine(-0.4, 0.5, 0.14, 0.05)] };
}

/** Pingente: três picos de gelo de cristal. */
export function icicle(): BadgeShape {
  const outline = poly(-0.92, -0.72, 0.92, -0.72, 0.62, 0.45, 0.38, 0.02, 0, 0.97, -0.38, 0.02, -0.62, 0.45);
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel'),
      L(poly(-0.6, 0.33, -0.82, -0.64, -0.58, -0.64), 'enamel3'), L(poly(-0.6, 0.33, -0.58, -0.64, -0.38, -0.64), 'enamel2'),
      L(poly(0.6, 0.33, 0.38, -0.64, 0.6, -0.64), 'enamel3'), L(poly(0.6, 0.33, 0.6, -0.64, 0.82, -0.64), 'enamel2'),
      L(poly(0, 0.84, -0.3, -0.64, 0, -0.64), 'enamel3'), L(poly(0, 0.84, 0, -0.64, 0.3, -0.64), 'enamel2'),
      L([pt(-0.84, -0.64), pt(0.84, -0.64)], 'metal', 0.04), shine(-0.12, 0.5, 0.04, 0.14, deg(-20)),
    ],
  };
}

/** Farol: cúpula dourada com a luz acesa. */
export function beacon(): BadgeShape {
  const outline = [...arc(0.86, 0, -0.05, 30, 0, Math.PI), ...poly(-0.86, -0.42, -0.96, -0.58, -0.96, -0.88, 0.96, -0.88, 0.96, -0.58, 0.86, -0.42)];
  return {
    outline,
    layers: [
      L([...arc(0.66, 0, -0.05, 26, 0, Math.PI), ...poly(-0.66, -0.44, 0.66, -0.44)], 'enamel2'), L(ellipse(0.34, 0.36, 0, -0.08, 32), 'enamel'),
      L(arc(0.15, 0, -0.06, 20), 'enamel3'), ...[40, 70, 110, 140].map((d) => L([polar(0.42, deg(d), 0, -0.06), polar(0.58, deg(d), 0, -0.06)], 'enamel', 0.04)),
      L(rect(-0.86, -0.8, 0.86, -0.64), 'enamel2'), L([pt(-0.8, -0.72), pt(0.8, -0.72)], 'metal', 0.03), shine(-0.4, 0.42, 0.16, 0.06),
    ],
  };
}

// ───────────────────────── Unova (V) ─────────────────────────

/** Trio: ziguezague de três cores (fogo, planta e água). */
export function trio(): BadgeShape {
  const c = poly(-0.72, -0.35, -0.25, 0.42, 0.25, -0.42, 0.72, 0.35);
  const segments: readonly (readonly [Point, Point, Fill])[] = [[c[0]!, c[1]!, 'enamel'], [c[1]!, c[2]!, '#43a047'], [c[2]!, c[3]!, '#1e88e5']];
  return {
    outline: band(c, 0.2),
    layers: [L(band(c, 0.13), 'enamel2'), ...segments.map(([a, b, fill]) => L(band([a, b], 0.12), fill)), ...segments.map(([a, b]) => L([pt(a[0] * 0.85 + b[0] * 0.15 - 0.05, a[1] * 0.85 + b[1] * 0.15 + 0.03), pt(a[0] * 0.4 + b[0] * 0.6 - 0.05, a[1] * 0.4 + b[1] * 0.6 + 0.03)], 'shine', 0.03))],
  };
}

/** Básica: barra roxa com as pontas douradas. */
export function basic(): BadgeShape {
  const line = [pt(-0.62, -0.62), pt(0.62, 0.62)];
  return {
    outline: band(line, 0.27),
    layers: [
      L(band(line, 0.19), 'enamel'), L(band([line[0]!, pt(-0.46, -0.46)], 0.2), 'metal'), L(band([pt(0.46, 0.46), line[1]!], 0.2), 'metal'),
      L([pt(-0.42, -0.3), pt(0.3, 0.42)], 'enamel3', 0.05), L([pt(-0.3, -0.42), pt(0.42, 0.3)], 'enamel2', 0.04),
    ],
  };
}

/** Inseto (Unova): asa em forma de folha, em dois verdes. */
export function insect(): BadgeShape {
  const a = pt(-0.72, -0.78);
  const b = pt(0.74, 0.82);
  const ia = pt(-0.6, -0.65);
  const ib = pt(0.62, 0.69);
  const along = (t: number, side: number): Point => {
    const dx = ib[0] - ia[0];
    const dy = ib[1] - ia[1];
    const len = Math.hypot(dx, dy);
    return pt(ia[0] + dx * t + (dy / len) * side, ia[1] + dy * t - (dx / len) * side);
  };
  return {
    outline: lens(a, b, 0.5, 0.36, 28),
    layers: [
      L(lens(ia, ib, 0.4, 0.001, 24), 'enamel3'), L(lens(ia, ib, 0.001, 0.27, 24), 'enamel'), L([ia, ib], 'metal', 0.05),
      ...[0.25, 0.45, 0.65].map((t) => L([along(t, 0), along(t + 0.12, 0.18)], 'enamel2', 0.03)),
      ...[0.3, 0.5, 0.7].map((t) => L([along(t, 0), along(t + 0.12, -0.24)], 'enamel', 0.03)),
    ],
  };
}

/** Raio: relâmpago amarelo. */
export function bolt(): BadgeShape {
  const outline = poly(0.4, 0.97, -0.64, -0.1, -0.06, -0.1, -0.4, -0.97, 0.68, 0.18, 0.1, 0.18);
  const inner = inset(outline, 0.06);
  return { outline, layers: [L(inner, 'enamel2'), L(shrink(inner, 0.8, -0.04, 0.03), 'enamel'), shine(-0.16, 0.3, 0.12, 0.04, deg(50))] };
}

/** Tremor: lâmina amarela inclinada com faixa marrom. */
export function quake(): BadgeShape {
  const raw = poly(-0.88, -0.3, 0.5, -0.3, 0.88, 0.18, -0.24, 0.18, -0.4, 0.46, -0.88, 0.46);
  const rot = deg(38);
  return {
    outline: transform(raw, 1, 0, 0, rot),
    layers: spin([
      L(inset(raw, 0.06), 'enamel'), L(poly(-0.8, -0.23, 0.46, -0.23, 0.6, -0.05, -0.8, -0.05), 'enamel2'),
      L(poly(-0.2, 0.1, 0, 0, 0.12, 0.08, 0.35, -0.02), 'enamel2', 0.03), shine(-0.66, 0.34, 0.1, 0.04, 0),
    ], rot),
  };
}

/** Jato: asa azul enflechada. */
export function jet(): BadgeShape {
  const outline = poly(-0.94, 0.6, -0.3, 0.46, 0.3, 0.26, 0.9, -0.04, 0.66, -0.44, 0.2, -0.2, 0.06, -0.56, -0.34, -0.1, -0.56, 0.14);
  const inner = inset(outline, 0.06);
  return { outline, layers: [L(inner, 'enamel'), L(shrink(inner, 0.55, 0.12, -0.12), 'enamel2'), L(poly(-0.7, 0.48, -0.1, 0.33, 0.55, 0.06), 'enamel3', 0.045)] };
}

/** Congelante: cristal laranja alongado. */
export function freeze(): BadgeShape {
  const raw = poly(0, 0.97, -0.4, 0.55, -0.4, -0.55, 0, -0.97, 0.4, -0.55, 0.4, 0.55);
  const rot = deg(-15);
  return {
    outline: transform(raw, 1, 0, 0, rot),
    layers: spin([
      L(inset(raw, 0.07), 'enamel'), L(poly(0, 0.86, 0.33, 0.51, 0.33, -0.51, 0, -0.86), 'enamel2'),
      L(poly(0, 0.82, 0.12, 0.48, 0.12, -0.48, 0, -0.82, -0.12, -0.48, -0.12, 0.48), 'enamel3'),
      L(poly(-0.33, 0.51, 0, 0.3, 0.33, 0.51), 'metal', 0.03), L(poly(-0.33, -0.51, 0, -0.3, 0.33, -0.51), 'metal', 0.03),
    ], rot),
  };
}

/** Lenda: estrela de pontas douradas com núcleo negro e um rubi. */
export function legend(): BadgeShape {
  const spikes = [0.98, 0.7, 0.92, 0.66, 0.98, 0.72, 0.9, 0.68];
  const outline = radial(16, (_, i) => (i % 2 ? 0.4 : spikes[i / 2]!), deg(90));
  return {
    outline,
    layers: [
      L(inset(outline, 0.06), 'enamel3'), L(radial(16, (_, i) => (i % 2 ? 0.3 : spikes[i / 2]! * 0.62), deg(90)), 'enamel'),
      L(arc(0.2, 0, 0, 24), 'metal'), L(arc(0.12, 0, 0, 20), '#e53935'), L(arc(0.04, -0.04, 0.04, 8), 'shine'),
    ],
  };
}

// ───────────────────────── Kalos (VI) ─────────────────────────

/** Besouro: joaninha de casco marrom com asas verdes. */
export function beetle(): BadgeShape {
  const outline = hull([ellipse(0.66, 0.8, 0, -0.12, 48), arc(0.24, 0, 0.72, 24)], 160);
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel2'), L(ellipse(0.29, 0.6, -0.3, -0.14, 32, deg(-6)), 'enamel'), L(ellipse(0.29, 0.6, 0.3, -0.14, 32, deg(6)), 'enamel'),
      L(ellipse(0.1, 0.28, -0.36, 0, 20, deg(-6)), 'enamel3'), L(ellipse(0.1, 0.28, 0.24, 0, 20, deg(6)), 'enamel3'),
      L([pt(0, 0.5), pt(0, -0.8)], 'dark', 0.035), L(arc(0.17, 0, 0.72, 20), '#4a3020'),
    ],
  };
}

/** Penhasco: degraus de rocha marrom. */
export function cliff(): BadgeShape {
  const outline = poly(-0.86, -0.86, 0.86, -0.86, 0.86, -0.26, 0.3, -0.26, 0.3, 0.34, -0.26, 0.34, -0.26, 0.92, -0.86, 0.92);
  return {
    outline,
    layers: [
      L(inset(outline, 0.06), 'enamel'), L(rect(-0.8, 0.7, -0.32, 0.86), 'enamel3'), L(rect(-0.2, 0.12, 0.24, 0.28), 'enamel3'), L(rect(0.36, -0.48, 0.8, -0.32), 'enamel3'),
      L(rect(-0.8, -0.8, 0.8, -0.68), 'enamel2'),
      L(poly(-0.6, 0.5, -0.5, 0.2, -0.6, -0.1), 'enamel2', 0.03), L(poly(0, -0.1, 0.1, -0.4, 0, -0.6), 'enamel2', 0.03), L(poly(0.5, -0.5, 0.6, -0.62), 'enamel2', 0.03),
    ],
  };
}

/** Estrondo: punho de aço com a frente vermelha. */
export function rumble(): BadgeShape {
  const outline = poly(-0.9, -0.46, 0.44, -0.46, 0.9, -0.1, 0.9, 0.46, 0.2, 0.46, 0.06, 0.72, -0.56, 0.72, -0.9, 0.36);
  return {
    outline,
    layers: [
      L(inset(outline, 0.06), 'enamel2'), L(rect(-0.8, 0.22, 0.04, 0.38), 'enamel3'), L(poly(0.12, -0.39, 0.42, -0.39, 0.83, -0.07, 0.83, 0.39, 0.12, 0.39), 'enamel'),
      ...[-0.42, -0.14, 0.12].map((x) => L([pt(x, 0.38), pt(x, -0.38)], 'dark', 0.035)), L([pt(0.22, 0.28), pt(0.72, 0.28)], 'shine', 0.04),
    ],
  };
}

/** Planta: gota verde com nervuras em árvore. */
export function plant(): BadgeShape {
  const outline = drop(0.98, -0.22, 0.72, 44);
  // Galhos: altura onde saem do caule, abertura e altura da ponta.
  const branches = [[-0.42, 0.42, -0.05], [-0.06, 0.3, 0.32], [0.3, 0.15, 0.6]] as const;
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel'), L(shrink(inset(outline, 0.07), 0.55, -0.1, 0.06), 'enamel3'), L([pt(0, -0.78), pt(0, 0.72)], 'enamel2', 0.06),
      ...branches.flatMap(([y0, x, y1]) => [L([pt(0, y0), pt(-x, y1)], 'enamel2', 0.045), L([pt(0, y0), pt(x, y1)], 'enamel2', 0.045)]),
    ],
  };
}

/** Voltagem: estrela de seis lâminas laranja com miolo de aço. */
export function voltage(): BadgeShape {
  const outline = radial(12, (_, i) => (i % 2 ? 0.36 : i % 4 === 0 ? 0.98 : 0.8), deg(90));
  const inner = inset(outline, 0.06);
  return {
    outline,
    layers: [
      L(inner, 'enamel'), ...inner.filter((_, i) => i % 2 === 0).map((tip, k) => L([pt(0, 0), tip, inner[(2 * k + 1) % 12]!], 'enamel2')),
      L(arc(0.3, 0, 0, 28), '#9aa1a8'), L(arc(0.15, 0, 0, 20), 'enamel3'), L(arc(0.05, -0.05, 0.05, 8), 'shine'),
    ],
  };
}

/** Fada: leque rosa de bordas onduladas. */
export function fairy(): BadgeShape {
  const bottom = Array.from({ length: 25 }, (_, i) => pt(-0.95 + (1.9 * i) / 24, 0.18 - 0.74 * Math.sin((Math.PI * i) / 24)));
  const top = Array.from({ length: 41 }, (_, i) => pt(0.95 - (1.9 * i) / 40, 0.3 + 0.24 * Math.abs(Math.sin((5 * Math.PI * i) / 40))));
  const outline = [...bottom, ...top];
  return {
    outline,
    layers: [
      L(inset(outline, 0.06), 'enamel'), ...[0.76, 0.38, 0, -0.38, -0.76].map((x) => L([pt(0, -0.36), pt(x, 0.44)], 'enamel2', 0.035)),
      L(arc(0.13, 0, -0.36, 20), 'metal'), L(arc(0.07, 0, -0.36, 12), 'enamel3'), shine(-0.5, 0.3, 0.16, 0.04, deg(10)),
    ],
  };
}

/** Psíquica: esfera dourada com espiral roxa e pingente. */
export function psychic(): BadgeShape {
  const outline = hull([arc(0.72, 0, 0.18, 48), poly(-0.28, -0.4, 0, -0.96, 0.28, -0.4)], 160);
  return {
    outline,
    layers: [L(inset(outline, 0.07), 'enamel'), L(spiral(0, 0.18, 0.04, 0.078, 1.15, 60), 'enamel2', 0.08), L(ellipse(0.1, 0.16, 0, -0.62, 20), 'enamel2'), shine(-0.36, 0.56, 0.14, 0.05)],
  };
}

/** Iceberg: hexágono com moldura dourada, montanhas de gelo e água. */
export function iceberg(): BadgeShape {
  const outline = radial(6, () => 0.96, deg(90));
  const frame = radial(6, () => 0.74, deg(90));
  return {
    outline,
    layers: [
      L(inset(outline, 0.07), 'enamel2'), L([...frame, frame[0]!], 'metal', 0.04),
      L(poly(-0.6, -0.36, -0.26, 0.22, -0.08, 0, 0.2, 0.46, 0.6, -0.36), 'enamel3'), L(poly(0.2, 0.46, 0.6, -0.36, 0.24, -0.36), '#9fd2f5'),
      L(poly(-0.62, -0.4, 0.62, -0.4, 0, -0.72), 'enamel'), shine(-0.5, 0.42, 0.1, 0.04, deg(30)),
    ],
  };
}
