import { boxBlur } from './image';
import type { Point, Quad, RgbaImage } from './types';

/**
 * Detecção de cartas por LINHAS: gradiente de cor → transformada de Hough → quadriláteros formados por
 * dois pares de retas quase paralelas. Funciona com fundo texturizado ou degradê, onde "o que difere
 * do fundo" falha, porque só depende de a borda da carta ser uma reta contínua.
 */

export interface Gradient {
  width: number;
  height: number;
  mag: Float32Array;
  /** Direção do gradiente (rad), do canal de maior variação. */
  ang: Float32Array;
  /** Magnitude acima da qual um pixel conta como borda. */
  threshold: number;
}

/** Sobel por canal R, G, B (a moldura amarela de uma carta quase não muda o brilho, mas muda a cor). */
export function colorGradient(image: RgbaImage): Gradient {
  const { width, height, data } = image;
  const channels: Float32Array[] = [0, 1, 2].map((c) => {
    const ch = new Float32Array(width * height);
    for (let i = 0; i < ch.length; i++) ch[i] = data[i * 4 + c] ?? 0;
    return boxBlur(ch, width, height);
  });
  const mag = new Float32Array(width * height);
  const ang = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      let best = 0;
      let bestAng = 0;
      for (const g of channels) {
        const gx = -g[i - width - 1]! - 2 * g[i - 1]! - g[i + width - 1]! + g[i - width + 1]! + 2 * g[i + 1]! + g[i + width + 1]!;
        const gy = -g[i - width - 1]! - 2 * g[i - width]! - g[i - width + 1]! + g[i + width - 1]! + 2 * g[i + width]! + g[i + width + 1]!;
        const m = Math.hypot(gx, gy);
        if (m > best) {
          best = m;
          bestAng = Math.atan2(gy, gx);
        }
      }
      mag[i] = best;
      ang[i] = bestAng;
    }
  }
  // Limiar por percentil: ~88% dos pixels abaixo; piso para não tratar ruído de quadro liso como borda.
  const sorted = Float32Array.from(mag).sort();
  const threshold = Math.max(24, sorted[Math.floor(sorted.length * 0.88)] ?? 0);
  return { width, height, mag, ang, threshold };
}

export interface HoughLine {
  /** Ângulo da normal (rad, 0..π) e distância assinada à origem. */
  theta: number;
  rho: number;
  votes: number;
}

const THETA_STEPS = 180;

export function houghLines(grad: Gradient, maxLines = 22): HoughLine[] {
  const { width, height, mag, ang, threshold } = grad;
  const diag = Math.ceil(Math.hypot(width, height));
  const rhoSize = diag * 2 + 1;
  const acc = new Float32Array(THETA_STEPS * rhoSize);
  const cos = new Float32Array(THETA_STEPS);
  const sin = new Float32Array(THETA_STEPS);
  for (let t = 0; t < THETA_STEPS; t++) {
    cos[t] = Math.cos((t * Math.PI) / THETA_STEPS);
    sin[t] = Math.sin((t * Math.PI) / THETA_STEPS);
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = mag[i]!;
      if (m < threshold) continue;
      const t0 = Math.round((((ang[i]! % Math.PI) + Math.PI) % Math.PI) / (Math.PI / THETA_STEPS));
      const weight = Math.min(3, m / threshold);
      for (let dt = -6; dt <= 6; dt += 2) {
        let t = t0 + dt;
        if (t < 0) t += THETA_STEPS;
        else if (t >= THETA_STEPS) t -= THETA_STEPS;
        // Com o índice já "enrolado" (θ+π), ρ = x·cosθ' + y·sinθ' é a representação canônica da mesma reta.
        const rho = x * cos[t]! + y * sin[t]!;
        const r = Math.round(rho) + diag;
        if (r >= 0 && r < rhoSize) acc[t * rhoSize + r]! += weight;
      }
    }
  }
  const minVotes = Math.max(12, Math.min(width, height) * 0.22);
  const peaks: HoughLine[] = [];
  for (let t = 0; t < THETA_STEPS; t++) {
    for (let r = 2; r < rhoSize - 2; r++) {
      const v = acc[t * rhoSize + r]!;
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -3; dt <= 3 && isMax; dt++) {
        const tt = (t + dt + THETA_STEPS) % THETA_STEPS;
        for (let dr = -3; dr <= 3; dr++) {
          const rr = dt !== 0 && (t + dt < 0 || t + dt >= THETA_STEPS) ? -(r - diag) + diag + dr : r + dr;
          if (rr < 0 || rr >= rhoSize || (dt === 0 && dr === 0)) continue;
          const o = acc[tt * rhoSize + rr]!;
          if (o > v || (o === v && (tt < t || (tt === t && rr < r)))) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ theta: (t * Math.PI) / THETA_STEPS, rho: r - diag, votes: v });
    }
  }
  peaks.sort((a, b) => b.votes - a.votes);
  // Supressão: retas quase iguais (mesma direção e posição) contam uma vez.
  const kept: HoughLine[] = [];
  for (const p of peaks) {
    const dup = kept.some((k) => lineDistance(k, p) < 5 && angleBetween(k.theta, p.theta) < (6 * Math.PI) / 180);
    if (!dup) kept.push(p);
    if (kept.length >= maxLines) break;
  }
  return kept.map((line) => refineLine(refineLine(refineLine(line, grad, 6), grad, 4), grad, 3));
}

/**
 * Refina uma reta de Hough (grade de 1° e 1 px) ajustando-a por mínimos quadrados totais aos pixels de borda
 * próximos e alinhados: os cantos do quadrilátero dependem disso (um erro de 1° vira ~10 px num canto distante).
 */
