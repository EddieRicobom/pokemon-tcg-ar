/**
 * Geometria do sprite em pé sobre a carta (matemática pura, sem Three.js, para testar).
 *
 * Convenção do MindAR (lida no código-fonte da versão 1.2.5, `three.js` e `controller.js`):
 *   matriz do alvo = worldMatrix · postMatrix, onde postMatrix = T(w/2, h/2, 0) · S(w).
 * No espaço resultante ("espaço da carta"):
 *   origem  = centro da carta,
 *   unidade = LARGURA da carta (a altura vale h/w ≈ 1,397 para 63×88 mm),
 *   +X      = direita da carta, +Y = topo da carta, +Z = para fora da carta (na direção de quem olha).
 * A carta fica no plano XY. Um sprite "em pé" fica no plano XZ, com a base encostada na carta.
 */

import { DEFAULT_SMOOTHING, normalizeSmoothing } from '../core/pixel-upscale';
import type { SmoothingMode } from '../core/pixel-upscale';
import { ARTWORK_BOX } from '../recognition/layout';

/** Altura da carta física (63×88 mm) em larguras de carta. */
const CARD_HEIGHT_RATIO = 88 / 63;
/** Centro da ilustração no espaço da carta (+Y = topo): a caixa da arte é medida a partir do topo da carta. */
export const ILLUSTRATION_CENTER_X = 0;
export const ILLUSTRATION_CENTER_Y = (0.5 - (ARTWORK_BOX[1] + ARTWORK_BOX[3]) / 2) * CARD_HEIGHT_RATIO;
/** Inclinação padrão do Pokémon para trás (graus a partir da vertical, afastando o topo de quem olha). */
export const DEFAULT_TILT_DEG = 30;

export interface SpriteLayout {
  /** Altura do sprite, em larguras de carta (0,6 = 60% da largura da carta). */
  heightRatio: number;
  /** Deslocamento da base no plano da carta, em larguras de carta. +X direita, +Y topo da carta. */
  offsetX: number;
  offsetY: number;
  /** Elevação da base acima da superfície da carta (larguras de carta). 0 = encostado. */
  lift: number;
  /** Giro em torno da normal da carta, em graus. 0 = sprite de frente para a borda inferior da carta. */
  yawDeg: number;
  /**
   * Onde fica o ponto de ancoragem no sprite:
   *  - `base`: o meio da borda de baixo fica no ponto (em pé sobre ele);
   *  - `center`: o centro do sprite fica no ponto, na altura `lift`;
   *  - `rest`: o centro fica logo acima do ponto e a borda de baixo encosta na carta (acima por `lift`), de modo que a
   *    "sombra" do sprite no chão fica centrada no ponto. É o padrão: o Pokémon aparece no centro da ilustração.
   */
  anchor: 'base' | 'center' | 'rest';
  /**
   * Inclinação para trás, em graus a partir da vertical: 0 = em pé (90° da carta); 30 = o topo se afasta de quem olha
   * e o sprite fica a 60° da carta, mais voltado para quem escaneia de cima. Omitido = 0.
   */
  tiltDeg?: number;
  /** Mostra a sombra suave (e o brilho) no chão sob o Pokémon. Omitido = ligado. */
  showShadow?: boolean;
  /**
   * Gira o sprite em torno da normal da carta para ele ficar de frente para a câmera, sem sair do "em pé"
   * (continua a 90° da carta). Sem isso, com a câmera de frente para a carta, o plano vira só um fio.
   * Omitido = ligado.
   */
  faceCamera?: boolean;
  /** Suavização de pixels do GIF (ver `SmoothingMode`). Omitido = bordas suaves. */
  smoothing?: SmoothingMode;
  /** Mostra o painel de status no chão, abaixo da carta. Omitido = ligado. */
  showStats?: boolean;
  /**
   * Tamanho pela altura real da espécie (`core/size-scale.ts`): `heightRatio` vira a altura do desenho de um Pokémon
   * de 1 m, e cada espécie sai proporcional (Pikachu menor, Snorlax maior). Omitido = ligado.
   */
  realSize?: boolean;
}

