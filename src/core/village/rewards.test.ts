import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../trainer';
import { itemDef } from './catalog';
import { emptyVillage, normalizeVillage, sell } from './life';
import { claimPrizes, PRIZES } from './rewards';

const fresh = () => emptyVillage(7, { x: 1, y: 1 });

describe('prêmios das conquistas', () => {
  it('toda conquista tem prêmio e todo prêmio aponta para uma conquista e um acessório ou móvel de verdade', () => {
    for (const a of ACHIEVEMENTS) expect(PRIZES[a.id], a.id).toBeDefined();
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const [id, prize] of Object.entries(PRIZES)) {
      // Prêmios de minigame ficam guardados mesmo com os minigames desligados.
      if (!id.startsWith('minigame')) expect(ids.has(id), id).toBe(true);
      expect(prize.coins).toBeGreaterThan(0);
      if (prize.item) {
        const def = itemDef(prize.item);
        expect(def?.kind === 'accessory' || def?.prize, prize.item).toBe(true);
        expect(def!.price).toBe(0);
      }
    }
  });

  it('cada acessório de prêmio vem de uma conquista só', () => {
    const items = Object.values(PRIZES).map((p) => p.item).filter(Boolean);
    expect(new Set(items).size).toBe(items.length);
  });

  it('entrega moedas e acessório uma vez só', () => {
    const s = fresh();
    const coins = s.coins;
    const got = claimPrizes(s, { 'primeira-carta': '2026-10-01' });
    expect(got?.coins).toBe(PRIZES['primeira-carta']!.coins);
    expect(got?.items).toEqual(['Boné de Treinador']);
    expect(s.coins).toBe(coins + 40);
    expect(s.inventory['bone-treinador']).toBe(1);
    expect(claimPrizes(s, { 'primeira-carta': '2026-10-01' })).toBeNull();
    expect(s.inventory['bone-treinador']).toBe(1);
  });

  it('explica a origem narrativa dos troféus e dos itens dos outros modos', () => {
    const state = fresh();
    const tower = claimPrizes(state, { 'torre-chefao': '2026-10-01' });
    expect(tower?.items).toContain('Troféu da Torre');
    expect(tower?.note).toContain('derrotar o chefão final');
    expect(tower?.note).toContain('abre modo Infinito');
    const pins = claimPrizes(state, { 'pins-perfeito': '2026-10-02' });
    expect(pins?.items).toContain('Troféu dos Pins');
    expect(pins?.note).toContain('100 pontos em uma partida concluída');
    expect(pins?.note).toContain('abre uma história opcional no Museu');
    const arena = claimPrizes(state, { 'liga-insignia': '2026-10-03' });
    expect(arena?.note).toContain('credencial da Arena');
    expect(arena?.note).toContain('história opcional no Museu');
  });

  it('conquistas antigas pagam todas de uma vez, e uma nova paga depois', () => {
    const s = fresh();
    const got = claimPrizes(s, { 'primeira-carta': '2026-10-01', 'cartas-50': '2026-10-03', 'cartas-10': '2026-10-02' });
    expect(got?.ids).toEqual(['primeira-carta', 'cartas-10', 'cartas-50']);
    expect(got?.note).toContain('3 conquistas');
    const next = claimPrizes(s, { 'primeira-carta': '2026-10-01', 'cartas-50': '2026-10-03', 'cartas-10': '2026-10-02', 'liga-campea': '2026-10-04' });
    expect(next?.ids).toEqual(['liga-campea']);
    expect(next?.note).toContain('Campeão da Liga');
    expect(s.inventory.louros).toBe(1);
  });

  it('ignora conquistas desconhecidas e não repete acessório que a pessoa já tem', () => {
    const s = fresh();
    s.inventory['monoculo'] = 1;
    expect(claimPrizes(s, { inventada: '2026-10-01' })).toBeNull();
    const got = claimPrizes(s, { 'cartas-50': '2026-10-01' });
    expect(got?.items).toEqual([]);
    expect(s.inventory['monoculo']).toBe(1);
  });

  it('o prêmio não se vende e o que foi entregue sobrevive ao salvar', () => {
    const s = fresh();
    claimPrizes(s, { 'nivel-20': '2026-10-01' });
    expect(sell(s, 'capa-estelar').ok).toBe(false);
    const back = normalizeVillage(JSON.parse(JSON.stringify(s)), 7, { x: 1, y: 1 });
    expect(back.claimed).toEqual(['nivel-20']);
    expect(back.inventory['capa-estelar']).toBe(1);
    expect(normalizeVillage({ v: 1, seed: 7, claimed: ['a', 3, 'a'] }, 7, { x: 1, y: 1 }).claimed).toEqual(['a']);
  });
});
