import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { findFree, generateVillage, isSolidTile, tileAt } from './map';
import {
  add, canFollow, count, craft, daylight, emptyVillage, favoriteOf, friendLevel, friendOf, giveGift, harvest, HOUSE_LEVELS, normalizeVillage, pickUp, place,
  pruneHarvest, talk, upgradeHouse,
} from './life';

const map = generateVillage(42);

/** Caminho a pé (busca em largura) entre dois blocos, sem atravessar blocos sólidos. */
function reachable(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    if (c.x === to.x && c.y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = `${n.x},${n.y}`;
      if (seen.has(k) || isSolidTile(tileAt(map, n.x, n.y))) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return false;
}

describe('mapa da Vila', () => {
  it('a mesma semente gera o mesmo mapa; tem lago, praia, árvores, pedras, arbustos e o terreno da casa', () => {
    expect(generateVillage(42).tiles).toEqual(map.tiles);
    const kinds = new Set(map.tiles);
    for (const k of ['water', 'sand', 'tree', 'rock', 'bush', 'flower', 'path', 'plot'] as const) expect(kinds.has(k)).toBe(true);
    expect(map.tiles.filter((t) => t === 'plot')).toHaveLength(12);
  });

  it('a borda é floresta e dá para chegar a pé do começo à praça, ao lago e à casa', () => {
    expect(tileAt(map, 0, 0)).toBe('tree');
    expect(tileAt(map, -5, 3)).toBe('tree');
    expect(isSolidTile(tileAt(map, map.spawn.x, map.spawn.y))).toBe(false);
    expect(reachable(map.spawn, { x: map.w / 2, y: map.h / 2 })).toBe(true);
    expect(reachable(map.spawn, { x: map.plot.x + map.plot.w, y: map.plot.y + map.plot.h - 1 })).toBe(true);
    const sand = map.tiles.findIndex((t, i) => t === 'sand' && reachable(map.spawn, { x: i % map.w, y: Math.floor(i / map.w) }));
    expect(sand).toBeGreaterThan(-1);
  });

  it('acha lugar livre perto de um ponto', () => {
    const c = findFree(map, map.spawn.x, map.spawn.y, () => false, seededRng(1));
    expect(isSolidTile(tileAt(map, c.x, c.y))).toBe(false);
  });
});

describe('coleta, casa e móveis', () => {
  const find = (tile: string) => {
    const i = map.tiles.indexOf(tile as never);
    return { x: i % map.w, y: Math.floor(i / map.w) };
  };

  it('árvore dá madeira uma vez por dia; no dia seguinte dá de novo', () => {
    const s = emptyVillage(42, map.spawn);
    const tree = find('tree');
    const a = harvest(s, map, tree.x, tree.y, '2026-10-14', seededRng(1));
    expect(a.ok).toBe(true);
    expect(count(s, 'madeira')).toBeGreaterThanOrEqual(1);
    expect(harvest(s, map, tree.x, tree.y, '2026-10-14', seededRng(1)).ok).toBe(false);
    pruneHarvest(s, '2026-10-15');
    expect(harvest(s, map, tree.x, tree.y, '2026-10-15', seededRng(2)).ok).toBe(true);
  });

  it('pedra, arbusto e flor dão os seus itens; trilha não dá nada', () => {
    const s = emptyVillage(42, map.spawn);
    for (const [tile, items] of [['rock', ['pedra']], ['bush', ['oran', 'pecha']], ['flower', ['flor']]] as const) {
      const c = find(tile);
      const r = harvest(s, map, c.x, c.y, 'd', seededRng(3));
      expect(r.ok).toBe(true);
      expect(items).toContain(r.got!.item);
    }
    const path = find('path');
    expect(harvest(s, map, path.x, path.y, 'd', seededRng(3)).ok).toBe(false);
  });

  it('casa sobe de nível pagando materiais; sem materiais diz o que falta', () => {
    const s = emptyVillage(42, map.spawn);
    const fail = upgradeHouse(s);
    expect(fail.ok).toBe(false);
    expect(fail.message).toContain('Madeira 0/8');
    add(s, 'madeira', 8);
    expect(upgradeHouse(s)).toMatchObject({ ok: true, message: 'Você construiu: Barraca!' });
    expect(s.house).toBe(1);
    expect(count(s, 'madeira')).toBe(0);
    s.house = HOUSE_LEVELS.length - 1;
    expect(upgradeHouse(s).ok).toBe(false);
  });

  it('fabrica, coloca e recolhe móveis', () => {
    const s = emptyVillage(42, map.spawn);
    expect(craft(s, 'cadeira').ok).toBe(false);
    add(s, 'madeira', 3);
    expect(craft(s, 'cadeira').ok).toBe(true);
    expect(count(s, 'cadeira')).toBe(1);
    const spot = { x: map.spawn.x, y: map.spawn.y };
    expect(place(s, map, 'cadeira', spot.x, spot.y, () => false).ok).toBe(true);
    expect(place(s, map, 'cadeira', spot.x, spot.y, () => false).ok).toBe(false);
    const water = find('water');
    add(s, 'cadeira');
    expect(place(s, map, 'cadeira', water.x, water.y, () => false).ok).toBe(false);
    expect(pickUp(s, spot.x, spot.y).ok).toBe(true);
    expect(count(s, 'cadeira')).toBe(2);
  });
});

describe('amizade', () => {
  it('a primeira conversa do dia vale amizade; as outras não', () => {
    const s = emptyVillage(42, map.spawn);
    const a = talk(s, 'p1', 'Pikachu', ['electric'], 'd1', 10, seededRng(1));
    expect(a.gained).toBe(6);
    const b = talk(s, 'p1', 'Pikachu', ['electric'], 'd1', 10, seededRng(1));
    expect(b.gained).toBe(0);
    expect(friendOf(s, 'p1').points).toBe(6);
  });

  it('presente favorito vale mais; um presente por dia; pedido do dia vale muito', () => {
    const s = emptyVillage(42, map.spawn);
    add(s, 'oran', 5);
    add(s, 'flor', 5);
    expect(favoriteOf(['electric'])).toBe('oran');
    expect(giveGift(s, 'p1', ['electric'], 'oran', 'd1').gained).toBe(10);
    expect(giveGift(s, 'p1', ['electric'], 'flor', 'd1').ok).toBe(false);
    expect(giveGift(s, 'p2', ['electric'], 'flor', 'd1').gained).toBe(4);
    const f = friendOf(s, 'p3');
    f.request = { day: 'd1', item: 'flor', qty: 2, done: false };
    const r = giveGift(s, 'p3', ['fire'], 'flor', 'd1');
    expect(r).toMatchObject({ ok: true, gained: 15 });
    expect(friendOf(s, 'p3').request?.done).toBe(true);
  });

  it('níveis e corações; só Grande amigo segue você', () => {
    expect(friendLevel(0)).toMatchObject({ name: 'Conhecido', hearts: 0 });
    expect(friendLevel(50)).toMatchObject({ name: 'Amigo', hearts: 3 });
    expect(friendLevel(100)).toMatchObject({ name: 'Melhor amigo', hearts: 5 });
    const s = emptyVillage(42, map.spawn);
    expect(canFollow(s, 'p')).toBe(false);
    friendOf(s, 'p').points = 75;
    expect(canFollow(s, 'p')).toBe(true);
  });

  it('a conversa muda com a hora', () => {
    const s = emptyVillage(42, map.spawn);
    expect(talk(s, 'a', 'A', [], 'd', 8, seededRng(1)).text.startsWith('Bom dia!')).toBe(true);
    expect(talk(s, 'b', 'B', [], 'd', 22, seededRng(1)).text.startsWith('Boa noite!')).toBe(true);
  });
});

describe('salvar e dia/noite', () => {
  it('estado salvo estranho é limpo; outra semente começa do zero', () => {
    const s = emptyVillage(42, map.spawn);
    add(s, 'madeira', 3);
    const back = normalizeVillage(JSON.parse(JSON.stringify({ ...s, inventory: { madeira: 3, laser: 9, pedra: -1 } })), 42, map.spawn);
    expect(back.inventory).toEqual({ madeira: 3 });
    expect(normalizeVillage(s, 7, map.spawn).inventory).toEqual({});
    expect(normalizeVillage(null, 42, map.spawn).house).toBe(0);
  });

  it('meio-dia é claro, meia-noite é escura, o fim de tarde é alaranjado', () => {
    expect(daylight(12).dark).toBe(0);
    expect(daylight(0).dark).toBeGreaterThan(0.5);
    expect(daylight(18).warm).toBeGreaterThan(0.8);
    expect(daylight(18.5).dark).toBeGreaterThan(0);
  });
});

describe('andar pela Vila', async () => {
  const { advance, canEnter, drawPos, facing, makeWalker, stepVillager, tryStep } = await import('./actors');
  it('anda de bloco em bloco, não atravessa árvore nem água, e vira mesmo sem andar', () => {
    const p = makeWalker('eu', map.spawn.x, map.spawn.y, 5);
    expect(tryStep(p, 'right', map, () => false)).toBe(canEnter(map, p.x + 1, p.y, () => false));
    for (let i = 0; i < 20; i++) advance(p, 0.05);
    expect(drawPos(p)).toEqual({ x: p.x, y: p.y });
    const w = makeWalker('w', 2, 2, 5);
    expect(tryStep(w, 'left', map, () => false)).toBe(false); // borda de árvores
    expect(w.dir).toBe('left');
    expect(facing(w)).toEqual({ x: 1, y: 2 });
  });

  it('meio passo fica entre os dois blocos', () => {
    const p = makeWalker('eu', map.spawn.x, map.spawn.y, 4);
    tryStep(p, 'up', map, () => false);
    advance(p, 0.125);
    expect(drawPos(p).y).toBeCloseTo(map.spawn.y - 0.5, 5);
  });

  it('o Pokémon passeia sem sair do chão livre; quem segue chega perto de você', () => {
    const rng = seededRng(5);
    const mon = makeWalker('m', map.spawn.x, map.spawn.y, 3);
    for (let i = 0; i < 400; i++) {
      stepVillager(mon, 0.05, map, () => false, rng, null);
      expect(isSolidTile(tileAt(map, mon.x, mon.y))).toBe(false);
    }
    const target = { x: map.w / 2, y: map.h / 2 };
    const f = makeWalker('f', map.w / 2 + 4, map.h / 2, 4);
    for (let i = 0; i < 200; i++) stepVillager(f, 0.05, map, () => false, rng, target);
    expect(Math.abs(f.x - target.x) + Math.abs(f.y - target.y)).toBeLessThanOrEqual(1);
  });
});