export const DEFAULT_LAYOUT: SpriteLayout = {
  heightRatio: 0.7,
  offsetX: ILLUSTRATION_CENTER_X,
  offsetY: ILLUSTRATION_CENTER_Y,
  lift: 0,
  yawDeg: 0,
  anchor: 'rest',
  tiltDeg: DEFAULT_TILT_DEG,
  realSize: true,
  showShadow: true,
  faceCamera: true,
  smoothing: DEFAULT_SMOOTHING,
  showStats: true,
};

export const LAYOUT_LIMITS = {
  heightRatio: { min: 0.15, max: 1.6 },
  offset: { min: -0.7, max: 0.7 },
  lift: { min: 0, max: 1 },
  yawDeg: { min: -180, max: 180 },
  tiltDeg: { min: 0, max: 75 },
} as const;

export function clampLayout(layout: SpriteLayout): SpriteLayout {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  return {
    heightRatio: clamp(layout.heightRatio, LAYOUT_LIMITS.heightRatio.min, LAYOUT_LIMITS.heightRatio.max),
    offsetX: clamp(layout.offsetX, LAYOUT_LIMITS.offset.min, LAYOUT_LIMITS.offset.max),
    offsetY: clamp(layout.offsetY, LAYOUT_LIMITS.offset.min, LAYOUT_LIMITS.offset.max),
    lift: clamp(layout.lift, LAYOUT_LIMITS.lift.min, LAYOUT_LIMITS.lift.max),
    yawDeg: clamp(layout.yawDeg, LAYOUT_LIMITS.yawDeg.min, LAYOUT_LIMITS.yawDeg.max),
    anchor: layout.anchor === 'center' || layout.anchor === 'rest' ? layout.anchor : 'base',
    tiltDeg: layout.tiltDeg === undefined ? 0 : clamp(layout.tiltDeg, LAYOUT_LIMITS.tiltDeg.min, LAYOUT_LIMITS.tiltDeg.max),
    showShadow: layout.showShadow !== false,
    faceCamera: layout.faceCamera !== false,
    // `smooth` (liga/desliga) é o formato antigo, ainda presente em layouts salvos.
    smoothing: normalizeSmoothing(layout.smoothing, (layout as { smooth?: boolean }).smooth),
    showStats: layout.showStats !== false,
    realSize: layout.realSize !== false,
  };
}

/**
 * O layout com a altura que o sprite realmente terá: pela altura real da espécie (`relativeSize`, 1 = Pokémon de 1 m)
 * e descontando a margem transparente do quadro (`contentFrac`, fração da altura ocupada pelo desenho). Sem dado
 * de altura ou com a opção desligada, devolve o layout como está (tamanho pelo quadro, como antes).
 */
export function speciesLayout(layout: SpriteLayout, relativeSize: number | undefined, contentFrac: number): SpriteLayout {
  if (layout.realSize === false || relativeSize === undefined || !(relativeSize > 0)) return layout;
  const frac = Number.isFinite(contentFrac) ? Math.min(1, Math.max(0.2, contentFrac)) : 1;
  return { ...layout, heightRatio: (layout.heightRatio * relativeSize) / frac };
}

