import { boxBlur, limitSide, toGray } from './image';
import { colorGradient, houghLines, quadsFromLines, sideSupport } from './quad-lines';
import type { Gradient } from './quad-lines';
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
export const CARD_ASPECT = 0.716;
export const CARD_ASPECT_MIN = 0.5;
export const CARD_ASPECT_MAX = 0.88;
const MIN_FILL_RATIO = 0.70;
/** Todo lado do quadrilátero precisa ter pelo menos esta fração apoiada por borda. */
const MIN_SIDE_SUPPORT = 0.4;

/**
 * Pontuação única para qualquer candidata (contorno ou retas). O tamanho pesa linearmente: testes com a foto
 * real mostraram que dar mais peso à borda/proporção faz um recorte parcial (só a arte, ~0,75 de proporção)
 * ganhar da carta inteira.
 */
export function candidateScore(areaFraction: number, aspect: number, support: number, fillRatio: number): number {
  const aspectPrior = Math.max(0, 1 - Math.abs(aspect - CARD_ASPECT) / 0.25);
  return areaFraction * fillRatio * (0.4 + 0.6 * support) * (0.25 + 0.75 * aspectPrior);
}

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

function edgeMask(gray: Float32Array, width: number, height: number): { mask: Uint8Array; mag: Float32Array; threshold: number } | null {
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
  return { mask: dilated, mag, threshold };
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

/**
 * Fundo = mediana das cores do contorno do quadro; primeiro plano = o que se afasta dele.
 * Devolve máscaras em VÁRIOS limiares (Otsu e frações dele): a moldura amarela de uma carta destoa
 * pouco de uma parede cinza, então o limiar de Otsu (guiado pela arte escura) pega só a ilustração.
 * Em limiares mais baixos a carta inteira aparece como um bloco só (depois de fechar buracos).
 */
function foregroundMasks(image: RgbaImage): Uint8Array[] {
  const { width, height, data } = image;
  const ring = 3;
  const samples: [number[], number[], number[]] = [[], [], []];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) {
        x = width - ring - 1;
        continue;
      }
      const o = (y * width + x) * 4;
      samples[0].push(data[o] ?? 0);
      samples[1].push(data[o + 1] ?? 0);
      samples[2].push(data[o + 2] ?? 0);
    }
  }
  const median = (values: number[]) => [...values].sort((p, q) => p - q)[Math.floor(values.length / 2)] ?? 0;
  const bg = [median(samples[0]), median(samples[1]), median(samples[2])];
  const bgLuma = (bg[0]! + bg[1]! + bg[2]!) / 3;
  const dist = new Float32Array(width * height);
  const histogram = new Float64Array(256);
  for (let i = 0; i < dist.length; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    // Distância de cor ao fundo + diferença de croma (cor "viva" contra parede neutra), sem depender só do brilho.
    const rgb = Math.hypot(r - bg[0]!, g - bg[1]!, b - bg[2]!) / 1.732;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const bgChroma = Math.max(bg[0]!, bg[1]!, bg[2]!) - Math.min(bg[0]!, bg[1]!, bg[2]!);
    const d = Math.max(rgb, Math.abs(chroma - bgChroma) * 0.8, Math.abs((r + g + b) / 3 - bgLuma) * 0.5);
    dist[i] = d;
    histogram[Math.min(255, Math.round(d))]!++;
  }
  const smooth = boxBlur(dist, width, height);
  // Otsu
  const totalPixels = dist.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i]!;
  let sumB = 0;
  let weightB = 0;
  let bestVariance = -1;
  let otsu = 0;
  for (let t = 0; t < 256; t++) {
    weightB += histogram[t]!;
    if (weightB === 0) continue;
    const weightF = totalPixels - weightB;
    if (weightF === 0) break;
    sumB += t * histogram[t]!;
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      otsu = t;
    }
  }
  const levels = new Set<number>();
  for (const fraction of [1, 0.6, 0.4, 0.25]) {
    const level = Math.max(10, Math.round(otsu * fraction));
    levels.add(level);
  }
  if (otsu < 10 && levels.size === 1) return [];
  return [...levels].map((level) => {
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = (smooth[i] ?? 0) > level ? 1 : 0;
    return fillHoles(closeMask(mask, width, height, 2), width, height);
  });
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  // Separável: horizontal e depois vertical.
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    let last = -Infinity;
    for (let x = 0; x < width; x++) if (mask[y * width + x]) last = x, tmp[y * width + x] = 1; else tmp[y * width + x] = x - last <= radius ? 1 : 0;
    last = Infinity;
    for (let x = width - 1; x >= 0; x--) {
      if (mask[y * width + x]) last = x;
      if (last - x <= radius) tmp[y * width + x] = 1;
    }
  }
  for (let x = 0; x < width; x++) {
    let last = -Infinity;
    for (let y = 0; y < height; y++) if (tmp[y * width + x]) last = y, out[y * width + x] = 1; else out[y * width + x] = y - last <= radius ? 1 : 0;
    last = Infinity;
    for (let y = height - 1; y >= 0; y--) {
      if (tmp[y * width + x]) last = y;
      if (last - y <= radius) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Fechamento morfológico (dilata e erode): junta pedaços separados por finas falhas (reflexos, texto claro). */
function closeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const dilated = dilateMask(mask, width, height, radius);
  const inverted = dilated.map((v) => 1 - v);
  const eroded = dilateMask(new Uint8Array(inverted), width, height, radius).map((v) => 1 - v);
  return new Uint8Array(eroded);
}

/** Preenche buracos (regiões de fundo que não tocam a borda do quadro). */
function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < mask.length - width) push(i + width);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/** Motivos pelos quais candidatas foram descartadas (só preenchido quando o chamador pede). */
export interface DetectDiag {
  reasons: string[];
}

