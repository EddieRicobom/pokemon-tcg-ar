/**
 * Mede o custo de `stepSurvivor` (o motor da Torre) em quadros de 60 fps, com um bot simples, numa corrida simulada.
 * Só lógica: o desenho da Torre fica de fora. Roda num PC, não num celular.
 *
 *   npx tsx scripts/survivor-step-bench.ts [minutos=10] [semente=1]
 */
import { applyUpgrade, createSurvivorState, stepSurvivor, type SurvivorState } from '../src/core/survivor';
import { moveFor, attackProfile } from '../src/core/survivor-moves';
import { chooseSurvivorSpecial } from '../src/core/survivor-specials';
import type { BaseStats, PokemonType } from '../src/core/pokemon-data';

const minutes = Number(process.argv[2] ?? 10);
const seed = Number(process.argv[3] ?? 1);
/** Inimigos extras parados no mapa, para testar o custo com muitos na tela (o bot morre cedo sem eles). */
const extraEnemies = Number(process.argv[4] ?? 0);
const STATS: BaseStats = { hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75 };
const type: PokemonType = 'fire';
const move = moveFor([type], STATS);
const state: SurvivorState = createSurvivorState(seed, { kindCount: 8, move, profile: attackProfile(move, STATS) });

state.player.hp = 1e9;
state.player.maxHp = 1e9;
for (let i = 0; i < extraEnemies; i++) {
  const e = { ...state.enemies[0]!, id: 900_000 + i, x: 100 + ((i * 97) % 2600), y: 100 + ((i * 53) % 1600), hp: 1e9, maxHp: 1e9 };
  state.enemies.push(e as never);
}

const rank: Record<string, number> = { normal: 1, raro: 2, lendario: 3, ancestral: 4 };
const times: number[] = [];
const enemyCounts: number[] = [];
const dt = 16;
const end = minutes * 60_000;
let frame = 0;
while (!state.over && state.elapsedMs < end && frame < 2_000_000) {
  frame++;
  if (state.pendingUpgrade) {
    const option = [...state.pendingUpgrade].sort((a, b) => (rank[b.rarity] ?? 0) - (rank[a.rarity] ?? 0))[0];
    if (option) applyUpgrade(state, option.id);
    continue;
  }
  if (state.special.phase === 'choice') { chooseSurvivorSpecial(state, 'shield'); continue; }
  const p = state.player;
  let dx = Math.cos(state.elapsedMs / 1700 + seed * 0.01);
  let dy = Math.sin(state.elapsedMs / 2100 + seed * 0.013);
  if (p.x < 110) dx += 1.5;
  if (p.x > 850) dx -= 1.5;
  if (p.y < 110) dy += 1.5;
  if (p.y > 530) dy -= 1.5;
  const t0 = performance.now();
  stepSurvivor(state, { dx, dy }, dt);
  times.push(performance.now() - t0);
  if (frame % 60 === 0) enemyCounts.push(state.enemies.length);
}
const sorted = [...times].sort((a, b) => a - b);
const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!.toFixed(3);
const total = times.reduce((a, b) => a + b, 0);
const maxEnemies = Math.max(...enemyCounts);
const meanEnemies = (enemyCounts.reduce((a, b) => a + b, 0) / enemyCounts.length).toFixed(1);
console.log(`${minutes} min simulados (${frame} quadros, ${state.enemies.length} inimigos no fim, média ${meanEnemies}, máx ${maxEnemies}): stepSurvivor mediana ${pct(0.5)} ms · p95 ${pct(0.95)} ms · p99 ${pct(0.99)} ms · máx ${pct(1)} ms · média ${(total / times.length).toFixed(3)} ms por quadro (orçamento 16,7 ms)`);
