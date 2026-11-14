import { describe, expect, it } from 'vitest';
import { HELD_ITEM_BY_ID, HELD_ITEMS, HELD_OFFER_PREFIX, rollHeldOffer } from './survivor-held';
import type { HeldItemId, HeldStacks } from './survivor-held';
import { applyUpgrade, createSurvivorState } from './survivor';

const items: HeldItemId[] = [
  'ovo-sorte', 'moeda-amuleto', 'bola-fumaca', 'po-brilho', 'po-metal', 'casca-metal', 'cinto-preto',
  'oculos-escuros', 'colher-torta', 'carvao', 'agua-mistica', 'areia-fina', 'bico-afiado', 'presa-dragao',
];

describe('novos itens dos baús', () => {
  it('cada item é sorteável, tem sprite próprio e aplica seu efeito ao ser escolhido', () => {
    const signatures = new Set<string>();
    for (const id of items) {
      const item = HELD_ITEM_BY_ID[id];
      const blocked = Object.fromEntries(HELD_ITEMS.filter((other) => other.id !== id).map((other) => [other.id, 4])) as HeldStacks;
      expect(rollHeldOffer(() => 0.5, blocked, 1)).toEqual([id]);
      expect(item.slug).toBeTruthy();
      expect(item.rarity === 'normal' || item.rarity === 'raro').toBe(true);
      const state = createSurvivorState(123, { kindCount: 1 });
      const before = { ...state.player };
      state.pendingUpgrade = [{ id: `${HELD_OFFER_PREFIX}${id}`, name: item.name, description: item.description }];
      applyUpgrade(state, `${HELD_OFFER_PREFIX}${id}`);
      expect(state.player.held?.[id]).toBe(1);
      const changed = Object.keys(before).filter((key) => key !== 'held' && key !== 'heldMods' && key !== 'heldLeechBudget' && before[key as keyof typeof before] !== state.player[key as keyof typeof before]);
      // Campos opcionais podem não existir antes da escolha.
      for (const key of ['bonusCoins', 'defenseBonus', 'spDefenseBonus', 'critChance']) {
        if (!(key in before) && key in state.player) changed.push(key);
      }
      expect(changed.length, id).toBeGreaterThan(0);
      signatures.add(changed.sort().join(','));
    }
    expect(signatures.size).toBe(items.length);
    expect(new Set(items.map((id) => HELD_ITEM_BY_ID[id].slug)).size).toBe(items.length);
  });

  it('acumula cópias e limita a cura à vida máxima', () => {
    const state = createSurvivorState(123, { kindCount: 1 });
    const start = state.player.maxHp;
    state.player.hp = start - 5;
    for (let i = 0; i < 2; i++) {
      state.pendingUpgrade = [{ id: 'held:agua-mistica', name: '', description: '' }];
      applyUpgrade(state, 'held:agua-mistica');
    }
    expect(state.player.maxHp).toBe(start + 24);
    expect(state.player.hp).toBe(start + 19);
    expect(state.player.held?.['agua-mistica']).toBe(2);
  });
});
