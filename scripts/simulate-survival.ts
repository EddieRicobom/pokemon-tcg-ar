/**
 * Simulação determinística do Survival.
 * Execute com: npx tsx scripts/simulate-survival.ts
 * O bot coleta orbes próximos, evita bordas, reage a ameaças e escolhe o Bastião.
 */
import { applyUpgrade, createSurvivorState, stepSurvivor, type SurvivorState } from '../src/core/survivor';
import { moveFor, attackProfile } from '../src/core/survivor-moves';
import { chooseSurvivorSpecial } from '../src/core/survivor-specials';
import type { BaseStats, PokemonType } from '../src/core/pokemon-data';

const TYPES: readonly PokemonType[] = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'bug', 'ghost', 'dark'];
const STATS: BaseStats = { hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75 };
const STRATEGIES = ['kiter', 'panic'] as const;
const RUNS_PER_TYPE = 20;

type Strategy = (typeof STRATEGIES)[number];
interface Result { type: PokemonType; strategy: Strategy; time: number; kills: number; level: number; wave: number; }

function chooseUpgrade(state: SurvivorState): void {
  const rank: Record<string, number> = { normal: 1, raro: 2, lendario: 3, ancestral: 4 };
  const option = [...(state.pendingUpgrade ?? [])].sort((a, b) => (rank[b.rarity] ?? 0) - (rank[a.rarity] ?? 0))[0];
  if (option) applyUpgrade(state, option.id);
}

function simulate(type: PokemonType, strategy: Strategy, seed: number): Result {
  const move = moveFor([type], STATS);
  const state = createSurvivorState(seed, { kindCount: 8, move, profile: attackProfile(move, STATS) });
  let steps = 0;
  while (!state.over && state.elapsedMs < 1_200_000 && steps++ < 20_000) {
    if (state.pendingUpgrade) { chooseUpgrade(state); continue; }
    if (state.special.phase === 'choice') { chooseSurvivorSpecial(state, 'shield'); continue; }
    const player = state.player;
    const enemies = state.enemies.filter((enemy) => enemy.hp > 0).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
    const nearest = enemies[0];
    const distance = nearest ? Math.hypot(nearest.x - player.x, nearest.y - player.y) : Number.POSITIVE_INFINITY;
    let dx = Math.cos(state.elapsedMs / 1700 + seed * 0.01);
    let dy = Math.sin(state.elapsedMs / 2100 + seed * 0.013);
    const threatDistance = strategy === 'kiter' ? 240 : 120;
    if (nearest && distance < threatDistance) {
      dx = player.x - nearest.x;
      dy = player.y - nearest.y;
    } else {
      const orb = [...state.orbs].sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
      if (orb && Math.hypot(orb.x - player.x, orb.y - player.y) < 260) { dx = orb.x - player.x; dy = orb.y - player.y; }
    }
    if (player.x < 110) dx += 1.5;
    if (player.x > 850) dx -= 1.5;
    if (player.y < 110) dy += 1.5;
    if (player.y > 530) dy -= 1.5;
    stepSurvivor(state, { dx, dy }, 100);
  }
  return { type, strategy, time: state.elapsedMs, kills: state.kills, level: state.player.level, wave: state.wave };
}

const results: Result[] = [];
for (const strategy of STRATEGIES) for (const type of TYPES) for (let i = 0; i < RUNS_PER_TYPE; i++) {
  const seed = 1000 + i * 7919 + TYPES.indexOf(type) * 101 + (strategy === 'panic' ? 500_000 : 0);
  results.push(simulate(type, strategy, seed));
}

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; };
for (const strategy of STRATEGIES) {
  const group = results.filter((result) => result.strategy === strategy);
  console.log(JSON.stringify({ strategy, runs: group.length, medianMinutes: median(group.map((result) => result.time)) / 60_000, reached3m: group.filter((result) => result.time >= 180_000).length, reached5m: group.filter((result) => result.time >= 300_000).length, medianKills: median(group.map((result) => result.kills)), medianLevel: median(group.map((result) => result.level)) }));
}