export function refineLine(line: HoughLine, grad: Gradient, window = 3): HoughLine {
  const { width, height, mag, ang, threshold } = grad;
  const nx = Math.cos(line.theta);
  const ny = Math.sin(line.theta);
  let sw = 0;
  let sx = 0;
  let sy = 0;
  const pts: [number, number, number][] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = mag[i]!;
      if (m < threshold * 0.7) continue;
      if (Math.abs(x * nx + y * ny - line.rho) > window) continue;
      if (Math.abs(Math.cos(ang[i]! - line.theta)) < 0.85) continue;
      pts.push([x, y, m]);
      sw += m;
      sx += x * m;
      sy += y * m;
    }
  }
  if (pts.length < 8) return line;
  const mx = sx / sw;
  const my = sy / sw;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y, m] of pts) {
    sxx += m * (x - mx) * (x - mx);
    sxy += m * (x - mx) * (y - my);
    syy += m * (y - my) * (y - my);
  }
  // Direção da reta = autovetor principal; a normal é perpendicular.
  const lineAngle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let theta = lineAngle + Math.PI / 2;
  let tx = Math.cos(theta);
  let ty = Math.sin(theta);
  if (tx * nx + ty * ny < 0) {
    theta += Math.PI;
    tx = -tx;
    ty = -ty;
  }
  theta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let rho = mx * tx + my * ty;
  // Representação canônica 0..π.
  let t = theta;
  if (t >= Math.PI) {
    t -= Math.PI;
    rho = -rho;
  }
  return { theta: t, rho, votes: line.votes };
}

/** Diferença entre duas direções de reta (0..π/2). */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/** Distância entre duas retas quase paralelas medida no ponto médio de uma delas. */
function lineDistance(a: HoughLine, b: HoughLine): number {
  // Compara usando a normal de `a`; se a normal de b aponta para o lado oposto, inverte ρ.
  const same = Math.cos(a.theta - b.theta) >= 0 ? 1 : -1;
  return Math.abs(a.rho - same * b.rho);
}

export function intersect(a: HoughLine, b: HoughLine): Point | null {
  const det = Math.cos(a.theta) * Math.sin(b.theta) - Math.sin(a.theta) * Math.cos(b.theta);
  if (Math.abs(det) < 1e-3) return null;
  return {
    x: (a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det,
    y: (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det,
  };
}

/**
 * Fração (0–1) dos pontos ao longo dos lados do quadrilátero apoiados por uma borda cuja direção é
 * perpendicular ao lado. Devolve a média e o pior lado (um lado sem borda reprova o quadrilátero).
 */
export function sideSupport(quad: readonly Point[], grad: Gradient): { mean: number; min: number } {
  const { width, height, mag, ang, threshold } = grad;
  let sum = 0;
  let min = 1;
  for (let s = 0; s < 4; s++) {
    const a = quad[s]!;
    const b = quad[(s + 1) % 4]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const steps = Math.max(8, Math.round(length / 3));
    let hits = 0;
    let total = 0;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      total++;
      let ok = false;
      for (let w = -2; w <= 2 && !ok; w++) {
        const x = Math.round(px + nx * w);
        const y = Math.round(py + ny * w);
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
        const i = y * width + x;
        if (mag[i]! < threshold * 0.7) continue;
        if (Math.abs(Math.cos(ang[i]! - Math.atan2(ny, nx))) > 0.8) ok = true;
      }
      if (ok) hits++;
    }
    const frac = total === 0 ? 0 : hits / total;
    sum += frac;
    min = Math.min(min, frac);
  }
  return { mean: sum / 4, min };
}

function orderCorners(points: Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  return [...points].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx)) as Quad;
}

export interface LineQuad {
  quad: Quad;
  support: { mean: number; min: number };
}

/**
 * Monta quadriláteros com 2 retas quase paralelas + 2 retas quase paralelas e perpendiculares às primeiras.
 * `accept` filtra por forma (área, proporção) antes do cálculo mais caro de apoio de borda.
 */
export function quadsFromLines(lines: HoughLine[], grad: Gradient, accept: (quad: Quad) => boolean): LineQuad[] {
  const { width, height } = grad;
  const minSep = Math.min(width, height) * 0.2;
  const parallel: [HoughLine, HoughLine][] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!;
      const b = lines[j]!;
      if (angleBetween(a.theta, b.theta) > (14 * Math.PI) / 180) continue;
      if (lineDistance(a, b) < minSep) continue;
      parallel.push([a, b]);
    }
  }
  const out: LineQuad[] = [];
  for (let p = 0; p < parallel.length; p++) {
    for (let q = p + 1; q < parallel.length; q++) {
      const [a1, a2] = parallel[p]!;
      const [b1, b2] = parallel[q]!;
      const between = angleBetween(a1.theta, b1.theta);
      if (Math.abs(between - Math.PI / 2) > (22 * Math.PI) / 180) continue;
      const corners = [intersect(a1, b1), intersect(a1, b2), intersect(a2, b2), intersect(a2, b1)];
      if (corners.some((c) => c === null)) continue;
      const quad = orderCorners(corners as Point[]);
      // Cantos precisam ficar (quase) dentro do quadro: carta cortada não serve para ler o número.
      const mx = width * 0.03;
      const my = height * 0.03;
      if (quad.some((c) => c.x < -mx || c.y < -my || c.x > width + mx || c.y > height + my)) continue;
      if (!accept(quad)) continue;
      out.push({ quad, support: sideSupport(quad, grad) });
    }
  }
  return out;
}