export function detectCard(source: RgbaImage, diag?: DetectDiag): CardDetection | null {
  const { image, scale } = limitSide(source, DETECT_MAX_SIDE);
  const { width, height } = image;
  if (width < 16 || height < 16) return null;
  const gray = boxBlur(toGray(image), width, height);
  const edges = edgeMask(gray, width, height);
  if (!edges) {
    diag?.reasons.push('Quadro sem bordas suficientes (muito liso, escuro ou desfocado).');
    return null;
  }
  const grad: Gradient = colorGradient(image);
  const rejected: { area: number; reason: string }[] = [];
  const reject = (area: number, reason: string) => {
    if (diag) rejected.push({ area, reason: `${Math.round(area * 100)}% do quadro: ${reason}` });
  };

  const frameArea = width * height;
  let best: CardDetection | null = null;
  const consider = (pixels: Point[]) => {
    const hull = convexHull(pixels);
    if (hull.length < 4) return;
    const hullArea = polygonArea(hull);
    if (hullArea < frameArea * MIN_AREA_FRACTION) return;
    // (a partir daqui o objeto já é grande o bastante para valer um motivo de descarte)
    const perimeter = hull.reduce((s, p, i) => {
      const q = hull[(i + 1) % hull.length]!;
      return s + Math.hypot(p.x - q.x, p.y - q.y);
    }, 0);
    const simplified = simplifyPolygon(hull, perimeter * 0.012);
    const quadPoints = maxAreaQuad(simplified.length >= 4 ? simplified : hull);
    if (!quadPoints) return;
    const quad = orderQuad(quadPoints);
    const quadArea = polygonArea(quad);
    const areaFraction = quadArea / frameArea;
    const aspect = quadAspect(quad);
    const fillRatio = Math.min(1, quadArea / hullArea);
    if (areaFraction < MIN_AREA_FRACTION) return reject(areaFraction, 'pequeno demais');
    if (aspect < CARD_ASPECT_MIN || aspect > CARD_ASPECT_MAX) return reject(areaFraction, `proporção ${aspect.toFixed(2)} fora de ${CARD_ASPECT_MIN}–${CARD_ASPECT_MAX}`);
    if (fillRatio < MIN_FILL_RATIO) return reject(areaFraction, `formato irregular (preenchimento ${Math.round(fillRatio * 100)}% < ${Math.round(MIN_FILL_RATIO * 100)}%)`);
    const sides = sideSupport(quad, grad);
    const support = 0.5 * sides.mean + 0.5 * sides.min;
    if (sides.min < MIN_SIDE_SUPPORT) return reject(areaFraction, `lados sem borda (pior lado ${Math.round(sides.min * 100)}%)`);
    // Uma carta real tem proporção ≈ 0,716: formas parecidas com a carta ganham de recortes parciais (só a arte, só o título).
    const score = candidateScore(areaFraction, aspect, support, fillRatio);
    if (!best || score > best.score) {
      best = {
        quad: quad.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad,
        areaFraction,
        aspect,
        fillRatio,
        score,
      };
    }
  };

  // Estratégia A: bordas fortes conectadas. Estratégia B: o que difere da cor do fundo.
  for (const pixels of components(edges.mask, width, height)) consider(pixels);
  for (const foreground of foregroundMasks(image)) for (const pixels of components(foreground, width, height)) consider(pixels);
  // Estratégia C: retas (Hough). Resiste a fundo texturizado, degradê e bagunça.
  const lineCandidates = quadsFromLines(houghLines(grad), grad, (quad) => {
    const area = polygonArea(quad) / frameArea;
    const aspect = quadAspect(quad);
    return area >= MIN_AREA_FRACTION && aspect >= CARD_ASPECT_MIN && aspect <= CARD_ASPECT_MAX;
  });
  for (const candidate of lineCandidates) {
    if (candidate.support.min < MIN_SIDE_SUPPORT) continue;
    const quad = orderQuad(candidate.quad);
    const areaFraction = polygonArea(quad) / frameArea;
    const aspect = quadAspect(quad);
    const support = 0.5 * candidate.support.mean + 0.5 * candidate.support.min;
    const score = candidateScore(areaFraction, aspect, support, 1);
    if (!best || score > best.score) {
      best = { quad: quad.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad, areaFraction, aspect, fillRatio: 1, score };
    }
  }
  if (diag && !best) {
    if (rejected.length === 0) diag.reasons.push('Nenhum objeto grande o bastante (≥ 5% do quadro) foi achado.');
    rejected.sort((a, b) => b.area - a.area);
    for (const item of rejected.slice(0, 3)) diag.reasons.push(`Descartado — ${item.reason}.`);
  }
  return best;
}
