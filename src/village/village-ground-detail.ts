import { tileAt } from '../core/village/map';
import type { Tile, VillageMap } from '../core/village/map';

/**
 * Detalhes miúdos do chão da Vila: tufos de grama, trevo, florzinhas, pedrinhas, cascalho, rachaduras, musgo,
 * marcas de areia e a franja de grama que avança sobre a trilha. Tudo é desenhado uma vez no chão pré-renderizado
 * (`village-game.ts`), então o custo por quadro é zero.
 *
 * A escolha de cada detalhe é uma função pura e determinística de (x, y): o mesmo mapa gera sempre o mesmo chão, sem
 * "ferver" entre recarregamentos e sem precisar guardar nada.
 */

const TILE = 16;

export type GroundDetailKind = 'blade' | 'tuft' | 'speck' | 'clover' | 'flower' | 'pebble' | 'gravel' | 'crack' | 'moss' | 'ripple' | 'shell' | 'wet' | 'fringe' | 'leaf' | 'inset' | 'mushroom';

export interface GroundDetail {
  kind: GroundDetailKind;
  /** Pixel dentro do bloco (0 a 15). */
  x: number;
  y: number;
  /** Variação/estado: cor, formato ou lado (0 norte, 1 leste, 2 sul, 3 oeste). */
  v: number;
}

const PATH_TILES: ReadonlySet<Tile> = new Set<Tile>(['path', 'shop', 'trail', 'plaza']);

