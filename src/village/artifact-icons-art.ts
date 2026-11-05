import type { SurvivorArtifactKind } from '../core/survivor-types';

/**
 * Ícones em pixel art dos artefatos que caem no chão da Torre. Cada um é um mapa de 16×16 letras, fácil de retocar à mão:
 * o ponto é vazio e as outras letras apontam para a paleta do ícone.
 */

export const ICON_SIZE = 16;

const OUTLINE = 0x272d47;

const BOLT = [
  '.........kkkk...',
  '........kYYYk...',
  '.......kYWYk....',
  '......kYWYk.....',
  '.....kYYYk......',
  '....kYYYkkkkk...',
  '...kYWYYYYYYk...',
  '...kkkkkYYYk....',
  '......kYYYk.....',
  '.....kYYyk......',
  '....kYYyk.......',
  '...kYYyk........',
  '...kYyk.........',
  '...kyk..........',
  '...kk...........',
  '................',
] as const;

const GEM = [
  '................',
  '....kkkkkkkk....',
  '...kWLkOOkOok...',
  '..kWLLkOOkOOok..',
  '.kLLLkOOOOkOOok.',
  'kkkkkkkkkkkkkkkk',
  'kLLLkOOOOOOkoook',
  '.kLLLkOOOOkoook.',
  '..kLLkOOOOkook..',
  '...kLkOOOOkok...',
  '....kLkOOkok....',
  '.....kLOOok.....',
  '......kOOk......',
  '.......kk.......',
  '................',
  '................',
] as const;

const HEART = [
  '................',
  '..kkkk....kkkk..',
  '.kPPPPk..kPPPPk.',
  'kPWWPPPkkPPPPpPk',
  'kPWPPPPPPPPPPPpk',
  'kPPPPPPPPPPPPppk',
  '.kPPPPPPPPPPppk.',
  '..kPPPPPPPPppk..',
  '...kPPPPPPppk...',
  '....kPPPPppk....',
  '.....kPPppk.....',
  '......kPpk......',
  '.......kk.......',
  '................',
  '................',
  '................',
] as const;

const MAGNET = [
  '................',
  '....kkkkkkkk....',
  '...kRRRRRRRRk...',
  '..kRWRRRRRRrrk..',
  '..kRWRkkkkRrrk..',
  '..kRRRk..kRrrk..',
  '..kRRRk..kRrrk..',
  '..kRRRk..kRrrk..',
  '..kRRRk..kRrrk..',
  '..kkkkk..kkkkk..',
  '..kSSWk..kSSsk..',
  '..kSSWk..kSSsk..',
  '..kSSsk..kSSsk..',
  '..kkkkk..kkkkk..',
  '................',
  '................',
] as const;

const LENS = [
  '................',
  '.....kkkkkk.....',
  '...kkGGGGGGkk...',
  '..kGGkkkkkkGGk..',
  '..kGkWBBBBBkGk..',
  '.kGkWBBkkBBBkGk.',
  '.kGkBBkRRkBBkGk.',
  '.kGkBBkRRkBBkGk.',
  '.kGkBBBkkBBBkGk.',
  '..kGkBBBBBBkGk..',
  '..kGGkkkkkkGGk..',
  '...kkGGGGGGkk...',
  '.....kkkkkk.....',
  '................',
  '................',
  '................',
] as const;

const BALL = [
  '.....kkkkkk.....',
  '...kkTTTTTTkk...',
  '..kTWWTTTTTTtk..',
  '.kTWTTTTTTTTTtk.',
  '.kTTTTTTTTTTTtk.',
  'kTTTTTkkkkTTTTtk',
  'kTTTTkWWWWkTTTtk',
  'kkkkkkWkkWkkkkkk',
  'kWWWWkWWWWkWWWsk',
  'kWWWWWkkkkWWWWsk',
  '.kWWWWWWWWWWWsk.',
  '.kWWWWWWWWWWssk.',
  '..kWWWWWWWWssk..',
  '...kkWWWWsskk...',
  '.....kkkkkk.....',
  '................',
] as const;

interface IconArt {
  rows: readonly string[];
  palette: Readonly<Record<string, number>>;
  /** Cor do halo no chão e da marca ao pegar. */
  color: string;
}

export const ARTIFACT_ICONS: Record<SurvivorArtifactKind, IconArt> = {
  speed: { rows: BOLT, palette: { Y: 0xffe04a, y: 0xe8a820, W: 0xfffbe0 }, color: '#7bdcff' },
  power: { rows: GEM, palette: { O: 0xff9a3c, o: 0xc85a24, L: 0xffc880, W: 0xfff4dc }, color: '#ffb35c' },
  heal: { rows: HEART, palette: { P: 0xff6a9c, p: 0xc83c74, W: 0xffe4ee }, color: '#ff8fbb' },
  magnet: { rows: MAGNET, palette: { R: 0xe84848, r: 0xa82c3c, W: 0xffb4a8, S: 0xd8e0ec, s: 0x98a4b8 }, color: '#d68cff' },
  focus: { rows: LENS, palette: { G: 0xf4c848, B: 0x8cd8f8, W: 0xf0fcff, R: 0xe84848 }, color: '#ffe071' },
  pokeball: { rows: BALL, palette: { T: 0xef4b57, t: 0xb02c44, W: 0xfcf8ec, s: 0xc8c4bc }, color: '#ff5b5b' },
  'shadow-ball': { rows: BALL, palette: { T: 0x6a2c94, t: 0x431a68, W: 0xe4d4f4, s: 0xa890c4 }, color: '#a66bff' },
};

/** Pixels RGBA do ícone. */
export function paintArtifactIcon(kind: SurvivorArtifactKind): Uint8ClampedArray {
  const { rows, palette } = ARTIFACT_ICONS[kind];
  const data = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < ICON_SIZE; x++) {
      const letter = row[x] ?? '.';
      if (letter === '.') continue;
      const rgb = letter === 'k' ? OUTLINE : (palette[letter] ?? OUTLINE);
      const i = (y * ICON_SIZE + x) * 4;
      data[i] = (rgb >> 16) & 255;
      data[i + 1] = (rgb >> 8) & 255;
      data[i + 2] = rgb & 255;
      data[i + 3] = 255;
    }
  });
  return data;
}

const canvases = new Map<SurvivorArtifactKind, HTMLCanvasElement | null>();

/** Ícone pronto para copiar no canvas do jogo; pintado uma vez só. */
export function artifactIcon(kind: SurvivorArtifactKind): HTMLCanvasElement | null {
  if (canvases.has(kind)) return canvases.get(kind) ?? null;
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const c = canvas.getContext('2d');
  if (c) c.putImageData(new ImageData(paintArtifactIcon(kind), ICON_SIZE, ICON_SIZE), 0, 0);
  const ready = c ? canvas : null;
  canvases.set(kind, ready);
  return ready;
}

/** Copia o ícone centrado em (x, y), sem suavizar os pixels. */
export function drawArtifactIcon(c: CanvasRenderingContext2D, kind: SurvivorArtifactKind, x: number, y: number, size: number): void {
  const icon = artifactIcon(kind);
  if (!icon) return;
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  c.drawImage(icon, x - size / 2, y - size / 2, size, size);
  c.imageSmoothingEnabled = smooth;
}

/** Endereço do ícone para o aviso em HTML. Sem canvas, volta vazio. */
export function artifactIconUrl(kind: SurvivorArtifactKind): string {
  try {
    return artifactIcon(kind)?.toDataURL('image/png') ?? '';
  } catch {
    return '';
  }
}
