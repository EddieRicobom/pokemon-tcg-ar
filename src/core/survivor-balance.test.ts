import { describe, expect, it } from 'vitest';
import { applyUpgrade, createSurvivorState, stepSurvivor } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import type { PokemonType } from './pokemon-data';

const TYPES: readonly PokemonType[] = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

/** Política simples e repetível: movimentação orbital, especial quando disponível e cura como prioridade. */
function simulate(type: PokemonType, seed: number): number {
  const move = moveFor([type], null);
  const state = createSurvivorState(seed, { kindCount: 4, move, profile: attackProfile(move, null) });
  for (let elapsed = 0; elapsed < 240_000 && !state.over; elapsed += 100) {
    stepSurvivor(state, {
      dx: Math.sin(elapsed / 1900 + seed),
      dy: Math.cos(elapsed / 2400 + seed),
      special: elapsed % 4000 < 100,
    }, 100);
    if (state.pendingUpgrade) {
      const choice = state.pendingUpgrade.find((option) => option.id === 'vigor') ?? state.pendingUpgrade[0];
      if (choice) applyUpgrade(state, choice.id);
    }
  }
  return state.elapsedMs;
}

// Simulação pesada de CPU: com a suíte inteira em paralelo ela passava dos 5 s padrão e falhava só por tempo.
describe('regressão de dificuldade do Survival', { timeout: 30_000 }, () => {
  it('mantém os tipos próximos entre si com a migração inicial e a progressão de XP reduzida', () => {
    const averages = new Map<PokemonType, number>();
    for (const type of TYPES) {
      const total = [1, 2, 3, 4, 5, 6, 7, 8].reduce((sum, seed) => sum + simulate(type, seed), 0);
      averages.set(type, total / 8);
    }
    const values = [...averages.values()];
    // A primeira migração triplica a horda dos 105 aos 135 segundos; os ataques por tipo mudaram a amostra.
    // O corte de 11% no dano do jogador (25/11/2026) puxou a faixa inteira para baixo e abriu um pouco o leque.
    expect(Math.min(...values)).toBeGreaterThanOrEqual(133_000);
    expect(Math.max(...values)).toBeLessThanOrEqual(190_000);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(46_000);
    expect(averages.get('bug')).toBeGreaterThanOrEqual(142_000);
    // A variedade nova de ataques de chefe (cruz, raios e meteoros) muda um pouco o ritmo da amostra.
    // A sinergia garantida também desloca uma vaga por oferta: fighting cai ~0,8% e continua bem acima do piso geral.
    expect(averages.get('fighting')).toBeGreaterThanOrEqual(143_500);
    expect(averages.get('ice')).toBeGreaterThanOrEqual(147_000);
  });
});
