import type { Building, BuildingKind, WorksiteId } from '../core/village/town-layout';
import type { CommunityActivityRecord } from '../core/village/community';
import type { ContentBounds } from './local-sprite';
import type { DecodedGif } from '../core/gif';
import type { Dir } from '../core/village/actors';
import type { FurnitureId } from '../core/village/life';
import type { Fx } from '../core/village/social-state';
import type { PixelBuf } from '../box/ground-art';
import type { Tile } from '../core/village/map';
import { paintArcade, paintCafe, paintMail, paintMuseum, paintPins, paintTorre } from './town-art';

/**
 * Tipos, constantes e auxiliares puros do jogo da Vila (movidos de `village-game.ts` sem mudar o texto, em 2026-10-23).
 * `village-game.ts` reexporta os tipos públicos (`VillageMon`, `Target`, `SceneLine`).
 */

export const COMMUNITY_ACTIVITY_NAMES: Readonly<Record<CommunityActivityRecord['activity'], string>> = {
  agricultura: 'agricultura', pesca: 'pesca', mineracao: 'mineração', madeireira: 'madeireira', culinaria: 'culinária', manutencao: 'manutenção', construcao: 'construção',
  transporte: 'transporte', exploracao: 'exploração', pesquisa: 'pesquisa', jardinagem: 'jardinagem', vigilancia: 'vigilância',
  comercio: 'comércio', protecao: 'proteção', conservacao: 'conservação', reciclagem: 'reciclagem', acolhimento: 'acolhimento',
  brincadeira: 'brincadeira', descanso: 'descanso',
};

/** Quanto tempo segurando contra um Pokémon parado até trocar de lugar com ele. */
export const SWAP_AFTER_MS = 450;
/** Quanto tempo um seguidor trava até aparecer ao seu lado. */
export const LAG_LIMIT_S = 4;

export interface VillageMon {
  id: string;
  name: string;
  shiny: boolean;
  /** GIF decodificado (ou imagem parada como GIF de 1 quadro). Pose "de frente" (down), usada quando `dirGifs` falta uma direção. */
  gif: DecodedGif;
  /**
   * As 4 poses cardeais do pacote de sprites locais (quando a espécie está nele), pra virar de verdade conforme o
   * último passo em vez do espelhamento falso que os GIFs de rede usam (ver `getLocalVillageSpriteDirs`). Mesmas
   * dimensões e tempos de quadro que `gif` em todas as direções (a folha de origem garante isso).
   */
  dirGifs?: Partial<Record<Dir, DecodedGif>>;
  /** Digital Pokémon (não vem de carta física): ganha o acabamento metálico leve (ver `core/metallic.ts`). */
  digital?: boolean;
  /** Número da Pokédex: dá o tamanho pela altura real da espécie (`core/size-scale.ts`). */
  dexId?: number;
}

export type Target =
  | { kind: 'mon'; id: string }
  | { kind: 'furniture'; x: number; y: number; item: FurnitureId }
  | { kind: 'leisure'; id: string }
  | { kind: 'plot' }
  | { kind: 'crop'; x: number; y: number }
  | { kind: 'shop' }
  | { kind: 'bell' }
  | { kind: 'seed-box' }
  | { kind: 'worksite'; site: WorksiteId }
  | { kind: 'board' }
  | { kind: 'building'; building: Building }
  | { kind: 'tile'; x: number; y: number; tile: Tile }
  | { kind: 'nothing' };

export interface SceneLine {
  /** Posição no elenco (índice em `cast`). */
  who: number;
  text: string;
  fx?: Fx;
}

export function toCanvas(buf: { w: number; h: number; data: Uint8Array | Uint8ClampedArray }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = buf.w;
  c.height = buf.h;
  const ctx = c.getContext('2d')!;
  const image = ctx.createImageData(buf.w, buf.h);
  image.data.set(buf.data);
  ctx.putImageData(image, 0, 0);
  return c;
}

/** Quadros do GIF como canvases; `tint` (opcional) transforma os pixels antes, ex.: a tinta metálica. */
export function framesOf(gif: DecodedGif, tint?: (rgba: Uint8ClampedArray) => ArrayLike<number>): HTMLCanvasElement[] {
  return gif.frames.map((f) => {
    const data = tint ? Uint8Array.from(tint(f.rgba)) : new Uint8Array(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength);
    return toCanvas({ w: gif.width, h: gif.height, data });
  });
}

