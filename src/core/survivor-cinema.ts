/**
 * Luz cinematográfica da Torre: quanto a noite pesa conforme a corrida avança. A luz em si vem dos golpes e dos chefões. Lógica pura; o desenho fica em
 * `village/survivor-cinema-art.ts`. Aos 20 minutos de progresso a intensidade chega ao máximo e a noite vira vermelho-sangue.
 * Os limites por quadro (`glows`, `shadows`) seguram o custo: nada aqui cresce com o número de inimigos.
 */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Maior passo do motor. Acima disso um tiro rápido atravessa o inimigo sem encostar, e o Ritmo acelerado dobra o passo. */
export const MAX_SIM_STEP_MS = 34;

/** Quantos passos iguais cobrem `dtMs` sem passar de `MAX_SIM_STEP_MS`: celular lento não pode mudar as colisões. */
export function simulationSteps(dtMs: number): { count: number; stepMs: number } {
  const count = Math.max(1, Math.ceil(dtMs / MAX_SIM_STEP_MS));
  return { count, stepMs: dtMs / count };
}

/** Câmera de cinema: zoom curto, tremor, câmera lenta, linhas de velocidade, clarão e letreiro. Só apresentação: nada aqui muda o motor. */
export interface CinemaBeat {
  slowMs?: number;
  slowScale?: number;
  zoom?: number;
  zoomMs?: number;
  shake?: number;
  shakeMs?: number;
  flash?: number;
  flashMs?: number;
  flashColor?: string;
  lines?: number;
  linesMs?: number;
  /** Quadro de impacto: a tela inverte por este tempo, como o quadro em negativo do golpe final num anime. */
  inkMs?: number;
}

/** Teto da câmera lenta: o toque nunca fica mais que um instante em ritmo reduzido. */
export const CINEMA_MAX_SLOW_MS = 650;
export const CINEMA_MIN_TIME_SCALE = 0.25;
/** Depois de uma câmera lenta, a próxima espera este tempo: chefes caindo em fila não viram um filme em câmera lenta. */
export const CINEMA_SLOW_GUARD_MS = 1500;

export const CINEMA_BEATS = {
  supremeCharge: { slowMs: 420, slowScale: 0.3, zoom: 0.1, zoomMs: 560, lines: 0.8, linesMs: 460 },
  supremeRelease: { slowMs: 120, slowScale: 0.55, zoom: 0.16, zoomMs: 430, shake: 9, shakeMs: 380, flash: 0.62, flashMs: 240, flashColor: '#ffffff', lines: 1, linesMs: 320, inkMs: 70 },
  bossDown: { slowMs: 520, slowScale: 0.35, zoom: 0.12, zoomMs: 620, shake: 5, shakeMs: 300, flash: 0.32, flashMs: 200, flashColor: '#fff3c9', inkMs: 50 },
  bossEntrance: { zoom: 0.05, zoomMs: 520, shake: 3, shakeMs: 260, lines: 0.35, linesMs: 300 },
  chargeFull: { zoom: 0.06, zoomMs: 240, shake: 3, shakeMs: 200, lines: 0.55, linesMs: 210 },
  evolve: { zoom: 0.14, zoomMs: 1100, flash: 0.5, flashMs: 420, flashColor: '#e8fbff', lines: 0.6, linesMs: 900 },
  victory: { zoom: 0.1, zoomMs: 1100, flash: 0.45, flashMs: 500, flashColor: '#ffe9a8' },
  defeat: { zoom: 0.08, zoomMs: 1200, shake: 7, shakeMs: 420, flash: 0.5, flashMs: 700, flashColor: '#8c1420' },
} as const satisfies Record<string, CinemaBeat>;

export interface CinemaBanner {
  kicker: string;
  title: string;
  color: string;
  leftMs: number;
  totalMs: number;
  /** Com o retrato do Pokémon entrando junto. */
  portrait: boolean;
}

export interface CinemaFrame { zoom: number; shakeX: number; shakeY: number; flash: number; flashColor: string; lines: number; ink: boolean }

