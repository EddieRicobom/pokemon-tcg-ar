import { describe, expect, it } from 'vitest';
import { NEW_ACCESSORIES } from './accessory-collection';
import { NEW_FURNITURE_ITEMS } from './furniture-collection';
import { PRIZES } from './rewards';
import { paintFurnitureItem } from '../../village/item-art';
import { ITEMS, isItem, itemDef, shopToday } from './catalog';
import { NEW_CROPS, NEW_FOODS, NEW_MATERIALS, NEW_SEEDS } from './item-collection';
import { WILD_FINDS } from './life';

describe('segunda leva de itens', () => {
  it('traz 100 itens novos e 100 acessórios novos, sem repetir id nem nome', () => {
    expect(NEW_MATERIALS.length + NEW_CROPS.length + NEW_SEEDS.length + NEW_FOODS.length).toBe(100);
    expect(NEW_ACCESSORIES).toHaveLength(100);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(new Set(ITEMS.map((i) => i.name)).size).toBe(ITEMS.length);
  });

  it('toda receita usa itens que existem', () => {
    for (const i of ITEMS) for (const k of Object.keys(i.recipe ?? {})) expect(isItem(k), `${i.id} → ${k}`).toBe(true);
  });

  it('todo material novo tem de onde vir: natureza, loja ou bancada', () => {
    for (const m of NEW_MATERIALS) expect(WILD_FINDS.has(m.id) || m.price > 0 || !!m.recipe, m.id).toBe(true);
  });

  it('cada semente nova dá uma colheita nova, e toda colheita nova tem semente', () => {
    const crops = new Set(NEW_CROPS.map((c) => c.id));
    for (const s of NEW_SEEDS) expect(crops.has(s.grows!.crop), s.id).toBe(true);
    expect(new Set(NEW_SEEDS.map((s) => s.grows!.crop)).size).toBe(NEW_CROPS.length);
    for (const s of NEW_SEEDS) expect(shopToday('2026-10-25').some((i) => i.id === s.id)).toBe(true);
  });

  it('todo prato novo leva ingrediente e vale mais que vender os ingredientes crus', () => {
    for (const d of NEW_FOODS) {
      const raw = Object.entries(d.recipe!).reduce((n, [k, q]) => n + (itemDef(k)?.sell ?? 0) * q, 0);
      expect(d.sell, d.id).toBeGreaterThan(raw);
    }
  });

  it('traz 100 móveis novos (84 peças e as famílias almofada e banqueta em 8 cores), cada um com desenho próprio', () => {
    const families = ITEMS.filter((i) => i.id === 'almofada' || i.id === 'banqueta' || i.id.startsWith('almofada-') || i.id.startsWith('banqueta-'));
    expect(NEW_FURNITURE_ITEMS.length + families.length).toBe(100);
    const art = new Set<string>();
    for (const f of [...NEW_FURNITURE_ITEMS, ...families]) {
      const buf = paintFurnitureItem(f.id, false, 0);
      expect(buf.h, f.id).toBe(f.tall ? 32 : 16);
      expect(buf.data.filter((_, i) => i % 4 === 3 && buf.data[i] === 255).length, f.id).toBeGreaterThan(30);
      art.add(buf.data.join());
    }
    expect(art.size).toBe(100);
  });

  it('móveis de prêmio só vêm de uma conquista', () => {
    const prizes = new Set(Object.values(PRIZES).map((p) => p.item));
    for (const f of NEW_FURNITURE_ITEMS.filter((i) => i.prize)) {
      expect(prizes.has(f.id), f.id).toBe(true);
      expect(f.price).toBe(0);
      expect(f.recipe).toBeUndefined();
    }
  });
});
