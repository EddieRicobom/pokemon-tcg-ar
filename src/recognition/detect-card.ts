import { boxBlur, limitSide, toGray } from './image';
import type { Point, Quad, RgbaImage } from './types';

/**
 * Detecção do quadrilátero da carta em um quadro da câmera, em TypeScript puro:
 * bordas (Sobel adaptativo) → componentes conexos → casco convexo → quadrilátero
 * de maior área → verificação de plausibilidade (área, proporção, preenchimento).
 *
 * Os limites de plausibilidade vêm do pokeum (MIT): área mínima de 5% do quadro e
 * proporção largura/altura entre 0,55 e 0,85.
 */
export const DETECT_MAX_SIDE = 320;
export const MIN_AREA_FRACTION = 0.05;
export const CARD_ASPECT_MIN = 0.55;
export const CARD_ASPECT_MAX = 0.85;
const MIN_FILL_RATIO = 0.88;

export interface CardDetection {
  quad: Quad;
  /** Fração da área do quadro ocupada pelo quadrilátero (0–1). */
  areaFraction: number;
  /** Lado curto / lado longo estimado (0–1). */
  aspect: number;
  /** Casco convexo preenchido pelo quadrilátero (0–1). */
  fillRatio: number;
  score: number;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  if (sorted.length < 3) return sorted;
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function pointLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / length;
}

/** Douglas–Peucker sobre polígono fechado (corta no par de vértices mais distantes). */
export function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length <= 4) return points;
  let ia = 0;
  let ib = 0;
  let best = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y);
      if (d > best) {
        best = d;
        ia = i;
        ib = j;
      }
    }
  }
  const chain = (from: number, to: number): Point[] => {
    const out: Point[] = [];
    for (let i = from; i !== to; i = (i + 1) % points.length) out.push(points[i]!);
    out.push(points[to]!);
    return out;
  };
  const dp = (chainPoints: Point[]): Point[] => {
    if (chainPoints.length < 3) return chainPoints;
    const first = chainPoints[0]!;
    const last = chainPoints[chainPoints.length - 1]!;
    let index = -1;
    let maxD = epsilon;
    for (let i = 1; i < chainPoints.length - 1; i++) {
      const d = pointLineDistance(chainPoints[i]!, first, last);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index < 0) return [first, last];
    const left = dp(chainPoints.slice(0, index + 1));
    const right = dp(chainPoints.slice(index));
    return left.slice(0, -1).concat(right);
  };
  const a = dp(chain(ia, ib));
  const b = dp(chain(ib, ia));
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/** Quadrilátero de maior área entre os vértices do polígono convexo. */
export function maxAreaQuad(points: Point[]): Point[] | null {
  const n = points.length;
  if (n < 4) return null;
  let best: Point[] | null = null;
  let bestArea = 0;
  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          const quad = [points[a]!, points[b]!, points[c]!, points[d]!];
          const area = polygonArea(quad);
          if (area > bestArea) {
            bestArea = area;
            best = quad;
          }
        }
      }
    }
  }
  return best;
}

/** Ordena como TL, TR, BR, BL (horário) e com o primeiro lado sendo o curto (retrato). */
export function orderQuad(points: Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  // Em coordenadas de imagem (y para baixo), ângulo crescente = sentido horário.
  const sorted = [...points].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
  let start = 0;
  let minSum = Infinity;
  sorted.forEach((p, i) => {
    if (p.x + p.y < minSum) {
      minSum = p.x + p.y;
      start = i;
    }
  });
  const ring = [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]!);
  const side0 = Math.hypot(ring[0]!.x - ring[1]!.x, ring[0]!.y - ring[1]!.y);
  const side1 = Math.hypot(ring[1]!.x - ring[2]!.x, ring[1]!.y - ring[2]!.y);
  const ordered = side0 > side1 ? [ring[1]!, ring[2]!, ring[3]!, ring[0]!] : ring;
  return ordered as Quad;
}

