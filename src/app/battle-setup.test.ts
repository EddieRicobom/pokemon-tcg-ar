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

  it('golpes escolhidos na Arena entram no lugar dos golpes do jogo e da carta', async () => {
    const load: BattleLoader = async (_id, dex, onPart) => {
      onPart('profile', { state: 'ok', value: { dexId: dex ?? 0, types: ['fire'], stats } });
      onPart('moves', { state: 'ok', value: [{ name: 'Brasa', type: 'fire', power: 40, accuracy: 100, pp: 25, damageClass: 'special' }] });
      onPart('card', { state: 'error', message: 'offline' });
    };
    const flamethrower = { name: 'Lança-chamas', type: 'fire' as const, power: 90, accuracy: 100, special: true, source: 'jogo' as const };
    const [chosen, plain] = await prepareFighters([{ id: 'a', name: 'Charmander', dexId: 4, moves: [flamethrower] }, { id: 'b', name: 'Vulpix', dexId: 37 }], load);
    expect(chosen?.moves.map((m) => m.name)).toEqual(['Lança-chamas']);
    expect(chosen?.notes.some((n) => n.includes('ataques da carta'))).toBe(false);
    expect(plain?.moves.map((m) => m.name)).toEqual(['Brasa']);
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

describe('prazo da preparação', () => {
  it('cresce com a quantidade de lutadores, com teto', async () => {
    const { prepareTimeoutFor, PREPARE_TIMEOUT_MS } = await import('./battle-setup');
    expect(prepareTimeoutFor(6)).toBe(PREPARE_TIMEOUT_MS);
    expect(prepareTimeoutFor(8)).toBe(PREPARE_TIMEOUT_MS);
    expect(prepareTimeoutFor(40)).toBeGreaterThan(PREPARE_TIMEOUT_MS);
    expect(prepareTimeoutFor(400)).toBe(30000);
  });
});
