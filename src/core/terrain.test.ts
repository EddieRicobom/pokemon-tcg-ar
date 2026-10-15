import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES } from './pokemon-data';
import { seededRng } from './battle';
import {
  applyTerrain, buildGrid, cellAt, cellCenter, DECOR_KINDS, GROUND_KINDS, planDecor, reactionFor, TERRAIN_FOR_TYPE, TERRAIN_KINDS, TERRAIN_LABELS_PT, TerrainGrid,
} from './terrain';

const HALF = { w: 1, d: 0.5 };

describe('chão de partida', () => {
  it('é repetível, usa só blocos conhecidos e tem trilha, flores e mato', () => {
    const a = buildGrid(28, 14, 'ellipse', 7);
    const b = buildGrid(28, 14, 'ellipse', 7);
    expect([...a.base]).toEqual([...b.base]);
    expect([...buildGrid(28, 14, 'ellipse', 8).base]).not.toEqual([...a.base]);
    const kinds = new Set([...a.base].map((v) => GROUND_KINDS[v]));
    for (const k of ['grass', 'grass2', 'flowers', 'path']) expect(kinds.has(k as never)).toBe(true);
    expect([...a.base].every((v) => v < GROUND_KINDS.length)).toBe(true);
    expect([...a.over].every((v) => v === 0)).toBe(true);
  });

  it('a elipse deixa os cantos de fora e o quadrado usa tudo', () => {
    const e = new TerrainGrid(20, 10, 'ellipse');
    expect(e.inside[e.index(0, 0)]).toBe(0);
    expect(e.inside[e.index(10, 5)]).toBe(1);
    const s = new TerrainGrid(20, 10, 'square');
    expect([...s.inside].every((v) => v === 1)).toBe(true);
  });

  it('converte posição em bloco e de volta (linha 0 = frente)', () => {
    const g = new TerrainGrid(10, 10, 'square');
    expect(cellAt(g, -0.99, 0.49, 1, 0.5)).toEqual({ c: 0, r: 0 });
    expect(cellAt(g, 0.99, -0.49, 1, 0.5)).toEqual({ c: 9, r: 9 });
    expect(cellAt(g, 1.5, 0, 1, 0.5)).toBeNull();
    const center = cellCenter(g, 3, 4, 1, 0.5);
    expect(cellAt(g, center.x, center.z, 1, 0.5)).toEqual({ c: 3, r: 4 });
  });
});

describe('golpes mudam o terreno', () => {
  it('todo tipo tem marca ou é um dos que não deixam (normal e voador)', () => {
    for (const type of POKEMON_TYPES) {
      const kind = TERRAIN_FOR_TYPE[type];
      if (kind) expect(TERRAIN_KINDS).toContain(kind);
      else expect(['normal', 'flying']).toContain(type);
    }
    for (const kind of TERRAIN_KINDS) expect(TERRAIN_LABELS_PT[kind].length).toBeGreaterThan(2);
  });

  it('marca um borrão ao redor do impacto, maior com golpes mais fortes, e só dentro do formato', () => {
    const small = buildGrid(28, 14, 'ellipse', 1);
    const big = buildGrid(28, 14, 'ellipse', 1);
    const s = applyTerrain(small, 'scorch', 0, 0, HALF.w, HALF.d, 0.4, seededRng(3));
    const b = applyTerrain(big, 'scorch', 0, 0, HALF.w, HALF.d, 1.6, seededRng(3));
    expect(s.changed.length).toBeGreaterThan(3);
    expect(b.changed.length).toBeGreaterThan(s.changed.length);
    expect(small.counts().scorch).toBe(s.changed.length);
    // Impacto no canto da elipse: nada fora do formato é alterado.
    const edge = buildGrid(28, 14, 'ellipse', 1);
    const hit = applyTerrain(edge, 'puddle', -1, 0.5, HALF.w, HALF.d, 1.5, seededRng(3));
    for (const i of hit.changed) expect(edge.inside[i]).toBe(1);
  });

  it('é repetível com a mesma semente', () => {
    const run = () => {
      const g = buildGrid(28, 14, 'ellipse', 1);
      applyTerrain(g, 'frost', 0.2, 0.1, HALF.w, HALF.d, 1, seededRng(9));
      return [...g.over];
    };
    expect(run()).toEqual(run());
  });

  it('o mesmo tipo de novo não conta de novo; outro tipo sobrescreve', () => {
    const g = buildGrid(28, 14, 'ellipse', 1);
    applyTerrain(g, 'toxic', 0, 0, HALF.w, HALF.d, 1, seededRng(2));
    const again = applyTerrain(g, 'toxic', 0, 0, HALF.w, HALF.d, 1, seededRng(2));
    expect(again.changed).toHaveLength(0);
    const over = applyTerrain(g, 'psy', 0, 0, HALF.w, HALF.d, 1.5, seededRng(4));
    expect(over.changed.length).toBeGreaterThan(0);
    expect(g.counts().psy).toBe(over.changed.length);
  });

  it('o chão reage quando elementos se encontram', () => {
    expect(reactionFor('scorch', 'puddle')?.text).toContain('apagou');
    expect(reactionFor('scorch', 'rubble')).toBeNull();
    const g = buildGrid(28, 14, 'ellipse', 1);
    applyTerrain(g, 'scorch', 0, 0, HALF.w, HALF.d, 1.4, seededRng(5));
    const wet = applyTerrain(g, 'puddle', 0, 0, HALF.w, HALF.d, 1.4, seededRng(6));
    expect(wet.reaction?.text).toBe('A água apagou o fogo!');
    const first = applyTerrain(buildGrid(28, 14, 'ellipse', 1), 'puddle', 0, 0, HALF.w, HALF.d, 1.4, seededRng(6));
    expect(first.reaction).toBeNull();
  });

  it('limpar tira as marcas e deixa o chão base', () => {
    const g = buildGrid(28, 14, 'ellipse', 1);
    const before = [...g.base];
    applyTerrain(g, 'bloom', 0, 0, HALF.w, HALF.d, 1, seededRng(1));
    g.clearOverlays();
    expect(g.counts()).toEqual({});
    expect([...g.base]).toEqual(before);
  });
});

describe('enfeites', () => {
  it('ficam na faixa de fora e os da frente são baixinhos', () => {
    const items = planDecor(1.4, 0.8, 'ellipse', 5, 24);
    expect(items).toHaveLength(24);
    for (const item of items) {
      const rho = Math.hypot(item.x / 1.4, item.z / 0.8);
      expect(rho).toBeGreaterThan(0.8);
      expect(rho).toBeLessThan(1.02);
      expect(DECOR_KINDS).toContain(item.kind);
      if (item.z > 0.8 * 0.2) expect(['tuft', 'flower-red', 'flower-yellow', 'flower-blue', 'rock']).toContain(item.kind);
    }
    expect(planDecor(1.4, 0.8, 'ellipse', 5, 24)).toEqual(items);
    expect(new Set(items.map((i) => i.kind)).size).toBeGreaterThan(2);
  });

  it('no quadrado ficam junto da borda', () => {
    for (const item of planDecor(1.2, 1.2, 'square', 3, 20)) {
      expect(Math.max(Math.abs(item.x), Math.abs(item.z))).toBeGreaterThan(1.2 * 0.8);
      expect(Math.max(Math.abs(item.x), Math.abs(item.z))).toBeLessThanOrEqual(1.2);
    }
  });
});