export function quadAspect(quad: Quad): number {
  const side = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (side(quad[0], quad[1]) + side(quad[3], quad[2])) / 2;
  const h = (side(quad[1], quad[2]) + side(quad[0], quad[3])) / 2;
  if (w === 0 || h === 0) return 0;
  return Math.min(w, h) / Math.max(w, h);
}

function edgeMask(gray: Float32Array, width: number, height: number): Uint8Array | null {
  const mag = new Float32Array(width * height);
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1]! - 2 * gray[i - 1]! - gray[i + width - 1]! + gray[i - width + 1]! + 2 * gray[i + 1]! + gray[i + width + 1]!;
      const gy =
        -gray[i - width - 1]! - 2 * gray[i - width]! - gray[i - width + 1]! + gray[i + width - 1]! + 2 * gray[i + width]! + gray[i + width + 1]!;
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      sum += m;
      sumSq += m * m;
      count++;
    }
  }
  const mean = sum / count;
  const std = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  // Quadro liso: sem bordas, sem carta (evita "detectar" ruído).
  if (std < 6) return null;
  const threshold = mean + 1.0 * std;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = (mag[i] ?? 0) > threshold ? 1 : 0;
  // Dilatação 3×3 para fechar pequenas falhas na borda.
  const dilated = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (
        mask[i] || mask[i - 1] || mask[i + 1] || mask[i - width] || mask[i + width] ||
        mask[i - width - 1] || mask[i - width + 1] || mask[i + width - 1] || mask[i + width + 1]
      ) {
        dilated[i] = 1;
      }
    }
  }
  return dilated;
}

function components(mask: Uint8Array, width: number, height: number): Point[][] {
  const seen = new Uint8Array(mask.length);
  const result: Point[][] = [];
  const stack: number[] = [];
  const minPixels = Math.max(40, Math.round(width * height * 0.002));
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const pixels: Point[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      pixels.push({ x, y });
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (mask[ni] && !seen[ni]) {
            seen[ni] = 1;
            stack.push(ni);
          }
        }
      }
    }
    if (pixels.length >= minPixels) result.push(pixels);
  }
  return result;
}

export function detectCard(source: RgbaImage): CardDetection | null {
  const { image, scale } = limitSide(source, DETECT_MAX_SIDE);
  const { width, height } = image;
  if (width < 16 || height < 16) return null;
  const gray = boxBlur(toGray(image), width, height);
  const mask = edgeMask(gray, width, height);
  if (!mask) return null;

  const frameArea = width * height;
  let best: CardDetection | null = null;
  for (const pixels of components(mask, width, height)) {
    const hull = convexHull(pixels);
    if (hull.length < 4) continue;
    const hullArea = polygonArea(hull);
    if (hullArea < frameArea * MIN_AREA_FRACTION) continue;
    const perimeter = hull.reduce((s, p, i) => {
      const q = hull[(i + 1) % hull.length]!;
      return s + Math.hypot(p.x - q.x, p.y - q.y);
    }, 0);
    const simplified = simplifyPolygon(hull, perimeter * 0.012);
    const quadPoints = maxAreaQuad(simplified.length >= 4 ? simplified : hull);
    if (!quadPoints) continue;
    const quad = orderQuad(quadPoints);
    const quadArea = polygonArea(quad);
    const areaFraction = quadArea / frameArea;
    const aspect = quadAspect(quad);
    const fillRatio = Math.min(1, quadArea / hullArea);
    if (areaFraction < MIN_AREA_FRACTION) continue;
    if (aspect < CARD_ASPECT_MIN || aspect > CARD_ASPECT_MAX) continue;
    if (fillRatio < MIN_FILL_RATIO) continue;
    const score = areaFraction * fillRatio;
    if (!best || score > best.score) {
      best = {
        quad: quad.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad,
        areaFraction,
        aspect,
        fillRatio,
        score,
      };
    }
  }
  return best;
}
