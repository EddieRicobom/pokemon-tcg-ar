import type { Rng } from '../core/battle';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import { drawPos, facing, makeWalker, moving, stepVillager, swapPlaces, tryStep, advance } from '../core/village/actors';
import type { Dir, Walker } from '../core/village/actors';
import { itemDef } from '../core/village/catalog';
import { cropAt, daylight, friendOf, isPlaced, needsWater } from '../core/village/life';
import type { FurnitureId, VillageState } from '../core/village/life';
import { homeDecor, homeLevel, homeOf, isAsleep, ROOFS, roofIndex } from '../core/village/town';
import type { Building, BuildingKind } from '../core/village/town-layout';
import { buildingAt, findFree, isSolidTile, isWalkable, tileAt } from '../core/village/map';
import { pathStep } from '../core/village/pathing';
import type { Tile, VillageMap } from '../core/village/map';
import { FX_EMOJI } from '../core/village/social-state';
import type { Fx } from '../core/village/social-state';
import { metallicTint, sheenAt, sheenOffset } from '../core/metallic';
import { speciesTiles } from '../core/size-scale';
import { villageScale } from '../core/village/camera';
import { stepOrder } from '../core/village/joystick';
import type { StickDirs } from '../core/village/joystick';
import { createWeather, stepWeather, WEATHER_KINDS } from '../core/weather';
import type { WeatherKind, WeatherMode, WeatherState } from '../core/weather';
import { EDGE } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { contentBounds } from './local-sprite';
import type { ContentBounds } from './local-sprite';
import { outfitFor, paintBell, paintBush, paintHouse, paintPlayer, paintRock, paintShop, paintTile, paintTree, TILE } from './village-art';
import type { GroundTileImage } from './village-art';
import { paintAccessory, paintCrop, paintFurnitureItem } from './item-art';
import { groundPieces } from './ground-tiles';
import { double, recolor, VillaAtlas, windowGlow } from './tileset-art';
import type { Rgba } from './tileset-art';
import { HOME_LANTERN, HOME_WINDOWS, paintArcade, paintArena, paintCafe, paintFountain, paintHome, paintLamp, paintLot, paintMail, paintMuseum, paintPins, paintTorre } from './town-art';

/**
 * O jogo da Vila no navegador: canvas 2D em escala inteira (pixels nítidos), câmera que segue você, profundidade por
 * linha (quem está mais embaixo fica na frente), dia e noite pelo relógio, clima (chuva, neve, nuvens), lampiões e janelas
 * acesas à noite, sombras, árvores ao vento, fumaça da chaminé, partículas, balões de emoji e os balões de fala dos
 * momentos entre os Pokémon. A lógica (andar, coletar, amizade, momentos) é a de `core/village`; aqui é só cola com o navegador.
 */

/** Quanto tempo segurando contra um Pokémon parado até trocar de lugar com ele. */
const SWAP_AFTER_MS = 450;
/** Quanto tempo um seguidor trava até aparecer ao seu lado. */
const LAG_LIMIT_S = 4;

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
  | { kind: 'plot' }
  | { kind: 'crop'; x: number; y: number }
  | { kind: 'shop' }
  | { kind: 'bell' }
  | { kind: 'building'; building: Building }
  | { kind: 'tile'; x: number; y: number; tile: Tile }
  | { kind: 'nothing' };

export interface SceneLine {
  /** Posição no elenco (índice em `cast`). */
  who: number;
  text: string;
  fx?: Fx;
}

