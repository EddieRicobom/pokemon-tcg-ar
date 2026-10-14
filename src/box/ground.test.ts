import { describe, expect, it } from 'vitest';
import { seededRng } from '../core/battle';
import { DECOR_KINDS, GROUND_KINDS, TERRAIN_KINDS } from '../core/terrain';
import { createBuf, EDGE, paintDecor, paintGround, paintOverlay, TILE } from './ground-art';
import { Ground } from './ground';

const opts = { halfW: 1, halfD: 0.5, shape: 'ellipse' as const, seed: 5, cols: 24, decor: 16, decorUnit: 0.15, opacity: 0.95 };

function tile(draw: (b: ReturnType<typeof createBuf>) => void): Uint8Array {
  const buf = createBuf(TILE, TILE);
  draw(buf);
  return buf.data;
}

const opaque = (data: Uint8Array): number => {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++;
  return n;
};

describe('pixel art', () => {
  it('cada chão base preenche o bloco inteiro e é repetível', () => {
    for (const kind of GROUND_KINDS) {
      const a = tile((b) => paintGround(b, 0, 0, kind, seededRng(3)));
      const b = tile((buf) => paintGround(buf, 0, 0, kind, seededRng(3)));
      expect(opaque(a)).toBe(TILE * TILE);
      expect([...a]).toEqual([...b]);
    }
    const colors = new Set<string>();
    for (const kind of GROUND_KINDS) colors.add([...tile((b) => paintGround(b, 0, 0, kind, seededRng(1))).slice(0, 4)].join());
    expect(colors.size).toBeGreaterThan(2);
  });

  it('cada marca de golpe muda os pixels do bloco e só pinta onde há chão', () => {
    for (const kind of TERRAIN_KINDS) {
      const base = tile((b) => paintGround(b, 0, 0, 'grass', seededRng(1)));
      const marked = tile((b) => {
        paintGround(b, 0, 0, 'grass', seededRng(1));
        paintOverlay(b, 0, 0, kind, 0, seededRng(2));
      });
      expect([...marked], kind).not.toEqual([...base]);
      expect(opaque(marked)).toBe(TILE * TILE);
    }
    // Bloco vazio (fora do formato): a marca não aparece.
    const empty = tile((b) => paintOverlay(b, 0, 0, 'scorch', 0, seededRng(2)));
    expect(opaque(empty)).toBe(0);
  });

  it('nas bordas sem vizinho a marca se dissolve', () => {
    const full = tile((b) => {
      paintGround(b, 0, 0, 'grass', seededRng(1));
      paintOverlay(b, 0, 0, 'puddle', 0, seededRng(2));
    });
    const edged = tile((b) => {
      paintGround(b, 0, 0, 'grass', seededRng(1));
      paintOverlay(b, 0, 0, 'puddle', EDGE.north | EDGE.west, seededRng(2));
    });
    expect([...edged]).not.toEqual([...full]);
  });

  it('todo enfeite tem contorno, fundo transparente e algo desenhado', () => {
    for (const kind of DECOR_KINDS) {
      const buf = paintDecor(kind);
      const n = opaque(buf.data);
      expect(n, kind).toBeGreaterThan(12);
      expect(n, kind).toBeLessThan(TILE * TILE);
    }
  });
});

describe('Ground', () => {
  it('monta o chão em elipse com a trilha, os enfeites e cantos transparentes', () => {
    const ground = new Ground(opts);
    const { w, h, data } = ground.pixels;
    expect(w).toBe(24 * TILE);
    expect(h).toBe(12 * TILE);
    expect(data[3]).toBe(0); // canto de fora
    expect(data[((h / 2) * w + w / 2) * 4 + 3]).toBe(255); // centro
    expect(ground.decorCount).toBe(16);
  });

  it('um golpe de fogo repinta o chão onde caiu e golpe normal não deixa marca', () => {
    const ground = new Ground(opts);
    const before = new Uint8Array(ground.pixels.data);
    expect(ground.hit('normal', 0, 0, 1)).toBeNull();
    expect([...ground.pixels.data]).toEqual([...before]);
    const hit = ground.hit('fire', 0, 0, 1.2);
    expect(hit?.kind).toBe('scorch');
    expect(hit!.changed).toBeGreaterThan(3);
    expect([...ground.pixels.data]).not.toEqual([...before]);
    expect(ground.grid.counts().scorch).toBe(hit!.changed);
  });

  it('água sobre fogo apaga e avisa; reset volta ao chão de partida', () => {
    const ground = new Ground(opts);
    const start = new Uint8Array(ground.pixels.data);
    ground.hit('fire', 0, 0, 1.4);
    const wet = ground.hit('water', 0, 0, 1.4);
    expect(wet?.reaction?.text).toBe('A água apagou o fogo!');
    ground.reset();
    expect(ground.grid.counts()).toEqual({});
    expect([...ground.pixels.data]).toEqual([...start]);
  });

  it('repintar um bloco não muda a arte dos outros (sem tremer)', () => {
    const ground = new Ground(opts);
    ground.hit('grass', 0.9, 0.4, 0.3);
    const a = new Uint8Array(ground.pixels.data);
    ground.hit('grass', 0.9, 0.4, 0.3);
    expect([...ground.pixels.data]).toEqual([...a]);
  });

  it('o ambiente tinge o chão e os enfeites', () => {
    const ground = new Ground(opts);
    ground.setTint(0.5, 0.6, 0.7);
    expect(ground.tint.r).toBeCloseTo(0.5);
    ground.dispose();
  });
});
