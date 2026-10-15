import type { Rng } from '../core/battle';
import { frameIndexAt } from '../core/gif';
import type { DecodedGif } from '../core/gif';
import { drawPos, facing, makeWalker, moving, stepVillager, tryStep, advance } from '../core/village/actors';
import type { Dir, Walker } from '../core/village/actors';
import { cropAt, daylight, isPlaced, needsWater } from '../core/village/life';
import type { FurnitureId, VillageState } from '../core/village/life';
import { findFree, tileAt, TILES } from '../core/village/map';
import type { Tile, VillageMap } from '../core/village/map';
import { EDGE } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { outfitFor, paintBush, paintHouse, paintPlayer, paintRock, paintShop, paintTile, paintTree, TILE } from './village-art';
import { paintAccessory, paintCrop, paintFurnitureItem } from './item-art';
import { itemDef } from '../core/village/catalog';

/**
 * O jogo da Vila no navegador: canvas 2D em escala inteira (pixels nítidos), câmera que segue você, profundidade por
 * linha (quem está mais embaixo fica na frente), dia e noite pelo relógio, lampiões acesos à noite e balões de emoji.
 * A lógica (andar, coletar, amizade) é a de `core/village`; aqui é só cola com o navegador.
 */

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
  | { kind: 'tile'; x: number; y: number; tile: Tile }
  | { kind: 'nothing' };

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

/** Luzes que acendem à noite (e iluminam em volta). */
const LIGHTS = new Set(['luminaria', 'abajur', 'poste', 'lanterna', 'abobora-lanterna', 'lareira']);
/** Acessórios que vão na cabeça (os outros: óculos no rosto, cachecol no pescoço, mochila nas costas). */
const HATS = new Set(['chapeu-palha', 'bone', 'cartola', 'gorro', 'tiara', 'coroa-flores', 'laco']);

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
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