export function dirFramesOf(dirGifs: Partial<Record<Dir, DecodedGif>> | undefined, tint?: (rgba: Uint8ClampedArray) => ArrayLike<number>): Partial<Record<Dir, HTMLCanvasElement[]>> | undefined {
  if (!dirGifs) return undefined;
  const out: Partial<Record<Dir, HTMLCanvasElement[]>> = {};
  for (const dir of ['up', 'down', 'left', 'right'] as const) {
    const g = dirGifs[dir];
    if (g) out[dir] = framesOf(g, tint);
  }
  return out;
}

export interface MonSprite {
  frames: HTMLCanvasElement[];
  gif: DecodedGif;
  /** Quadros por direção (pacote de sprites locais); mesmos índices/tempos de `gif`, só troca a imagem. */
  dirFrames?: Partial<Record<Dir, HTMLCanvasElement[]>>;
  dirGifs?: Partial<Record<Dir, DecodedGif>>;
  /** Altura desenhada do bicho em si (sem a margem transparente da folha), em blocos. */
  heightTiles: number;
  /** Caixa dos pixels opacos do quadro (ver `contentBounds`): ancora os pés no chão e mede o tamanho real,
   * ignorando a margem transparente — sem isso, espécies com folhas de margem diferente (comum entre o pacote
   * de sprite local e o GIF do Showdown) pareciam ter tamanhos inconsistentes e os pés flutuavam sobre o chão. */
  bounds: ContentBounds;
  /** Topo da cabeça no 1º quadro (0 a 1 da altura) e o centro dela (0 a 1 da largura): onde vai o acessório. */
  headTop: number;
  /** Digital Pokémon: desenhado com a tinta metálica (quadros feitos só na 1ª vez que aparecem com a opção ligada). */
  digital: boolean;
  metal?: { frames: HTMLCanvasElement[]; dirFrames?: Partial<Record<Dir, HTMLCanvasElement[]>> };
  headX: number;
}

/** Acessórios que vão na cabeça (os outros: rosto, pescoço, costas) vêm de `pos` no catálogo. */
export const PLAYER_H = 24;

export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

/** Partículas no mundo (em blocos): poeira, folhas, fumaça, emojis flutuando. */
export interface Particle {
  kind: 'dust' | 'leaf' | 'smoke' | 'emoji' | 'poof';
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  emoji?: string;
  color?: string;
}

export interface Scene {
  cast: string[];
  lines: SceneLine[];
  idx: number;
  /** 'gather' = andando até o outro; 'talk' = falas; 'end' = pausa final. */
  phase: 'gather' | 'talk' | 'end';
  until: number;
  startedAt: number;
  done: () => void;
}

export function headOf(gif: DecodedGif): { top: number; x: number } {
  const f = gif.frames[0];
  if (!f) return { top: 0, x: 0.5 };
  for (let y = 0; y < gif.height; y++) {
    let sum = 0;
    let n = 0;
    for (let x = 0; x < gif.width; x++) {
      if ((f.rgba[(y * gif.width + x) * 4 + 3] ?? 0) > 0) {
        sum += x;
        n++;
      }
    }
    if (n > 0) return { top: y / gif.height, x: sum / n / gif.width };
  }
  return { top: 0, x: 0.5 };
}

export const hashN = (n: number): number => {
  let h = Math.imul(n ^ 0x9e3779b9, 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 3266489917) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/** Sino da praça: quanto tempo o chamado vale e a partir de que distância o Pokémon "chega correndo" (puf no caminho). */
export const BELL_MS = 40_000;
export const BELL_FAR = 18;

export const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** O desenho e o emoji sobre a porta de cada prédio da praça. */
export const CIVIC_ART: Partial<Record<BuildingKind, () => PixelBuf>> = { cafe: paintCafe, mail: paintMail, museum: paintMuseum, arcade: paintArcade, pins: paintPins, torre: paintTorre };
export const atlasOpaqueBottoms = new WeakMap<HTMLCanvasElement, number>();
/** Com o atlas: o desenho de cada prédio (recortes de tileset, ver `atlas-spec.ts`). */
export const CIVIC_TILESET: Partial<Record<BuildingKind, string>> = { cafe: 'cabin', mail: 'home-orange', museum: 'manor', arcade: 'center-blue', pins: 'home-teal', torre: 'tower' };
/** Com o atlas: a casa de cada estágio (Cabana, Casa de madeira, Casa de tijolos, Sobrado — `HOME_STAGES`). */
/** As que pegam a cor escolhida (o desenho tem partes coloridas para tingir). */
export const CIVIC_EMOJI: Partial<Record<BuildingKind, string>> = { cafe: '☕', mail: '📬', museum: '🏛️', arcade: '🕹️', pins: '🎳', arena: '🏟️', torre: '🗼', dojo: '🥋', altar: '💠' };
