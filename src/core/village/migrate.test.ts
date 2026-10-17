import { describe, expect, it } from 'vitest';
import { emptyVillage, MAP_LAYOUT, normalizeVillage } from './life';
import { generateVillage, tileAt } from './map';
import { migrateLayout } from './migrate';

const map = generateVillage(20261014);

describe('save do mapa antigo no mapa grande', () => {
  it('móveis voltam para a mochila, a horta vai para a fazenda (mesmo estágio) e você volta ao começo', () => {
    const old = { ...emptyVillage(20261014, { x: 27, y: 23 }), layout: undefined } as Record<string, unknown>;
    old.placed = [{ x: 10, y: 10, item: 'cadeira' }, { x: 11, y: 10, item: 'cadeira' }];
    old.crops = [{ x: 5, y: 5, seed: 'sem-tomate', stage: 2, wateredAt: 123 }];
    old.harvested = { '3,4': '2026-10-16' };
    const s = normalizeVillage(JSON.parse(JSON.stringify(old)), 20261014, map.spawn);
    expect(s.layout).toBe(1);
    expect(migrateLayout(s, map)).toBe(true);
    expect(s.placed).toEqual([]);
    expect(s.inventory.cadeira).toBe(2);
    expect(s.crops).toHaveLength(1);
    expect(s.crops[0]).toMatchObject({ seed: 'sem-tomate', stage: 2, wateredAt: 123 });
    expect(tileAt(map, s.crops[0]!.x, s.crops[0]!.y)).toBe('field');
    expect(s.harvested).toEqual({});
    expect(s.player).toMatchObject(map.spawn);
    expect(s.layout).toBe(MAP_LAYOUT);
    expect(migrateLayout(s, map)).toBe(false);
  });

  it('save novo já nasce no mapa grande e passa intacto', () => {
    const s = emptyVillage(20261014, map.spawn);
    s.placed.push({ x: 24, y: 29, item: 'cadeira' });
    const back = normalizeVillage(JSON.parse(JSON.stringify(s)), 20261014, map.spawn);
    expect(back.layout).toBe(MAP_LAYOUT);
    expect(migrateLayout(back, map)).toBe(false);
    expect(back.placed).toHaveLength(1);
  });

  it('planta demais para a fazenda: o que não cabe volta como semente', () => {
    const s = { ...emptyVillage(20261014, map.spawn), layout: 1 };
    for (let i = 0; i < 70; i++) s.crops.push({ x: i, y: 0, seed: 'sem-milho', stage: 0, wateredAt: null });
    migrateLayout(s, map);
    expect(s.crops).toHaveLength(60);
    expect(s.inventory['sem-milho']).toBe(10);
  });
});
