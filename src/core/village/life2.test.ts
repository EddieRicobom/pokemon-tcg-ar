import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { bookPage, dislikeOf, moodOf, opinionOf, personalityOf, UNLOCKS } from './book';
import { ACCESSORY_IDS, COOK_IDS, CRAFT_IDS, FOOD_IDS, FURNITURE_IDS, itemDef, ITEMS, LIGHT_IDS, SEED_IDS, shopToday } from './catalog';
import { add, buy, cook, count, craft, cropAt, dailyHelp, emptyVillage, favoriteFoodOf, favoriteOf, fish, FISH_PER_DAY, friendOf, giveGift, harvestCrop, needsWater, normalizeVillage, place, plant, sell, tickCrops, water, wear } from './life';
import { generateVillage, isSolidTile, tileAt } from './map';
import { ACCESSORY_ART_IDS, FOOD_ART_IDS, FURNITURE_ART_IDS, MATERIAL_ART_IDS, paintCrop, paintFurnitureItem, paintItemIcon, TALL_ART_IDS } from '../../village/item-art';

const map = generateVillage(20261014);
const spot = (() => {
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (tileAt(map, x, y) === 'grass') return { x, y };
  return { x: 0, y: 0 };
})();

describe('catálogo', () => {
  it('dezenas de móveis, todos com arte; todo material, colheita e acessório tem ícone', () => {
    expect(FURNITURE_IDS.length).toBeGreaterThanOrEqual(110);
    for (const id of FURNITURE_IDS) expect(FURNITURE_ART_IDS).toContain(id);
    for (const i of ITEMS.filter((i) => i.kind === 'material' || i.kind === 'crop')) expect(MATERIAL_ART_IDS).toContain(i.id);
    for (const id of ACCESSORY_IDS) expect(ACCESSORY_ART_IDS).toContain(id);
    for (const id of FOOD_IDS) expect(FOOD_ART_IDS).toContain(id);
    for (const i of ITEMS) {
      let n = 0;
      const b = paintItemIcon(i.id);
      for (let k = 3; k < b.data.length; k += 4) if (b.data[k]! > 0) n++;
      expect(n, i.id).toBeGreaterThan(15);
    }
  });

  it('receitas só usam itens que existem; todo móvel se consegue de algum jeito', () => {
    for (const i of ITEMS) for (const k of Object.keys(i.recipe ?? {})) expect(itemDef(k), `${i.id}→${k}`).toBeDefined();
    for (const id of FURNITURE_IDS) {
      const d = itemDef(id)!;
      expect(Boolean(d.recipe) || d.price > 0 || d.gift, id).toBe(true);
    }
  });

  it('a loja vende sempre as sementes e muda o resto a cada dia', () => {
    const a = shopToday('2026-10-14').map((i) => i.id);
    const b = shopToday('2026-10-15').map((i) => i.id);
    for (const sId of SEED_IDS) expect(a).toContain(sId);
    expect(a).not.toEqual(b);
    expect(shopToday('2026-10-14').map((i) => i.id)).toEqual(a);
  });

  it('a loja aparece no mapa, sólida, com trilha na frente', () => {
    expect(isSolidTile(tileAt(map, map.shop.x, map.shop.y))).toBe(true);
    expect(tileAt(map, map.shop.x, map.shop.y + map.shop.h)).toBe('path');
  });
});

describe('desejo único da Fonte', () => {
  it('saves antigos ficam elegíveis uma vez e o marco visto sobrevive à normalização', () => {
    const fresh = emptyVillage(1, map.spawn);
    expect(fresh.hoOhWishSeen).toBe(false);
    const oldSave = { ...fresh } as Partial<typeof fresh>;
    delete oldSave.hoOhWishSeen;
    expect(normalizeVillage(oldSave, 1, map.spawn).hoOhWishSeen).toBe(false);
    expect(normalizeVillage({ ...fresh, hoOhWishSeen: true }, 1, map.spawn).hoOhWishSeen).toBe(true);
  });
});

describe('loja e moedas', () => {
  it('compra com moedas e vende pelo preço de venda', () => {
    const s = emptyVillage(1, map.spawn);
    expect(s.coins).toBe(100);
    expect(buy(s, 'sem-oran', '2026-10-14').ok).toBe(true);
    expect(s.coins).toBe(80);
    expect(buy(s, 'nao-existe', '2026-10-14').ok).toBe(false);
    add(s, 'concha', 3);
    expect(sell(s, 'concha', 3).ok).toBe(true);
    expect(s.coins).toBe(80 + 36);
    expect(sell(s, 'concha').ok).toBe(false);
  });

  it('não vende o acessório que está em uso', () => {
    const s = emptyVillage(1, map.spawn);
    add(s, 'laco');
    expect(wear(s, 'player', 'laco').ok).toBe(true);
    expect(sell(s, 'laco').ok).toBe(false);
  });
});