export class VillageGame {
  readonly player: Walker;
  readonly villagers = new Map<string, Walker>();
  private readonly monSprites = new Map<string, MonSprite>();
  private readonly ctx: CanvasRenderingContext2D;
  private groundFrames: HTMLCanvasElement[] = [];
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private running = false;
  private handle = 0;
  private last = 0;
  private held: Dir | null = null;
  private scale = 3;
  private bubbles = new Map<string, { emoji: string; until: number }>();
  /** Borboletas (dia) e vagalumes (noite), em blocos. */
  private readonly motes: Mote[] = [];
  private lastGreet = 0;
  private nextEmote = 0;
  /** Bloco que foi coletado hoje (o arbusto perde as frutas). */
  harvestedToday: (x: number, y: number) => boolean = () => false;
  onStep: (() => void) | null = null;

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
    this.buildGround();
    this.setMons(mons);
  }

  setMons(mons: readonly VillageMon[]): void {
    this.villagers.clear();
    this.monSprites.clear();
    for (const mon of mons) {
      const spot = findFree(this.map, this.map.spawn.x + Math.floor(this.rng() * 9) - 4, this.map.spawn.y - 2 - Math.floor(this.rng() * 5), (x, y) => this.occupied(x, y), this.rng);
      const w = makeWalker(mon.id, spot.x, spot.y, 2.6);
      w.idle = this.rng() * 2;
      this.villagers.set(mon.id, w);
      const frames = mon.gif.frames.map((f) => toCanvas({ w: mon.gif.width, h: mon.gif.height, data: new Uint8Array(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength) }));
      const head = headOf(mon.gif);
      this.monSprites.set(mon.id, { frames, gif: mon.gif, heightTiles: Math.min(2.4, Math.max(1.1, mon.gif.height / 40)), headTop: head.top, headX: head.x });
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
      if (id === except) continue;
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
    for (const [id, w] of this.villagers) if ((w.x === f.x && w.y === f.y) || (w.tx === f.x && w.ty === f.y)) return { kind: 'mon', id };
    const crop = cropAt(this.state, f.x, f.y);
    if (crop) return { kind: 'crop', x: f.x, y: f.y };
    const placed = this.state.placed.find((p) => p.x === f.x && p.y === f.y);
    if (placed) return { kind: 'furniture', x: f.x, y: f.y, item: placed.item };
    const tile = tileAt(this.map, f.x, f.y);
    if (tile === 'plot') return { kind: 'plot' };
    if (tile === 'shop') return { kind: 'shop' };
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

  /** O Pokémon se vira para você (para conversar). */
  faceMe(id: string): void {
    const w = this.villagers.get(id);
    if (!w || moving(w)) return;
    const dx = this.player.x - w.x;
    const dy = this.player.y - w.y;
    w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    w.idle = 3;
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
    }
    if (!moving(p) && this.held) tryStep(p, this.held, this.map, (x, y) => this.occupied(x, y, 'eu'));
    const behind = { x: p.x, y: p.y };
    for (const [id, w] of this.villagers) {
      const follow = this.state.follower === id ? behind : null;
      stepVillager(w, dt, this.map, (x, y) => this.occupied(x, y, id), this.rng, follow);
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
    // Dois Pokémon que se encontram se cumprimentam.
    if (now - this.lastGreet > 2500) {
      const list = [...this.villagers.entries()];
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
    if (now > this.nextEmote && this.villagers.size > 0) {
      this.nextEmote = now + 4000 + this.rng() * 6000;
      const ids = [...this.villagers.keys()];
      const id = ids[Math.floor(this.rng() * ids.length)]!;
      const hour = new Date().getHours();
      const pool = hour >= 21 || hour < 6 ? ['💤', '💤', '🌙'] : ['🎵', '😊', '❗', '❓', '😋', '❤️', '🌸'];
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

    const hour = new Date().getHours();
    const minute = new Date().getMinutes();
    const light = daylight(hour, minute);
    const night = light.dark > 0.3;

    // Tudo que fica em pé, ordenado pela linha dos pés.
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];
    const sx = (x: number) => Math.round(x * TILE * scale - camX);
    const sy = (y: number) => Math.round(y * TILE * scale - camY);
    const x0 = Math.floor(camX / (TILE * scale)) - 2;
    const y0 = Math.floor(camY / (TILE * scale)) - 2;
    const x1 = x0 + Math.ceil(W / (TILE * scale)) + 4;
    const y1 = y0 + Math.ceil(H / (TILE * scale)) + 4;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = tileAt(this.map, x, y);
        if (t === 'tree') {
          const img = this.sprite(`tree${(x * 7 + y * 3) % 3}`, () => paintTree((x * 7 + y * 3) % 3));
          list.push({ y: y + 1, draw: () => ctx.drawImage(img, sx(x), sy(y - 1), TILE * scale, 2 * TILE * scale) });
        } else if (t === 'rock') {
          const img = this.sprite('rock', paintRock);
          list.push({ y: y + 1, draw: () => ctx.drawImage(img, sx(x), sy(y), TILE * scale, TILE * scale) });
        } else if (t === 'bush') {
          const fruit = !this.harvestedToday(x, y);
          const img = this.sprite(`bush${fruit}`, () => paintBush(fruit));
          list.push({ y: y + 1, draw: () => ctx.drawImage(img, sx(x), sy(y), TILE * scale, TILE * scale) });
        }
      }
    }
    const plot = this.map.plot;
    if (this.state.house > 0) {
      const img = this.sprite(`house${this.state.house}`, () => paintHouse(this.state.house));
      list.push({ y: plot.y + plot.h, draw: () => ctx.drawImage(img, sx(plot.x), sy(plot.y + plot.h - 4), 4 * TILE * scale, 4 * TILE * scale) });
    }
    const shop = this.map.shop;
    const shopImg = this.sprite('shop', paintShop);
    list.push({ y: shop.y + shop.h, draw: () => ctx.drawImage(shopImg, sx(shop.x), sy(shop.y + shop.h - 3), 3 * TILE * scale, 3 * TILE * scale) });
    const lamps: { x: number; y: number }[] = [];
    for (const f of this.state.placed) {
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      const frame = f.item === 'fonte' ? Math.floor(now / 300) % 2 : 0;
      const lit = LIGHTS.has(f.item) && night;
      if (lit) lamps.push(f);
      const img = this.sprite(`f:${f.item}:${lit}:${frame}`, () => paintFurnitureItem(f.item, lit, frame));
      list.push({ y: f.y + 1, draw: () => ctx.drawImage(img, sx(f.x), sy(f.y), TILE * scale, TILE * scale) });
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
          ctx.drawImage(img, sx(c.x), sy(c.y), TILE * scale, TILE * scale);
          if (thirsty) this.drawTag(sx(c.x + 0.5), sy(c.y) - 2 * scale, '💧');
          else if (c.stage >= g.stages) this.drawTag(sx(c.x + 0.5), sy(c.y) - 2 * scale, '✨');
        },
      });
    }
    for (const [id, w] of this.villagers) {
      const sprite = this.monSprites.get(id);
      if (!sprite) continue;
      const pos = drawPos(w);
      list.push({
        y: pos.y + 1,
        draw: () => {
          const frame = sprite.frames[frameIndexAt(sprite.gif, now)] ?? sprite.frames[0]!;
          const h = sprite.heightTiles * TILE * scale;
          const wpx = h * (sprite.gif.width / sprite.gif.height);
          const hop = moving(w) ? Math.abs(Math.sin(w.t * Math.PI)) * 2 * scale : 0;
          const cx = sx(pos.x + 0.5);
          const base = sy(pos.y + 1) - 2 * scale - hop;
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath();
          ctx.ellipse(cx, sy(pos.y + 1) - 2 * scale, 5 * scale, 2 * scale, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          // Os sprites do Showdown olham para a esquerda: andando para a direita, espelha.
          if (w.dir === 'right') {
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-cx, 0);
          }
          ctx.drawImage(frame, Math.round(cx - wpx / 2), Math.round(base - h), Math.round(wpx), Math.round(h));
          const acc = this.state.wear.mons[id];
          if (acc) {
            const size = Math.max(8 * scale, Math.min(14 * scale, wpx * 0.45));
            const hx = cx - wpx / 2 + sprite.headX * wpx;
            const hy = base - h + sprite.headTop * h;
            const img = this.sprite(`acc:${acc}`, () => paintAccessory(acc));
            ctx.drawImage(img, Math.round(hx - size / 2), Math.round(hy - size * 0.7), Math.round(size), Math.round(size));
          }
          ctx.restore();
          this.drawBubble(id, cx, base - h, now);
        },
      });
    }
    const outfit = outfitFor(this.trainerId);
    const step = moving(this.player) ? this.player.steps + (this.player.t > 0.5 ? 1 : 0) : -1;
    const pimg = this.sprite(`p:${this.player.dir}:${step < 0 ? 's' : step % 2}:${this.trainerId}`, () => paintPlayer(this.player.dir, step, outfit));
    list.push({
      y: pp.y + 1.01,
      draw: () => {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(sx(pp.x + 0.5), sy(pp.y + 1) - 1 * scale, 5 * scale, 2 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        const px0 = sx(pp.x);
        const py0 = sy(pp.y + 1) - 21 * scale;
        const acc = this.state.wear.player;
        const dir = this.player.dir;
        if (acc === 'mochila' && dir !== 'up') this.drawAcc(acc, px0 + 3 * scale, py0 + 8 * scale, 10 * scale);
        ctx.drawImage(pimg, px0, py0, TILE * scale, 20 * scale);
        if (acc && HATS.has(acc)) this.drawAcc(acc, px0 + 1 * scale, py0 - 6 * scale, 14 * scale);
        else if (acc === 'oculos' && dir === 'down') this.drawAcc(acc, px0 + 3 * scale, py0 + 2 * scale, 10 * scale);
        else if (acc === 'cachecol') this.drawAcc(acc, px0 + 3 * scale, py0 + 5 * scale, 10 * scale);
        else if (acc === 'mochila' && dir === 'up') this.drawAcc(acc, px0 + 3 * scale, py0 + 8 * scale, 10 * scale);
      },
    });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    // Borboletas de dia (por baixo da noite).
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
    // Dia e noite.
    if (light.warm > 0) {
      ctx.fillStyle = `rgba(255,140,60,${(light.warm * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (light.dark > 0) {
      ctx.fillStyle = `rgba(12,18,58,${light.dark.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lamps) {
        const cx = sx(l.x + 0.5);
        const cy = sy(l.y + 0.2);
        const r = 2.5 * TILE * scale;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,214,120,${(light.dark * 0.7).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      // Vagalumes.
      if (night) {
        for (const m of this.motes) {
          const a = 0.35 + 0.65 * Math.max(0, Math.sin(m.phase * 0.7));
          const fx = sx(m.x);
          const fy = sy(m.y) - 8 * scale;
          const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 4 * scale);
          g.addColorStop(0, `rgba(220,255,140,${a.toFixed(2)})`);
          g.addColorStop(1, 'rgba(220,255,140,0)');
          ctx.fillStyle = g;
          ctx.fillRect(fx - 4 * scale, fy - 4 * scale, 8 * scale, 8 * scale);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawAcc(id: string, x: number, y: number, size: number): void {
    const img = this.sprite(`acc:${id}`, () => paintAccessory(id));
    this.ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  }

  /** Emoji pequeno sem balão (gota da horta, brilho de pronto). */
  private drawTag(cx: number, y: number, emoji: string): void {
    const { ctx, scale } = this;
    ctx.font = `${7 * scale}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(emoji, cx, y);
  }

  private drawBubble(id: string, cx: number, top: number, now: number): void {
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
    ctx.font = `${Math.round(size * 0.8)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(b.emoji, cx, y + (size + 2 * scale) / 2);
  }
}

export { TILES };
