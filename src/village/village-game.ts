import { drawWaterFx, drawFountainFx, drawSunRays, drawTowerDataFx } from './ambient-art';
import { BenchVisits, benchesFor } from '../core/village/benches';
import type { Rng } from '../core/battle';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
import { trainerSpriteUrl } from '../core/trainer-sprites';
import { trainerAtlasFrame, type TrainerAtlas } from './trainer-atlas';
import { drawPos, facing, makeWalker, moving, stepVillager, swapPlaces, tryStep, advance, syncFollowerSpeed, WALK_SPEED } from '../core/village/actors';
import type { Dir, Walker } from '../core/village/actors';
import { itemDef } from '../core/village/catalog';
import { cropAt, daylight, friendOf, isPlaced, needsWater } from '../core/village/life';
import type { FurnitureId, VillageState } from '../core/village/life';
import { homeDecor, homeLevel, homeOf, homeStyleOf, isAsleep, ROOFS, roofIndex } from '../core/village/town';
import { buildingGroundY, WORK_AREAS, WORK_SITES } from '../core/village/town-layout';
import type { Building, BuildingKind, WorksiteId } from '../core/village/town-layout';
import { buildingAt, findFree, isSolidTile, isWalkable, tileAt } from '../core/village/map';
import { pathStep } from '../core/village/pathing';
import type { Tile, VillageMap } from '../core/village/map';
import { FX_EMOJI } from '../core/village/social-state';
import type { Fx } from '../core/village/social-state';
import type { CommunityActivityRecord } from '../core/village/community';
import { metallicTint, sheenAt, sheenOffset } from '../core/metallic';
import { speciesTiles } from '../core/size-scale';
import { villageScale } from '../core/village/camera';