/** Matriz 4×4 em ordem de colunas (a mesma de `THREE.Matrix4.elements`). */
export type Mat4 = number[];

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function transformPoint(m: Mat4, p: [number, number, number]): [number, number, number] {
  const [x, y, z] = p;
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  return [
    (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w,
    (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w,
    (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w,
  ];
}

/** postMatrix do MindAR: T(w/2, h/2, 0) · S(w), em ordem de colunas. */
export function mindArPostMatrix(markerWidth: number, markerHeight: number): Mat4 {
  return [markerWidth, 0, 0, 0, 0, markerWidth, 0, 0, 0, 0, markerWidth, 0, markerWidth / 2, markerHeight / 2, 0, 1];
}

/** Matriz do espaço da carta no espaço da câmera: worldMatrix · postMatrix. */
export function cardSpaceMatrix(worldMatrix: ArrayLike<number>, markerWidth: number, markerHeight: number): Mat4 {
  return multiply(Array.from(worldMatrix), mindArPostMatrix(markerWidth, markerHeight));
}

/** Altura da carta no espaço da carta (largura = 1). */
export function cardHeightUnits(markerWidth: number, markerHeight: number): number {
  return markerHeight / markerWidth;
}

/**
 * Matriz do sprite no espaço da carta. O sprite nasce como um plano unitário no plano XY do Three.js
 * (largura em X, altura em Y, normal +Z). Aqui ele é:
 *   1. escalado (largura = altura × proporção do GIF, altura = heightRatio);
 *   2. levantado para ficar com a base na origem (ou o centro, se anchor = 'center');
 *   3. tombado +90° em torno de X: o "alto" do sprite passa a apontar para +Z (para fora da carta)
 *      e a frente dele passa a olhar para −Y (para a borda inferior da carta);
 *   4. girado em yaw em torno de Z e deslocado pela base.
 */
export function spriteMatrix(layout: SpriteLayout, spriteAspect: number, extraYawDeg = 0): Mat4 {
  const l = clampLayout(layout);
  const aspect = Number.isFinite(spriteAspect) && spriteAspect > 0 ? spriteAspect : 1;
  const height = l.heightRatio;
  const width = height * aspect;
  const yaw = ((l.yawDeg + extraYawDeg) * Math.PI) / 180;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // Ângulo do "alto" do sprite com o plano da carta: 90° em pé, menos a inclinação para trás.
  const rise = ((90 - (l.tiltDeg ?? 0)) * Math.PI) / 180;
  const cr = Math.cos(rise);
  const sr = Math.sin(rise);
  // Colunas: imagem de (1,0,0), (0,1,0), (0,0,1) do plano unitário.
  // Após escala e tombamento (rise em torno de X): X→X, Y→(0, cr, sr), Z→(0, −sr, cr). Depois yaw em Z.
  // Em pé (rise = 90°) isso dá exatamente Y→Z e Z→−Y. Inclinar leva o topo para +Y (para longe de quem olha).
  const xAxis: [number, number, number] = [width * c, width * s, 0];
  const yAxis: [number, number, number] = [-height * s * cr, height * c * cr, height * sr];
  const zAxis: [number, number, number] = [s * sr, -c * sr, cr];
  const half: [number, number, number] = [yAxis[0] / 2, yAxis[1] / 2, yAxis[2] / 2];
  // Ponto (0,0,0) do plano é o centro; a base é y = −0,5.
  let origin: [number, number, number];
  if (l.anchor === 'base') origin = [l.offsetX + half[0], l.offsetY + half[1], l.lift + half[2]];
  else if (l.anchor === 'rest') origin = [l.offsetX, l.offsetY, l.lift + half[2]];
  else origin = [l.offsetX, l.offsetY, l.lift];
  return [...xAxis, 0, ...yAxis, 0, ...zAxis, 0, ...origin, 1];
}

/**
 * Distância (larguras de carta, no chão) do ponto de ancoragem até a borda de baixo do sprite, na direção em que ele
 * olha. É por aí que o painel de status começa. Em pé sobre a base é 0; inclinado, o sprite avança sobre o chão.
 */
export function frontReach(layout: SpriteLayout): number {
  const l = clampLayout(layout);
  if (l.anchor === 'base') return 0;
  return (l.heightRatio / 2) * Math.sin((((l.tiltDeg ?? 0)) * Math.PI) / 180);
}

/** Onde o Pokémon está no chão da carta: o painel de status é posicionado a partir daqui. */
export interface SpritePlacement {
  /** Ponto do chão (espaço da carta) sob o centro da ilustração. */
  x: number;
  y: number;
  /** Giro total do sprite (layout + automático para a câmera), em graus. */
  yawDeg: number;
  heightRatio: number;
  /** Quanto a borda de baixo do sprite avança, no chão, na frente do ponto (ver `frontReach`). Omitido = 0. */
  frontReach?: number;
}

/** Largura do painel, em larguras de carta, por unidade de altura do sprite (painel e sprite crescem juntos). */
export const PANEL_WIDTH_PER_SPRITE_HEIGHT = 1.15;
export const PANEL_MIN_WIDTH = 0.4;
export const PANEL_MAX_WIDTH = 1.6;
/** Folga entre os pés do Pokémon e a borda do painel (larguras de carta). */
export const PANEL_GAP = 0.04;

export interface PanelPlacement {
  x: number;
  y: number;
  /** Giro em torno da normal da carta, em radianos (o "alto" do painel aponta para o Pokémon). */
  yawRad: number;
  width: number;
  height: number;
}

/**
 * Painel logo abaixo da ilustração: deitado no chão, à frente dos pés do Pokémon (no lado para onde ele olha),
 * girado junto com ele para o texto ficar de pé para quem olha de frente. `panelAspect` = altura/largura do painel.
 */
export function panelPlacement(sprite: SpritePlacement, panelAspect: number): PanelPlacement {
  const width = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, sprite.heightRatio * PANEL_WIDTH_PER_SPRITE_HEIGHT));
  const height = width * panelAspect;
  const yawRad = (sprite.yawDeg * Math.PI) / 180;
  const distance = (sprite.frontReach ?? 0) + PANEL_GAP + height / 2;
  return {
    x: sprite.x + Math.sin(yawRad) * distance,
    y: sprite.y - Math.cos(yawRad) * distance,
    yawRad,
    width,
    height,
  };
}

/**
 * Posição da câmera no espaço da carta (inversa da matriz da carta aplicada à origem da câmera).
 * A matriz é uma transformação rígida com escala uniforme, então basta a inversa da parte 3×3.
 */
export function cameraPositionInCardSpace(cardMatrix: Mat4): Vec3 | null {
  const a = cardMatrix[0]!, b = cardMatrix[4]!, c = cardMatrix[8]!;
  const d = cardMatrix[1]!, e = cardMatrix[5]!, f = cardMatrix[9]!;
  const g = cardMatrix[2]!, h = cardMatrix[6]!, i = cardMatrix[10]!;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const inv = [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
  const t: Vec3 = [cardMatrix[12]!, cardMatrix[13]!, cardMatrix[14]!];
  return [
    -(inv[0]! * t[0] + inv[1]! * t[1] + inv[2]! * t[2]),
    -(inv[3]! * t[0] + inv[4]! * t[1] + inv[5]! * t[2]),
    -(inv[6]! * t[0] + inv[7]! * t[1] + inv[8]! * t[2]),
  ];
}

/**
 * Giro (graus, em torno da normal da carta) que deixa a frente do sprite virada para a câmera.
 * Devolve null quando a câmera está quase na vertical da carta (a direção seria instável).
 */
export function yawTowardCamera(cardMatrix: Mat4): number | null {
  const p = cameraPositionInCardSpace(cardMatrix);
  if (!p) return null;
  const horizontal = Math.hypot(p[0], p[1]);
  const total = Math.hypot(p[0], p[1], p[2]);
  if (total === 0 || horizontal / total < 0.12) return null;
  // A frente do sprite aponta para (sen yaw, −cos yaw): queremos (p.x, p.y)/|p|.
  return (Math.atan2(p[0], -p[1]) * 180) / Math.PI;
}

/** Os 4 cantos do sprite no espaço da carta: base-esq, base-dir, topo-dir, topo-esq. */
export type Vec3 = [number, number, number];

export function spriteCorners(layout: SpriteLayout, spriteAspect: number): [Vec3, Vec3, Vec3, Vec3] {
  const m = spriteMatrix(layout, spriteAspect);
  return [
    transformPoint(m, [-0.5, -0.5, 0]),
    transformPoint(m, [0.5, -0.5, 0]),
    transformPoint(m, [0.5, 0.5, 0]),
    transformPoint(m, [-0.5, 0.5, 0]),
  ];
}

export interface CameraParams {
  fovDeg: number;
  near: number;
  far: number;
  aspect: number;
}

/**
 * Parâmetros da câmera de perspectiva a partir da matriz de projeção do MindAR (`controller.getProjectionMatrix()`),
 * para o vídeo exibido em "cover" dentro do contêiner. Mesma conta do `MindARThree.resize` (MIT, hiukim/mind-ar-js).
 */
export function cameraParamsFromProjection(
  proj: ArrayLike<number>,
  inputWidth: number,
  inputHeight: number,
  containerWidth: number,
  containerHeight: number,
): CameraParams {
  const containerRatio = containerWidth / containerHeight;
  const inputRatio = inputWidth / inputHeight;
  const videoDisplayHeight = inputRatio > containerRatio ? containerHeight : (containerWidth / inputWidth) * inputHeight;
  const fovAdjust = containerHeight / videoDisplayHeight;
  return {
    fovDeg: ((2 * Math.atan((1 / proj[5]!) * fovAdjust)) * 180) / Math.PI,
    near: proj[14]! / (proj[10]! - 1.0),
    far: proj[14]! / (proj[10]! + 1.0),
    aspect: containerRatio,
  };
}
