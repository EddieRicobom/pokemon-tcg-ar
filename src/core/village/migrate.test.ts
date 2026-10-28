import { describe, expect, it } from 'vitest';
import { emptyVillage, MAP_LAYOUT, MAP_LAYOUT_BEFORE_MOUNTAIN, normalizeVillage } from './life';
import { generateVillage, tileAt } from './map';
import { migrateLayout } from './migrate';
import { WEST } from './west';

const map = generateVillage(20261014);

describe('save do mapa antigo no mapa grande', () => {
  it('preserva mobília e estágio das plantas quando um novo posto ocupa seu terreno', () => {
    const state = emptyVillage(20261014, map.spawn);
    state.placed.push({ x: WEST + 6, y: 64, item: 'cadeira' });
    state.crops.push({ x: WEST + 80, y: 17, seed: 'sem-tomate', stage: 2, wateredAt: 1234 });
    state.player = { x: WEST + 7, y: 64, dir: 'down' };
    expect(migrateLayout(state, map)).toBe(true);
    expect(state.placed).toHaveLength(1);
    expect(state.placed[0]).not.toMatchObject({ x: WEST + 6, y: 64 });
    expect(state.crops[0]).toMatchObject({ seed: 'sem-tomate', stage: 2, wateredAt: 1234 });
    expect(state.crops[0]).not.toMatchObject({ x: WEST + 80, y: 17 });
    expect(state.inventory.cadeira ?? 0).toBe(0);
    expect(migrateLayout(state, map)).toBe(false);
  });
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

  it('save de antes do Monte Miragem: tudo anda WEST blocos e continua no mesmo lugar da cidade', () => {
    const s = { ...emptyVillage(20261014, map.spawn), layout: MAP_LAYOUT_BEFORE_MOUNTAIN };
    // Uma cadeira na praça, um tomate num canteiro e você na frente da fonte, nas coordenadas do desenho anterior.
    s.placed.push({ x: 42, y: 36, item: 'cadeira' });
    s.crops.push({ x: 78, y: 48, seed: 'sem-tomate', stage: 2, wateredAt: 99 });
    s.player = { x: 45, y: 41, dir: 'left' };
    const back = normalizeVillage(JSON.parse(JSON.stringify(s)), 20261014, map.spawn);
    expect(back.layout).toBe(MAP_LAYOUT_BEFORE_MOUNTAIN);
    expect(migrateLayout(back, map)).toBe(true);
    expect(back.layout).toBe(MAP_LAYOUT);
    expect(back.placed[0]).toMatchObject({ x: WEST + 42, y: 36 });
    expect(back.crops[0]).toMatchObject({ x: WEST + 78, y: 48, stage: 2, wateredAt: 99 });
    expect(tileAt(map, back.crops[0]!.x, back.crops[0]!.y)).toBe('field');
    expect(back.player).toEqual({ x: WEST + 45, y: 41, dir: 'left' });
    expect(migrateLayout(back, map)).toBe(false);
  });

  it('save novo já nasce no mapa grande e passa intacto', () => {
    const s = emptyVillage(20261014, map.spawn);
    s.placed.push({ x: WEST + 24, y: 29, item: 'cadeira' });
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