/** Gerador inteiro estável (não depende de `Math.random` nem da plataforma). */
export function detailHash(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x79b9, 0xc2b2ae35) ^ Math.imul(salt + 0x27d4, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function at(x: number, y: number, salt: number, min: number, max: number): number {
  return min + Math.floor(detailHash(x, y, salt) * (max - min + 1));
}

function neighbor(map: VillageMap, x: number, y: number, dx: number, dy: number): Tile | null {
  const nx = x + dx;
  const ny = y + dy;
  return nx < 0 || ny < 0 || nx >= map.w || ny >= map.h ? null : tileAt(map, nx, ny);
}

function grassDetails(x: number, y: number): GroundDetail[] {
  const out: GroundDetail[] = [];
  const density = detailHash(x, y, 11);
  const tufts = density < 0.16 ? 3 : density < 0.58 ? 2 : 1;
  for (let i = 0; i < tufts; i++) {
    out.push({
      kind: detailHash(x, y, 20 + i) < 0.7 ? 'blade' : 'tuft',
      x: at(x, y, 30 + i, 1, 14),
      y: at(x, y, 40 + i, 2, 14),
      v: Math.floor(detailHash(x, y, 50 + i) * 4),
    });
  }
  const accent = detailHash(x, y, 60);
  if (accent < 0.11) out.push({ kind: 'flower', x: at(x, y, 61, 1, 14), y: at(x, y, 62, 1, 13), v: Math.floor(detailHash(x, y, 63) * 3) });
  else if (accent < 0.19) out.push({ kind: 'clover', x: at(x, y, 64, 1, 14), y: at(x, y, 65, 2, 14), v: 0 });
  else if (accent < 0.25) out.push({ kind: 'pebble', x: at(x, y, 66, 1, 14), y: at(x, y, 67, 2, 14), v: Math.floor(detailHash(x, y, 68) * 2) });
  else if (accent < 0.27) out.push({ kind: 'leaf', x: at(x, y, 69, 1, 14), y: at(x, y, 70, 2, 14), v: Math.floor(detailHash(x, y, 71) * 2) });
  // Grão fino: quebra a repetição do ladrilho base sem virar ruído.
  for (let i = 0; i < 3; i++) {
    out.push({ kind: 'speck', x: at(x, y, 72 + i, 0, 15), y: at(x, y, 75 + i, 0, 15), v: Math.floor(detailHash(x, y, 78 + i) * 2) });
  }
  return out;
}

function pathDetails(x: number, y: number): GroundDetail[] {
  const out: GroundDetail[] = [];
  const n = 1 + (detailHash(x, y, 80) < 0.55 ? 1 : 0) + (detailHash(x, y, 81) < 0.2 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    out.push({ kind: 'gravel', x: at(x, y, 82 + i, 1, 14), y: at(x, y, 85 + i, 1, 14), v: Math.floor(detailHash(x, y, 88 + i) * 2) });
  }
  if (detailHash(x, y, 92) < 0.055) out.push({ kind: 'crack', x: at(x, y, 93, 3, 12), y: at(x, y, 94, 3, 12), v: Math.floor(detailHash(x, y, 95) * 4) });
  if (detailHash(x, y, 96) < 0.035) out.push({ kind: 'leaf', x: at(x, y, 97, 1, 14), y: at(x, y, 98, 1, 14), v: Math.floor(detailHash(x, y, 99) * 2) });
  return out;
}

function sandDetails(x: number, y: number): GroundDetail[] {
  const out: GroundDetail[] = [];
  if (detailHash(x, y, 100) < 0.34) out.push({ kind: 'ripple', x: at(x, y, 101, 1, 9), y: at(x, y, 102, 2, 13), v: at(x, y, 103, 3, 6) });
  if (detailHash(x, y, 104) < 0.07) out.push({ kind: 'shell', x: at(x, y, 105, 2, 13), y: at(x, y, 106, 2, 13), v: Math.floor(detailHash(x, y, 107) * 2) });
  if (detailHash(x, y, 108) < 0.1) out.push({ kind: 'pebble', x: at(x, y, 109, 2, 13), y: at(x, y, 110, 2, 13), v: Math.floor(detailHash(x, y, 111) * 2) });
  return out;
}

/** Franja de grama invadindo a trilha, musgo na emenda e areia molhada onde a praia encontra a água. */
function edgeDetails(map: VillageMap, x: number, y: number, tile: Tile): GroundDetail[] {
  const out: GroundDetail[] = [];
  const sides = [
    [0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3],
  ] as const;
  for (const [dx, dy, side] of sides) {
    const other = neighbor(map, x, y, dx, dy);
    if (PATH_TILES.has(tile)) {
      if (other === 'grass' || other === 'flower' || other === 'tall') {
        const blades = 1 + (detailHash(x, y, 120 + side) < 0.5 ? 1 : 0);
        for (let i = 0; i < blades; i++) {
          const along = at(x, y, 124 + side * 3 + i, 2, 13);
          const px = side === 0 ? along : side === 2 ? along : side === 1 ? 14 : 1;
          const py = side === 0 ? 0 : side === 2 ? 15 : along;
          out.push({ kind: 'fringe', x: px, y: py, v: side });
        }
      } else if (other === 'water') {
        out.push({ kind: 'moss', x: at(x, y, 140 + side, 3, 12), y: at(x, y, 144 + side, 3, 12), v: side });
      } else if (other !== null) {
        // Sombra de contato: a trilha parece assentada no gramado, não colada por cima dele.
        out.push({ kind: 'inset', x: 0, y: 0, v: side });
      }
    } else if (tile === 'sand' && other === 'water') {
      out.push({ kind: 'wet', x: 0, y: 0, v: side });
    }
  }
  return out;
}

/** Todos os detalhes do bloco (x, y), na ordem em que devem ser pintados. */
export function groundDetails(map: VillageMap, x: number, y: number): GroundDetail[] {
  const tile = tileAt(map, x, y);
  switch (tile) {
    case 'grass':
    case 'flower': {
      const out = [...grassDetails(x, y), ...edgeDetails(map, x, y, tile)];
      // Sob as árvores e arbustos o chão ganha folhas caídas e, de vez em quando, um cogumelo.
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const t = neighbor(map, x, y, dx!, dy!);
        return t === 'tree' || t === 'bush' || t === 'rock';
      });
      if (near && detailHash(x, y, 160) < 0.2) out.push({ kind: 'leaf', x: at(x, y, 161, 2, 13), y: at(x, y, 162, 2, 13), v: Math.floor(detailHash(x, y, 163) * 2) });
      if (near && detailHash(x, y, 164) < 0.05) out.push({ kind: 'mushroom', x: at(x, y, 165, 2, 13), y: at(x, y, 166, 2, 13), v: Math.floor(detailHash(x, y, 167) * 2) });
      return out;
    }
    case 'path':
    case 'shop':
    case 'trail':
    case 'plaza':
      return [...pathDetails(x, y), ...edgeDetails(map, x, y, tile)];
    case 'sand':
      return [...sandDetails(x, y), ...edgeDetails(map, x, y, tile)];
    default:
      return [];
  }
}

