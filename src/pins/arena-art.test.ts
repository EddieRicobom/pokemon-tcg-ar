import { describe, expect, it } from 'vitest';
import { ARENA_RADIUS, createWorld } from '../core/pins';
import type { Patch } from '../core/pins';
import { seededRng } from '../core/battle';
import { createArenaGrid, stampType, TERRAIN_MARGIN } from '../core/pin-terrain';
import { TILE } from '../box/ground-art';
import { artSize, paintArena, paintArenaLines, paintBumpers, UNITS_PER_PIXEL } from './arena-art';
import { ArenaTerrainArt } from './terrain-paint';

const bumper: Patch = { kind: 'bumper', x: 100, y: -100, r: 28, angle: 0 };

const at = (buf: ReturnType<typeof paintArena>, wx: number, wy: number) => {
  const px = Math.floor(wx / UNITS_PER_PIXEL + buf.w / 2);
  const py = Math.floor(wy / UNITS_PER_PIXEL + buf.h / 2);
  const i = (py * buf.w + px) * 4;
  return [buf.data[i]!, buf.data[i + 1]!, buf.data[i + 2]!, buf.data[i + 3]!] as [number, number, number, number];
};

describe('arte da arena', () => {
  it('cobre a arena e a borda, sem pixel vazio', () => {
    const buf = paintArena(ARENA_RADIUS, 3);
    expect(buf.w).toBe(artSize(ARENA_RADIUS));
    expect(buf.data.length).toBe(buf.w * buf.h * 4);
    for (let i = 3; i < buf.data.length; i += 4) expect(buf.data[i]).toBe(255);
  });

  it('é repetível com a mesma semente e muda com outra', () => {
    const a = paintArena(ARENA_RADIUS, 3);
    const b = paintArena(ARENA_RADIUS, 3);
    const c = paintArena(ARENA_RADIUS, 4);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
  });

  it('o chão comum é verde e fora da arena é escuro', () => {
    const buf = paintArena(ARENA_RADIUS, 3);
    const [r, g, b] = at(buf, 0, 0);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    const [or, og, ob] = at(buf, ARENA_RADIUS + 70, 0);
    expect(or + og + ob).toBeLessThan(150);
  });

  it('a camada de linhas é transparente no meio do gramado e marca as zonas, o meio e a sombra da mureta', () => {
    const layer = paintArenaLines(ARENA_RADIUS);
    expect(layer.w).toBe(artSize(ARENA_RADIUS));
    // Fora do chão e entre o círculo central e a zona de saída nada é pintado.
    expect(at(layer, 0, ARENA_RADIUS + 40)[3]).toBe(0);
    expect(at(layer, 180, 40)[3]).toBe(0);
    // Giz no centro, véu azul embaixo (seu lado) e vermelho em cima.
    expect(at(layer, 0, 0)[3]).toBeGreaterThan(100);
    const [, , blue, blueA] = at(layer, 40, 400);
    expect(blueA).toBeGreaterThan(0);
    expect(blue).toBeGreaterThan(200);
    const [red, , , redA] = at(layer, 40, -400);
    expect(redA).toBeGreaterThan(0);
    expect(red).toBeGreaterThan(200);
    // A sombra escurece o gramado junto da mureta.
    const edge = at(layer, 0, -(ARENA_RADIUS - 24));
    expect(edge[3]).toBeGreaterThan(40);
  });

  it('os pinos de mola ficam numa camada transparente por cima', () => {
    const layer = paintBumpers(ARENA_RADIUS, [bumper]);
    const [br, , , ba] = at(layer, 100, -100);
    expect(ba).toBe(255);
    expect(br).toBeGreaterThan(0xe0); // topo do pino de mola
    expect(at(layer, -200, 150)[3]).toBe(0);
    expect(paintBumpers(ARENA_RADIUS, []).data.every((v) => v === 0)).toBe(true);
  });
});

describe('chão em pixel art do Pin Mode', () => {
  const alphaOf = (art: ArenaTerrainArt, c: number, r: number) => art.buf.data[((r * TILE + 8) * art.buf.w + c * TILE + 8) * 4 + 3]!;

  it('o buffer tem um bloco de 16 px por célula e só pinta dentro do círculo', () => {
    const grid = createArenaGrid(5);
    const art = new ArenaTerrainArt(grid, ARENA_RADIUS, 5);
    expect(art.buf.w).toBe(grid.cols * TILE);
    expect(art.buf.h).toBe(grid.rows * TILE);
    expect(art.half).toBe(ARENA_RADIUS - TERRAIN_MARGIN);
    expect(alphaOf(art, grid.cols >> 1, grid.rows >> 1)).toBe(255);
    expect(alphaOf(art, 0, 0)).toBe(0);
  });

  it('repinta só o que mudou e a marca aparece na cor do tipo', () => {
    const grid = createArenaGrid(5);
    grid.over.fill(0);
    const art = new ArenaTerrainArt(grid, ARENA_RADIUS, 5);
    const before = Buffer.from(art.buf.data);
    const version = art.version;
    const hit = stampType(grid, ARENA_RADIUS, 'water', 0, 0, 1, seededRng(1))!;
    art.repaint(hit.cells);
    expect(art.version).toBe(version + 1);
    const after = Buffer.from(art.buf.data);
    expect(after.equals(before)).toBe(false);
    // O centro da poça ficou azul (mais azul que verde).
    const mid = ((Math.floor(grid.rows / 2) * TILE + 8) * art.buf.w + Math.floor(grid.cols / 2) * TILE + 8) * 4;
    expect(art.buf.data[mid + 2]!).toBeGreaterThan(art.buf.data[mid]!);
    // Longe da marca nada mudou.
    const far = ((1 * TILE + 8) * art.buf.w + (grid.cols >> 1) * TILE + 8) * 4;
    expect(after.subarray(far, far + 4).equals(before.subarray(far, far + 4))).toBe(true);
  });

  it('repintar o mesmo estado dá o mesmo desenho (sem tremer)', () => {
    const w = createWorld({ mine: [], enemy: [] }, seededRng(4));
    const grid = w.terrain!;
    const a = new ArenaTerrainArt(grid, ARENA_RADIUS, 9);
    const before = Buffer.from(a.buf.data);
    a.repaint(Array.from({ length: grid.cols * grid.rows }, (_, i) => i));
    expect(Buffer.from(a.buf.data).equals(before)).toBe(true);
  });
});