describe('horta', () => {
  it('planta, precisa de rega, cresce com o tempo e colhe', () => {
    const s = emptyVillage(1, map.spawn);
    add(s, 'sem-tomate');
    let now = 1_000_000;
    expect(plant(s, map, 'sem-tomate', spot.x, spot.y, now, () => false).ok).toBe(true);
    expect(count(s, 'sem-tomate')).toBe(0);
    const crop = cropAt(s, spot.x, spot.y)!;
    expect(needsWater(crop)).toBe(false);
    now += 10 * 60_000;
    expect(tickCrops(s, now)).toBe(1);
    expect(crop.stage).toBe(1);
    expect(needsWater(crop)).toBe(true);
    // Sem rega não cresce.
    now += 60 * 60_000;
    expect(tickCrops(s, now)).toBe(0);
    for (let k = 0; k < 2; k++) {
      expect(water(s, spot.x, spot.y, now).ok).toBe(true);
      expect(water(s, spot.x, spot.y, now).ok).toBe(false);
      now += 10 * 60_000;
      tickCrops(s, now);
    }
    expect(crop.stage).toBe(3);
    const r = harvestCrop(s, spot.x, spot.y, seededRng(2));
    expect(r.ok).toBe(true);
    expect(count(s, 'tomate')).toBeGreaterThanOrEqual(2);
    expect(cropAt(s, spot.x, spot.y)).toBeUndefined();
  });

  it('não planta na trilha, na água nem em cima de móvel', () => {
    const s = emptyVillage(1, map.spawn);
    add(s, 'sem-oran', 3);
    expect(plant(s, map, 'sem-oran', map.spawn.x, map.spawn.y, 0, () => false).ok).toBe(false);
    add(s, 'cadeira');
    place(s, map, 'cadeira', spot.x, spot.y, () => false);
    expect(plant(s, map, 'sem-oran', spot.x, spot.y, 0, () => false).ok).toBe(false);
  });

  it('a planta tem desenho em cada estágio', () => {
    const frames = [0, 1, 2, 3].map((st) => paintCrop('tomate', st, 3).data.join());
    expect(new Set(frames).size).toBe(4);
  });
});

describe('acessórios e coleção', () => {
  it('veste em você ou num Pokémon; não dá para usar o mesmo acessório em dois sem ter dois', () => {
    const s = emptyVillage(1, map.spawn);
    expect(wear(s, 'player', 'laco').ok).toBe(false);
    add(s, 'laco');
    expect(wear(s, 'p1', 'laco').ok).toBe(true);
    expect(wear(s, 'player', 'laco').ok).toBe(false);
    add(s, 'laco');
    expect(wear(s, 'player', 'laco').ok).toBe(true);
    add(s, 'cartola');
    expect(wear(s, 'player', 'cartola').ok).toBe(false);
    add(s, 'oculos');
    expect(wear(s, 'p1', 'oculos').ok).toBe(false);
    expect(wear(s, 'p1', null).ok).toBe(true);
    expect(s.wear.mons.p1).toBeNull();
  });

  it('móveis entram na coleção ao serem obtidos', () => {
    const s = emptyVillage(1, map.spawn);
    add(s, 'madeira', 3);
    craft(s, 'cadeira');
    expect(s.collected).toEqual(['cadeira']);
    add(s, 'flor', 6);
    expect(craft(s, 'coroa-flores').ok).toBe(true);
    expect(count(s, 'coroa-flores')).toBe(1);
  });
});

