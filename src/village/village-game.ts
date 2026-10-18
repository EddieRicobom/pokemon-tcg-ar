import type { Rng } from '../core/battle';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
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

/** Desenha um recorte em pé: a última linha visível encosta no chão em (cx, base). */
export class VillageGame {
  readonly player: Walker;
  readonly villagers = new Map<string, Walker>();
  private readonly monSprites = new Map<string, MonSprite>();
  private readonly names = new Map<string, string>();
  private readonly ctx: CanvasRenderingContext2D;
  private groundFrames: HTMLCanvasElement[] = [];
  /** Recortes de tileset (null: sem a imagem, cai no desenho por código de sempre). */
  private readonly atlas: VillaAtlas | null;
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
    this.player = makeWalker('eu', state.player.x, state.player.y, 5.5);
    this.player.dir = state.player.dir;
    this.weather = createWeather(this.rng, 'sol');
    this.buildGround();
    this.setMons(mons);
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
   * Põe um morador novo na cena agora, num bloco livre ao lado do jogador (ex.: o presente inicial, que precisa
   * aparecer na hora), sem sortear de novo a posição dos que já estão lá como `setMons` faz. Se já existir, troca.
   */
  addMon(mon: VillageMon): void {
    this.villagers.delete(mon.id);
    const p = this.player;
    const spot = findFree(this.map, p.x + 1, p.y, (x, y) => this.occupied(x, y), this.rng);
    this.placeMon(mon, spot.x, spot.y);
    const w = this.villagers.get(mon.id);
    if (w) {
      // Vira pro jogador e dá um pulinho de chegada.
      w.dir = spot.x < p.x ? 'right' : spot.x > p.x ? 'left' : spot.y < p.y ? 'down' : 'up';
      w.idle = 2.5;
    }
    this.bounce.set(mon.id, performance.now());
  }

  private placeMon(mon: VillageMon, x: number, y: number): void {
    const w = makeWalker(mon.id, x, y, 2.6);
    w.idle = this.rng() * 2;
    this.villagers.set(mon.id, w);
    this.names.set(mon.id, mon.name);
    const frames = framesOf(mon.gif);
    const dirFrames = dirFramesOf(mon.dirGifs);
    const head = headOf(mon.gif);
    // Mede a caixa real do bicho (sem a margem transparente da folha) em todos os quadros, pra achar o tamanho
    // e o ponto de chão de verdade — tanto pro pacote de sprites locais (PMD SpriteCollab, que guarda folga
    // em cima pro balanço da pose "parado") quanto pro GIF baixado do Showdown. Mesma fórmula pros dois, sem
    // fator de ajuste por olho: a diferença de tamanho que sobrar vem da arte em si, não de margem.
    const bounds = contentBounds(mon.gif);
    // Tamanho pela altura REAL da espécie (PokéAPI), comparável entre todos; sem esse dado, cai no tamanho do
    // desenho (pixels opacos), como antes. A âncora dos pés continua sendo a caixa de pixels reais.
    const contentHeightFrac = Math.max(0.05, bounds.bottom - bounds.top);
    const rawScale = (contentHeightFrac * mon.gif.height) / 40;
    const heightTiles = speciesTiles(mon.dexId) ?? Math.min(2.4, Math.max(1.1, rawScale));
    this.monSprites.set(mon.id, {
      frames, gif: mon.gif, dirGifs: mon.dirGifs, dirFrames, heightTiles, bounds, headTop: head.top, headX: head.x, digital: mon.digital === true,
    });
  }

  /** Quadros com a tinta metálica (feitos uma vez, na 1ª vez que o Digital Pokémon aparece com a opção ligada). */
  private metalOf(sprite: MonSprite): NonNullable<MonSprite['metal']> {
    sprite.metal ??= { frames: framesOf(sprite.gif, metallicTint), dirFrames: dirFramesOf(sprite.dirGifs, metallicTint) };
    return sprite.metal;
  }

  // ----------------------------------------------------------------------------- cidade

  setTown(level: number, homes: ReadonlyMap<string, number>): void {
    this.townLevel = level;
    this.homes = homes;
    this.nextSleepCheck = 0;
  }

  /** Faz o Pokémon esperar você parado (ou solta, com `null`). */
  setWaiting(id: string): void {
    this.waiting = id;
  }

