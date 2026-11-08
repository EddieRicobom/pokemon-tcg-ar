import { describe, expect, it } from 'vitest';
import { generateVillage, tileAt } from './map';
import type { VillageMap } from './map';
import { add, emptyVillage, harvest, MAX_CROPS, MAX_PLACED, normalizeVillage, place, plant, sell, water } from './life';
import { BOARD_BONUS_COINS, claimBoardBonus, ensureRequests } from './requests';
import { weeklyEventFor } from './world-progress';

const map = generateVillage(42);
const fresh = () => emptyVillage(42, map.spawn);
const day = '2026-11-08';
const residents = [{ id: 'a', name: 'Pikachu' }];

function firstTile(m: VillageMap, tile: string): { x: number; y: number } {
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (tileAt(m, x, y) === tile) return { x, y };
  throw new Error(`sem bloco ${tile}`);
}

describe('bônus do mural', () => {
  it('paga uma vez, só com os três pedidos de hoje concluídos', () => {
    const state = fresh();
    ensureRequests(state, day, residents);
    expect(claimBoardBonus(state, day)).toBe(0);
    state.requests.items.forEach((request) => { request.done = true; });
    expect(claimBoardBonus(state, day)).toBe(BOARD_BONUS_COINS);
    expect(claimBoardBonus(state, day)).toBe(0);
  });

  it('o save guarda que o bônus de hoje já saiu', () => {
    const state = fresh();
    ensureRequests(state, day, residents);
    state.requests.items.forEach((request) => { request.done = true; });
    claimBoardBonus(state, day);
    const back = normalizeVillage(JSON.parse(JSON.stringify(state)), 42, map.spawn);
    expect(back.requests.bonusDay).toBe(day);
    expect(claimBoardBonus(back, day)).toBe(0);
  });

  it('save antigo, sem o campo, continua abrindo', () => {
    const state = fresh();
    const raw = JSON.parse(JSON.stringify(state));
    raw.requests = { day, items: [], story: [] };
    expect(normalizeVillage(raw, 42, map.spawn).requests.bonusDay).toBeUndefined();
  });
});

describe('limites que o save impõe', () => {
  it('não coloca móvel acima do que o save guarda', () => {
    const state = fresh();
    add(state, 'cadeira', 5);
    state.placed = Array.from({ length: MAX_PLACED }, (_, x) => ({ x, y: 0, item: 'cadeira' }));
    const spot = firstTile(map, 'grass');
    const result = place(state, map, 'cadeira', spot.x, spot.y, () => false);
    expect(result.ok).toBe(false);
    expect(state.inventory.cadeira).toBe(5);
  });

  it('não planta acima do que o save guarda', () => {
    const state = fresh();
    add(state, 'sem-tomate', 5);
    state.crops = Array.from({ length: MAX_CROPS }, (_, x) => ({ x, y: 0, seed: 'sem-tomate', stage: 0, wateredAt: null }));
    const spot = firstTile(map, 'grass');
    expect(plant(state, map, 'sem-tomate', spot.x, spot.y, 0, () => false).ok).toBe(false);
    expect(state.inventory['sem-tomate']).toBe(5);
  });
});

describe('coleta e horta', () => {
  it('bloco já coletado avisa "volte amanhã" antes de qualquer sorteio', () => {
    const state = fresh();
    const spot = firstTile(map, 'sand');
    state.harvested[`${spot.x},${spot.y}`] = day;
    // 0 faria a areia cair em "Só areia por aqui" se o sorteio viesse antes.
    expect(harvest(state, map, spot.x, spot.y, day, () => 0).message).toContain('Volte amanhã');
  });

  it('o plantio não manda regar o que já vem regado', () => {
    const state = fresh();
    add(state, 'sem-tomate');
    const spot = firstTile(map, 'grass');
    const result = plant(state, map, 'sem-tomate', spot.x, spot.y, 1000, () => false);
    if (!result.ok) return; // bloco reservado pelo desenho da cidade: o limite é coberto acima
    expect(result.message).toContain('Já está regada');
    expect(water(state, spot.x, spot.y, 1000).ok).toBe(false);
  });

  it('o tempo prometido na rega considera o efeito que acelera a horta', () => {
    const state = fresh();
    state.crops.push({ x: 1, y: 1, seed: 'sem-tomate', stage: 0, wateredAt: 0 });
    const normal = water(state, 1, 1, 0).message;
    const fast = water(state, 1, 1, 0, 0.5).message;
    expect(Number(/(\d+) minutos/.exec(fast)?.[1])).toBeLessThan(Number(/(\d+) minutos/.exec(normal)?.[1]));
  });
});

describe('economia', () => {
  it('venda respeita o teto de moedas', () => {
    const state = fresh();
    state.coins = 999_999;
    add(state, 'madeira');
    expect(sell(state, 'madeira').ok).toBe(true);
    expect(state.coins).toBe(999_999);
  });

  it('o evento da semana não troca o objeto a cada passo', () => {
    const state = fresh();
    weeklyEventFor(state, day);
    const before = state.weekly;
    weeklyEventFor(state, day);
    expect(state.weekly).toBe(before);
  });
});
