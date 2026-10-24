/**
 * Geometria das insígnias: pontos num quadrado de -1 a 1 (y para cima) e as ferramentas para montar os contornos
 * (círculos, estrelas, faixas, recuo para a borda de metal, união de formas). Sem Three.js nem DOM: os mesmos pontos
 * viram SVG (`BadgeIcon.vue`), textura e relevo na maleta 3D (`src/box/`).
 */

export type Point = readonly [number, number];

/** Acabamento de uma camada: o metal da insígnia, três tons de esmalte, um traço escuro ou um reflexo claro. */
export type Finish = 'metal' | 'enamel' | 'enamel2' | 'enamel3' | 'dark' | 'shine';
/** Um acabamento ou uma cor de esmalte própria (`#rrggbb`), para as insígnias de várias cores (Arco-íris, Trio...). */
export type Fill = Finish | `#${string}`;

export interface BadgeLayer {
  points: readonly Point[];
  fill: Fill;
  /** Linha aberta (nervura, contorno de vitral) em vez de área preenchida; a espessura vai em unidades do desenho. */
  line?: number;
}

export const TAU = Math.PI * 2;
export const deg = (d: number): number => (d * Math.PI) / 180;
export const round = (n: number): number => Math.round(n * 1000) / 1000;
export const pt = (x: number, y: number): Point => [round(x), round(y)];
export const polar = (r: number, a: number, cx = 0, cy = 0): Point => pt(cx + r * Math.cos(a), cy + r * Math.sin(a));

/** Pontos a partir de pares de números: `poly(x0, y0, x1, y1, ...)`. */
export function poly(...xy: number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) out.push(pt(xy[i]!, xy[i + 1]!));
  return out;
}

/** Círculo (ou arco, de `from` a `to` em radianos) com `n` pontos. */
export function arc(r: number, cx = 0, cy = 0, n = 32, from = 0, to = TAU): Point[] {
  const closed = Math.abs(to - from - TAU) < 1e-9;
  const steps = closed ? n : n - 1;
  return Array.from({ length: n }, (_, i) => polar(r, from + ((to - from) * i) / steps, cx, cy));
}

export function ellipse(rx: number, ry: number, cx = 0, cy = 0, n = 40, rot = 0): Point[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => {
    const a = (TAU * i) / n;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    return pt(cx + x * c - y * s, cy + x * s + y * c);
  });
}

/** Pontos em volta do centro com o raio dado por `radius(ângulo, i)`. */
export function radial(n: number, radius: (a: number, i: number) => number, rot = 0, cx = 0, cy = 0): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (TAU * i) / n;
    return polar(radius(a, i), a, cx, cy);
  });
}

/** Estrela de `n` pontas (raio de fora e de dentro), com a primeira ponta em `rot`. */
export function star(n: number, outer: number, inner: number, rot = deg(90), cx = 0, cy = 0): Point[] {
  return radial(n * 2, (_, i) => (i % 2 ? inner : outer), rot, cx, cy);
}

/** Escala, gira e desloca (nessa ordem) em volta da origem. */
export function transform(points: readonly Point[], s: number, dx = 0, dy = 0, rot = 0): Point[] {
  const c = Math.cos(rot);
  const si = Math.sin(rot);
  return points.map(([x, y]) => pt((x * c - y * si) * s + dx, (x * si + y * c) * s + dy));
}

export function centroid(points: readonly Point[]): Point {
  const n = Math.max(1, points.length);
  return [points.reduce((a, p) => a + p[0], 0) / n, points.reduce((a, p) => a + p[1], 0) / n];
}

/** Escala em volta do centro da própria forma e desloca (para "um degrau de esmalte mais claro por cima"). */
export function shrink(points: readonly Point[], s: number, dx = 0, dy = 0): Point[] {
  const [cx, cy] = centroid(points);
  return points.map(([x, y]) => pt(cx + (x - cx) * s + dx, cy + (y - cy) * s + dy));
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

/** Desloca cada vértice ao longo da bissetriz (junta em quina, com limite para pontas finas). */
function offsetVertices(points: readonly Point[], d: number, closed: boolean, side: number): Point[] {
  const n = points.length;
  const normal = (a: Point, b: Point): Point => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [(-dy / len) * side, (dx / len) * side];
  };
  return points.map((p, i) => {
    const prev = closed ? points[(i - 1 + n) % n]! : points[Math.max(0, i - 1)]!;
    const next = closed ? points[(i + 1) % n]! : points[Math.min(n - 1, i + 1)]!;
    const n1 = prev === p ? normal(p, next) : normal(prev, p);
    const n2 = next === p ? n1 : normal(p, next);
    let nx = n1[0] + n2[0];
    let ny = n1[1] + n2[1];
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) [nx, ny] = n1;
    else [nx, ny] = [nx / len, ny / len];
    const k = d / Math.max(0.4, nx * n1[0] + ny * n1[1]);
    return pt(p[0] + nx * k, p[1] + ny * k);
  });
}