describe('ajuda dos amigos', () => {
  it('Amigo traz materiais uma vez por dia; Conhecido ainda não', () => {
    const s = emptyVillage(1, map.spawn);
    expect(dailyHelp(s, 'p', '2026-10-14', seededRng(1)).items).toEqual([]);
    friendOf(s, 'p').points = 50;
    const a = dailyHelp(s, 'p', '2026-10-14', seededRng(1));
    expect(a.items.length).toBe(1);
    expect(dailyHelp(s, 'p', '2026-10-14', seededRng(1)).items).toEqual([]);
    expect(dailyHelp(s, 'p', '2026-10-15', seededRng(1)).items.length).toBe(1);
  });

  it('Melhor amigo traz um móvel raro por semana', () => {
    const s = emptyVillage(1, map.spawn);
    friendOf(s, 'p').points = 95;
    const a = dailyHelp(s, 'p', '2026-10-14', seededRng(1));
    expect(a.rare).not.toBeNull();
    expect(itemDef(a.rare!)?.gift).toBe(true);
    expect(dailyHelp(s, 'p', '2026-10-13', seededRng(1)).rare).toBeNull();
    expect(dailyHelp(s, 'p', '2026-10-21', seededRng(1)).rare).not.toBeNull();
  });
});

describe('Livro dos Pokémon', () => {
  const pika = { id: 'base1-58', name: 'Pikachu', types: ['electric'] as const };
  const squirt = { id: 'base1-63', name: 'Squirtle', types: ['water'] as const };
  const gyara = { id: 'x-1', name: 'Gyarados', types: ['water', 'flying'] as const };

  it('personalidade e o que não gosta são fixos de cada Pokémon', () => {
    expect(personalityOf('a')).toEqual(personalityOf('a'));
    expect(dislikeOf(pika.id, pika.types)).not.toBe(favoriteOf(pika.types));
  });

  it('o humor muda com o que você fez hoje e com a hora', () => {
    const f = { points: 10, lastTalk: 'd', lastGift: 'd', request: null };
    expect(moodOf('a', f, 'd', 12).name).toBe('Radiante');
    expect(moodOf('a', undefined, 'd', 23).name).toBe('Sonolento');
    expect(moodOf('a', { ...f, lastGift: '' }, 'd', 12).name).toBe('Contente');
  });

  it('opiniões pelos tipos: vantagem, desvantagem e mesmo tipo', () => {
    expect(opinionOf(pika, squirt).feeling).toMatch(/ganha fácil|protege/);
    expect(opinionOf(squirt, pika).feeling).toMatch(/respeita|treinar/);
    expect(opinionOf(squirt, gyara).feeling).toContain('unha e carne');
  });

  it('as páginas se abrem com a intimidade', () => {
    const closed = bookPage(pika, [pika, squirt], undefined, 'd', 12);
    expect(closed.likes).toBeNull();
    expect(closed.opinions).toBeNull();
    expect(closed.unlocks.every((u) => !u.open)).toBe(true);
    const friend = bookPage(pika, [pika, squirt], { points: 50, lastTalk: '', lastGift: '', request: null }, 'd', 12);
    expect(friend.likes).toBe('Fruta Oran');
    expect(friend.opinions).toHaveLength(1);
    expect(friend.unlocks.filter((u) => u.open)).toHaveLength(3);
    expect(UNLOCKS.at(-1)!.text).toContain('aguenta firme');
  });
});


describe('catálogo ampliado', () => {
  it('móveis altos têm arte de 2 blocos e as luzes e animações existem no catálogo', () => {
    const tall = FURNITURE_IDS.filter((id) => itemDef(id)?.tall);
    expect(tall.length).toBeGreaterThanOrEqual(6);
    for (const id of tall) {
      expect(TALL_ART_IDS).toContain(id);
      expect(paintFurnitureItem(id, false, 0).h, id).toBe(32);
    }
    for (const id of FURNITURE_IDS.filter((i) => !itemDef(i)?.tall)) expect(paintFurnitureItem(id, false, 0).h, id).toBe(16);
    expect(LIGHT_IDS.size).toBeGreaterThanOrEqual(6);
    // A maioria acende de noite (a lareira e a fogueira já têm fogo o tempo todo, só ganham brilho no mundo).
    const lights = [...LIGHT_IDS].filter((id) => paintFurnitureItem(id, true, 0).data.join() !== paintFurnitureItem(id, false, 0).data.join());
    expect(lights.length).toBeGreaterThanOrEqual(Math.floor(LIGHT_IDS.size / 2));
    for (const id of FURNITURE_IDS.filter((i) => (itemDef(i)?.frames ?? 1) > 1)) {
      {
      const lit = LIGHT_IDS.has(id);
      expect(paintFurnitureItem(id, lit, 0).data.join(), id).not.toBe(paintFurnitureItem(id, lit, 1).data.join());
    }
    }
  });

  it('as variantes de cor existem em mais de um tom e cada uma tem desenho próprio', () => {
    const sofas = FURNITURE_IDS.filter((id) => id.startsWith('sofa-'));
    expect(sofas.length).toBeGreaterThanOrEqual(4);
    expect(new Set(sofas.map((id) => paintFurnitureItem(id, false, 0).data.join())).size).toBe(sofas.length);
  });

  it('móveis que só vêm de presente não estão à venda nem têm receita', () => {
    const gifts = FURNITURE_IDS.filter((id) => itemDef(id)?.gift);
    expect(gifts.length).toBeGreaterThanOrEqual(5);
    for (const id of gifts) {
      expect(itemDef(id)!.price, id).toBe(0);
      expect(itemDef(id)!.recipe, id).toBeUndefined();
    }
  });

  it('há muitas comidas, todas com receita feita de itens que existem; fabricar e cozinhar não se misturam', () => {
    expect(FOOD_IDS.length).toBeGreaterThanOrEqual(12);
    expect(COOK_IDS.sort()).toEqual([...FOOD_IDS].sort());
    for (const id of CRAFT_IDS) expect(itemDef(id)?.kind).not.toBe('food');
    const s = emptyVillage(1, map.spawn);
    const food = COOK_IDS[0]!;
    for (const [k, n] of Object.entries(itemDef(food)!.recipe!)) add(s, k, n);
    expect(craft(s, food).ok).toBe(false);
    expect(cook(s, food).ok).toBe(true);
    expect(count(s, food)).toBe(1);
    expect(cook(s, food).ok).toBe(false);
    expect(cook(s, 'madeira').ok).toBe(false);
  });
});