  /** Troca os nomes mostrados (apelidos dados ou tirados) sem recarregar nada. */
  setNames(names: Readonly<Record<string, string>>): void {
    for (const [id, name] of Object.entries(names)) if (this.names.has(id)) this.names.set(id, name);
  }

  isAsleep(id: string): boolean {
    return this.asleep.has(id);
  }

  /** Está de pé e à vista? (quem dorme em casa não conta) */
  isOut(id: string): boolean {
    return this.villagers.has(id) && !this.asleep.has(id);
  }

  /**
   * Alguém bateu na porta e `id` abriu: sai de casa já (num "puf", de mau humor se `grumpy`) e fica de pé por `ms`, sem
   * voltar a dormir. Se já estava fora, só renova o tempo. Devolve `false` se não é morador de nenhuma casa.
   */
  wake(id: string, ms: number, grumpy: boolean): boolean {
    const w = this.villagers.get(id);
    const door = this.homeDoor(id);
    if (!w || !door) return false;
    this.stayUp.set(id, Date.now() + ms);
    if (this.asleep.has(id)) {
      this.asleep.delete(id);
      const spot = findFree(this.map, door.x, door.y, (x, y) => this.occupied(x, y, id), this.rng);
      w.x = w.tx = spot.x;
      w.y = w.ty = spot.y;
      w.t = 1;
      w.dir = 'down';
      this.particles.push({ kind: 'poof', x: spot.x + 0.5, y: spot.y + 0.6, vx: 0, vy: 0, born: performance.now(), life: 500 });
      this.bubble(id, grumpy ? '😠' : '🥱', 2600);
    }
    return true;
  }

  /** O morador recusou abrir ("me deixa dormir!"): um 😴 pula sobre o telhado da casa por uns segundos, e ele continua lá dentro. */
  grumble(id: string): void {
    const lot = this.homes.get(id);
    if (lot !== undefined) this.houseTags.set(lot, { emoji: '😴', until: performance.now() + 2400 });
  }

  private homeDoor(id: string): { x: number; y: number } | null {
    const lot = this.homes.get(id);
    const b = lot === undefined ? undefined : this.map.buildings.find((x) => x.lot === lot);
    return b ? b.door : null;
  }

  /** Hora de dormir e de acordar: o Pokémon vai para casa (some num "puf") e volta à porta de manhã. */
  private updateSleep(now: number): void {
    if (now < this.nextSleepCheck) return;
    this.nextSleepCheck = now + 1500;
    const hour = new Date().getHours();
    for (const [id, w] of this.villagers) {
      const door = this.homeDoor(id);
      if (!door) {
        this.asleep.delete(id);
        continue;
      }
      const up = (this.stayUp.get(id) ?? 0) > Date.now();
      if (!up) this.stayUp.delete(id);
      const want = isAsleep(id, hour) && !up && this.state.follower !== id && !this.sceneBusy(id);
      if (want && !this.asleep.has(id)) {
        this.particles.push({ kind: 'poof', x: w.x + 0.5, y: w.y + 0.6, vx: 0, vy: 0, born: now, life: 500 });
        this.asleep.add(id);
        this.speech.delete(id);
        this.bubbles.delete(id);
        w.x = w.tx = door.x;
        w.y = w.ty = door.y;
        w.t = 1;
      } else if (!want && this.asleep.has(id)) {
        this.asleep.delete(id);
        const spot = findFree(this.map, door.x, door.y, (x, y) => this.occupied(x, y, id), this.rng);
        w.x = w.tx = spot.x;
        w.y = w.ty = spot.y;
        w.t = 1;
        this.particles.push({ kind: 'poof', x: spot.x + 0.5, y: spot.y + 0.6, vx: 0, vy: 0, born: now, life: 500 });
        this.bubble(id, '🥱', 2200);
      }
    }
  }

  // ----------------------------------------------------------------------------- mundo

