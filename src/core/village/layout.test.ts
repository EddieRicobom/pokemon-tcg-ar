import { describe, expect, it } from 'vitest';
import { advance, makeWalker, moving, stepVillager, swapPlaces } from './actors';
import { chokepoints, cutsOff, generateVillage, isWalkable, keyPoints, reachableFrom, setTile, tileAt } from './map';
import type { Tile, VillageMap } from './map';
import { pathStep } from './pathing';
import { FURNITURE_IDS, SEED_IDS } from './catalog';
import { add, emptyVillage, place, plant } from './life';
import { sanitizeTown } from './town';
import { VILLAGE_SEED } from '../../app/village-store';
import { TOWN } from './town-layout';

/** Um bloco de grama aberta no gramado a oeste da praça (mapa de `VILLAGE_SEED`). */
const OPEN = { x: 24, y: 29 };

const SEEDS = [VILLAGE_SEED, 1, 2, 3, 7, 42, 99, 1234, 20240101, 777777];

describe('layout da Vila: sem ilhas nem gargalos', () => {
  it.each(SEEDS)('semente %i: todo lugar importante se alcança e nada isola um deles', (seed) => {
    const map = generateVillage(seed);
    const seen = reachableFrom(map, map.spawn.x, map.spawn.y);
    for (const k of keyPoints(map)) expect(seen[k.y * map.w + k.x], `${k.x},${k.y}`).toBe(1);
    expect(chokepoints(map)).toEqual([]);
  });

  it('todo bloco livre se alcança a partir de onde você nasce (sem ilhas)', () => {
    for (const seed of SEEDS) {
      const map = generateVillage(seed);
      const seen = reachableFrom(map, map.spawn.x, map.spawn.y);
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (isWalkable(map, x, y)) expect(seen[y * map.w + x], `${seed}: ${x},${y}`).toBe(1);
    }
  });

  it('as ruas principais ficam inteiras, com duas faixas, de ponta a ponta', () => {
    const map = generateVillage(VILLAGE_SEED);
    const cy = TOWN.mainStreetY;
    for (const y of [cy, cy + 1]) for (let x = 4; x < map.w - 4; x++) expect(['path', 'plaza'].includes(tileAt(map, x, y)), `${x},${y}`).toBe(true);
    const cx = TOWN.avenueX;
    for (const x of [cx, cx + 1]) for (let y = 4; y < map.h - 4; y++) expect(isWalkable(map, x, y) || tileAt(map, x, y) === 'building', `${x},${y}`).toBe(true);
    for (const y of [TOWN.gamesStreetY, TOWN.homesStreetY, TOWN.southStreetY]) expect(tileAt(map, cx - 3, y)).toBe('path');
  });

  it('postes nunca encostam numa casa ou prédio, e entre duas casas vizinhas sempre dá para passar', () => {
    for (const seed of SEEDS) {
      const map = generateVillage(seed);
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          if (tileAt(map, x, y) !== 'lamp') continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) expect(tileAt(map, x + dx, y + dy), `poste ${x},${y}`).not.toBe('building');
        }
      }
      const homes = map.buildings.filter((b) => b.kind === 'home');
      for (const a of homes) {
        const right = homes.find((b) => b.y === a.y && b.x > a.x + a.w && b.x - (a.x + a.w) <= 3);
        if (!right) continue;
        for (let x = a.x + a.w; x < right.x; x++) for (let y = a.y; y < a.y + a.h; y++) expect(isWalkable(map, x, y), `vão ${x},${y}`).toBe(true);
        expect(right.x - (a.x + a.w)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('o terreno da sua casa fica inteiro (5×3) e dá acesso por fora', () => {
    const map = generateVillage(VILLAGE_SEED);
    const p = map.plot;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) expect(tileAt(map, x, y)).toBe('plot');
    expect(isWalkable(map, p.x + p.w, p.y + p.h - 1)).toBe(true);
    expect(isWalkable(map, p.x + 1, p.y - 1)).toBe(true);
  });

  it('a calçada de cada prédio é larga: todo bloco à frente dele é trilha', () => {
    const map = generateVillage(VILLAGE_SEED);
    for (const b of map.buildings) {
      if (b.kind === 'fountain') continue;
      for (let x = b.x; x < b.x + b.w; x++) expect(tileAt(map, x, b.y + b.h), `${b.id} ${x}`).toBe('path');
    }
  });

  it('alguém parado numa rua larga não isola nada, mas uma barreira de ponta a ponta isola', () => {
    const map = generateVillage(VILLAGE_SEED);
    const cx = Math.floor(map.w / 2);
    const cy = Math.floor(map.h / 2);
    expect(cutsOff(map, (x, y) => x === 10 && y === cy)).toBe(false);
    // Fechar três colunas da cidade inteira separa o lado de lá (é o que o aviso «bloquearia o caminho» evita).
    expect(cutsOff(map, (x) => x >= cx - 9 && x <= cx - 6)).toBe(true);
  });
});

describe('caminho dos Pokémon', () => {
  it('contorna a fonte em vez de encostar nela', () => {
    const map = generateVillage(VILLAGE_SEED);
    const fonte = map.buildings.find((b) => b.kind === 'fountain')!;
    const from = { x: fonte.x - 3, y: fonte.y };
    const goal = { x: fonte.x + fonte.w + 2, y: fonte.y };
    // Em linha reta, o primeiro passo seria para a direita, direto na fonte; o caminho dá a volta.
    const w = makeWalker('a', from.x, from.y, 100);
    let guard = 0;
    while (Math.abs(goal.x - w.x) + Math.abs(goal.y - w.y) > 1 && guard++ < 60) stepVillager(w, 0.05, map, () => false, () => 0.5, goal);
    expect(guard).toBeLessThan(60);
    expect(Math.abs(goal.x - w.x) + Math.abs(goal.y - w.y)).toBeLessThanOrEqual(1);
  });

  it('chega a quem está atrás de um prédio, de qualquer ponto da cidade', () => {
    const map = generateVillage(VILLAGE_SEED);
    const casa = map.buildings.find((b) => b.id === 'casa0')!;
    const goal = { x: casa.x + 1, y: casa.y - 2 }; // atrás da casa
    const w = makeWalker('a', casa.x + 1, casa.y + 5, 100);
    let guard = 0;
    while (Math.abs(goal.x - w.x) + Math.abs(goal.y - w.y) > 1 && guard++ < 200) stepVillager(w, 0.05, map, () => false, () => 0.5, goal);
    expect(guard).toBeLessThan(200);
  });

  it('contorna quem está no caminho', () => {
    const map = generateVillage(VILLAGE_SEED);
    const cy = Math.floor(map.h / 2);
    const from = { x: 8, y: cy };
    const goal = { x: 14, y: cy };
    // Alguém parado logo à frente: o primeiro passo não é para a direita (bateria nele).
    expect(pathStep(map, from, goal, (x, y) => x === 9 && y === cy)).not.toBe('right');
    // Já ao lado do destino, não precisa andar.
    expect(pathStep(map, { x: 13, y: cy }, goal, () => false)).toBeNull();
  });

  it('sem caminho nenhum (destino numa ilha), devolve null', () => {
    const map = generateVillage(VILLAGE_SEED);
    expect(pathStep(map, { x: 24, y: 23 }, { x: 0, y: 0 }, () => false)).toBeNull();
  });
});

describe('móveis e plantas não fecham a cidade', () => {
  const setup = () => {
    const map = generateVillage(VILLAGE_SEED);
    const s = emptyVillage(VILLAGE_SEED, map.spawn);
    const item = FURNITURE_IDS[0]!;
    add(s, item, 80);
    return { map, s, item };
  };
  const none = () => false;

  it('a frente das portas, da loja e de onde você nasce fica livre', () => {
    const { map, s, item } = setup();
    const casa = map.buildings.find((b) => b.id === 'casa1')!;
    expect(place(s, map, item, casa.x + 1, casa.y + casa.h, none).ok).toBe(false);
    expect(place(s, map, item, map.shop.x, map.shop.y + map.shop.h, none).ok).toBe(false);
    expect(place(s, map, item, map.spawn.x, map.spawn.y, none).ok).toBe(false);
    expect(s.placed).toHaveLength(0);
  });

  it('um móvel no meio da grama aberta pode', () => {
    const { map, s, item } = setup();
    expect(place(s, map, item, OPEN.x, OPEN.y, none).ok).toBe(true);
    expect(place(s, map, item, map.spawn.x + 1, map.spawn.y - 1, none).ok).toBe(true); // na praça também
  });

  /** Um corredor de 1 bloco de largura: de onde você nasce até a loja e o terreno da casa. */
  const corridor = (tile: 'path' | 'grass') => {
    const map: VillageMap = { w: 10, h: 5, tiles: new Array<Tile>(50).fill('tree'), spawn: { x: 1, y: 2 }, plot: { x: 7, y: 0, w: 1, h: 3 }, shop: { x: 6, y: 0, w: 1, h: 2 }, buildings: [], decor: [] };
    for (let x = 1; x <= 8; x++) setTile(map, x, 2, tile);
    return map;
  };

  it('recusa o móvel que fecharia o único caminho, e diz por quê', () => {
    const map = corridor('path');
    const s = emptyVillage(1, map.spawn);
    const item = FURNITURE_IDS[0]!;
    add(s, item, 2);
    const r = place(s, map, item, 4, 2, none);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/fecharia o caminho/);
    expect(s.placed).toHaveLength(0);
    expect(s.inventory[item]).toBe(2);
  });

  it('o mesmo vale para plantar na grama', () => {
    const map = corridor('grass');
    const s = emptyVillage(1, map.spawn);
    const seed = SEED_IDS[0]!;
    add(s, seed, 1);
    const r = plant(s, map, seed, 4, 2, 0, none);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/fecharia o caminho/);
    expect(s.crops).toHaveLength(0);
  });

  it('móveis antigos que ficaram na frente de uma porta voltam para a mochila', () => {
    const { map, s, item } = setup();
    const casa = map.buildings.find((b) => b.id === 'casa1')!;
    s.placed.push({ x: casa.x + 1, y: casa.y + casa.h, item });
    s.placed.push({ x: OPEN.x, y: OPEN.y, item });
    const have = s.inventory[item]!;
    expect(sanitizeTown(s, map)).toBe(1);
    expect(s.placed).toEqual([{ x: OPEN.x, y: OPEN.y, item }]);
    expect(s.inventory[item]).toBe(have + 1);
  });
});

describe('trocar de lugar', () => {
  it('dois lado a lado trocam, olhando um para o outro; depois do passo, cada um está onde o outro estava', () => {
    const a = makeWalker('a', 24, 23, 100);
    const b = makeWalker('b', 25, 23, 100);
    expect(swapPlaces(a, b)).toBe(true);
    expect(a.dir).toBe('right');
    expect(b.dir).toBe('left');
    for (let i = 0; i < 40 && (moving(a) || moving(b)); i++) {
      advance(a, 0.05);
      advance(b, 0.05);
    }
    expect([a.x, a.y, b.x, b.y]).toEqual([25, 23, 24, 23]);
  });

  it('não troca com quem está longe nem com quem está no meio de um passo', () => {
    const a = makeWalker('a', 24, 23, 1);
    expect(swapPlaces(a, makeWalker('b', 26, 23, 1))).toBe(false);
    expect(swapPlaces(a, makeWalker('c', 24, 24, 1))).toBe(true);
    expect(swapPlaces(a, makeWalker('d', 23, 23, 1))).toBe(false); // a já está andando
  });
});
