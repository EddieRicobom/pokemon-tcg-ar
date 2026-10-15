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
import { buildingAt, findFree, tileAt } from '../core/village/map';
import type { Tile, VillageMap } from '../core/village/map';
import { FX_EMOJI } from '../core/village/social-state';
import type { Fx } from '../core/village/social-state';
import { createWeather, stepWeather, WEATHER_KINDS } from '../core/weather';
import type { WeatherKind, WeatherMode, WeatherState } from '../core/weather';
import { EDGE } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { outfitFor, paintBush, paintHouse, paintPlayer, paintRock, paintShop, paintTile, paintTree, TILE } from './village-art';
import { paintAccessory, paintCrop, paintFurnitureItem } from './item-art';
import { HOME_LANTERN, HOME_WINDOWS, paintArcade, paintArena, paintCafe, paintFountain, paintHome, paintLamp, paintLot, paintMail, paintMuseum, paintPins } from './town-art';

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
  /** GIF decodificado (ou imagem parada como GIF de 1 quadro). */
  gif: DecodedGif;
}

export type Target =
  | { kind: 'mon'; id: string }
  | { kind: 'furniture'; x: number; y: number; item: FurnitureId }
  | { kind: 'plot' }
  | { kind: 'crop'; x: number; y: number }
  | { kind: 'shop' }
  | { kind: 'building'; building: Building }
  | { kind: 'tile'; x: number; y: number; tile: Tile }
  | { kind: 'nothing' };

export interface SceneLine {
  /** Posição no elenco (índice em `cast`). */
  who: number;
  text: string;
  fx?: Fx;
}

function toCanvas(buf: PixelBuf): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = buf.w;
  c.height = buf.h;
  const ctx = c.getContext('2d')!;
  const image = ctx.createImageData(buf.w, buf.h);
  image.data.set(buf.data);
  ctx.putImageData(image, 0, 0);
  return c;
}