export interface CinemaCamera {
  slowMs: number;
  slowScale: number;
  guardMs: number;
  zoom: number; zoomMs: number; zoomTotal: number;
  shake: number; shakeMs: number; shakeTotal: number;
  flash: number; flashMs: number; flashTotal: number; flashColor: string;
  lines: number; linesMs: number; linesTotal: number;
  inkMs: number;
  banner: CinemaBanner | null;
  frame: CinemaFrame;
}

export function createCinemaCamera(): CinemaCamera {
  return { slowMs: 0, slowScale: 1, guardMs: 0, zoom: 0, zoomMs: 0, zoomTotal: 1, shake: 0, shakeMs: 0, shakeTotal: 1, flash: 0, flashMs: 0, flashTotal: 1, flashColor: '#ffffff', lines: 0, linesMs: 0, linesTotal: 1, inkMs: 0, banner: null, frame: { zoom: 0, shakeX: 0, shakeY: 0, flash: 0, flashColor: '#ffffff', lines: 0, ink: false } };
}

export function triggerCinema(cam: CinemaCamera, beat: CinemaBeat): void {
  if (beat.slowMs && (cam.guardMs <= 0 || cam.slowMs > 0)) {
    cam.slowMs = Math.min(CINEMA_MAX_SLOW_MS, Math.max(cam.slowMs, beat.slowMs));
    cam.slowScale = Math.max(CINEMA_MIN_TIME_SCALE, Math.min(cam.slowMs > 0 && cam.slowScale < 1 ? cam.slowScale : 1, beat.slowScale ?? 0.5));
  }
  if (beat.zoom && beat.zoom * (beat.zoomMs ?? 1) >= cam.zoom * cam.zoomMs) { cam.zoom = beat.zoom; cam.zoomMs = cam.zoomTotal = beat.zoomMs ?? 300; }
  if (beat.shake && beat.shake >= cam.shake * (cam.shakeMs / cam.shakeTotal)) { cam.shake = beat.shake; cam.shakeMs = cam.shakeTotal = beat.shakeMs ?? 240; }
  if (beat.flash && beat.flash >= cam.flash * (cam.flashMs / cam.flashTotal)) { cam.flash = beat.flash; cam.flashMs = cam.flashTotal = beat.flashMs ?? 200; cam.flashColor = beat.flashColor ?? '#ffffff'; }
  if (beat.lines && beat.lines >= cam.lines * (cam.linesMs / cam.linesTotal)) { cam.lines = beat.lines; cam.linesMs = cam.linesTotal = beat.linesMs ?? 300; }
  if (beat.inkMs) cam.inkMs = Math.max(cam.inkMs, beat.inkMs);
}

export function showCinemaBanner(cam: CinemaCamera, banner: Omit<CinemaBanner, 'leftMs' | 'totalMs'>, ms: number): void {
  cam.banner = { ...banner, leftMs: ms, totalMs: ms };
}

export function resetCinema(cam: CinemaCamera): void {
  Object.assign(cam, createCinemaCamera());
}

export function stepCinema(cam: CinemaCamera, dtMs: number): void {
  if (cam.slowMs > 0) {
    cam.slowMs = Math.max(0, cam.slowMs - dtMs);
    if (cam.slowMs === 0) { cam.slowScale = 1; cam.guardMs = CINEMA_SLOW_GUARD_MS; }
  } else if (cam.guardMs > 0) cam.guardMs = Math.max(0, cam.guardMs - dtMs);
  cam.zoomMs = Math.max(0, cam.zoomMs - dtMs);
  cam.shakeMs = Math.max(0, cam.shakeMs - dtMs);
  cam.flashMs = Math.max(0, cam.flashMs - dtMs);
  cam.linesMs = Math.max(0, cam.linesMs - dtMs);
  cam.inkMs = Math.max(0, cam.inkMs - dtMs);
  if (cam.banner) {
    cam.banner.leftMs -= dtMs;
    if (cam.banner.leftMs <= 0) cam.banner = null;
  }
}