/** O mesmo contorno recuado `d` para dentro: a borda de metal em volta do esmalte. */
export function inset(points: readonly Point[], d: number): Point[] {
  return offsetVertices(points, d, true, signedArea(points) >= 0 ? 1 : -1);
}

/** Faixa de largura `2 * half` em volta de uma linha (raio, barra, ziguezague). */
export function band(line: readonly Point[], half: number): Point[] {
  return [...offsetVertices(line, half, false, 1), ...offsetVertices(line, half, false, -1).reverse()];
}

/** Losango com o centro, a meia largura, a meia altura e a rotação dados. */
export function rhombus(cx: number, cy: number, w: number, h: number, rot = 0): Point[] {
  return transform(poly(0, h, -w, 0, 0, -h, w, 0), 1, 0, 0, rot).map(([x, y]) => pt(x + cx, y + cy));
}

/** Retângulo entre dois cantos. */
export function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return poly(x0, y0, x1, y0, x1, y1, x0, y1);
}

/**
 * Contorno da união de várias formas, visto de `center`: para cada direção, o ponto mais distante das bordas. Exato
 * para uniões "visíveis" do centro (bolhas, estrelas, punho com dedos), que é o que as insígnias usam.
 */
export function hull(shapes: readonly (readonly Point[])[], n = 144, center: Point = [0, 0]): Point[] {
  const [cx, cy] = center;
  return Array.from({ length: n }, (_, i) => {
    const a = (TAU * i) / n;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = 0;
    for (const shape of shapes) {
      for (let k = 0; k < shape.length; k++) {
        const [px, py] = shape[k]!;
        const [qx, qy] = shape[(k + 1) % shape.length]!;
        const ex = qx - px;
        const ey = qy - py;
        const denom = dx * ey - dy * ex;
        if (Math.abs(denom) < 1e-12) continue;
        const wx = px - cx;
        const wy = py - cy;
        const t = (wx * ey - wy * ex) / denom;
        const u = (wx * dy - wy * dx) / denom;
        if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
      }
    }
    return pt(cx + best * dx, cy + best * dy);
  });
}

/** Gota com a ponta para cima: ponta em `tipY`, corpo redondo de raio `r` centrado em `cy`. */
export function drop(tipY: number, cy: number, r: number, n = 40, cx = 0): Point[] {
  const span = Math.acos(r / (tipY - cy));
  const from = Math.PI / 2 + span;
  const to = Math.PI / 2 - span + TAU;
  return [pt(cx, tipY), ...arc(r, cx, cy, n, from, to)];
}

/** Coração clássico, com largura `w` (de ponta a ponta) e centro em `cy`. */
export function heart(w: number, cy = 0, n = 64, cx = 0): Point[] {
  const s = w / 32;
  return Array.from({ length: n }, (_, i) => {
    const t = (TAU * i) / n;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return pt(cx + x * s, cy + (y + 2.5) * s);
  });
}

/** Folha (ou lente) entre duas pontas, com a barriga de cada lado. */
export function lens(a: Point, b: Point, left: number, right: number, n = 24): Point[] {
  const [ax, ay] = a;
  const dx = b[0] - ax;
  const dy = b[1] - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const side = (w: number, sign: number, reverse: boolean): Point[] => {
    const pts = Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const bulge = w * Math.sin(Math.PI * t) * sign;
      return pt(ax + dx * t + nx * bulge, ay + dy * t + ny * bulge);
    });
    return reverse ? pts.reverse() : pts;
  };
  return [...side(right, -1, false), ...side(left, 1, true).slice(1, -1)];
}

/** Espiral de Arquimedes (linha aberta). */
export function spiral(cx: number, cy: number, r0: number, growth: number, turns: number, n = 60, rot = 0): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (turns * TAU * i) / (n - 1);
    return polar(r0 + growth * a, a + rot, cx, cy);
  });
}
