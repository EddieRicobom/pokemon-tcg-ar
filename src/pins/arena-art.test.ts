import { describe, expect, it } from 'vitest';
import { ARENA_RADIUS } from '../core/pins';
import type { Patch } from '../core/pins';
import { artSize, paintArena, UNITS_PER_PIXEL } from './arena-art';

const patches: Patch[] = [
  { kind: 'ice', x: -200, y: 0, r: 70, angle: 0 },
  { kind: 'mud', x: 200, y: 0, r: 60, angle: 0 },
  { kind: 'water', x: 0, y: 80, r: 70, angle: 1 },
  { kind: 'boost', x: 0, y: -90, r: 40, angle: 0 },
  { kind: 'bumper', x: 100, y: -100, r: 28, angle: 0 },
];

const at = (buf: ReturnType<typeof paintArena>, wx: number, wy: number) => {
  const px = Math.floor(wx / UNITS_PER_PIXEL + buf.w / 2);
  const py = Math.floor(wy / UNITS_PER_PIXEL + buf.h / 2);
  const i = (py * buf.w + px) * 4;
  return [buf.data[i]!, buf.data[i + 1]!, buf.data[i + 2]!, buf.data[i + 3]!] as [number, number, number, number];
};

describe('arte da arena', () => {
  it('cobre a arena e a borda, sem pixel vazio', () => {
    const buf = paintArena(ARENA_RADIUS, patches, 3);
    expect(buf.w).toBe(artSize(ARENA_RADIUS));
    expect(buf.data.length).toBe(buf.w * buf.h * 4);
    for (let i = 3; i < buf.data.length; i += 4) expect(buf.data[i]).toBe(255);
  });

  it('é repetível com a mesma semente e muda com outra', () => {
    const a = paintArena(ARENA_RADIUS, patches, 3);
    const b = paintArena(ARENA_RADIUS, patches, 3);
    const c = paintArena(ARENA_RADIUS, patches, 4);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
  });

  it('cada elemento tem a sua cor característica', () => {
    const buf = paintArena(ARENA_RADIUS, patches, 3);
    const [ir, , ib] = at(buf, -200, 0);
    expect(ib).toBeGreaterThan(ir - 20); // gelo é claro e azulado
    const [mr, mg, mb] = at(buf, 200, 0);
    expect(mr).toBeGreaterThan(mb); // lama é marrom
    expect(mg).toBeGreaterThan(0x20);
    const [, , wb] = at(buf, 0, 80);
    expect(wb).toBeGreaterThan(0xa0); // água é azul
    const [br] = at(buf, 100, -100);
    expect(br).toBeGreaterThan(0xe0); // topo do pino de mola
  });

  it('o chão comum é verde e fora da arena é escuro', () => {
    const buf = paintArena(ARENA_RADIUS, [], 3);
    const [r, g, b] = at(buf, 0, 0);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    const [or, og, ob] = at(buf, ARENA_RADIUS + 38, 0);
    expect(or + og + ob).toBeLessThan(150);
  });
});
