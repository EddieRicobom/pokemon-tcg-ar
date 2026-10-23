import { describe, expect, it } from 'vitest';
import { emptyVillage, normalizeVillage, craft, add } from './life';
import { homeDecor, homeLevel, homeRoof, homeValue, normalizeHomeValue } from './home-state';
import { personalizeResidentHomes, RESIDENT_HOME_PREFS } from './town';
import { advanceResidentHomes } from './home-autonomy';
import { findHomeFurnitureSlot, furnitureZone } from './home-layout';
import { COZY_FURNITURE } from './furniture-collection';
import { ITEMS, isItem } from './catalog';
import { homePlace } from './home-interior';
import { paintFurnitureItem } from '../../village/item-art';
import { payResidentWork } from './resident-economy';

const fresh = () => emptyVillage(7, { x: 2, y: 2 });
const homes = new Map([['morador-1', 0]]);
const day = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString().slice(0, 10);

describe('decoração e reformas persistentes', () => {
  it('preserva TODOS os valores do save antigo e estende os níveis sem misturar enfeites ou telhado', () => {
    for (let old = 0; old < 512; old++) {
      expect(normalizeHomeValue(old)).toBe(old);
      expect(homeLevel(old)).toBe(old & 3);
    }
    for (const l of [4, 5]) for (let d = 0; d < 16; d++) for (let r = 0; r < 8; r++) {
      const packed = homeValue(l, d, r);
      const state = fresh(); state.homes['0'] = packed;
      const back = normalizeVillage(JSON.parse(JSON.stringify(state)), 7, state.player);
      expect([homeLevel(back.homes['0']!), homeDecor(back.homes['0']!), homeRoof(back.homes['0']!)]).toEqual([l, d, r]);
    }
  });

  it('todas as peças novas têm receita válida, arte diferente e podem ser fabricadas', () => {
    expect(COZY_FURNITURE).toHaveLength(32);
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
    const art = new Set<string>();
    for (const item of COZY_FURNITURE) {
      expect(item.purpose).toBeTruthy();
      const state = fresh();
      for (const [material, qty] of Object.entries(item.recipe!)) { expect(isItem(material), material).toBe(true); add(state, material, qty); }
      expect(craft(state, item.id).ok, item.id).toBe(true);
      const pixels = paintFurnitureItem(item.id);
      expect(pixels.data.filter((_, i) => i % 4 === 3 && pixels.data[i] === 255).length, item.id).toBeGreaterThan(30);
      art.add(pixels.data.join(','));
    }
    expect(art.size).toBe(32);
  });

  it('organiza descanso, cozinha e convivência e deixa a entrada livre sem apagar móveis antigos', () => {
    const state = fresh(); state.house = 1;
    const room = state.homeInterior;
    for (const item of ['cama-colcha', 'comoda', 'fogao', 'armario-loucas', 'mesa-jantar', 'almofadas']) {
      const position = findHomeFurnitureSlot(room, item)!;
      expect(position).not.toBeNull();
      if (furnitureZone(item) === 'rest') expect(position.x).toBeLessThan(3);
      if (furnitureZone(item) === 'kitchen') expect(position.x).toBeGreaterThan(3);
      add(state, item); expect(homePlace(state, item, position.x, position.y).ok).toBe(true);
    }
    add(state, 'cadeira');
    expect(homePlace(state, 'cadeira', 3, 4).ok).toBe(false);
    expect(state.inventory.cadeira).toBe(1);
    room.placed.push({ x: 3, y: 4, item: 'cadeira' });
    expect(normalizeVillage(JSON.parse(JSON.stringify(state)), 7, state.player).homeInterior.placed).toEqual(room.placed);
  });

  it('compras de moradores são idempotentes, coerentes e não consomem recursos do jogador', () => {
    const s = fresh(); s.coins = 180; s.inventory = { madeira: 30 };
    personalizeResidentHomes(s, homes);
    expect(s.homeInteriors['0']!.placed.some((p) => p.item === 'cama')).toBe(true);
    const preferences = new Set(Object.values(RESIDENT_HOME_PREFS).flatMap((p) => p.items));
    for (const p of s.homeInteriors['0']!.placed) expect(p.item === 'cama' || preferences.has(p.item)).toBe(true);
    advanceResidentHomes(s, homes, day(1));
    const start = JSON.stringify(s);
    for (let n = 0; n < 20; n++) {
      expect(advanceResidentHomes(s, homes, day(1)).changed).toBe(false);
      expect(personalizeResidentHomes(s, homes)).toEqual([]);
    }
    expect(JSON.stringify(s)).toBe(start);
    let upgrades = 0;
    for (let n = 2; n <= 250; n++) {
      payResidentWork(s, 'morador-1', 'farm', `tarefa-${n}`, day(n), 80);
      const events = advanceResidentHomes(s, homes, day(n)).events;
      expect(events.length).toBeLessThanOrEqual(1);
      upgrades += events.filter((e) => e.renovation).length;
      expect(s.homeProjects['0']!.savings).toBeGreaterThanOrEqual(0);
    }
    expect(upgrades).toBe(5);
    expect(homeLevel(s.homes['0']!)).toBe(5);
    expect(s.coins).toBe(180); expect(s.inventory).toEqual({ madeira: 30 });
    const back = normalizeVillage(JSON.parse(JSON.stringify(s)), 7, s.player);
    expect(back.homeProjects).toEqual(s.homeProjects);
    expect(back.homeStyles).toEqual(s.homeStyles);
    expect(back.homeInteriors).toEqual(s.homeInteriors);
  });

  it('não gera renda ao ficar ausente, recarregar ou voltar o relógio', () => {
    const s = fresh(); personalizeResidentHomes(s, homes); advanceResidentHomes(s, homes, day(1));
    s.community.welfare = 0;
    advanceResidentHomes(s, homes, day(60));
    expect(s.homeProjects['0']!.savings).toBe(0);
    const before = JSON.stringify(s);
    advanceResidentHomes(s, homes, day(59)); advanceResidentHomes(s, homes, day(60));
    expect(JSON.stringify(s)).toBe(before);
    expect(advanceResidentHomes(s, homes, 'invalid').changed).toBe(false);
  });
});