const COMMUNITY_ACTIVITY_NAMES: Readonly<Record<CommunityActivityRecord['activity'], string>> = {
  agricultura: 'agricultura', pesca: 'pesca', mineracao: 'mineração', madeireira: 'madeireira', culinaria: 'culinária', manutencao: 'manutenção', construcao: 'construção',
  transporte: 'transporte', exploracao: 'exploração', pesquisa: 'pesquisa', jardinagem: 'jardinagem', vigilancia: 'vigilância',
  comercio: 'comércio', protecao: 'proteção', conservacao: 'conservação', reciclagem: 'reciclagem', acolhimento: 'acolhimento',
  brincadeira: 'brincadeira', descanso: 'descanso',
};
import { stepOrder } from '../core/village/joystick';
import type { StickDirs } from '../core/village/joystick';
import { createWeather, stepWeather, WEATHER_KINDS } from '../core/weather';
import type { WeatherKind, WeatherMode, WeatherState } from '../core/weather';
import { isFrameDue } from '../core/frame-rate';
import { cancelGameFrame, requestGameFrame } from '../app/frame-scheduler';
import { EDGE } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { contentBounds } from './local-sprite';
import type { ContentBounds } from './local-sprite';
import { outfitFor, paintSeedBox, paintBell, paintBush, paintHouse, paintPlayer, paintRock, paintShop, paintTile, paintTree, TILE } from './village-art';
import type { FarmTask, FarmWorker } from '../core/village/farm';
import { stepFarmWorker } from '../core/village/farm';
import type { GroundTileImage } from './village-art';
import { paintAccessory, paintCrop, paintFurnitureItem } from './item-art';
import { harmonizePlayerCanvas, harmonizePlayerSprite } from './player-filter';
import { wrapSpeech } from './speech-layout';
import { VILLAGE_DIORAMA_OBJECT_TILT_DEG } from '../core/village/ar-diorama';
import { groundPieces } from './ground-tiles';
import { drawCommunityWorkAction, drawWorkAction } from './work-art';
import { recolor, VillaAtlas, windowGlow } from './tileset-art';
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
const CIVIC_TILESET: Partial<Record<BuildingKind, string>> = { cafe: 'cabin', mail: 'home-orange', museum: 'manor', arcade: 'center-blue', pins: 'home-teal', arena: 'center-red', torre: 'tower' };
/** Com o atlas: a casa de cada estágio (Cabana, Casa de madeira, Casa de tijolos, Sobrado — `HOME_STAGES`). */
const HOME_TILESET = ['home-orange', 'home-teal', 'house-brick', 'home-yellow'] as const;
/** As que pegam a cor escolhida (o desenho tem partes coloridas para tingir). */
const HOME_TINTED = new Set<string>(['home-orange', 'home-teal', 'home-yellow']);
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
  private trainerAtlas: TrainerAtlas | null = null;
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
  /** A Vila em AR usa este mesmo canvas como textura de um diorama completo. */
  private diorama = false;
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
  /** Tipo Dark: moradores noturnos dormem pela manhã e ficam ativos à noite. */
  nocturnal: (id: string) => boolean = () => false;
  /** Quem foi acordado batendo na porta fica de pé até este instante (relógio de `Date.now()`), mesmo em hora de dormir. */
  private readonly stayUp = new Map<string, number>();
  /** Há quanto tempo (s) quem te segue está longe ou sem conseguir andar; passou do limite, ele aparece ao seu lado. */
  private readonly lag = new Map<string, number>();
  /** Há quanto tempo (ms) você empurra o botão contra um Pokémon parado; passou do limite, vocês trocam de lugar. */
  private pushMs = 0;
  private benchVisits: BenchVisits | null = null;
  private nextBenchChat = 0;
  /** Avisos sobre o telhado de uma casa (por terreno), como o 😴 de quem não quer abrir a porta. */
  private readonly houseTags = new Map<number, { emoji: string; until: number }>();
  /** Atividade concluída neste ciclo: caminhada curta até o local e identificação na cena. */
  private readonly communityWork = new Map<string, { activity: CommunityActivityRecord['activity']; target: { x: number; y: number }; until: number }>();
  private farmTasks = new Map<string, FarmTask>();

  farmWorkers(): Omit<FarmWorker, 'types'>[] {
    const now = performance.now();
    return [...this.villagers].map(([id, walker]) => ({
      id, x: walker.x, y: walker.y,
      available: !this.asleep.has(id) && this.waiting !== id && this.state.follower !== id && !this.sceneBusy(id)
        && !(now < this.calledUntil && this.called.has(id)) && !(now < (this.communityWork.get(id)?.until ?? 0)),
    }));
  }

  setFarmTasks(tasks: readonly FarmTask[]): void {
    for (const [id, task] of this.farmTasks) {
      const started = task.workingSince;
      if (started !== null && !tasks.some((next) => next.residentId === id)
        && this.state.farm.history.some((entry) => entry.residentId === id && entry.kind === task.kind && entry.at >= started)) this.bubble(id, '📦', 2400);
    }
    this.farmTasks = new Map(tasks.map((task) => [task.residentId, task]));
  }
  private nextSleepCheck = 0;
  /** Quem está esperando você para conversar (o ❗): fica parado onde está. */
  private waiting: string | null = null;
  /** Bloco que foi coletado hoje (o arbusto perde as frutas). */
  harvestedToday: (x: number, y: number) => boolean = () => false;
  onStep: (() => void) | null = null;
  /** Modo do clima (vem das opções visuais): 'off' desliga, 'ciclo' alterna, ou um clima fixo. */
  ambientFx: () => boolean = () => true;
  maxFps: () => number = () => 0;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  weatherMode: () => WeatherMode = () => 'ciclo';
  /** Zapdos: postes piscando forte à noite (ver `legendaryEffects`). */
  lampStorm: () => boolean = () => false;
  /** Celebi: velocidade das animações dos Pokémon (1 = normal). */
  animSpeed: () => number = () => 1;
  /** Acabamento metálico dos Digital Pokémon (vem das opções visuais; desligado = sprite normal). */
  metallic: () => boolean = () => true;
  /** Canvas de trabalho do brilho (um só, reaproveitado: o brilho é desenhado na hora, quadro a quadro). */
  private sheenCanvas: HTMLCanvasElement | null = null;

  /**
   * O diorama AR redesenha o mapa inteiro como textura da câmera. Quando o
   * jogador deixa a taxa em automático, 30 fps constantes evitam a disputa
   * entre esse mapa grande e o vídeo, sem alterar a Vila normal. Uma taxa
   * escolhida nas opções continua tendo prioridade.
   */
  private renderFps(): number {
    const configured = this.maxFps();
    return this.diorama && (!Number.isFinite(configured) || configured <= 0) ? 30 : configured;
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly map: VillageMap,
    readonly state: VillageState,
    mons: readonly VillageMon[],
    private readonly trainerId: string,
    /** Recorte real de tileset pra grama (ver `village-art.ts`); null/undefined cai no ladrilho desenhado por código. */
    private readonly groundTile?: GroundTileImage | null,
    /** O atlas de tilesets da Vila (asset com hash no build); null cai no desenho por código. */
    atlasImage?: Rgba | null,
    trainerAtlas?: TrainerAtlas | null,
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
    this.trainerAtlas = trainerAtlas ?? null;
    if (!this.trainerAtlas) this.loadTrainerAvatar();
    this.player = makeWalker('eu', state.player.x, state.player.y, WALK_SPEED.player);
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
         this.trainerAvatar = harmonizePlayerCanvas(avatar, avatar.width, avatar.height) ?? avatar;
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
    const w = makeWalker(mon.id, x, y, WALK_SPEED.resident);
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
  setWaiting(id: string | null): void {
    this.waiting = id;
  }

  /** Mostra atividades concluídas no ciclo de hoje; tarefas antigas de catch-up ficam só no histórico. */
  showCommunityActivities(activities: readonly CommunityActivityRecord[], day: string): void {
    if (day !== this.state.community.lastCycleDay) return;
    const until = performance.now() + 9_000;
    const reserved = new Set<string>();
    for (const task of activities) {
      if (!this.villagers.has(task.residentId) || this.state.follower === task.residentId || this.waiting === task.residentId || this.sceneBusy(task.residentId)) continue;
      const worksite = task.x !== undefined && task.y !== undefined
        ? { x: task.x, y: task.y }
        : task.activity === 'acolhimento' || task.activity === 'brincadeira' ? { x: 47, y: 40 }
          : task.activity === 'culinaria' ? { x: 66, y: 24 }
            : task.activity === 'pesca' ? { x: 76, y: 17 }
              : task.activity === 'pesquisa' || task.activity === 'vigilancia' ? { x: 56, y: 24 }
                : task.activity === 'exploracao' ? { x: 17, y: 63 }
                  : task.activity === 'descanso' ? this.homeDoor(task.residentId) ?? this.villagerZones.get(task.residentId) ?? this.player
                    : this.villagerZones.get(task.residentId) ?? this.player;
      const candidates = task.x !== undefined && task.y !== undefined
        ? [{ x: worksite.x, y: worksite.y - 1 }, { x: worksite.x + 1, y: worksite.y }, { x: worksite.x, y: worksite.y + 1 }, { x: worksite.x - 1, y: worksite.y }]
        : [worksite];
      const target = candidates.find((spot) => isWalkable(this.map, spot.x, spot.y) && !reserved.has(`${spot.x},${spot.y}`) && !this.occupied(spot.x, spot.y, task.residentId))
        ?? findFree(this.map, worksite.x, worksite.y, (x, y) => reserved.has(`${x},${y}`) || this.occupied(x, y, task.residentId), this.rng);
      if (!target) continue;
      reserved.add(`${target.x},${target.y}`);
      this.communityWork.set(task.residentId, { activity: task.activity, target, until });
      this.bubble(task.residentId, task.icon, 5_000);
    }
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
      const want = isAsleep(id, hour, this.nocturnal(id)) && !up && this.state.follower !== id && !this.sceneBusy(id);
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

  private getBenchVisits(): BenchVisits {
    // Não sobrepõe móveis e hortas de salvamentos existentes.
    return this.benchVisits ??= new BenchVisits(benchesFor(this.map).filter((b) => [0, 1].every((dx) => !isPlaced(this.state, b.x + dx, b.y) && !cropAt(this.state, b.x + dx, b.y))));
  }

  /** Tem alguém ou alguma coisa ocupando o bloco? (Pokémon, você, móveis) */
  occupied(x: number, y: number, except?: string): boolean {
    const benches = this.getBenchVisits();
    if (benches.reserved(x, y, except)) return true;
    if ((!except || except === 'eu') && benches.benches.some((b) => y === b.y && (x === b.x || x === b.x + 1))) return true;
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
    const x = Math.floor(px / (TILE * this.scale));
    const y = Math.floor(py / (TILE * this.scale));
    return x >= 0 && y >= 0 && x < this.map.w && y < this.map.h ? { x, y } : null;
  }

  /** Renderiza o mapa inteiro para a textura da Vila em AR; sair volta para a câmera que segue o treinador. */
  setDioramaView(on: boolean): void {
    if (this.diorama === on) return;
    this.diorama = on;
    if (on) {
      // A textura usa a proporção real do mapa (4:3), sem faixas vazias de uma tela de celular em pé.
      this.canvas.width = this.map.w * TILE;
      this.canvas.height = this.map.h * TILE;
      this.scale = 1;
    }
  }

  /**
   * Anda até o bloco (toque na tela). Se ele não dá para pisar (um Pokémon, um prédio, uma planta), para ao lado e
   * fica virado para ele — pronto para o A. Qualquer outro comando de movimento cancela.
   */
  walkTo(x: number, y: number): void {
    this.goal = { x, y };
  }

  stopWalk(): void {
    this.goal = null;
    this.held = null;
    this.stick = null;
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
        const mid = findFree(this.map, spot.x + Math.sign(w.x - spot.x) * Math.min(8, Math.abs(w.x - spot.x)), spot.y + Math.sign(w.y - spot.y) * Math.min(6, Math.abs(w.y - spot.y)), (x, y) => this.occupied(x, y, id), this.rng);
        this.particles.push({ kind: 'poof', x: w.x + 0.5, y: w.y + 0.6, vx: 0, vy: 0, born: now, life: 500 });
        w.x = w.tx = mid.x;
        w.y = w.ty = mid.y;
        w.t = 1;
        this.particles.push({ kind: 'poof', x: mid.x + 0.5, y: mid.y + 0.6, vx: 0, vy: 0, born: now, life: 500 });
      }
      this.bubble(id, '🔔', 1800);
    }
    this.calledUntil = now + BELL_MS + bonus * 1000;
    return { coming, sleeping };
  }

  /** Um passo rumo ao `goal` (chamado quando você está parado e sem joystick/teclado). */
  private stepTowardGoal(): void {
    const p = this.player;
    const g = this.goal;
    if (!g) return;
    const blocked = (x: number, y: number) => this.occupied(x, y, 'eu');
    const dist = Math.abs(g.x - p.x) + Math.abs(g.y - p.y);
    if (dist === 0) {
      this.goal = null;
      return;
    }
    if (dist === 1) {
      const dir: Dir = g.x > p.x ? 'right' : g.x < p.x ? 'left' : g.y > p.y ? 'down' : 'up';
      // Ao lado: pisa se der; se não (alguém ou alguma coisa ali), só vira para lá.
      if (!(isWalkable(this.map, g.x, g.y) && !blocked(g.x, g.y) && tryStep(p, dir, this.map, blocked))) p.dir = dir;
      this.goal = null;
      return;
    }
    const dir = pathStep(this.map, { x: p.x, y: p.y }, g, blocked);
    if (!dir || !tryStep(p, dir, this.map, blocked)) this.goal = null;
  }

  /** O que está à sua frente. */
  target(): Target {
    const f = facing(this.player);
    for (const [id, w] of this.villagers) if (!this.asleep.has(id) && ((w.x === f.x && w.y === f.y) || (w.tx === f.x && w.ty === f.y))) return { kind: 'mon', id };
    const crop = cropAt(this.state, f.x, f.y);
    if (crop) return { kind: 'crop', x: f.x, y: f.y };
    const placed = this.state.placed.find((p) => p.x === f.x && p.y === f.y);
    if (placed) return { kind: 'furniture', x: f.x, y: f.y, item: placed.item };
    const tile = tileAt(this.map, f.x, f.y);
    if (tile === 'plot') return { kind: 'plot' };
    if (tile === 'shop') return { kind: 'shop' };
    if (tile === 'building') {
      const b = buildingAt(this.map, f.x, f.y);
      return b ? { kind: 'building', building: b } : { kind: 'nothing' };
    }
    if (tile === 'deco') {
      const decor = this.map.decor.find((d) => f.x >= d.x && f.x < d.x + d.w && f.y >= d.y && f.y < d.y + d.h);
      if (decor?.kind === 'bell') return { kind: 'bell' };
      if (decor?.kind === 'seed-box') return { kind: 'seed-box' };
      if (decor?.kind === 'board') return { kind: 'board' };
      if (decor?.kind === 'mine-board') return { kind: 'worksite', site: 'mine' };
      if (decor?.kind === 'lumber-board') return { kind: 'worksite', site: 'lumber' };
      if (decor?.kind === 'fishing-board') return { kind: 'worksite', site: 'fishing' };
    }
    if (tile === 'lamp' || tile === 'deco') return { kind: 'nothing' };
    if (tile !== 'grass' && tile !== 'path' && tile !== 'trail' && tile !== 'plaza' && tile !== 'field' && tile !== 'pier') return { kind: 'tile', x: f.x, y: f.y, tile };
    return { kind: 'nothing' };
  }

  /** O bloco livre à sua frente (para colocar móveis), ou null. */
  frontSpot(): { x: number; y: number } | null {
    const f = facing(this.player);
    return this.occupied(f.x, f.y) ? null : f;
  }

  bubble(id: string, emoji: string, ms = 1800): void {
    this.bubbles.set(id, { emoji, until: performance.now() + ms });
  }

  /** Solta um emoji que sobe e some sobre o Pokémon (e ele dá um pulinho). */
  pop(id: string, emoji: string): void {
    const w = this.villagers.get(id);
    if (!w) return;
    const p = drawPos(w);
    this.particles.push({ kind: 'emoji', x: p.x + 0.5 + (this.rng() - 0.5) * 0.5, y: p.y - 0.8, vx: (this.rng() - 0.5) * 0.4, vy: -1.1, born: performance.now(), life: 1400, emoji });
    this.bounce.set(id, performance.now());
  }

  /** O Pokémon se vira para você (para conversar). */
  faceMe(id: string): void {
    const w = this.villagers.get(id);
    if (!w || moving(w)) return;
    const dx = this.player.x - w.x;
    const dy = this.player.y - w.y;
    w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    w.idle = 3;
  }

  /** Lança a linha: uma boia pisca no bloco de água por um tempo. */
  castLine(x: number, y: number, ms = 1400): void {
    this.bobber = { x, y, until: performance.now() + ms };
  }

  /** Algum desses Pokémon está a até `dist` blocos de você? */
  playerNear(ids: readonly string[], dist: number): boolean {
    return ids.some((id) => {
      const w = this.villagers.get(id);
      return !!w && !this.asleep.has(id) && Math.abs(w.x - this.player.x) + Math.abs(w.y - this.player.y) <= dist;
    });
  }

  // ----------------------------------------------------------------------------- momentos

  get sceneActive(): boolean {
    return this.scene !== null;
  }

  /** Morador cuja fala está visível agora, para HUDs auxiliares como o minimapa. */
  get sceneSpeakerId(): string | null {
    const scene = this.scene;
    if (!scene || scene.cast.length === 0) return null;
    const line = scene.idx >= 0 ? scene.lines[scene.idx] : undefined;
    return scene.cast[line?.who ?? 0] ?? scene.cast[0] ?? null;
  }

  sceneBusy(id: string): boolean {
    return !!this.scene && this.scene.cast.includes(id);
  }

  /**
   * Toca um momento: o elenco se junta (quem está longe é levado para perto num "puf"), cada fala aparece num balão com
   * efeito de emoji e o Pokémon dá um pulinho; ao fim chama `done`.
   */
  playScene(cast: string[], lines: SceneLine[], done: () => void): boolean {
    if (this.scene || cast.length === 0 || cast.some((id) => !this.villagers.has(id) || this.asleep.has(id))) return false;
    const now = performance.now();
    this.scene = { cast, lines, idx: -1, phase: cast.length > 1 ? 'gather' : 'talk', until: now + 9000, startedAt: now, done };
    if (cast.length === 1) this.startLine(0, now);
    return true;
  }

  /** Interrompe o momento em andamento (sem chamar o `done`): quem chama decide o que fazer com ele. */
  abortScene(): void {
    const sc = this.scene;
    if (!sc) return;
    this.scene = null;
    for (const id of sc.cast) this.speech.delete(id);
  }

  /** Mostra falas soltas (as que vêm depois da sua decisão), sem juntar ninguém. */
  sayLines(cast: string[], lines: SceneLine[], done: () => void): void {
    if (this.scene) {
      done();
      return;
    }
    const now = performance.now();
    this.scene = { cast, lines, idx: -1, phase: 'talk', until: now, startedAt: now, done };
    this.startLine(0, now);
  }

  private startLine(i: number, now: number): void {
    const s = this.scene;
    if (!s) return;
    const line = s.lines[i];
    if (!line) {
      s.phase = 'end';
      s.until = now + 700;
      return;
    }
    s.idx = i;
    s.phase = 'talk';
    const id = s.cast[line.who] ?? s.cast[0]!;
    const ms = Math.max(2300, 1300 + line.text.length * 52);
    s.until = now + ms;
    const tint = ['#c0382b', '#2a6ad8', '#2f8f46'][line.who % 3]!;
    this.speech.set(id, { text: line.text, name: this.names.get(id) ?? '', start: now, until: now + ms, tint });
    // Quem fala olha para o parceiro; o parceiro olha de volta.
    const speaker = this.villagers.get(id);
    const other = this.villagers.get(s.cast[line.who === 0 ? 1 : 0] ?? s.cast[0]!);
    if (speaker && other && other !== speaker && !moving(speaker)) {
      const dx = other.x - speaker.x;
      const dy = other.y - speaker.y;
      speaker.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
    if (line.fx) this.pop(id, FX_EMOJI[line.fx]);
  }

  /** Troca de lugar com o Pokémon à sua frente, se ele estiver só passeando (e não em cena, esperando você ou falando). */
  private swapWithFront(): boolean {
    const p = this.player;
    const f = facing(p);
    for (const [id, w] of this.villagers) {
      if (this.asleep.has(id) || moving(w) || w.x !== f.x || w.y !== f.y) continue;
      if (this.waiting === id || this.speech.has(id) || this.scene?.cast.includes(id)) return false;
      if (this.benchVisits?.seated(id, w)) return false;
      this.benchVisits?.release(id, performance.now());
      return swapPlaces(p, w);
    }
    return false;
  }

  /** Quem te segue e ficou para trás (longe demais ou sem caminho por alguns segundos) reaparece ao seu lado. */
  private catchUp(w: Walker, to: { x: number; y: number }, dt: number, now: number): void {
    const far = Math.abs(to.x - w.x) + Math.abs(to.y - w.y);
    const stuck = far > 10 || (far > 1 && !moving(w));
    const lag = stuck ? (this.lag.get(w.id) ?? 0) + dt : 0;
    if (lag < LAG_LIMIT_S) {
      this.lag.set(w.id, lag);
      return;
    }
    this.lag.delete(w.id);
    const spot = findFree(this.map, to.x, to.y, (x, y) => this.occupied(x, y, w.id) || (x === to.x && y === to.y), this.rng);
    this.particles.push({ kind: 'poof', x: w.x + 0.5, y: w.y + 0.6, vx: 0, vy: 0, born: now, life: 500 });
    w.x = w.tx = spot.x;
    w.y = w.ty = spot.y;
    w.t = 1;
    this.particles.push({ kind: 'poof', x: spot.x + 0.5, y: spot.y + 0.6, vx: 0, vy: 0, born: now, life: 500 });
  }

  private updateScene(now: number): void {
    const s = this.scene;
    if (!s) return;
    if (s.phase === 'gather') {
      const [a, ...rest] = s.cast.map((id) => this.villagers.get(id)!);
      const together = rest.every((w) => Math.abs(w.x - a!.x) + Math.abs(w.y - a!.y) <= 1 && !moving(w));
      if (together && !moving(a!)) {
        this.startLine(0, now);
      } else if (now > s.until) {
        // Demorou: leva quem está longe até um bloco livre ao lado de quem começa.
        for (const w of rest) {
          if (Math.abs(w.x - a!.x) + Math.abs(w.y - a!.y) <= 1) continue;
          const spot = findFree(this.map, a!.x + 1, a!.y, (x, y) => this.occupied(x, y, w.id), this.rng);
          this.particles.push({ kind: 'poof', x: w.x + 0.5, y: w.y + 0.6, vx: 0, vy: 0, born: now, life: 500 });
          w.x = w.tx = spot.x;
          w.y = w.ty = spot.y;
          w.t = 1;
          this.particles.push({ kind: 'poof', x: spot.x + 0.5, y: spot.y + 0.6, vx: 0, vy: 0, born: now, life: 500 });
        }
        s.until = now + 300;
        s.phase = 'talk';
        s.idx = -1;
        s.until = now + 400;
      }
    } else if (s.phase === 'talk') {
      if (s.idx < 0) {
        if (now >= s.until) this.startLine(0, now);
      } else if (now >= s.until) {
        const line = s.lines[s.idx];
        if (line) this.speech.delete(s.cast[line.who] ?? s.cast[0]!);
        this.startLine(s.idx + 1, now);
      }
    } else if (now >= s.until) {
      const done = s.done;
      this.scene = null;
      done();
    }
  }

  // ----------------------------------------------------------------------------- laço

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.handle = requestGameFrame(tick, () => this.renderFps());
      if (!isFrameDue(now, this.last, this.renderFps())) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.update(dt, now);
      this.draw(now);
    };
    this.handle = requestGameFrame(tick, this.maxFps);
  }

  stop(): void {
    this.running = false;
    cancelGameFrame(this.handle);
  }

  private update(dt: number, now: number): void {
    const p = this.player;
    const arrived = advance(p, dt);
    if (arrived) {
      this.state.player = { x: p.x, y: p.y, dir: p.dir };
      this.onStep?.();
      for (let k = 0; k < 2; k++) this.particles.push({ kind: 'dust', x: p.x + 0.5 + (this.rng() - 0.5) * 0.4, y: p.y + 0.95, vx: (this.rng() - 0.5) * 0.8, vy: -0.25 - this.rng() * 0.3, born: now, life: 420 });
    }
    // Teclado (uma direção) ou joystick (na diagonal alterna os eixos; bloqueado num, tenta o outro e desliza).
    const order = this.stick ? stepOrder(this.stick, this.stepParity) : this.held ? [this.held] : [];
    if (!moving(p) && order.length > 0) {
      const blocked = (x: number, y: number) => this.occupied(x, y, 'eu');
      if (order.some((dir) => tryStep(p, dir, this.map, blocked))) {
        this.pushMs = 0;
        this.stepParity++;
      } else {
        // Ninguém andou: fica virado pra direção principal (é pra ela que se conversa e se empurra).
        p.dir = order[0]!;
        // Só virar para o Pokémon (para conversar) é um toque; segurar contra ele troca de lugar, para ninguém trancar a rua.
        this.pushMs += dt * 1000;
        if (this.pushMs >= SWAP_AFTER_MS && this.swapWithFront()) this.pushMs = 0;
      }
    } else if (order.length === 0) {
      this.pushMs = 0;
      if (!moving(p) && this.goal) this.stepTowardGoal();
    }
    const behind = { x: p.x, y: p.y };
    this.updateSleep(now);
    const benchVisits = this.getBenchVisits();
    for (const id of benchVisits.visits.keys()) {
      if (!this.villagers.has(id)) benchVisits.release(id, now);
    }
    for (const [id, w] of this.villagers) {
      syncFollowerSpeed(w, p, this.state.follower === id);
      if (this.asleep.has(id) || this.waiting === id || this.state.follower === id || this.sceneBusy(id) || (now < this.calledUntil && this.called.has(id))) benchVisits.release(id, now);
      if (this.asleep.has(id) || (this.waiting === id && !moving(w))) continue;
      const sc = this.scene;
      if (sc && sc.cast.includes(id)) {
        // No momento: o primeiro fica parado; os outros vão até ele. Depois do encontro, todos ficam parados.
        const anchor = this.villagers.get(sc.cast[0]!)!;
        const target = sc.phase === 'gather' && id !== sc.cast[0] ? { x: anchor.x, y: anchor.y } : { x: w.x, y: w.y };
        stepVillager(w, dt, this.map, (x, y) => this.occupied(x, y, id), this.rng, target);
        continue;
      }
      const farmTask = this.farmTasks.get(id);
      if (farmTask && this.waiting !== id && this.state.follower !== id && !(now < this.calledUntil && this.called.has(id))) {
        benchVisits.release(id, now);
        stepFarmWorker(w, farmTask, dt, this.map, (x, y) => this.occupied(x, y, id));
        continue;
      }
      const work = this.communityWork.get(id);
      if (work && now < work.until) {
        if (Math.abs(work.target.x - w.x) + Math.abs(work.target.y - w.y) > 1) {
          stepVillager(w, dt, this.map, (x, y) => this.occupied(x, y, id), this.rng, work.target);
        }
        continue;
      }
      if (work) this.communityWork.delete(id);
      const called = now < this.calledUntil ? this.called.get(id) : undefined;
      const zone = this.villagerZones.get(id);
      const follow = this.state.follower === id
        ? behind
        : called ?? (zone && Math.abs(zone.x - w.x) + Math.abs(zone.y - w.y) > 7 ? zone : null);
      if (follow) benchVisits.release(id, now);
      if (!follow && benchVisits.step(w, dt, now, this.map, (x, y) => this.occupied(x, y, id), this.rng)) continue;
      stepVillager(w, dt, this.map, (x, y) => this.occupied(x, y, id), this.rng, follow);
      if (follow && !called) this.catchUp(w, follow, dt, now);
    }
    if (now >= this.nextBenchChat) {
      this.nextBenchChat = now + 8000;
      for (const [id, w] of this.villagers) {
        if (!benchVisits.seated(id, w)) continue;
        const visit = benchVisits.visits.get(id)!;
        const company = [...benchVisits.visits].some(([other, v]) => other !== id && v.bench === visit.bench && !!this.villagers.get(other) && benchVisits.seated(other, this.villagers.get(other)!));
        this.bubble(id, company ? '💬' : '☕', 2300);
      }
    }
    this.updateScene(now);
    // Clima.
    const mode = this.weatherMode();
    if (mode !== 'off') stepWeather(this.weather, dt, this.rng, mode === 'ciclo' ? null : (WEATHER_KINDS.includes(mode as WeatherKind) ? (mode as WeatherKind) : null));
    else {
      this.weather.cloud = this.weather.rain = this.weather.snow = this.weather.wet = this.weather.snowCover = 0;
    }
    // Borboletas e vagalumes voando perto de você.
    if (this.motes.length < 9) {
      this.motes.push({ x: p.x + (this.rng() - 0.5) * 14, y: p.y + (this.rng() - 0.5) * 12, vx: (this.rng() - 0.5) * 0.8, vy: (this.rng() - 0.5) * 0.8, phase: this.rng() * 6 });
    }
    for (const m of this.motes) {
      m.phase += dt * 6;
      m.vx += (this.rng() - 0.5) * dt * 2;
      m.vy += (this.rng() - 0.5) * dt * 2;
      m.vx = Math.max(-0.9, Math.min(0.9, m.vx));
      m.vy = Math.max(-0.9, Math.min(0.9, m.vy));
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i]!;
      if (Math.abs(m.x - p.x) > 10 || Math.abs(m.y - p.y) > 9) this.motes.splice(i, 1);
    }
    // Folhas e pétalas ao vento (dia, sem chuva).
    if (now > this.nextLeaf && this.weather.rain < 0.2) {
      this.nextLeaf = now + 900 + this.rng() * 1500;
      this.particles.push({ kind: 'leaf', x: p.x + (this.rng() - 0.3) * 14, y: p.y - 8, vx: 0.5 + this.weather.windX * 2 + this.rng() * 0.4, vy: 0.9 + this.rng() * 0.5, born: now, life: 9000, color: ['#6cc85c', '#f8a8c8', '#e8b060', '#8ad878'][Math.floor(this.rng() * 4)] });
    }
    // Fumaça da chaminé.
    if (this.state.house >= 3 && now > this.nextSmoke) {
      this.nextSmoke = now + 650;
      const pl = this.map.plot;
      this.particles.push({ kind: 'smoke', x: pl.x + 3.06, y: pl.y + pl.h - 3.8, vx: 0.15 + this.weather.windX * 0.8, vy: -0.55, born: now, life: 3000 });
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i]!;
      const age = now - q.born;
      if (age > q.life) {
        this.particles.splice(i, 1);
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind === 'leaf') q.vx += Math.sin(age / 300) * dt * 0.6;
    }
    if (this.particles.length > 140) this.particles.splice(0, this.particles.length - 140);
    // Dois Pokémon que se encontram se cumprimentam.
    if (now - this.lastGreet > 2500 && !this.scene) {
      const list = [...this.villagers.entries()].filter(([id]) => !this.asleep.has(id));
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const [ia, a] = list[i]!;
          const [ib, b] = list[j]!;
          if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1 && !this.bubbles.has(ia) && !this.bubbles.has(ib) && this.rng() < 0.5) {
            const pair = [['👋', '😊'], ['🎵', '🎶'], ['😆', '😄'], ['❤️', '🥰'], ['❓', '💡']][Math.floor(this.rng() * 5)]!;
            this.bubble(ia, pair[0]!);
            this.bubble(ib, pair[1]!, 2200);
            this.lastGreet = now;
          }
        }
      }
    }
    // De vez em quando alguém mostra uma emoção.
    if (now > this.nextEmote && this.villagers.size > 0 && !this.scene) {
      this.nextEmote = now + 4000 + this.rng() * 6000;
      const ids = [...this.villagers.keys()].filter((k) => !this.asleep.has(k));
      const id = ids[Math.floor(this.rng() * ids.length)];
      if (!id) return;
      const hour = new Date().getHours();
      const pool = hour >= 21 || hour < 6 ? ['💤', '💤', '🌙'] : this.weather.kind === 'chuva' ? ['☔', '💧', '😊'] : this.weather.kind === 'neve' ? ['❄️', '⛄', '🥶'] : ['🎵', '😊', '❗', '❓', '😋', '❤️', '🌸'];
      this.bubble(id, pool[Math.floor(this.rng() * pool.length)]!);
    }
  }

  resize(width: number, height: number): void {
    // Três vezes a densidade pinta mais de nove vezes os pixels de um celular
    // comum. A Vila é pixel art e já usa `image-rendering: pixelated`, então
    // limitar a 2× mantém a leitura nítida sem transformar cada quadro do mapa
    // em uma carga desnecessária para a GPU.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.scale = villageScale(width, height, dpr);
  }

  private draw(now: number): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const scale = this.scale;
    ctx.imageSmoothingEnabled = false;
    const pp = drawPos(this.player);
    // No diorama a textura sempre mostra a Vila inteira; no modo normal a câmera segue o treinador.
    const camX = this.diorama
      ? Math.round((this.map.w * TILE * scale - W) / 2)
      : Math.round(Math.min(Math.max(0, (pp.x + 0.5) * TILE * scale - W / 2), this.map.w * TILE * scale - W));
    const camY = this.diorama
      ? Math.round((this.map.h * TILE * scale - H) / 2)
      : Math.round(Math.min(Math.max(0, (pp.y + 0.5) * TILE * scale - H / 2), this.map.h * TILE * scale - H));
    this.view = { camX, camY };
    ctx.fillStyle = '#1d4a22';
    ctx.fillRect(0, 0, W, H);
    const ground = this.groundFrames[Math.floor(now / 450) % this.groundFrames.length]!;
    if (this.diorama) ctx.drawImage(ground, -camX, -camY, this.map.w * TILE * scale, this.map.h * TILE * scale);
    else ctx.drawImage(ground, camX / scale, camY / scale, W / scale, H / scale, 0, 0, W, H);

    const clock = new Date();
    const hour = clock.getHours();
    const minute = clock.getMinutes();
    const light = daylight(hour, minute);
    const night = light.dark > 0.3;
    const wx = this.weather;
    const ambientFx = this.ambientFx() && !this.reducedMotion?.matches;
    const sx = (x: number) => Math.round(x * TILE * scale - camX);
    const sy = (y: number) => Math.round(y * TILE * scale - camY);
    const T = TILE * scale;

    // Chão molhado e neve acumulada (só o chão; os objetos ficam por cima).
    if (wx.wet > 0.02) {
      ctx.fillStyle = `rgba(20,44,90,${(wx.wet * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (wx.snowCover > 0.02) {
      ctx.fillStyle = `rgba(246,250,255,${(wx.snowCover * 0.5).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Sombras das nuvens passando pelo chão.
    if (!night && wx.cloud < 0.95) {
      const cover = 1 - wx.cloud * 0.5;
      for (let i = 0; i < 4; i++) {
        const bx = ((now / 1000) * (0.45 + wx.windX) + i * 23) % (this.map.w + 30) - 15;
        const by = 6 + i * 9 + Math.sin(now / 9000 + i) * 2;
        const cx = sx(bx);
        const cy = sy(by);
        const r = (5 + (i % 2) * 2) * T;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(10,20,50,${(0.16 * cover).toFixed(3)})`);
        g.addColorStop(1, 'rgba(10,20,50,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }

    // Tudo que fica em pé, ordenado pela linha dos pés.
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];
    const overlays: (() => void)[] = [];
    // Efeitos altos não podem ficar presos ao z-order dos pés do prédio: uma
    // árvore ou outro prédio à frente acabaria escondendo a coluna inteira.
    // Eles são desenhados depois dos elementos do mapa, antes das partículas.
    const towerFx: (() => void)[] = [];
    const x0 = Math.floor(camX / T) - 2;
    const y0 = Math.floor(camY / T) - 2;
    const x1 = x0 + Math.ceil(W / T) + 4;
    const y1 = y0 + Math.ceil(H / T) + 4;
    const shadow = (cx: number, cy: number, rx: number, ry: number, a = 0.2) => {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const streetLamps: { x: number; y: number }[] = [];
    const homeGlows: { x: number; y: number; w: number; h: number; lantern?: boolean }[] = [];
    /** Janelas do tileset acesas à noite (o vidro do desenho vira luz). */
    const glassGlows: { img: HTMLCanvasElement; x: number; y: number; w: number; h: number }[] = [];
    const atlas = this.atlas;
    /**
     * Apresentação 2.5D do Diorama: sprites continuam em pé e ganham um
     * cisalhamento discreto. As sombras de contato já são desenhadas pelo mapa;
     * aqui não usamos blur nem filtro por sprite, pois isso pesa muito em celular.
     * Rotacionar o bitmap inteiro em 45° fazia prédios e personagens tombarem.
     */
    const drawDioramaTilted = (cx: number, base: number, width: number, paint: () => void): void => {
      if (!this.diorama || width <= 0) {
        paint();
        return;
      }
      const tilt = (VILLAGE_DIORAMA_OBJECT_TILT_DEG * Math.PI) / 180;
      // A constante de 45° define a força máxima da leitura 2.5D; ela não é
      // usada como rotação. Um cisalhamento de 0.18 desloca o topo para trás
      // e mantém a linha dos pés exatamente no ponto de contato com o chão.
      const shear = -Math.min(0.18, Math.tan(tilt) * 0.18);
      ctx.save();
      ctx.translate(cx, base);
      ctx.transform(1, 0, shear, 1, 0, 0);
      ctx.translate(-cx, -base);
      paint();
      ctx.restore();
    };
    /** Desenha um recorte em pé: a última linha visível encosta no chão em (cx, base). */
    const stand = (img: HTMLCanvasElement, cx: number, base: number, maxWidth = Infinity) => {
      const pixelScale = Math.min(scale, maxWidth / img.width);
      const w = img.width * pixelScale;
      const h = img.height * pixelScale;
      const x = Math.round(cx - w / 2);
      let opaqueBottom = atlasOpaqueBottoms.get(img);
      if (opaqueBottom === undefined) {
        const pixels = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
        opaqueBottom = -1;
        for (let row = img.height - 1; row >= 0 && opaqueBottom < 0; row--) {
          for (let col = 0; col < img.width; col++) {
            if (pixels[(row * img.width + col) * 4 + 3]! > 0) { opaqueBottom = row; break; }
          }
        }
        atlasOpaqueBottoms.set(img, opaqueBottom);
      }
      const y = Math.round(base - (opaqueBottom + 1) * pixelScale);
      drawDioramaTilted(cx, base, w, () => ctx.drawImage(img, x, y, w, h));
      return { x, y, w, h };
    };
    const lightUp = (id: string, key: string, at: { x: number; y: number; w: number; h: number }, transform?: (img: Rgba) => Rgba) => {
      const glass = this.art(id, `glass:${key}`, (img) => windowGlow(transform ? transform(img) : img));
      if (glass) glassGlows.push({ img: glass, ...at });
    };
    const wind = wx.windX * 0.5;
    const sway = (x: number, y: number, amp: number) => Math.sin(now / 900 + x * 0.7 + y * 0.3) * amp + Math.sin(now / 2300 + x) * amp * 0.6 + wind * amp * (0.6 + wx.rain);
    const drawSwayed = (img: HTMLCanvasElement, dx: number, dy: number, w: number, h: number, k: number) => {
      drawDioramaTilted(dx + w / 2, dy + h, w, () => {
        ctx.save();
        ctx.translate(dx + w / 2, dy + h);
        ctx.transform(1, 0, k, 1, 0, 0);
        ctx.drawImage(img, -w / 2, -h, w, h);
        ctx.restore();
      });
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = tileAt(this.map, x, y);
        if (atlas && (t === 'tree' || t === 'rock' || t === 'bush')) {
          const hv = hashN(x * 31 + y * 17);
          const depleted = this.harvestedToday(x, y);
          const lumberTree = x >= WORK_AREAS.lumber.x && x < WORK_AREAS.lumber.x + WORK_AREAS.lumber.w && y >= WORK_AREAS.lumber.y && y < WORK_AREAS.lumber.y + WORK_AREAS.lumber.h;
          const id = t === 'tree' ? (depleted ? 'stump' : lumberTree || hv < 0.62 ? 'pine-s1' : 'pine-s2') : t === 'rock' ? `rock-${1 + Math.floor(hv * 3)}` : t;
          const img = this.art(id);
          if (img) {
            const h = img.height * scale;
            if (t === 'tree') {
              list.push({ y: y + 1, draw: () => drawSwayed(img, sx(x), sy(y + 1) - h, T, h, depleted ? 0 : sway(x, y, 0.028)) });
            } else if (t === 'bush') {
              const fruit = !this.harvestedToday(x, y);
              list.push({
                y: y + 1,
                draw: () => {
                  shadow(sx(x + 0.5), sy(y + 1) - 1.5 * scale, 6 * scale, 2 * scale, 0.2);
                  drawSwayed(img, sx(x), sy(y), T, T, sway(x, y, 0.04));
                  // Frutinhas (Oran e Pecha) enquanto dá para colher hoje.
                  if (fruit) {
                    for (const [fx, fy, c] of [[4, 6, '#4a6ae8'], [9, 4, '#f28ab0'], [11, 9, '#4a6ae8'], [6, 11, '#f28ab0']] as const) {
                      ctx.fillStyle = c;
                      ctx.fillRect(sx(x) + fx * scale, sy(y) + fy * scale, 2 * scale, 2 * scale);
                    }
                  }
                },
              });
            } else {
              list.push({ y: y + 1, draw: () => { shadow(sx(x + 0.5), sy(y + 1) - 1.5 * scale, 6 * scale, 2 * scale, 0.2); ctx.save(); if (depleted) ctx.globalAlpha = .5; ctx.drawImage(img, sx(x), sy(y + 1) - h, T, h); ctx.restore(); } });
            }
            continue;
          }
        }
        if (t === 'tree') {
          const variant = (x * 7 + y * 3) % 3;
          const img = this.sprite(`tree${variant}`, () => paintTree(variant));
          list.push({
            y: y + 1,
            draw: () => {
              shadow(sx(x + 0.5), sy(y + 1) - scale, 6 * scale, 2.2 * scale, 0.18);
              drawSwayed(img, sx(x), sy(y - 1), T, 2 * T, sway(x, y, 0.028));
            },
          });
        } else if (t === 'rock') {
          const img = this.sprite('rock', paintRock);
          list.push({ y: y + 1, draw: () => { shadow(sx(x + 0.5), sy(y + 1) - 1.5 * scale, 6 * scale, 2 * scale, 0.2); ctx.drawImage(img, sx(x), sy(y), T, T); } });
        } else if (t === 'bush') {
          const fruit = !this.harvestedToday(x, y);
          const img = this.sprite(`bush${fruit}`, () => paintBush(fruit));
          list.push({ y: y + 1, draw: () => { shadow(sx(x + 0.5), sy(y + 1) - 1.5 * scale, 6 * scale, 2 * scale, 0.2); drawSwayed(img, sx(x), sy(y), T, T, sway(x, y, 0.04)); } });
        } else if (t === 'lamp') {
          const img = this.sprite(`lamp:${night}`, () => paintLamp(night));
          list.push({ y: y + 1, draw: () => { shadow(sx(x + 0.5), sy(y + 1) - 1 * scale, 4 * scale, 1.5 * scale, 0.18); ctx.drawImage(img, sx(x), sy(y - 1), T, 2 * T); } });
          if (night) streetLamps.push({ x, y });
        } else if (t === 'water') {
          if (ambientFx) drawWaterFx(ctx, sx(x), sy(y), T, now, hashN(x * 131 + y * 17) * 7, wx.rain, light.dark);
          // Brilhinhos na água.
          const h = hashN(x * 131 + y * 17);
          if (Math.sin(now / 500 + h * 40) > 0.93) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(sx(x) + Math.floor(h * 12) * scale, sy(y) + Math.floor(hashN(x + y * 99) * 12) * scale, 2 * scale, scale);
          }
        }
      }
    }
    // Enfeites fixos do mapa (parquinho, celeiro, jardineiras, árvores grandes).
    {
      for (const d of this.map.decor) {
        const worksite = d.kind === 'mine-board' ? WORK_SITES[1] : d.kind === 'lumber-board' ? WORK_SITES[2] : d.kind === 'fishing-board' ? WORK_SITES[3] : null;
        const img = d.kind === 'seed-box' ? this.sprite('seed-box', paintSeedBox) : d.kind === 'bell' ? this.sprite('bell', paintBell) : this.art(worksite ? 'board' : d.kind);
        if (!img) continue;
        if (d.x + d.w < x0 || d.x > x1 || d.y + d.h < y0 || d.y + d.h - img.height / TILE > y1) continue;
        const tree = d.kind === 'tree-big' || d.kind === 'pine-m';
        list.push({
          y: d.y + d.h,
          draw: () => {
            if (tree) drawSwayed(img, sx(d.x + d.w / 2) - (img.width * scale) / 2, sy(d.y + d.h) - img.height * scale, img.width * scale, img.height * scale, sway(d.x, d.y, 0.02));
            else {
              const at = stand(img, sx(d.x + d.w / 2), sy(d.y + d.h), d.w * T);
              if (d.kind === 'swing') {
                // O recorte do tileset traz a armação, mas o assento vermelho fica em uma peça vizinha da folha.
                // Desenhá-lo aqui mantém a parte interativa visível mesmo quando o atlas é recompilado.
                ctx.fillStyle = '#6f292a';
                ctx.fillRect(at.x + 15 * scale, at.y + 21 * scale, 34 * scale, 5 * scale);
                ctx.fillStyle = '#d8463c';
                ctx.fillRect(at.x + 17 * scale, at.y + 18 * scale, 30 * scale, 4 * scale);
                ctx.fillStyle = '#f0705f';
                ctx.fillRect(at.x + 18 * scale, at.y + 18 * scale, 28 * scale, scale);
              }
              if (worksite) {
                this.drawTag(sx(d.x + d.w / 2), at.y - 2 * scale, worksite.icon);
                if (Math.abs(this.player.x - d.x) + Math.abs(this.player.y - d.y) < 6) overlays.push(() => this.drawLabel(sx(d.x + d.w / 2), sy(d.y + d.h) + 2 * scale, worksite.name));
              }
              // O recorte do tileset dá a madeira; os papéis por cima deixam claro que este é o mural vivo da praça,
              // sem trocar a arte original por uma placa genérica. Variam só quando há avisos reais para consultar.
              if (d.kind === 'board') {
                const pending = this.state.requests.items.some((request) => !request.done) || (this.state.requests.story ?? []).some((request) => !request.done);
                const paper = (x: number, y: number, color: string, pin: string) => {
                  ctx.fillStyle = 'rgba(35, 24, 15, 0.62)';
                  ctx.fillRect(x + scale, y + scale, 9 * scale, 8 * scale);
                  ctx.fillStyle = color;
                  ctx.fillRect(x, y, 9 * scale, 8 * scale);
                  ctx.fillStyle = 'rgba(93, 70, 44, 0.78)';
                  ctx.fillRect(x + 2 * scale, y + 3 * scale, 5 * scale, scale);
                  ctx.fillRect(x + 2 * scale, y + 5 * scale, 4 * scale, scale);
                  ctx.fillStyle = pin;
                  ctx.fillRect(x + 4 * scale, y, scale, 2 * scale);
                };
                paper(at.x + 11 * scale, at.y + 20 * scale, '#f6df9e', '#d84a43');
                paper(at.x + 11 * scale, at.y + 36 * scale, pending ? '#d8ecff' : '#e7e2d3', pending ? '#386ec4' : '#9b815d');
                this.drawTag(sx(d.x + d.w / 2), at.y - 2 * scale + Math.sin(now / 500) * scale, pending ? '📌' : '🎪');
              }
            }
          },
        });
      }
    }
    const plot = this.map.plot;
    const homeBase = sy(buildingGroundY(plot));
    const houseId = this.state.house >= 3 ? 'house-brick' : this.state.house === 2 ? 'home-teal' : 'home-orange';
    const houseArt = atlas && this.state.house > 0 ? this.art(houseId) : null;
    if (houseArt) {
      list.push({
        y: buildingGroundY(plot),
        draw: () => {
          shadow(sx(plot.x + plot.w / 2), homeBase - 2 * scale, 34 * scale, 4 * scale, 0.2);
          const at = stand(houseArt, sx(plot.x + plot.w / 2), homeBase);
          if (night) lightUp(houseId, houseId, at);
        },
      });
    } else if (this.state.house > 0) {
      const img = this.sprite(`house${this.state.house}`, () => paintHouse(this.state.house));
      list.push({
        y: buildingGroundY(plot),
        draw: () => {
          shadow(sx(plot.x + 2), homeBase - 2 * scale, 30 * scale, 4 * scale, 0.2);
          drawDioramaTilted(sx(plot.x) + 2 * T, homeBase, 4 * T, () => ctx.drawImage(img, sx(plot.x), homeBase - 4 * T, 4 * T, 4 * T));
        },
      });
    }
    const shop = this.map.shop;
    const shopBaseY = buildingGroundY(shop);
    // A loja tem fachada própria no atlas. Nunca troque o prédio por guarda-sóis: eram só peças decorativas da praça.
    const shopArt = atlas ? this.art('market-store') : null;
    if (shopArt) {
      list.push({
        y: shopBaseY,
        draw: () => {
          shadow(sx(shop.x + shop.w / 2), sy(shopBaseY) - 2 * scale, 42 * scale, 4 * scale, 0.2);
          const at = stand(shopArt, sx(shop.x + shop.w / 2), sy(shopBaseY), shop.w * T);
          if (night) lightUp('market-store', 'market-store', at);
          this.drawTag(sx(shop.x + shop.w / 2), sy(shop.y - 1) + Math.sin(now / 350) * scale - 1 * scale, '🛒');
        },
      });
    } else {
    const shopImg = this.sprite('shop', paintShop);
    list.push({
      y: shopBaseY,
      draw: () => {
        shadow(sx(shop.x + 1.5), sy(shopBaseY) - 2 * scale, 24 * scale, 3.5 * scale, 0.2);
        drawDioramaTilted(sx(shop.x + 1.5), sy(shopBaseY), 3 * T, () => ctx.drawImage(shopImg, sx(shop.x), sy(shopBaseY) - 3 * T, 3 * T, 3 * T));
        this.drawTag(sx(shop.x + 1.5), sy(shop.y - 1) + Math.sin(now / 350) * scale - 1 * scale, '🛒');
      },
    });
    }
    for (const b of this.map.buildings) {
      // Os prédios do tileset são altos (a Torre sobe ~10 blocos): entram na lista mesmo com a base fora da tela.
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1 + 10) continue;
      const open = this.townLevel >= b.unlock;
      const bottom = sy(b.y + b.h);
      const spriteBase = sy(buildingGroundY(b));
      const left = sx(b.x);
      const mid = sx(b.x + b.w / 2);
      const nearDoor = Math.abs(this.player.x - b.door.x) + Math.abs(this.player.y - b.door.y) <= 4;
      if (b.kind === 'fountain') {
        const f = Math.floor(now / 450) % 2;
        const img = this.sprite(`fonte${f}`, () => paintFountain(f));
        list.push({ y: buildingGroundY(b), draw: () => { shadow(mid, spriteBase - 3 * scale, 14 * scale, 4 * scale, 0.16); drawDioramaTilted(mid, spriteBase, 32 * scale, () => ctx.drawImage(img, left, spriteBase - 40 * scale, 32 * scale, 40 * scale)); if (ambientFx) drawFountainFx(ctx, left + 16 * scale, spriteBase, scale, now); } });
        if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, b.name));
        continue;
      }
      const wpx = b.w * T;
      const fence = atlas ? this.art('fence-h') : null;
      const drawLot = () => {
        if (!fence) return false;
        list.push({ y: b.y + b.h, draw: () => { drawDioramaTilted(mid, bottom, wpx, () => { for (let i = 0; i + 2 <= b.w + 1; i += 2) ctx.drawImage(fence, sx(b.x + Math.min(i, b.w - 2)), bottom - 16 * scale, 32 * scale, 16 * scale); }); } });
        return true;
      };
      if (!open && drawLot()) {
        if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, `🔒 Nível ${b.unlock} de Treinador`));
        continue;
      }
      if (b.kind === 'home' && [...this.homes.values()].every((l) => l !== b.lot) && drawLot()) {
        if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, 'Terreno livre'));
        continue;
      }
      if (!open) {
        const img = this.sprite('lot', paintLot);
        list.push({ y: b.y + b.h, draw: () => drawDioramaTilted(mid, bottom, wpx, () => ctx.drawImage(img, left, bottom - 48 * scale, wpx, 3 * T)) });
        if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, `🔒 Nível ${b.unlock} de Treinador`));
        continue;
      }
      if (b.kind === 'home' && [...this.homes.values()].every((l) => l !== b.lot)) {
        // Terreno liberado, mas sem morador ainda: a casa só é construída quando chega um Pokémon para morar nela.
        const img = this.sprite('lot', paintLot);
        list.push({ y: b.y + b.h, draw: () => drawDioramaTilted(mid, bottom, wpx, () => ctx.drawImage(img, left, bottom - 48 * scale, wpx, 3 * T)) });
        if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, 'Terreno livre'));
        continue;
      }
      if (b.kind === 'home' && atlas) {
        const lot = b.lot ?? 0;
        const v = homeOf(this.state, lot);
        const lvl = homeLevel(v);
        const decor = homeDecor(v);
        const roof = ROOFS[roofIndex(v, lot)]!.rgb;
        const id = HOME_TILESET[lvl] ?? 'gazebo';
        const tint = HOME_TINTED.has(id) ? (img: Rgba) => recolor(img, roof) : undefined;
        const key = `${id}:${tint ? roof : 0}`;
        const img = this.art(id, key, tint);
        const fenceArt = decor & 2 ? this.art('fence-h') : null;
        const planter = decor & 1 ? this.art('planter') : null;
        const lantern = decor & 4 ? this.sprite(`lamp:${night}`, () => paintLamp(night)) : null;
        const who = [...this.homes].filter(([, l]) => l === lot).map(([id2]) => id2);
        const sleeping = who.length > 0 && who.every((id2) => this.asleep.has(id2));
        if (img) {
          list.push({
            y: buildingGroundY(b),
            draw: () => {
              shadow(mid, spriteBase - 2 * scale, 30 * scale, 3.5 * scale, 0.2);
              const at = stand(img, mid, spriteBase);
              if (night && who.length > 0) lightUp(id, key, at, tint);
              // Enfeites da casa (comprados na Vila): jardineira, cerquinha, lampião e caixa de correio.
              drawDioramaTilted(mid, spriteBase, Math.max(wpx, b.w * T), () => {
                if (planter) ctx.drawImage(planter, left, spriteBase - 10 * scale, 24 * scale, 13 * scale);
                if (fenceArt) {
                  ctx.drawImage(fenceArt, 0, 0, 16, 16, left - 8 * scale, spriteBase - 14 * scale, 16 * scale, 16 * scale);
                  ctx.drawImage(fenceArt, 16, 0, 16, 16, left + b.w * T - 8 * scale, spriteBase - 14 * scale, 16 * scale, 16 * scale);
                }
                // No vão ao lado da casa (o desenho do tileset ocupa a frente inteira): não tapa janela nem porta.
                if (lantern) ctx.drawImage(lantern, left + b.w * T, spriteBase - 2 * T, T, 2 * T);
                if (decor & 8) {
                  ctx.fillStyle = '#6a4a28';
                  ctx.fillRect(left + 2 * scale, spriteBase - 10 * scale, 2 * scale, 10 * scale);
                  ctx.fillStyle = '#3f6fd0';
                  ctx.fillRect(left, spriteBase - 14 * scale, 6 * scale, 5 * scale);
                }
              });
              if (sleeping) this.drawTag(mid, at.y + 10 * scale + Math.sin(now / 600) * scale, '💤');
              const tag = this.houseTags.get(lot);
              if (tag && now > tag.until) this.houseTags.delete(lot);
              else if (tag) this.drawTag(mid, at.y - 4 * scale - Math.abs(Math.sin(now / 140)) * 3 * scale, tag.emoji);
            },
          });
          if (nearDoor) {
            const text = who.length === 0 ? 'Casa vazia' : `Casa de ${who.map((id2) => this.names.get(id2) ?? '').join(' e ')}`;
            overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, text));
          }
          continue;
        }
      }
      if (b.kind === 'home') {
        const lot = b.lot ?? 0;
        const v = homeOf(this.state, lot);
        const lvl = homeLevel(v);
        const decor = homeDecor(v);
        const roof = ROOFS[roofIndex(v, lot)]!.rgb;
        const style = homeStyleOf(this.state, lot);
        const img = this.sprite(`home:${lvl}:${roof}:${decor}:${style}`, () => paintHome(lvl, roof, decor, style));
        const who = [...this.homes].filter(([, l]) => l === lot).map(([id]) => id);
        const sleeping = who.length > 0 && who.every((id) => this.asleep.has(id));
        list.push({
            y: buildingGroundY(b),
          draw: () => {
            shadow(mid, spriteBase - 2 * scale, 22 * scale, 3.5 * scale, 0.2);
            drawDioramaTilted(mid, spriteBase, 3 * T, () => ctx.drawImage(img, left, spriteBase - 48 * scale, 3 * T, 3 * T));
            if (sleeping) this.drawTag(mid, spriteBase - 38 * scale + Math.sin(now / 600) * scale, '💤');
            const tag = this.houseTags.get(lot);
            if (tag && now > tag.until) this.houseTags.delete(lot);
            else if (tag) this.drawTag(mid, spriteBase - 52 * scale - Math.abs(Math.sin(now / 140)) * 3 * scale, tag.emoji);
          },
        });
        if (night && who.length > 0) {
          for (const w of HOME_WINDOWS[lvl]!) homeGlows.push({ x: left + w[0]! * scale, y: spriteBase - 48 * scale + w[1]! * scale, w: w[2]! * scale, h: w[3]! * scale });
          if (decor & 4) homeGlows.push({ x: left + HOME_LANTERN.x * scale, y: spriteBase - 48 * scale + HOME_LANTERN.y * scale, w: 2 * scale, h: 2 * scale, lantern: true });
        }
        if (nearDoor) {
          const text = who.length === 0 ? 'Casa vazia' : `Casa de ${who.map((id) => this.names.get(id) ?? '').join(' e ')}`;
          overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, text));
        }
        continue;
      }
      const emoji = CIVIC_EMOJI[b.kind] ?? '🏛️';
      const civicId = CIVIC_TILESET[b.kind];
      const civicArt = atlas && civicId ? this.art(civicId) : null;
      if (civicArt && civicId) {
        list.push({
          y: buildingGroundY(b),
          draw: () => {
            shadow(mid, spriteBase - 2 * scale, wpx / 2 - 2 * scale, 3.5 * scale, 0.2);
            const at = stand(civicArt, mid, spriteBase, wpx);
            if (night) lightUp(civicId, civicId, at);
            this.drawTag(mid, at.y - 2 * scale + Math.sin(now / 350) * scale, emoji);
          },
        });
        if (b.kind === 'torre' && ambientFx) towerFx.push(() => drawTowerDataFx(ctx, mid, spriteBase, scale, now));
        if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, b.name));
        continue;
      }
      const img = this.sprite(b.kind, CIVIC_ART[b.kind] ?? paintMuseum);
      list.push({
        y: buildingGroundY(b),
        draw: () => {
          shadow(mid, spriteBase - 2 * scale, (wpx / 2 - 2 * scale), 3.5 * scale, 0.2);
          drawDioramaTilted(mid, spriteBase, wpx, () => ctx.drawImage(img, left, spriteBase - 48 * scale, wpx, 3 * T));
          this.drawTag(mid, spriteBase - 50 * scale + Math.sin(now / 350) * scale, emoji);
        },
      });
      if (b.kind === 'torre' && ambientFx) towerFx.push(() => drawTowerDataFx(ctx, mid, spriteBase, scale, now));
      if (night) homeGlows.push({ x: left + 4 * scale, y: bottom - 20 * scale, w: wpx - 8 * scale, h: 6 * scale });
      if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, b.name));
    }
    // O banco fica atrás dos moradores; os pés sobem até a altura do assento.
    for (const bench of this.getBenchVisits().benches) {
      if (bench.x + 2 < x0 || bench.x > x1 || bench.y < y0 || bench.y > y1) continue;
      const img = this.sprite('public-bench', () => paintFurnitureItem('banco', false, 0));
      list.push({ y: bench.y + 0.5, draw: () => {
        shadow(sx(bench.x + 1), sy(bench.y + 1), 12 * scale, 2 * scale, 0.18);
        drawDioramaTilted(sx(bench.x + 1), sy(bench.y + 1), 2 * T, () => ctx.drawImage(img, sx(bench.x), sy(bench.y), 2 * T, T));
      } });
    }
    const lamps: { x: number; y: number; big: boolean }[] = [];
    for (const f of this.state.placed) {
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      const def = itemDef(f.item);
      const frame = def?.frames ? Math.floor(now / (f.item === 'moinho' ? 140 : f.item === 'fogueira' || f.item === 'tocha' ? 150 : 340)) % def.frames : 0;
      const lit = !!def?.light && night;
      if (lit) lamps.push({ x: f.x, y: f.y, big: f.item === 'fogueira' || f.item === 'lareira' || f.item === 'pinheirinho' });
      const img = this.sprite(`f:${f.item}:${lit}:${frame}`, () => paintFurnitureItem(f.item, lit, frame));
      const tall = !!def?.tall;
      list.push({
        y: f.y + 1,
        draw: () => {
          shadow(sx(f.x + 0.5), sy(f.y + 1) - 1.5 * scale, (tall ? 5 : 6) * scale, 2 * scale, 0.18);
          const base = sy(f.y + 1);
          drawDioramaTilted(sx(f.x + 0.5), base, T, () => {
            if (tall) ctx.drawImage(img, sx(f.x), sy(f.y - 1), T, 2 * T);
            else ctx.drawImage(img, sx(f.x), sy(f.y), T, T);
          });
        },
      });
    }
    for (const c of this.state.crops) {
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      const g = itemDef(c.seed)?.grows;
      if (!g) continue;
      const img = this.sprite(`crop:${g.crop}:${c.stage}`, () => paintCrop(g.crop, c.stage, g.stages));
      const thirsty = needsWater(c);
      list.push({
        y: c.y + 0.9,
        draw: () => {
          drawSwayed(img, sx(c.x), sy(c.y), T, T, sway(c.x, c.y, 0.03));
          if (thirsty) this.drawTag(sx(c.x + 0.5), sy(c.y) - 2 * scale + Math.sin(now / 300) * scale, '💧');
          else if (c.stage >= g.stages) this.drawTag(sx(c.x + 0.5), sy(c.y) - 2 * scale + Math.sin(now / 260) * scale, '✨');
        },
      });
    }
    const near = (w: Walker): boolean => Math.abs(w.x - this.player.x) + Math.abs(w.y - this.player.y) <= 3;
    for (const [id, w] of this.villagers) {
      const sprite = this.monSprites.get(id);
      if (!sprite || this.asleep.has(id)) continue;
      const pos = drawPos(w);
      list.push({
        y: pos.y + 1,
        draw: () => {
          // Quem tem sprite local usa a pose de verdade da direção (vira pra frente de quem andou de verdade);
          // sem ela, cai no espelhamento de sempre (o GIF do Showdown só olha pra um lado).
          const metal = sprite.digital && this.metallic() ? this.metalOf(sprite) : null;
          const dirSet = (metal ? metal.dirFrames : sprite.dirFrames)?.[w.dir];
          const activeFrames = dirSet ?? (metal ? metal.frames : sprite.frames);
          const frame = activeFrames[frameIndexAt(sprite.gif, now * this.animSpeed())] ?? activeFrames[0]!;
          // `h`/`wpx` são o tamanho do BICHO (sem a margem transparente); o quadro inteiro (`fullH`/`fullW`) é
          // desenhado maior na mesma proporção, pra caber a margem — e posicionado (`frameLeft`/`frameTop`) de
          // forma que os pixels opacos (não o quadro inteiro) fiquem centrados no bloco e com o pé no chão.
          const seated = this.benchVisits?.seated(id, w) ?? false;
          const h = sprite.heightTiles * TILE * scale * (seated ? 0.85 : 1);
          const wpx = h * (sprite.gif.width / sprite.gif.height);
          const contentHeightFrac = Math.max(0.001, sprite.bounds.bottom - sprite.bounds.top);
          const fullH = h / contentHeightFrac;
          const fullW = fullH * (sprite.gif.width / sprite.gif.height);
          const born = this.bounce.get(id);
          const bounceAge = born ? now - born : 9999;
          const hop = (moving(w) ? Math.abs(Math.sin(w.t * Math.PI)) * 2 * scale : 0) + (bounceAge < 500 ? Math.abs(Math.sin(bounceAge * 0.012)) * 4 * scale : 0);
          const cx = sx(pos.x + 0.5);
          const base = sy(pos.y + (seated ? 0.62 : 1)) - 2 * scale - hop;
          const contentCx = (sprite.bounds.left + sprite.bounds.right) / 2;
          const frameLeft = cx - contentCx * fullW;
          const frameTop = base - sprite.bounds.bottom * fullH;
          shadow(cx, sy(pos.y + 1) - 2 * scale, (5 - hop / (2 * scale) * 0.3) * scale, 2 * scale, 0.22);
          drawDioramaTilted(cx, base, Math.max(fullW, wpx), () => {
            ctx.save();
            // Os sprites do Showdown olham para a esquerda: andando para a direita, espelha. Quem já tem a pose
            // direita de verdade (sprite local) não precisa desse truque.
            if (!dirSet && w.dir === 'right') {
              ctx.translate(cx, 0);
              ctx.scale(-1, 1);
              ctx.translate(-cx, 0);
            }
            const acc = this.state.wear.mons[id];
            const def = acc ? itemDef(acc) : undefined;
            const hx = frameLeft + sprite.headX * fullW;
            const hy = frameTop + sprite.headTop * fullH;
            if (acc && def?.pos === 'back') {
              const size = Math.max(9 * scale, Math.min(16 * scale, wpx * 0.6));
              ctx.drawImage(this.sprite(`acc:${acc}`, () => paintAccessory(acc)), Math.round(cx - size / 2), Math.round(base - h * 0.62), Math.round(size), Math.round(size));
            }
            ctx.drawImage(frame, Math.round(frameLeft), Math.round(frameTop), Math.round(fullW), Math.round(fullH));
            if (metal) this.drawSheen(id, frame, Math.round(frameLeft), Math.round(frameTop), Math.round(fullW), Math.round(fullH), now);
            if (acc && def && def.pos !== 'back') {
              const size = Math.max(8 * scale, Math.min(14 * scale, wpx * 0.45));
              const img = this.sprite(`acc:${acc}`, () => paintAccessory(acc));
              const y = def.pos === 'hat' ? hy - size * 0.7 : def.pos === 'face' ? hy + size * 0.15 : hy + h * 0.2;
              ctx.drawImage(img, Math.round(hx - size / 2), Math.round(y), Math.round(size), Math.round(size));
            }
            ctx.restore();
          });
          const activeTask = this.farmTasks.get(id);
          if (activeTask?.workingSince != null && w.x === activeTask.stand.x && w.y === activeTask.stand.y && !moving(w)) drawWorkAction(ctx, activeTask, cx, base, sx(activeTask.x + .5), sy(activeTask.y + .65), scale, now, ambientFx);
           const activeCommunity = this.communityWork.get(id);
           if (!activeTask && activeCommunity && now < activeCommunity.until && !moving(w)) {
             drawCommunityWorkAction(ctx, activeCommunity.activity, cx, base, sx(activeCommunity.target.x), sy(activeCommunity.target.y), scale, now, ambientFx);
           }
          if (near(w) && !this.scene) {
            const hearts = Math.round(friendOf(this.state, id).points / 20);
            const working = this.communityWork.get(id);
            const farmTask = this.farmTasks.get(id);
            const taskStatus = farmTask ? farmTask.workingSince === null ? 'a caminho' : 'trabalhando' : '';
            const taskIcon = farmTask ? ({ plant: '🌱', water: '💧', harvest: '🧺', mine: '⛏️', lumber: '🪓', fish: '🎣' } as const)[farmTask.kind] : '';
            const activityLabel = farmTask ? ` · ${taskStatus} ${taskIcon}` : working && now < working.until ? ` · ${COMMUNITY_ACTIVITY_NAMES[working.activity]}` : '';
            if (farmTask?.workingSince !== null && farmTask) {
              const workEmoji = ({ mine: '⛏️', lumber: '🪓', fish: '🎣' } as const)[farmTask.kind as 'mine' | 'lumber' | 'fish'];
              if (workEmoji) this.drawTag(cx, base - h - 9 * scale - Math.abs(Math.sin(now / 150)) * 2 * scale, workEmoji);
            }
            overlays.push(() => this.drawLabel(cx, sy(pos.y + 1) + 1 * scale, `${this.names.get(id) ?? ''}${seated ? ' · descansando' : activityLabel} ${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)}`));
          }
          overlays.push(() => this.drawBubble(id, cx, base - h, now));
        },
      });
    }
    const outfit = outfitFor(this.trainerId);
    const accP = this.state.wear.player;
    const accDef = accP ? itemDef(accP) : undefined;
    const hatless = accDef?.pos === 'hat';
    const step = moving(this.player) ? this.player.steps + (this.player.t > 0.5 ? 1 : 0) : -1;
    const pimg = this.trainerAtlas ? null : this.sprite(`p:${this.player.dir}:${step < 0 ? 's' : step % 2}:${this.trainerId}:${hatless}`, () => harmonizePlayerSprite(paintPlayer(this.player.dir, step, hatless ? { ...outfit, gear: 'none' } : outfit)));
    const trainerAvatar = this.trainerAvatar;
    list.push({
      y: pp.y + 1.01,
      draw: () => {
        shadow(sx(pp.x + 0.5), sy(pp.y + 1) - 1 * scale, 5 * scale, 2 * scale, 0.24);
        const hop = !this.trainerAtlas && moving(this.player) ? Math.abs(Math.sin(this.player.t * Math.PI)) * 1.5 * scale : 0;
        const px0 = sx(pp.x);
        const py0 = sy(pp.y + 1) - (PLAYER_H + 1) * scale - hop;
        const dir = this.player.dir;
        const pos = accDef?.pos;
        // O treinador também é uma peça em pé no Diorama. O ponto de apoio
        // continua no chão e a elevação da rotação é calculada pelo helper.
        drawDioramaTilted(px0 + T / 2, py0 + PLAYER_H * scale, T, () => {
          if (accP && pos === 'back' && dir !== 'up') this.drawAcc(accP, px0 + 2 * scale, py0 + 11 * scale, 12 * scale);
          const atlas = this.trainerAtlas;
          const frame = atlas ? trainerAtlasFrame(atlas.image.naturalWidth, atlas.image.naturalHeight, dir, moving(this.player), this.player.steps, this.player.t, now) : null;
          if (atlas && frame) {
            const bounds = atlas.bounds;
            const height = PLAYER_H * scale;
            const width = height * bounds.width / bounds.height;
            const left = px0 + T / 2 - (frame.width / 2 - bounds.x) * height / bounds.height;
            ctx.drawImage(atlas.filtered ?? atlas.image, frame.x + bounds.x, frame.y + bounds.y, bounds.width, bounds.height, left, py0, width, height);
          } else if (trainerAvatar && dir !== 'up') {
            const aspect = trainerAvatar.width / trainerAvatar.height;
            const avatarH = Math.min(PLAYER_H * scale, (T * 1.4) / aspect);
            const avatarW = avatarH * aspect;
            const avatarX = px0 + (T - avatarW) / 2;
            if (dir === 'left') {
              ctx.save();
              ctx.translate(avatarX + avatarW / 2, py0 + avatarH / 2);
              ctx.scale(-1, 1);
              ctx.drawImage(trainerAvatar, -avatarW / 2, -avatarH / 2, avatarW, avatarH);
              ctx.restore();
            } else ctx.drawImage(trainerAvatar, avatarX, py0, avatarW, avatarH);
          } else if (pimg) ctx.drawImage(pimg, px0, py0, T, PLAYER_H * scale);
          if (accP) {
            if (pos === 'hat') this.drawAcc(accP, px0 + 1 * scale, py0 - 5 * scale, 14 * scale);
            else if (pos === 'face' && dir !== 'up') this.drawAcc(accP, px0 + (dir === 'down' ? 3 : dir === 'right' ? 5 : 1) * scale, py0 + 3 * scale, 10 * scale);
            else if (pos === 'neck') this.drawAcc(accP, px0 + 3 * scale, py0 + 8 * scale, 10 * scale);
            else if (pos === 'back' && dir === 'up') this.drawAcc(accP, px0 + 2 * scale, py0 + 11 * scale, 12 * scale);
          }
        });
      },
    });
    if (this.bobber) {
      const b = this.bobber;
      if (now > b.until) this.bobber = null;
      else {
        list.push({
          y: b.y + 0.9,
          draw: () => {
            const bx = sx(b.x + 0.5);
            const by = sy(b.y + 0.55) + Math.sin(now / 160) * scale;
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = Math.max(1, scale * 0.4);
            ctx.beginPath();
            ctx.moveTo(sx(pp.x + 0.5), sy(pp.y + 0.2));
            ctx.quadraticCurveTo((bx + sx(pp.x + 0.5)) / 2, Math.min(by, sy(pp.y)) - 10 * scale, bx, by);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.ellipse(bx, by + 2 * scale, 5 * scale + Math.sin(now / 200) * scale, 2 * scale, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#e8403a';
            ctx.fillRect(bx - scale, by - 2 * scale, 2 * scale, 2 * scale);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(bx - scale, by, 2 * scale, 2 * scale);
          },
        });
      }
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    for (const fx of towerFx) fx();

    // Partículas do mundo (poeira, folhas, fumaça, puf) e borboletas.
    for (const q of this.particles) {
      const age = (now - q.born) / q.life;
      const x = sx(q.x);
      const y = sy(q.y);
      if (x < -50 || y < -50 || x > W + 50 || y > H + 50) continue;
      if (q.kind === 'dust') {
        ctx.fillStyle = `rgba(230,220,190,${((1 - age) * 0.6).toFixed(2)})`;
        const s = (1 + age * 2) * scale;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      } else if (q.kind === 'leaf') {
        ctx.fillStyle = q.color ?? '#6cc85c';
        const f = Math.sin(age * 40) > 0;
        ctx.fillRect(x, y, (f ? 2 : 1) * scale, (f ? 1 : 2) * scale);
      } else if (q.kind === 'smoke') {
        ctx.fillStyle = `rgba(225,225,235,${((1 - age) * 0.5).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, (2 + age * 5) * scale, 0, Math.PI * 2);
        ctx.fill();
      } else if (q.kind === 'poof') {
        ctx.fillStyle = `rgba(255,255,255,${((1 - age) * 0.8).toFixed(2)})`;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * age * 10 * scale, y + Math.sin(a) * age * 7 * scale, (3 - age * 2) * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (q.emoji) {
        ctx.globalAlpha = Math.min(1, (1 - age) * 2);
        ctx.font = `${Math.round(8 * scale)}px ${EMOJI_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(q.emoji, x, y);
        ctx.globalAlpha = 1;
      }
    }
    if (!night) {
      for (const m of this.motes) {
        const wing = Math.sin(m.phase) > 0 ? 2 : 1;
        const color = ['#ffffff', '#ffd84a', '#f8a8c8', '#9ad0ff'][Math.floor(m.phase) % 4]!;
        ctx.fillStyle = color;
        const bx = sx(m.x);
        const by = sy(m.y) - 10 * scale;
        ctx.fillRect(bx - wing * scale, by, wing * scale, 2 * scale);
        ctx.fillRect(bx + scale, by, wing * scale, 2 * scale);
      }
    }

    // Clima: cor do céu, chuva e neve.
    if (wx.cloud > 0.02 || wx.rain > 0.02 || wx.snow > 0.02) {
      ctx.fillStyle = `rgba(34,46,70,${(wx.cloud * 0.16 + wx.rain * 0.14).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      if (wx.snow > 0.05) {
        ctx.fillStyle = `rgba(235,245,255,${(wx.snow * 0.1).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    if (wx.rain > 0.05) {
      const n = Math.round(wx.rain * 150);
      // A chuva cai quase na vertical. O vento só desloca levemente cada gota,
      // em vez de transformar toda a tela em riscos diagonais paralelos.
      const wind = Math.max(-1, Math.min(1, wx.windX));
      ctx.strokeStyle = 'rgba(190,215,255,0.52)';
      ctx.lineWidth = Math.max(1, scale * 0.45);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const sp = 0.7 + hashN(i * 3) * 0.6;
        const rx = (hashN(i) * (W + 60) + now * 0.012 * wind) % (W + 60);
        const ry = (hashN(i + 500) * H + now * 0.9 * sp * (scale / 3)) % H;
        const length = (7 + sp * 5) * scale;
        const drift = (wind * 2.4 + Math.sin(now / 1500 + i * 1.7) * 0.35) * scale;
        ctx.moveTo(rx - 30, ry - length * 0.35);
        ctx.lineTo(rx - 30 + drift, ry + length * 0.65);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
      // Ondinhas no chão.
      ctx.strokeStyle = 'rgba(210,230,255,0.45)';
      for (let i = 0; i < 9; i++) {
        const bucket = Math.floor(now / 800) + i * 7;
        const age = (now % 800) / 800;
        const rx = hashN(bucket * 13 + i) * W;
        const ry = hashN(bucket * 29 + i) * H;
        ctx.beginPath();
        ctx.ellipse(rx, ry, (1 + age * 4) * scale, (0.5 + age * 1.6) * scale, 0, 0, Math.PI * 2);
        ctx.globalAlpha = 1 - age;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    if (wx.snow > 0.05) {
      const n = Math.round(wx.snow * 110);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < n; i++) {
        const sp = 0.25 + hashN(i * 5) * 0.35;
        const fx = (hashN(i) * W + Math.sin(now / 900 + i) * 14 * scale + now * 0.02 * wx.windX * 6) % W;
        const fy = (hashN(i + 900) * H + now * 0.09 * sp * (scale / 3)) % H;
        const sz = (hashN(i + 3) > 0.7 ? 2 : 1) * scale;
        ctx.fillRect((fx + W) % W, fy, sz, sz);
      }
    }

    // Dia e noite.
    if (light.warm > 0) {
      ctx.fillStyle = `rgba(255,140,60,${(light.warm * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (light.dark > 0) {
      ctx.fillStyle = `rgba(12,18,58,${light.dark.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const glow = (cx: number, cy: number, r: number, rgb: string, a: number) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      };
      for (const l of lamps) {
        const storm = this.lampStorm();
        // Zapdos: todos os postes piscam de verdade (quedas curtas e irregulares), não só o balanço suave dos grandes.
        const flicker = storm
          ? (Math.sin(now / 37 + l.x * 7) > 0.82 || Math.sin(now / 173 + l.y * 3) > 0.9 ? 0.15 : 1)
          : l.big ? 0.85 + Math.sin(now / 120 + l.x) * 0.15 : 1;
        glow(sx(l.x + 0.5), sy(l.y + 0.2), (l.big ? 3.4 : 2.5) * T, '255,214,120', light.dark * 0.7 * flicker);
      }
      // Janelas acesas da casa e a luz da loja.
      for (const g of glassGlows) {
        ctx.globalAlpha = Math.min(1, light.dark * 1.3);
        ctx.drawImage(g.img, g.x, g.y, g.w, g.h);
        ctx.globalAlpha = 1;
      }
      if (!houseArt && this.state.house >= 2) {
        const ox = sx(plot.x);
        const oy = sy(plot.y + plot.h + 1 - 4);
        const win = this.state.house >= 3 ? [[11, 38, 10, 9], [43, 38, 10, 9]] : [[12, 40, 8, 7]];
        for (const [wx0, wy0, ww, wh] of win as number[][]) {
          ctx.fillStyle = `rgba(255,214,120,${(light.dark * 1.4).toFixed(3)})`;
          ctx.fillRect(ox + wx0! * (T / 16), oy + wy0! * (T / 16), ww! * (T / 16), wh! * (T / 16));
          glow(ox + (wx0! + ww! / 2) * (T / 16), oy + (wy0! + wh! / 2) * (T / 16), 2.2 * T, '255,200,110', light.dark * 0.45);
        }
      }
      glow(sx(shop.x + 1.5), sy(shop.y + shop.h + 1 - 1.2), 3 * T, '255,190,120', light.dark * 0.5);
      for (const l of streetLamps) glow(sx(l.x + 0.5), sy(l.y - 0.3), 2.6 * T, '255,214,120', light.dark * 0.6);
      for (const g of homeGlows) {
        ctx.fillStyle = `rgba(255,214,120,${(light.dark * 1.2).toFixed(3)})`;
        ctx.fillRect(g.x, g.y, g.w, g.h);
        glow(g.x + g.w / 2, g.y + g.h / 2, (g.lantern ? 1.8 : 1.5) * T, '255,200,110', light.dark * 0.4);
      }
      // Vagalumes.
      if (night) {
        for (const m of this.motes) {
          const a = 0.35 + 0.65 * Math.max(0, Math.sin(m.phase * 0.7));
          glow(sx(m.x), sy(m.y) - 8 * scale, 4 * scale, '220,255,140', a);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (ambientFx && this.weatherMode() !== 'off') drawSunRays(ctx, W, H, now, (1 - light.dark) * (1 - wx.cloud) * (1 - wx.rain) * (1 - wx.snow));
    // Vinheta: escurece de leve as bordas.
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    for (const o of overlays) o();
  }

  /**
   * Brilho metálico que atravessa o Digital Pokémon de tempos em tempos: uma faixa clara na diagonal, recortada
   * pelos pixels opacos do próprio quadro (fora deles não aparece nada). Só desenha durante a passada.
   */
  private drawSheen(id: string, frame: HTMLCanvasElement, x: number, y: number, w: number, h: number, now: number): void {
    const t = sheenAt(now, sheenOffset(id));
    if (t === null || w <= 0 || h <= 0) return;
    const c = (this.sheenCanvas ??= document.createElement('canvas'));
    if (c.width !== frame.width) c.width = frame.width;
    if (c.height !== frame.height) c.height = frame.height;
    const g = c.getContext('2d');
    if (!g) return;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(frame, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const span = c.width + c.height;
    const center = -c.height + t * (span + c.height);
    const band = g.createLinearGradient(center - c.height * 0.35, 0, center + c.height * 0.35, c.height * 0.5);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(235,245,255,0.55)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = band;
    g.fillRect(0, 0, c.width, c.height);
    this.ctx.drawImage(c, x, y, w, h);
  }

  private drawAcc(id: string, x: number, y: number, size: number): void {
    const img = this.sprite(`acc:${id}`, () => paintAccessory(id));
    this.ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  }

  /** Emoji pequeno sem balão (gota da horta, brilho de pronto). */
  /** Uma plaquinha redonda com o emoji (sobre prédios, a loja, quem dorme): fundo claro para não parecer objeto solto. */
  private drawTag(cx: number, y: number, emoji: string): void {
    const { ctx, scale } = this;
    const r = 5 * scale;
    const cy = y - r;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(20,24,40,0.85)';
    ctx.lineWidth = Math.max(1, scale * 0.6);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = `${6 * scale}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(emoji, cx, cy + scale * 0.4);
  }

  /** Nome e corações de quem está perto de você. */
  private drawLabel(cx: number, y: number, text: string): void {
    const { ctx, scale } = this;
    ctx.font = `bold ${Math.round(3.6 * scale)}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 6 * scale;
    const h = 6 * scale;
    ctx.fillStyle = 'rgba(14,19,34,0.78)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y, w, h, 3 * scale);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, y + h / 2 + 0.3 * scale);
  }

  private drawBubble(id: string, cx: number, top: number, now: number): void {
    const talk = this.speech.get(id);
    if (talk) {
      if (now > talk.until + 150) this.speech.delete(id);
      else this.drawSpeech(cx, top, talk, now);
      return;
    }
    const b = this.bubbles.get(id);
    if (!b) return;
    if (now > b.until) {
      this.bubbles.delete(id);
      return;
    }
    const { ctx, scale } = this;
    const size = 9 * scale;
    const x = cx - size / 2 - 2 * scale;
    const y = top - size - 4 * scale;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a1a24';
    ctx.lineWidth = scale;
    ctx.beginPath();
    ctx.roundRect(x, y, size + 4 * scale, size + 2 * scale, 3 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.font = `${Math.round(size * 0.8)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(b.emoji, cx, y + (size + 2 * scale) / 2);
  }

  /** O balão de fala dos momentos: o texto aparece letra por letra, com o nome de quem fala. */
  private drawSpeech(cx: number, top: number, s: { text: string; name: string; start: number; tint: string }, now: number): void {
    const { ctx, canvas, scale } = this;
    const fs = Math.max(13, Math.round(5.4 * scale));
    ctx.font = `bold ${fs}px system-ui, sans-serif`;
    const shown = s.text.slice(0, Math.max(1, Math.floor((now - s.start) / 22)));
    const maxW = Math.min(canvas.width - 24, 90 * scale);
    // A caixa se dimensiona pelo texto inteiro (não pula enquanto escreve).
    const full = wrapSpeech(s.text, maxW - 14 * scale, (text) => ctx.measureText(text).width);
    const lines = wrapSpeech(shown, maxW - 14 * scale, (text) => ctx.measureText(text).width);
    const boxW = Math.min(maxW, Math.max(...full.map((l) => ctx.measureText(l).width), ctx.measureText(s.name).width) + 14 * scale);
    const lh = fs * 1.3;
    const boxH = lh * (full.length + 1) + 10 * scale;
    let x = cx - boxW / 2;
    x = Math.max(8, Math.min(canvas.width - boxW - 8, x));
    // Não passa por baixo da barra do topo (≈ 56 px de tela).
    const topBar = Math.round(58 * (canvas.width / Math.max(1, canvas.clientWidth || canvas.width)));
    const y = Math.max(topBar, top - boxH - 7 * scale);
    ctx.save();
    // Balão leve, inspirado em mangá: papel claro, contorno de tinta e acento só no nome.
    // Assim continua legível sobre grama, água e áreas noturnas sem virar uma janela de dark mode.
    ctx.shadowColor = 'rgba(22, 32, 48, 0.26)';
    ctx.shadowBlur = 3 * scale;
    ctx.shadowOffsetY = 2 * scale;
    ctx.fillStyle = '#fffdf5';
    ctx.strokeStyle = '#1b2737';
    ctx.lineWidth = Math.max(2, scale * 0.8);
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 5 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    const nameWidth = Math.min(boxW - 10 * scale, ctx.measureText(s.name).width + 14 * scale);
    ctx.fillStyle = s.tint;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.roundRect(x + 4 * scale, y + 3 * scale, nameWidth, lh + 2 * scale, 3 * scale);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = s.tint;
    ctx.lineWidth = Math.max(1, scale * 0.45);
    ctx.stroke();
    ctx.strokeStyle = '#1b2737';
    ctx.lineWidth = Math.max(2, scale * 0.8);
    // Rabinho do balão, apontando para quem fala.
    const tx = Math.max(x + 6 * scale, Math.min(x + boxW - 6 * scale, cx));
    ctx.beginPath();
    ctx.moveTo(tx - 3 * scale, y + boxH - 1);
    ctx.lineTo(tx, y + boxH + 4 * scale);
    ctx.lineTo(tx + 3 * scale, y + boxH - 1);
    ctx.closePath();
    ctx.fillStyle = '#fffdf5';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(tx - 3 * scale + 1, y + boxH - 2, 6 * scale - 2, 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#1b2737';
    ctx.fillText(s.name, x + 7 * scale, y + 5 * scale);
    ctx.fillStyle = '#1f2a3a';
    lines.forEach((l, i) => ctx.fillText(l, x + 7 * scale, y + 8 * scale + lh * (i + 1)));
    ctx.restore();
  }
}