describe('pesca', () => {
  const water = (() => {
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (tileAt(map, x, y) === 'water') return { x, y };
    return null;
  })();

  it('só funciona na água, rende itens e cansa depois de 10 lançamentos por dia', () => {
    expect(water).not.toBeNull();
    const s = emptyVillage(1, map.spawn);
    expect(fish(s, map, spot.x, spot.y, '2026-10-14', seededRng(1)).ok).toBe(false);
    expect(s.fishing.casts).toBe(0);
    const rng = seededRng(5);
    let got = 0;
    for (let i = 0; i < FISH_PER_DAY; i++) {
      const r = fish(s, map, water!.x, water!.y, '2026-10-14', rng);
      expect(r.ok).toBe(true);
      if (r.got) got++;
    }
    expect(got).toBeGreaterThan(0);
    expect(fish(s, map, water!.x, water!.y, '2026-10-14', rng).ok).toBe(false);
    // No dia seguinte os peixes voltam.
    expect(fish(s, map, water!.x, water!.y, '2026-10-15', rng).ok).toBe(true);
    expect(s.fishing).toEqual({ day: '2026-10-15', casts: 1 });
  });

  it('a pesca rende itens raros ao longo de muitos dias', () => {
    const s = emptyVillage(1, map.spawn);
    const rng = seededRng(9);
    for (let d = 1; d <= 60; d++) for (let i = 0; i < FISH_PER_DAY; i++) fish(s, map, water!.x, water!.y, `d${d}`, rng);
    expect(count(s, 'peixe')).toBeGreaterThan(50);
    expect(count(s, 'perola') + count(s, 'cristal') + count(s, 'dourado')).toBeGreaterThan(0);
  });
});

describe('comida como presente', () => {
  it('uma refeição por dia por Pokémon; o prato favorito e o guloso rendem mais', () => {
    const s = emptyVillage(1, map.spawn);
    const types = ['fire'] as const;
    const fav = favoriteFoodOf(types);
    expect(itemDef(fav)?.kind).toBe('food');
    add(s, fav, 2);
    const other = FOOD_IDS.find((f) => f !== fav)!;
    add(s, other, 2);
    const r1 = giveGift(s, 'mon', types, other, '2026-10-14');
    expect(r1.ok).toBe(true);
    expect(r1.gained).toBeGreaterThanOrEqual(itemDef(other)!.feeds!);
    const again = giveGift(s, 'mon', types, fav, '2026-10-14');
    expect(again.ok).toBe(false);
    expect(count(s, fav)).toBe(2);
    const next = giveGift(s, 'mon', types, fav, '2026-10-15');
    expect(next.gained).toBeGreaterThanOrEqual(r1.gained - 4);
    expect(next.gained).toBeGreaterThanOrEqual(itemDef(fav)!.feeds! + 10);
    expect(giveGift(s, 'mon2', types, 'madeira', '2026-10-14').ok).toBe(false);
  });
});
