import { describe, expect, it, vi } from 'vitest';
import { prepareFighters } from './battle-setup';
import type { BattleLoader } from './battle-setup';

const stats = { hp: 50, attack: 60, defense: 50, spAttack: 60, spDefense: 50, speed: 70 };

describe('prepareFighters', () => {
  it('monta um lutador por Pokémon, na ordem, com os dados carregados', async () => {
    const load: BattleLoader = async (id, dex, onPart) => {
      onPart('profile', { state: 'ok', value: { dexId: dex ?? 0, types: ['fire'], stats } });
      onPart('moves', { state: 'ok', value: [{ name: 'Brasa', type: 'fire', power: 40, accuracy: 100, pp: 25, damageClass: 'special' }] });
      onPart('card', { state: 'ok', value: { types: ['Fire'], attacks: [{ name: 'Chama', cost: ['Fire'], damage: '30' }], weaknesses: [] } });
      void id;
    };
    const fighters = await prepareFighters([{ id: 'a', name: 'Charmander', dexId: 4 }, { id: 'b', name: 'Vulpix', dexId: 37 }], load);
    expect(fighters.map((f) => f.id)).toEqual(['a', 'b']);
    expect(fighters[0]?.moves.map((m) => m.name)).toEqual(['Chama', 'Brasa']);
    expect(fighters[0]?.quality).toBe('completo');
  });

  it('uma fonte que falha ou nunca responde não derruba a batalha', async () => {
    vi.useFakeTimers();
    const load: BattleLoader = (id, _dex, onPart) => {
      if (id === 'erro') {
        onPart('profile', { state: 'error', message: 'offline' });
        return Promise.reject(new Error('rede'));
      }
      return new Promise<void>(() => {
        onPart('card', { state: 'ok', value: { types: ['Water'], attacks: [{ name: 'Bolha', cost: ['Water'], damage: '20' }], weaknesses: [] } });
      });
    };
    const promise = prepareFighters([{ id: 'erro', name: 'A' }, { id: 'trava', name: 'B' }], load, 1000);
    await vi.advanceTimersByTimeAsync(1200);
    const fighters = await promise;
    vi.useRealTimers();
    expect(fighters[0]?.quality).toBe('sem-dados');
    expect(fighters[0]?.moves[0]?.name).toBe('Investida');
    expect(fighters[1]?.quality).toBe('parcial');
    expect(fighters[1]?.types).toEqual(['water']);
    expect(fighters[1]?.moves[0]?.name).toBe('Bolha');
  });
});