  private edgesOf(x: number, y: number): number {
    const t = tileAt(this.map, x, y);
    const differs = (nx: number, ny: number) => {
      const n = tileAt(this.map, nx, ny);
      if (t === 'path') return n !== 'path';
      if (t === 'water') return n !== 'water';
      if (t === 'plot') return n !== 'plot';
      return false;
    };
    let e = 0;
    if (differs(x, y - 1)) e |= EDGE.north;
    if (differs(x + 1, y)) e |= EDGE.east;
    if (differs(x, y + 1)) e |= EDGE.south;
    if (differs(x - 1, y)) e |= EDGE.west;
    return e;
  }

  /** O chão inteiro pré-desenhado com os recortes do tileset (um quadro só; os brilhos da água são desenhados por cima). */
  private buildTilesetGround(atlas: VillaAtlas, grass: GroundTileImage): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.map.w * TILE;
    c.height = this.map.h * TILE;
    const ctx = c.getContext('2d')!;
    const sheet = toCanvas(atlas.image);
    const grassCanvas = toCanvas(grass);
    for (let y = 0; y < this.map.h; y++) {
      for (let x = 0; x < this.map.w; x++) {
        for (const p of groundPieces(this.map, x, y)) {
          const dx = x * TILE + p.dx;
          const dy = y * TILE + p.dy;
          if (p.src === 'grass') {
            ctx.drawImage(grassCanvas, p.sx, p.sy, p.w, p.h, dx, dy, p.w, p.h);
            continue;
          }
          const r = atlas.rect(p.src);
          if (r) ctx.drawImage(sheet, r.x + p.sx, r.y + p.sy, p.w, p.h, dx, dy, p.w, p.h);
        }
      }
    }
    return c;
  }

  /** Um recorte do atlas como canvas (guardado); `transform` muda os pixels antes (ex.: a cor da casa). */
  private art(id: string, key = id, transform?: (img: Rgba) => Rgba): HTMLCanvasElement | null {
    const cached = this.sprites.get(`art:${key}`);
    if (cached) return cached;
    const piece = this.atlas?.piece(id);
    if (!piece) return null;
    const c = toCanvas(transform ? transform(piece) : piece);
    this.sprites.set(`art:${key}`, c);
    return c;
  }

  /** O chão inteiro pré-desenhado (3 quadros, por causa da água). */
  private buildGround(): void {
    if (this.atlas && this.groundTile) {
      this.groundFrames = [this.buildTilesetGround(this.atlas, this.groundTile)];
      return;
    }
    this.groundFrames = [0, 1, 2].map((frame) => {
      const c = document.createElement('canvas');
      c.width = this.map.w * TILE;
      c.height = this.map.h * TILE;
      const ctx = c.getContext('2d')!;
      const cache = new Map<string, HTMLCanvasElement>();
      for (let y = 0; y < this.map.h; y++) {
        for (let x = 0; x < this.map.w; x++) {
          const tile = tileAt(this.map, x, y);
          const edges = this.edgesOf(x, y);
          // Blocos iguais em lugares iguais do padrão reaproveitam o desenho.
          const key = `${tile}:${edges}:${tile === 'water' || tile === 'path' || tile === 'sand' ? `${x % 12},${y % 12}` : `${(x + y) % 6},${x % 2}`}:${frame}`;
          let img = cache.get(key);
          if (!img) {
            img = toCanvas(paintTile(tile, edges, x, y, frame, this.groundTile ?? undefined));
            cache.set(key, img);
          }
          ctx.drawImage(img, x * TILE, y * TILE);
        }
      }
      return c;
    });
  }

  private sprite(key: string, paint: () => PixelBuf): HTMLCanvasElement {
    let c = this.sprites.get(key);
    if (!c) {
      c = toCanvas(paint());
      this.sprites.set(key, c);
    }
    return c;
  }

  /** Tem alguém ou alguma coisa ocupando o bloco? (Pokémon, você, móveis) */
  occupied(x: number, y: number, except?: string): boolean {
    if (isPlaced(this.state, x, y) || cropAt(this.state, x, y)) return true;
    if (this.player && except !== 'eu' && ((this.player.x === x && this.player.y === y) || (this.player.tx === x && this.player.ty === y))) return true;
    for (const [id, w] of this.villagers) {
      if (id === except || this.asleep.has(id)) continue;
      if ((w.x === x && w.y === y) || (w.tx === x && w.ty === y)) return true;
    }
    return false;
  }

  // ----------------------------------------------------------------------------- controle

  hold(dir: Dir | null): void {
    this.held = dir;
  }

  /** Joystick virtual: direção principal e, na diagonal, a secundária (ver `core/village/joystick.ts`). null solta. */
  holdStick(dirs: Pick<StickDirs, 'primary' | 'secondary'> | null): void {
    this.stick = dirs?.primary ? dirs : null;
    if (this.stick) this.goal = null;
  }

  /** O bloco do mapa sob um ponto da tela (coordenadas do navegador). */
  tileAtScreen(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const px = ((clientX - rect.left) / rect.width) * this.canvas.width + this.view.camX;
    const py = ((clientY - rect.top) / rect.height) * this.canvas.height + this.view.camY;
    const x = Math.floor(px / (TILE * this.scale * this.arZoom));
    const y = Math.floor(py / (TILE * this.scale * this.arZoom));
    return x >= 0 && y >= 0 && x < this.map.w && y < this.map.h ? { x, y } : null;
  }

  /** Ativa a composição experimental sobre a câmera; não há rastreamento de superfície. */
  setArView(video: HTMLVideoElement | null, lookX = 0, lookY = 0): void {
    this.arVideo = video;
    this.arZoom = video ? 1.8 : 1;
    this.arLook = video ? { x: lookX, y: lookY } : { x: 0, y: 0 };
  }

  /**
   * Anda até o bloco (toque na tela). Se ele não dá para pisar (um Pokémon, um prédio, uma planta), para ao lado e
   * fica virado para ele — pronto para o A. Qualquer outro comando de movimento cancela.
   */
  walkTo(x: number, y: number): void {
    this.goal = { x, y };
  }

  /** Permite que um toque no mapa saiba se está apontando para algo que aceita A. */
  interactableAt(x: number, y: number): boolean {
    if (isPlaced(this.state, x, y) || cropAt(this.state, x, y)) return true;
    for (const w of this.villagers.values()) if ((w.x === x && w.y === y) || (w.tx === x && w.ty === y)) return true;
    return isSolidTile(tileAt(this.map, x, y)) || tileAt(this.map, x, y) === 'plot';
  }

  /** Vira o treinador para um bloco antes de disparar a interação automática. */
  facePoint(x: number, y: number): void {
    const dx = x - this.player.x;
    const dy = y - this.player.y;
    if (Math.abs(dx) > Math.abs(dy)) this.player.dir = dx > 0 ? 'right' : 'left';
    else if (dy !== 0) this.player.dir = dy > 0 ? 'down' : 'up';
  }

  get walking(): boolean {
    return this.goal !== null;
  }

  /**
   * O sino da praça: todo Pokémon acordado vem para perto do sino (cada um num lugar livre em volta). Quem está longe
   * demais (mais de `BELL_FAR` blocos) aparece num "puf" no meio do caminho e chega correndo, para ninguém levar um
   * minuto atravessando o mapa. Devolve quem vem e quem está dormindo. O chamado dura `BELL_MS`.
   */
  ringBell(now = performance.now(), bonus = 0): { coming: string[]; sleeping: string[] } {
    const bell = this.map.decor.find((d) => d.kind === 'bell');
    const at = bell ? { x: bell.x, y: bell.y + bell.h } : { x: this.player.x, y: this.player.y };
    const coming: string[] = [];
    const sleeping: string[] = [];
    this.called.clear();
    const taken = new Set<string>();
    for (const [id, w] of this.villagers) {
      if (this.asleep.has(id)) {
        sleeping.push(id);
        continue;
      }
      const spot = findFree(this.map, at.x, at.y + 1, (x, y) => taken.has(`${x},${y}`) || (x === this.player.x && y === this.player.y) || this.occupied(x, y, id), this.rng);
      taken.add(`${spot.x},${spot.y}`);
      this.called.set(id, spot);
      coming.push(id);
      const far = Math.abs(w.x - spot.x) + Math.abs(w.y - spot.y);
      if (far > BELL_FAR && !moving(w)) {
        const mid = findFree(this.map, spot.x + Math.sign(w.x - spot.x) * Math.min(8, Math.abs(w.x - spot.x)), spot.y + Math.sign(w.y - spot.y) * Math.min(6, Math.abs(w.y - spot.y)), (x, y) => th