function toCanvas(buf: { w: number; h: number; data: Uint8Array | Uint8ClampedArray }): HTMLCanvasElement {
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
function framesOf(gif: DecodedGif, tint?: (rgba: Uint8ClampedArray) => ArrayLike<number>): HTMLCanvasElement[] {
  return gif.frames.map((f) => {
    const data = tint ? Uint8Array.from(tint(f.rgba)) : new Uint8Array(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength);
    return toCanvas({ w: gif.width, h: gif.height, data });
  });
}

function dirFramesOf(dirGifs: Partial<Record<Dir, DecodedGif>> | undefined, tint?: (rgba: Uint8ClampedArray) => ArrayLike<number>): Partial<Record<Dir, HTMLCanvasElement[]>> | undefined {
  if (!dirGifs) return undefined;
  const out: Partial<Record<Dir, HTMLCanvasElement[]>> = {};
  for (const dir of ['up', 'down', 'left', 'right'] as const) {
    const g = dirGifs[dir];
    if (g) out[dir] = framesOf(g, tint);
  }
  return out;
}

interface MonSprite {
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
const PLAYER_H = 24;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

/** Partículas no mundo (em blocos): poeira, folhas, fumaça, emojis flutuando. */
interface Particle {
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

interface Scene {
  cast: string[];
  lines: SceneLine[];
  idx: number;
  /** 'gather' = andando até o outro; 'talk' = falas; 'end' = pausa final. */
  phase: 'gather' | 'talk' | 'end';
  until: number;
  startedAt: number;
  done: () => void;
}

function headOf(gif: DecodedGif): { top: number; x: number } {
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

const hashN = (n: number): number => {
  let h = Math.imul(n ^ 0x9e3779b9, 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 3266489917) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/** Sino da praça: quanto tempo o chamado vale e a partir de que distância o Pokémon "chega correndo" (puf no caminho). */
const BELL_MS = 40_000;
const BELL_FAR = 18;

const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** O desenho e o emoji sobre a porta de cada prédio da praça. */
const CIVIC_ART: Partial<Record<BuildingKind, () => PixelBuf>> = { cafe: paintCafe, mail: paintMail, museum: paintMuseum, arcade: paintArcade, pins: paintPins, arena: paintArena, torre: paintTorre };
const atlasOpaqueBottoms = new WeakMap<HTMLCanvasElement, number>();
/** Com o atlas: o desenho de cada prédio (recortes de tileset, ver `atlas-spec.ts`). */
const CIVIC_TILESET: Partial<Record<BuildingKind, string>> = { cafe: 'cabin', mail: 'kiosk-red', museum: 'manor', arcade: 'center-blue', pins: 'kiosk-blue', arena: 'center-red', torre: 'tower' };
/** Com o atlas: a casa de cada estágio (Cabana, Casa de madeira, Casa de tijolos, Sobrado — `HOME_STAGES`). */
const HOME_TILESET = ['gazebo', 'barn', 'house-brick', 'home-yellow'] as const;
/** As que pegam a cor escolhida (o desenho tem partes coloridas para tingir). */
const HOME_TINTED = new Set<string>(['barn', 'home-yellow']);
/** Prédios cujo desenho do tileset é pequeno demais para a escala da Vila: desenhados em 2× (pixel inteiro, sem borrar). */
const CIVIC_DOUBLE = new Set<string>(['kiosk-red', 'kiosk-blue']);
const CIVIC_EMOJI: Partial<Record<BuildingKind, string>> = { cafe: '☕', mail: '📬', museum: '🏛️', arcade: '🕹️', pins: '🎳', arena: '⚔️', torre: '🗼' };

export class VillageGame {
  readonly player: Walker;
  readonly villagers = new Map<string, Walker>();
  private readonly monSprites = new Map<string, MonSprite>();
  private readonly names = new Map<string, string>();
  private readonly ctx: CanvasRenderingContext2D;
  private groundFrames: HTMLCanvasElement[] = [];
  /** Recortes de tileset (null: sem a imagem, cai no desenho por código de sempre). */
  private readonly atlas: VillaAtlas | null;
  /** Sprite oficial do treinador escolhido; null mantém o avatar pixel-art de fallback. */
  private trainerAvatar: HTMLCanvasElement | null = null;
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private running = false;
  private handle = 0;
  private last = 0;
  private held: Dir | null = null;
  /** Sino da praça: para onde cada Pokémon chamado está indo, e até quando o chamado vale. */
  private readonly called = new Map<string, { x: number; y: number }>();
  private calledUntil = 0;
  /** Toque na tela: o bloco aonde você está indo a pé (o caminho contorna o que estiver no meio). */
  private goal: { x: number; y: number } | null = null;
  /** A câmera do último quadro, para converter um toque na tela em bloco do mapa. */
  private view = { camX: 0, camY: 0 };
  private stick: Pick<StickDirs, 'primary' | 'secondary'> | null = null;
  private stepParity = 0;
  private scale = 3;
  private arZoom = 1;
  private arLook = { x: 0, y: 0 };
  private arVideo: HTMLVideoElement | null = null;
  private bubbles = new Map<string, { emoji: string; until: number }>();
  private speech = new Map<string, { text: string; name: string; start: number; until: number; tint: string }>();
  private bounce = new Map<string, number>();
  /** Borboletas (dia) e vagalumes (noite), em blocos. */
  private readonly motes: Mote[] = [];
  private readonly particles: Particle[] = [];
  private lastGreet = 0;
  private nextEmote = 0;
  private nextLeaf = 0;
  private nextSmoke = 0;
  private scene: Scene | null = null;
  private weather: WeatherState;
  private bobber: { x: number; y: number; until: number } | null = null;
  /** Nível de Treinador (libera terrenos e prédios) e quem mora em qual terreno. */
  private townLevel = 1;
  private homes: ReadonlyMap<string, number> = new Map();
  /** Centro de passeio de cada morador, espalhado pela cidade em vez de todos ficarem na praça. */
  private villagerZones = new Map<string, { x: number; y: number }>();
  /** Quem está dormindo em casa agora: some do mapa até acordar. */
  private readonly asleep = new Set<string>();
  /** Quem foi acordado batendo na porta fica de pé até este instante (relógio de `Date.now()`), mesmo em hora de dormir. */
  private readonly stayUp = new Map<string, number>();
  /** Há quanto tempo (s) quem te segue está longe ou sem conseguir andar; passou do limite, ele aparece ao seu lado. */
  private readonly lag = new Map<string, number>();
  /** Há quanto tempo (ms) você empurra o botão contra um Pokémon parado; passou do limite, vocês trocam de lugar. */
  private pushMs = 0;
  /** Avisos sobre o telhado de uma casa (por terreno), como o 😴 de quem não quer abrir a porta. */
  private readonly houseTags = new Map<number, { emoji: string; until: number }>();
  private nextSleepCheck = 0;
  /** Quem está esperando você para conversar (o ❗): fica parado onde está. */
  private waiting: string | null = null;
  /** Bloco que foi coletado hoje (o arbusto perde as frutas). */
  harvestedToday: (x: number, y: number) => boolean = () => false;
  onStep: (() => void) | null = null;
  /** Modo do clima (vem das opções visuais): 'off' desliga, 'ciclo' alterna, ou um clima fixo. */
  weatherMode: () => WeatherMode = () => 'ciclo';
  /** Zapdos: postes piscando forte à noite (ver `legendaryEffects`). */
  lampStorm: () => boolean = () => false;
  /** Celebi: velocidade das animações dos Pokémon (1 = normal). */
  animSpeed: () => number = () => 1;
  /** Acabamento metálico dos Digital Pokémon (vem das opções visuais; desligado = sprite normal). */
  metallic: () => boolean = () => true;
  /** Canvas de trabalho do brilho (um só, reaproveitado: o brilho é desenhado na hora, quadro a quadro). */
  private sheenCanvas: HTMLCanvasElement | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly map: VillageMap,
    readonly state: VillageState,
    mons: readonly VillageMon[],
    private readonly trainerId: string,
    /** Recorte real de tileset pra grama (ver `village-art.ts`); null/undefined cai no ladrilho desenhado por código. */
    private readonly groundTile?: GroundTileImage | null,
    /** O atlas de tilesets da Vila (`public/tilesets/vila-atlas.png`); null cai no desenho por código. */
    atlasImage?: Rgba | null,
    private readonly rng: Rng = Math.random,
  ) {
    this.ctx = canvas.getContext('2d')!;
    let atlas: VillaAtlas | null = null;
    try {
      atlas = atlasImage ? new VillaAtlas(atlasImage) : null;
    } catch {
      atlas = null;
    }
    this.atlas = atlas;
    this.loadTrainerAvatar();
    this.player = makeWalker('eu', state.player.x, state.player.y, 5.5);
    this.player.dir = state.player.dir;
    this.weather = createWeather(this.rng, 'sol');
    this.buildGround();
    this.setMons(mons);
  }

  /** Carrega e recorta a sprite selecionada, sem impedir a Vila de abrir quando a rede falha. */
  private loadTrainerAvatar(): void {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const source = document.createElement('canvas');
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceCtx = source.getContext('2d', { willReadFrequently: true });
        if (!sourceCtx || source.width === 0 || source.height === 0) return;
        sourceCtx.drawImage(image, 0, 0);
        const pixels = sourceCtx.getImageData(0, 0, source.width, source.height).data;
        let minX = source.width;
        let minY = source.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < source.height; y++) {
          for (let x = 0; x < source.width; x++) {
            if (pixels[(y * source.width + x) * 4 + 3]! === 0) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        if (maxX < minX || maxY < minY) return;
        const avatar = document.createElement('canvas');
        avatar.width = maxX - minX + 1;
        avatar.height = maxY - minY + 1;
        avatar.getContext('2d')!.drawImage(source, minX, minY, avatar.width, avatar.height, 0, 0, avatar.width, avatar.height);
        this.trainerAvatar = avatar;
      } catch {
        // Se o servidor não permitir leitura de pixels, o avatar desenhado por código continua disponível.
      }
    };
    image.src = trainerSpriteUrl(this.trainerId);
  }

  /** O clima de agora (para as falas dos Pokémon e para os momentos). */
  get weatherKind(): WeatherKind | null {
    return this.weatherMode() === 'off' ? null : this.weather.kind;
  }

  setMons(mons: readonly VillageMon[]): void {
    this.villagers.clear();
    this.villagerZones.clear();
    this.monSprites.clear();
    this.names.clear();
    // Zonas próximas às ruas, casas, parquinho, lago e fazenda. A busca em
    // espiral corrige automaticamente uma âncora que caiu sobre um obstáculo.
    const zones = [
      { x: 43, y: 34 }, { x: 52, y: 34 }, { x: 58, y: 29 }, { x: 68, y: 28 },
      { x: 31, y: 28 }, { x: 22, y: 38 }, { x: 31, y: 45 }, { x: 43, y: 46 },
      { x: 55, y: 46 }, { x: 67, y: 46 }, { x: 76, y: 39 }, { x: 76, y: 52 },
      { x: 42, y: 56 }, { x: 55, y: 56 }, { x: 70, y: 57 }, { x: 78, y: 63 },
    ];
    for (const [i, mon] of mons.entries()) {
      const anchor = zones[i % zones.length]!;
      const spot = findFree(this.map, anchor.x, anchor.y, (x, y) => this.occupied(x, y), this.rng);
      this.placeMon(mon, spot.x, spot.y);
      this.villagerZones.set(mon.id, spot);
    }
  }

  /**
  }