/** Escala de tempo do motor neste quadro (1 = normal). */
export function cinemaTimeScale(cam: CinemaCamera): number {
  return cam.slowMs > 0 ? Math.max(CINEMA_MIN_TIME_SCALE, cam.slowScale) : 1;
}

/** Como a câmera está agora. Reaproveita o mesmo objeto a cada quadro. */
export function cinemaFrame(cam: CinemaCamera, timeMs: number): CinemaFrame {
  const f = cam.frame;
  const zoomLeft = cam.zoomMs / cam.zoomTotal;
  // Sobe rápido e volta devagar: o "soco" de câmera.
  f.zoom = cam.zoomMs > 0 ? cam.zoom * Math.min(1, (1 - zoomLeft) / 0.2) * Math.min(1, zoomLeft * 1.6) : 0;
  const shake = cam.shakeMs > 0 ? cam.shake * (cam.shakeMs / cam.shakeTotal) : 0;
  f.shakeX = shake * Math.sin(timeMs * 0.071);
  f.shakeY = shake * Math.cos(timeMs * 0.057);
  f.flash = cam.flashMs > 0 ? cam.flash * (cam.flashMs / cam.flashTotal) : 0;
  f.flashColor = cam.flashColor;
  f.lines = cam.linesMs > 0 ? cam.lines * Math.min(1, (cam.linesMs / cam.linesTotal) * 1.4) : 0;
  f.ink = cam.inkMs > 0;
  return f;
}

/** A apresentação de treinador só devolve o jogo se nada mais estiver pedindo a pausa. */
export function presentationMayResume(blockers: { leaveConfirm: boolean; summary: boolean; typeAffinityOffer: boolean }): boolean {
  return !blockers.leaveConfirm && !blockers.summary && !blockers.typeAffinityOffer;
}

const FINALE_MS = 20 * 60_000;
const LEVEL_CAP = 40;

export interface CinemaInput {
  /** Tempo de corrida já na escala normal (`survivorProgressMs`). */
  progressMs: number;
  level: number;
  /** Chefão, treinador ou lendário em campo: a cena pesa um pouco mais. */
  bossOnField: boolean;
}

/** Intensidade de 0 a 1: o tempo manda, o nível ajuda. */
export function cinemaPower({ progressMs, level, bossOnField }: CinemaInput): number {
  const time = clamp01(progressMs / FINALE_MS);
  const growth = clamp01((level - 1) / LEVEL_CAP);
  return clamp01(0.72 * time + 0.28 * growth + (bossOnField ? 0.08 : 0));
}

export interface CinemaLook {
  /** Opacidade da noite: é igual na tela toda, e só os golpes a abrem. */
  dark: number;
  /** Cor da noite: azul no começo, vermelho-sangue no fim. */
  tint: readonly [number, number, number];
  /** Brilhos desenhados por quadro. */
  glows: number;
  /** Sombras projetadas por quadro e comprimento máximo delas, quando há um clarão por perto. */
  shadows: number;
  shadowLength: number;
  /** A reta final: a escuridão pulsa. */
  finale: boolean;
}

const NIGHT: readonly [number, number, number] = [8, 14, 42];
const BLOOD: readonly [number, number, number] = [46, 4, 14];

/** O visual para esta intensidade. `lite` corta os limites quando o aparelho está sofrendo. */
export function cinemaLook(power: number, lite: boolean): CinemaLook {
  const p = clamp01(power);
  const budget = lite ? 0.5 : 1;
  const blood = clamp01((p - 0.5) / 0.5);
  return {
    dark: 0.1 + 0.42 * p,
    tint: [
      Math.round(NIGHT[0] + (BLOOD[0] - NIGHT[0]) * blood),
      Math.round(NIGHT[1] + (BLOOD[1] - NIGHT[1]) * blood),
      Math.round(NIGHT[2] + (BLOOD[2] - NIGHT[2]) * blood),
    ],
    glows: Math.round((10 + 26 * p) * budget),
    shadows: Math.round((12 + 28 * p) * budget),
    shadowLength: 14 + 30 * p,
    finale: p >= 0.92,
  };
}