interface MonSprite {
  frames: HTMLCanvasElement[];
  gif: DecodedGif;
  /** Altura desenhada, em blocos. */
  heightTiles: number;
  /** Topo da cabeça no 1º quadro (0 a 1 da altura) e o centro dela (0 a 1 da largura): onde vai o acessório. */
  headTop: number;
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

const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** O desenho e o emoji sobre a porta de cada prédio da praça. */
const CIVIC_ART: Partial<Record<BuildingKind, () => PixelBuf>> = { cafe: paintCafe, mail: paintMail, museum: paintMuseum, arcade: paintArcade, pins: paintPins, arena: paintArena };
const CIVIC_EMOJI: Partial<Record<BuildingKind, string>> = { cafe: '☕', mail: '📬', museum: '🏛️', arcade: '🕹️', pins: '🎳', arena: '⚔️' };

export class VillageGame {
  readonly player: Walker;
  readonly villagers = new Map<string, Walker>();
  private readonly monSprites = new Map<string, MonSprite>();
  private readonly names = new Map<string, string>();
  private readonly ctx: CanvasRenderingContext2D;
  private groundFrames: HTMLCanvasElement[] = [];
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private running = false;
  private handle = 0;
  private last = 0;
  private held: Dir | null = null;
  private scale = 3;
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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly map: VillageMap,
    readonly state: VillageState,
    mons: readonly VillageMon[],
    private readonly trainerId: string,
    private readonly rng: Rng = Math.random,
  ) {
    this.ctx = canvas.getContext('2d')!;
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
    this.monSprites.clear();
    this.names.clear();
    for (const mon of mons) {
      const spot = findFree(this.map, this.map.spawn.x + Math.floor(this.rng() * 9) - 4, this.map.spawn.y - 2 - Math.floor(this.rng() * 5), (x, y) => this.occupied(x, y), this.rng);
      const w = makeWalker(mon.id, spot.x, spot.y, 2.6);
      w.idle = this.rng() * 2;
      this.villagers.set(mon.id, w);
      this.names.set(mon.id, mon.name);
      const frames = mon.gif.frames.map((f) => toCanvas({ w: mon.gif.width, h: mon.gif.height, data: new Uint8Array(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength) }));
      const head = headOf(mon.gif);
      this.monSprites.set(mon.id, { frames, gif: mon.gif, heightTiles: Math.min(2.4, Math.max(1.1, mon.gif.height / 40)), headTop: head.top, headX: head.x });
    }
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

  /** O chão inteiro pré-desenhado (3 quadros, por causa da água). */
  private buildGround(): void {
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
            img = toCanvas(paintTile(tile, edges, x, y, frame));
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
    if (tile === 'lamp') return { kind: 'nothing' };
    if (tile !== 'grass' && tile !== 'path') return { kind: 'tile', x: f.x, y: f.y, tile };
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
      this.handle = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.update(dt, now);
      this.draw(now);
    };
    this.handle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private update(dt: number, now: number): void {
    const p = this.player;
    const arrived = advance(p, dt);
    if (arrived) {
      this.state.player = { x: p.x, y: p.y, dir: p.dir };
      this.onStep?.();
      for (let k = 0; k < 2; k++) this.particles.push({ kind: 'dust', x: p.x + 0.5 + (this.rng() - 0.5) * 0.4, y: p.y + 0.95, vx: (this.rng() - 0.5) * 0.8, vy: -0.25 - this.rng() * 0.3, born: now, life: 420 });
    }
    if (!moving(p) && this.held) {
      if (tryStep(p, this.held, this.map, (x, y) => this.occupied(x, y, 'eu'))) this.pushMs = 0;
      else {
        // Só virar para o Pokémon (para conversar) é um toque; segurar contra ele troca de lugar, para ninguém trancar a rua.
        this.pushMs += dt * 1000;
        if (this.pushMs >= SWAP_AFTER_MS && this.swapWithFront()) this.pushMs = 0;
      }
    } else if (!this.held) this.pushMs = 0;
    const behind = { x: p.x, y: p.y };
    this.updateSleep(now);
    for (const [id, w] of this.villagers) {
      if (this.asleep.has(id) || (this.waiting === id && !moving(w))) continue;
      const sc = this.scene;
      if (sc && sc.cast.includes(id)) {
        // No momento: o primeiro fica parado; os outros vão até ele. Depois do encontro, todos ficam parados.
        const anchor = this.villagers.get(sc.cast[0]!)!;
        const target = sc.phase === 'gather' && id !== sc.cast[0] ? { x: anchor.x, y: anchor.y } : { x: w.x, y: w.y };
        stepVillager(w, dt, this.map, (x, y) => this.occupied(x, y, id), this.rng, target);
        continue;
      }
      const follow = this.state.follower === id ? behind : null;
      stepVillager(w, dt, this.map, (x, y) => this.occupied(x, y, id), this.rng, follow);
      if (follow) this.catchUp(w, follow, dt, now);
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
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    // Escala inteira: uns 11 blocos na largura do celular.
    this.scale = Math.max(2, Math.round((width * dpr) / (TILE * 11)));
  }

  private draw(now: number): void {
    const { ctx, canvas, scale } = this;
    ctx.imageSmoothingEnabled = false;
    const W = canvas.width;
    const H = canvas.height;
    const pp = drawPos(this.player);
    // Câmera centrada em você, presa à borda do mapa.
    const camX = Math.round(Math.min(Math.max(0, (pp.x + 0.5) * TILE * scale - W / 2), this.map.w * TILE * scale - W));
    const camY = Math.round(Math.min(Math.max(0, (pp.y + 0.5) * TILE * scale - H / 2), this.map.h * TILE * scale - H));
    ctx.fillStyle = '#1d4a22';
    ctx.fillRect(0, 0, W, H);
    const ground = this.groundFrames[Math.floor(now / 450) % 3]!;
    ctx.drawImage(ground, camX / scale, camY / scale, W / scale, H / scale, 0, 0, W, H);

    const clock = new Date();
    const hour = clock.getHours();
    const minute = clock.getMinutes();
    const light = daylight(hour, minute);
    const night = light.dark > 0.3;
    const wx = this.weather;
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
    const wind = wx.windX * 0.5;
    const sway = (x: number, y: number, amp: number) => Math.sin(now / 900 + x * 0.7 + y * 0.3) * amp + Math.sin(now / 2300 + x) * amp * 0.6 + wind * amp * (0.6 + wx.rain);
    const drawSwayed = (img: HTMLCanvasElement, dx: number, dy: number, w: number, h: number, k: number) => {
      ctx.save();
      ctx.translate(dx + w / 2, dy + h);
      ctx.transform(1, 0, k, 1, 0, 0);
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = tileAt(this.map, x, y);
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
          // Brilhinhos na água.
          const h = hashN(x * 131 + y * 17);
          if (Math.sin(now / 500 + h * 40) > 0.93) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(sx(x) + Math.floor(h * 12) * scale, sy(y) + Math.floor(hashN(x + y * 99) * 12) * scale, 2 * scale, scale);
          }
        }
      }
    }
    const plot = this.map.plot;
    if (this.state.house > 0) {
      const img = this.sprite(`house${this.state.house}`, () => paintHouse(this.state.house));
      list.push({
        y: plot.y + plot.h,
        draw: () => {
          shadow(sx(plot.x + 2), sy(plot.y + plot.h) - 2 * scale, 30 * scale, 4 * scale, 0.2);
          ctx.drawImage(img, sx(plot.x), sy(plot.y + plot.h - 4), 4 * T, 4 * T);
        },
      });
    }
    const shop = this.map.shop;
    const shopImg = this.sprite('shop', paintShop);
    list.push({
      y: shop.y + shop.h,
      draw: () => {
        shadow(sx(shop.x + 1.5), sy(shop.y + shop.h) - 2 * scale, 24 * scale, 3.5 * scale, 0.2);
        ctx.drawImage(shopImg, sx(shop.x), sy(shop.y + shop.h - 3), 3 * T, 3 * T);
        this.drawTag(sx(shop.x + 1.5), sy(shop.y - 1) + Math.sin(now / 350) * scale - 1 * scale, '🛒');
      },
    });
    for (const b of this.map.buildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1 + 3) continue;
      const open = this.townLevel >= b.unlock;
      const bottom = sy(b.y + b.h);
      const left = sx(b.x);
      const mid = sx(b.x + b.w / 2);
      const nearDoor = Math.abs(this.player.x - b.door.x) + Math.abs(this.player.y - b.door.y) <= 4;
      if (b.kind === 'fountain') {
        const f = Math.floor(now / 450) % 2;
        const img = this.sprite(`fonte${f}`, () => paintFountain(f));
        list.push({ y: b.y + b.h, draw: () => { shadow(mid, bottom - 3 * scale, 14 * scale, 4 * scale, 0.16); ctx.drawImage(img, left, bottom - 40 * scale, 32 * scale, 40 * scale); } });
        if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, b.name));
        continue;
      }
      const wpx = b.w * T;
      if (!open) {
        const img = this.sprite('lot', paintLot);
        list.push({ y: b.y + b.h, draw: () => ctx.drawImage(img, left, bottom - 48 * scale, wpx, 3 * T) });
        if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, `🔒 Nível ${b.unlock} de Treinador`));
        continue;
      }
      if (b.kind === 'home' && [...this.homes.values()].every((l) => l !== b.lot)) {
        // Terreno liberado, mas sem morador ainda: a casa só é construída quando chega um Pokémon para morar nela.
        const img = this.sprite('lot', paintLot);
        list.push({ y: b.y + b.h, draw: () => ctx.drawImage(img, left, bottom - 48 * scale, wpx, 3 * T) });
        if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, 'Terreno livre'));
        continue;
      }
      if (b.kind === 'home') {
        const lot = b.lot ?? 0;
        const v = homeOf(this.state, lot);
        const lvl = homeLevel(v);
        const decor = homeDecor(v);
        const roof = ROOFS[roofIndex(v, lot)]!.rgb;
        const img = this.sprite(`home:${lvl}:${roof}:${decor}`, () => paintHome(lvl, roof, decor));
        const who = [...this.homes].filter(([, l]) => l === lot).map(([id]) => id);
        const sleeping = who.length > 0 && who.every((id) => this.asleep.has(id));
        list.push({
          y: b.y + b.h,
          draw: () => {
            shadow(mid, bottom - 2 * scale, 22 * scale, 3.5 * scale, 0.2);
            ctx.drawImage(img, left, bottom - 48 * scale, 3 * T, 3 * T);
            if (sleeping) this.drawTag(mid, bottom - 38 * scale + Math.sin(now / 600) * scale, '💤');
            const tag = this.houseTags.get(lot);
            if (tag && now > tag.until) this.houseTags.delete(lot);
            else if (tag) this.drawTag(mid, bottom - 52 * scale - Math.abs(Math.sin(now / 140)) * 3 * scale, tag.emoji);
          },
        });
        if (night && who.length > 0) {
          for (const w of HOME_WINDOWS[lvl]!) homeGlows.push({ x: left + w[0]! * scale, y: bottom - 48 * scale + w[1]! * scale, w: w[2]! * scale, h: w[3]! * scale });
          if (decor & 4) homeGlows.push({ x: left + HOME_LANTERN.x * scale, y: bottom - 48 * scale + HOME_LANTERN.y * scale, w: 2 * scale, h: 2 * scale, lantern: true });
        }
        if (nearDoor) {
          const text = who.length === 0 ? 'Casa vazia' : `Casa de ${who.map((id) => this.names.get(id) ?? '').join(' e ')}`;
          overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, text));
        }
        continue;
      }
      const img = this.sprite(b.kind, CIVIC_ART[b.kind] ?? paintMuseum);
      const emoji = CIVIC_EMOJI[b.kind] ?? '🏛️';
      list.push({
        y: b.y + b.h,
        draw: () => {
          shadow(mid, bottom - 2 * scale, (wpx / 2 - 2 * scale), 3.5 * scale, 0.2);
          ctx.drawImage(img, left, bottom - 48 * scale, wpx, 3 * T);
          this.drawTag(mid, bottom - 50 * scale + Math.sin(now / 350) * scale, emoji);
        },
      });
      if (night) homeGlows.push({ x: left + 4 * scale, y: bottom - 20 * scale, w: wpx - 8 * scale, h: 6 * scale });
      if (nearDoor) overlays.push(() => this.drawLabel(mid, bottom + 2 * scale, b.name));
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
          if (tall) ctx.drawImage(img, sx(f.x), sy(f.y - 1), T, 2 * T);
          else ctx.drawImage(img, sx(f.x), sy(f.y), T, T);
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
          const frame = sprite.frames[frameIndexAt(sprite.gif, now)] ?? sprite.frames[0]!;
          const h = sprite.heightTiles * TILE * scale;
          const wpx = h * (sprite.gif.width / sprite.gif.height);
          const born = this.bounce.get(id);
          const bounceAge = born ? now - born : 9999;
          const hop = (moving(w) ? Math.abs(Math.sin(w.t * Math.PI)) * 2 * scale : 0) + (bounceAge < 500 ? Math.abs(Math.sin(bounceAge * 0.012)) * 4 * scale : 0);
          const cx = sx(pos.x + 0.5);
          const base = sy(pos.y + 1) - 2 * scale - hop;
          shadow(cx, sy(pos.y + 1) - 2 * scale, (5 - hop / (2 * scale) * 0.3) * scale, 2 * scale, 0.22);
          ctx.save();
          // Os sprites do Showdown olham para a esquerda: andando para a direita, espelha.
          if (w.dir === 'right') {
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-cx, 0);
          }
          const acc = this.state.wear.mons[id];
          const def = acc ? itemDef(acc) : undefined;
          const hx = cx - wpx / 2 + sprite.headX * wpx;
          const hy = base - h + sprite.headTop * h;
          if (acc && def?.pos === 'back') {
            const size = Math.max(9 * scale, Math.min(16 * scale, wpx * 0.6));
            ctx.drawImage(this.sprite(`acc:${acc}`, () => paintAccessory(acc)), Math.round(cx - size / 2), Math.round(base - h * 0.62), Math.round(size), Math.round(size));
          }
          ctx.drawImage(frame, Math.round(cx - wpx / 2), Math.round(base - h), Math.round(wpx), Math.round(h));
          if (acc && def && def.pos !== 'back') {
            const size = Math.max(8 * scale, Math.min(14 * scale, wpx * 0.45));
            const img = this.sprite(`acc:${acc}`, () => paintAccessory(acc));
            const y = def.pos === 'hat' ? hy - size * 0.7 : def.pos === 'face' ? hy + size * 0.15 : hy + h * 0.2;
            ctx.drawImage(img, Math.round(hx - size / 2), Math.round(y), Math.round(size), Math.round(size));
          }
          ctx.restore();
          if (near(w) && !this.scene) {
            const hearts = Math.round(friendOf(this.state, id).points / 20);
            overlays.push(() => this.drawLabel(cx, sy(pos.y + 1) + 1 * scale, `${this.names.get(id) ?? ''} ${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)}`));
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
    const pimg = this.sprite(`p:${this.player.dir}:${step < 0 ? 's' : step % 2}:${this.trainerId}:${hatless}`, () => paintPlayer(this.player.dir, step, hatless ? { ...outfit, gear: 'none' } : outfit));
    list.push({
      y: pp.y + 1.01,
      draw: () => {
        shadow(sx(pp.x + 0.5), sy(pp.y + 1) - 1 * scale, 5 * scale, 2 * scale, 0.24);
        const hop = moving(this.player) ? Math.abs(Math.sin(this.player.t * Math.PI)) * 1.5 * scale : 0;
        const px0 = sx(pp.x);
        const py0 = sy(pp.y + 1) - (PLAYER_H + 1) * scale - hop;
        const dir = this.player.dir;
        const pos = accDef?.pos;
        if (accP && pos === 'back' && dir !== 'up') this.drawAcc(accP, px0 + 2 * scale, py0 + 11 * scale, 12 * scale);
        ctx.drawImage(pimg, px0, py0, T, PLAYER_H * scale);
        if (accP) {
          if (pos === 'hat') this.drawAcc(accP, px0 + 1 * scale, py0 - 5 * scale, 14 * scale);
          else if (pos === 'face' && dir !== 'up') this.drawAcc(accP, px0 + (dir === 'down' ? 3 : dir === 'right' ? 5 : 1) * scale, py0 + 3 * scale, 10 * scale);
          else if (pos === 'neck') this.drawAcc(accP, px0 + 3 * scale, py0 + 8 * scale, 10 * scale);
          else if (pos === 'back' && dir === 'up') this.drawAcc(accP, px0 + 2 * scale, py0 + 11 * scale, 12 * scale);
        }
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
      ctx.strokeStyle = 'rgba(190,215,255,0.55)';
      ctx.lineWidth = Math.max(1, scale * 0.45);
      ctx.beginPath();
      const slant = 4 + wx.windX * 40;
      for (let i = 0; i < n; i++) {
        const sp = 0.7 + hashN(i * 3) * 0.6;
        const rx = (hashN(i) * (W + 200) + now * 0.05 * wx.windX * 8 + now * 0.18 * 0) % (W + 200);
        const ry = (hashN(i + 500) * H + now * 0.9 * sp * (scale / 3)) % H;
        ctx.moveTo(rx - 100, ry);
        ctx.lineTo(rx - 100 - slant * scale * 0.8, ry + 9 * scale);
      }
      ctx.stroke();
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
        const flicker = l.big ? 0.85 + Math.sin(now / 120 + l.x) * 0.15 : 1;
        glow(sx(l.x + 0.5), sy(l.y + 0.2), (l.big ? 3.4 : 2.5) * T, '255,214,120', light.dark * 0.7 * flicker);
      }
      // Janelas acesas da casa e a luz da loja.
      if (this.state.house >= 2) {
        const ox = sx(plot.x);
        const oy = sy(plot.y + plot.h - 4);
        const win = this.state.house >= 3 ? [[11, 38, 10, 9], [43, 38, 10, 9]] : [[12, 40, 8, 7]];
        for (const [wx0, wy0, ww, wh] of win as number[][]) {
          ctx.fillStyle = `rgba(255,214,120,${(light.dark * 1.4).toFixed(3)})`;
          ctx.fillRect(ox + wx0! * (T / 16), oy + wy0! * (T / 16), ww! * (T / 16), wh! * (T / 16));
          glow(ox + (wx0! + ww! / 2) * (T / 16), oy + (wy0! + wh! / 2) * (T / 16), 2.2 * T, '255,200,110', light.dark * 0.45);
        }
      }
      glow(sx(shop.x + 1.5), sy(shop.y + shop.h - 1.2), 3 * T, '255,190,120', light.dark * 0.5);
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
    // Vinheta: escurece de leve as bordas.
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    for (const o of overlays) o();
  }

  private drawAcc(id: string, x: number, y: number, size: number): void {
    const img = this.sprite(`acc:${id}`, () => paintAccessory(id));
    this.ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  }

  /** Emoji pequeno sem balão (gota da horta, brilho de pronto). */
  private drawTag(cx: number, y: number, emoji: string): void {
    const { ctx, scale } = this;
    ctx.font = `${7 * scale}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000';
    ctx.fillText(emoji, cx, y);
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
    const fs = Math.max(11, Math.round(4.4 * scale));
    ctx.font = `bold ${fs}px system-ui, sans-serif`;
    const shown = s.text.slice(0, Math.max(1, Math.floor((now - s.start) / 22)));
    const maxW = Math.min(canvas.width - 24, 74 * scale);
    // A caixa se dimensiona pelo texto inteiro (não pula enquanto escreve).
    const wrap = (text: string): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(t).width > maxW - 10 * scale && cur) {
          lines.push(cur);
          cur = w;
        } else cur = t;
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const full = wrap(s.text);
    const lines = wrap(shown);
    const boxW = Math.min(maxW, Math.max(...full.map((l) => ctx.measureText(l).width), ctx.measureText(s.name).width) + 10 * scale);
    const lh = fs * 1.25;
    const boxH = lh * (full.length + 1) + 6 * scale;
    let x = cx - boxW / 2;
    x = Math.max(8, Math.min(canvas.width - boxW - 8, x));
    // Não passa por baixo da barra do topo (≈ 56 px de tela).
    const topBar = Math.round(58 * (canvas.width / Math.max(1, canvas.clientWidth || canvas.width)));
    const y = Math.max(topBar, top - boxH - 7 * scale);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a1a24';
    ctx.lineWidth = Math.max(2, scale * 0.7);
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 4 * scale);
    ctx.fill();
    ctx.stroke();
    // Rabinho do balão, apontando para quem fala.
    const tx = Math.max(x + 6 * scale, Math.min(x + boxW - 6 * scale, cx));
    ctx.beginPath();
    ctx.moveTo(tx - 3 * scale, y + boxH - 1);
    ctx.lineTo(tx, y + boxH + 4 * scale);
    ctx.lineTo(tx + 3 * scale, y + boxH - 1);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tx - 3 * scale + 1, y + boxH - 2, 6 * scale - 2, 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = s.tint;
    ctx.fillText(s.name, x + 5 * scale, y + 3 * scale);
    ctx.fillStyle = '#1a1a24';
    lines.forEach((l, i) => ctx.fillText(l, x + 5 * scale, y + 3 * scale + lh * (i + 1)));
  }
}