/** Ruído de valor suave (grade de 7 blocos, interpolação em S): manchas grandes de sol e sombra na grama. */
export function grassToneAt(x: number, y: number): number {
  const cell = 7;
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = detailHash(x0, y0, 200);
  const b = detailHash(x0 + 1, y0, 200);
  const c = detailHash(x0, y0 + 1, 200);
  const d = detailHash(x0 + 1, y0 + 1, 200);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

const C = {
  grass: '#80ac75',
  grassLight: '#93c07f',
  grassDark: '#6a9660',
  grassShadow: '#57804f',
  white: '#f4f2e2',
  yellow: '#ffd84a',
  pink: '#f2a8c0',
  blue: '#a8c4f0',
  pebble: '#a8a49a',
  pebbleLight: '#d0ccc2',
  pebbleDark: '#6e6a64',
  shell: '#f0dcd0',
  leafGreen: '#7cb84e',
  leafGold: '#d8a03c',
  leafRust: '#b86a34',
} as const;

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function drawDetail(ctx: CanvasRenderingContext2D, ox: number, oy: number, d: GroundDetail): void {
  const x = ox + d.x;
  const y = oy + d.y;
  switch (d.kind) {
    case 'blade': {
      const color = [C.grassLight, C.grass, C.grassDark, C.grassLight][d.v]!;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 2);
      ctx.fillRect(x + (d.v % 2 ? 1 : -1), y - 1, 1, 1);
      break;
    }
    case 'tuft': {
      ctx.fillStyle = C.grassDark;
      ctx.fillRect(x, y, 1, 3);
      ctx.fillRect(x + 1, y - 1, 1, 2);
      ctx.fillRect(x - 1, y + 1, 1, 2);
      pixel(ctx, x + 1, y - 2, C.grassLight);
      break;
    }
    case 'speck': {
      ctx.globalAlpha = d.v ? 0.28 : 0.22;
      pixel(ctx, x, y, d.v ? C.grassLight : C.grassShadow);
      ctx.globalAlpha = 1;
      break;
    }
    case 'clover': {
      ctx.fillStyle = C.grassDark;
      ctx.fillRect(x, y, 2, 1);
      ctx.fillRect(x + 1, y - 1, 1, 2);
      pixel(ctx, x, y - 1, C.grassLight);
      break;
    }
    case 'flower': {
      const petal = [C.white, C.yellow, C.pink][d.v] ?? C.white;
      pixel(ctx, x, y + 1, C.grassShadow);
      ctx.fillStyle = petal;
      ctx.fillRect(x - 1, y, 3, 1);
      pixel(ctx, x, y - 1, petal);
      pixel(ctx, x, y + 1, d.v === 1 ? '#ffb03a' : C.white);
      break;
    }
    case 'pebble': {
      ctx.fillStyle = d.v ? C.pebble : C.pebbleDark;
      ctx.fillRect(x, y, 2, 1);
      pixel(ctx, x, y - 1, C.pebbleLight);
      break;
    }
    case 'gravel': {
      ctx.globalAlpha = d.v ? 0.5 : 0.4;
      pixel(ctx, x, y, d.v ? C.pebbleLight : C.pebbleDark);
      ctx.globalAlpha = 1;
      break;
    }
    case 'crack': {
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#473a2c';
      const dir = d.v;
      for (let i = 0; i < 3; i++) {
        const dx = dir === 1 || dir === 3 ? (dir === 1 ? 1 : -1) * i : (dir === 0 ? 1 : -1);
        const dy = dir === 0 || dir === 2 ? (dir === 0 ? -1 : 1) * i : (dir === 2 ? 1 : -1);
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'moss': {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#5a8a4a';
      ctx.fillRect(x, y, 2, 1);
      pixel(ctx, x + 1, y + 1, '#6ea45a');
      ctx.globalAlpha = 1;
      break;
    }
    case 'ripple': {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = C.white;
      ctx.fillRect(x, y, d.v, 1);
      ctx.fillRect(x + 1, y + 2, Math.max(2, d.v - 2), 1);
      ctx.globalAlpha = 1;
      break;
    }
    case 'shell': {
      ctx.fillStyle = d.v ? C.shell : C.pink;
      ctx.fillRect(x, y, 2, 1);
      pixel(ctx, x + 1, y + 1, C.shell);
      break;
    }
    case 'mushroom': {
      ctx.fillStyle = C.white;
      ctx.fillRect(x, y + 1, 1, 1);
      ctx.fillStyle = d.v ? '#e8a24a' : '#d8503e';
      ctx.fillRect(x - 1, y, 3, 1);
      pixel(ctx, x, y - 1, d.v ? '#f6c274' : '#e8785e');
      pixel(ctx, x, y, C.white);
      break;
    }
    case 'leaf': {
      ctx.fillStyle = d.v ? C.leafGold : C.leafGreen;
      ctx.fillRect(x, y, 2, 1);
      pixel(ctx, x + (d.v ? 0 : 1), y + 1, d.v ? C.leafRust : C.grassShadow);
      break;
    }
    case 'wet': {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#3e6e94';
      if (d.v === 0) ctx.fillRect(ox, oy, TILE, 2);
      else if (d.v === 2) ctx.fillRect(ox, oy + TILE - 2, TILE, 2);
      else if (d.v === 1) ctx.fillRect(ox + TILE - 2, oy, 2, TILE);
      else ctx.fillRect(ox, oy, 2, TILE);
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = C.white;
      if (d.v === 0) ctx.fillRect(ox, oy, TILE, 1);
      else if (d.v === 2) ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
      else if (d.v === 1) ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
      else ctx.fillRect(ox, oy, 1, TILE);
      ctx.globalAlpha = 1;
      break;
    }
    case 'inset': {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#2f2418';
      if (d.v === 0) ctx.fillRect(ox, oy, TILE, 1);
      else if (d.v === 2) ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
      else if (d.v === 1) ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
      else ctx.fillRect(ox, oy, 1, TILE);
      ctx.globalAlpha = 1;
      break;
    }
    case 'fringe': {
      const side = d.v;
      ctx.fillStyle = d.v % 2 ? C.grassLight : C.grass;
      if (side === 0) { ctx.fillRect(x, y, 1, 2); pixel(ctx, x + 1, y + 1, C.grassDark); }
      else if (side === 2) { ctx.fillRect(x, y - 1, 1, 2); pixel(ctx, x - 1, y - 1, C.grassDark); }
      else if (side === 1) { ctx.fillRect(x - 1, y, 2, 1); pixel(ctx, x - 1, y + 1, C.grassDark); }
      else { ctx.fillRect(x, y, 2, 1); pixel(ctx, x + 1, y - 1, C.grassDark); }
      break;
    }
  }
}

/**
 * Pinta o chão pré-renderizado: primeiro as manchas suaves de tom da grama, depois os detalhes de cada bloco.
 * Desenha em coordenadas de pixel do chão (1 px = 1 px de bloco), então o resultado continua sendo pixel art.
 */
export function drawGroundDetails(ctx: CanvasRenderingContext2D, map: VillageMap): void {
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const tile = tileAt(map, x, y);
      if (tile !== 'grass' && tile !== 'flower') continue;
      const tone = grassToneAt(x, y);
      if (tone > 0.56) {
        ctx.fillStyle = `rgba(255,240,176,${((tone - 0.56) * 0.14).toFixed(3)})`;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      } else if (tone < 0.44) {
        ctx.fillStyle = `rgba(24,66,44,${((0.44 - tone) * 0.12).toFixed(3)})`;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      for (const detail of groundDetails(map, x, y)) drawDetail(ctx, x * TILE, y * TILE, detail);
    }
  }
}
