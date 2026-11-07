// Equilíbrio da Torre em matriz: espécies fortes, médias e fracas, cartas ao acaso ou escolhidas por raridade, com e
// sem o desafio adaptável. Um robô joga o motor real (`src/core/survivor.ts`); os números servem para comparar antes e
// depois de mudar um parâmetro, não para declarar a Torre equilibrada (ver docs/SURVIVOR_BALANCE_PRINCIPLES.md). Fora do
// `npm test`:
//
//   BAL_RUNS=20 BAL_DT=50 npx vitest run -c vitest.eval.config.ts scripts/survivor-balance.eval.ts --silent=false
import { describe, it } from 'vitest';
import { seededRng } from '../src/core/battle';
import type { Rng } from '../src/core/battle';
import { attackProfile, moveFor } from '../src/core/survivor-moves';
import { statsOfDex } from '../src/core/survivor-stats';
import { typesOfDex } from '../src/core/species-filter';
import { applyUpgrade, ARENA_H, ARENA_W, createSurvivorState, stepSurvivor } from '../src/core/survivor';
import { chooseSurvivorSpecial, chooseSurvivorSpecialBranch } from '../src/core/survivor-specials';
import { SURVIVOR_RARITY_ORDER } from '../src/core/survivor-upgrades';
import { autoChargeHeld } from '../src/core/survivor-charge';
import type { SurvivorInput, SurvivorState } from '../src/core/survivor';

const DT = Math.max(16, Math.min(100, Number(process.env.BAL_DT ?? 50)));
const RUNS = Math.max(1, Math.min(100, Number(process.env.BAL_RUNS ?? 20)));
const CAP_MS = Math.max(60_000, Number(process.env.BAL_CAP_MIN ?? 22) * 60_000);
const ONLY = process.env.BAL_ONLY ?? '';

export const TIERS = {
  forte: [445, 248, 376, 373, 149, 635, 59, 130],
  media: [25, 58, 66, 133, 92, 4, 7, 1],
  fraca: [10, 129, 191, 13, 16, 19, 265, 401],
} as const;

/** Robô de corrida: foge de quem está perto (chefe pesa mais), evita a parede e pega orbe quando está seguro. */
function bot(s: SurvivorState): SurvivorInput {
  const p = s.player;
  let fx = 0;
  let fy = 0;
  let bossNear = false;
  for (const e of s.enemies) {
    if (e.thief) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 230) continue;
    if (e.boss && d < 180) bossNear = true;
    const w = ((e.boss ? 3 : 1) * 1e4) / (d * d);
    fx += (dx / d) * w;
    fy += (dy / d) * w;
  }
  const m = 90;
  if (p.x < m) fx += ((m - p.x) / m) * 2;
  if (p.x > ARENA_W - m) fx -= ((p.x - (ARENA_W - m)) / m) * 2;
  if (p.y < m) fy += ((m - p.y) / m) * 2;
  if (p.y > ARENA_H - m) fy -= ((p.y - (ARENA_H - m)) / m) * 2;
  if (Math.hypot(fx, fy) < 0.6 && s.orbs.length > 0) {
    let best = s.orbs[0]!;
    let bd = Infinity;
    for (const o of s.orbs) {
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    fx += (best.x - p.x) / (bd || 1);
    fy += (best.y - p.y) / (bd || 1);
  }
  // Foco, Teleporte e Trilha precisam da carga: o robô usa a carga automática, a mesma opção que o jogo oferece.
  const category = p.move.category;
  const style = category === 'foco' || category === 'teleporte' || category === 'trilha' ? category : null;
  return { dx: fx, dy: fy, special: bossNear && s.special.phase === 'ready' && s.special.cooldownMs === 0, charge: style ? autoChargeHeld(style, s.charge) : false };
}

type Pick = (s: SurvivorState, rng: Rng) => string;
const randomPick: Pick = (s, rng) => s.pendingUpgrade![Math.floor(rng() * s.pendingUpgrade!.length)]!.id;
/** Quem escolhe bem: a carta mais rara da oferta (no empate, a primeira). */
const smartPick: Pick = (s) => [...s.pendingUpgrade!].sort((a, b) => SURVIVOR_RARITY_ORDER.indexOf(b.rarity ?? 'normal') - SURVIVOR_RARITY_ORDER.indexOf(a.rarity ?? 'normal'))[0]!.id;

export interface BalanceRun {
  survivedMs: number;
  level: number;
  kills: number;
  adaptiveEnd: number | null;
  adaptivePeak: number | null;
  cause: string;
}

export function play(dexId: number, seed: number, pick: Pick, adaptive: boolean): BalanceRun {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  const move = moveFor(types, stats);
  const secondMove = types[1] ? moveFor([types[1]], stats) : undefined;
  const s = createSurvivorState(seed, { kindCount: 6, dexId, move, profile: attackProfile(move, stats), ...(secondMove ? { secondMove } : {}), adaptive });
  const rng = seededRng(seed ^ 0x5eed);
  let peak = s.adaptive?.value ?? null;
  let steps = 0;
  while (!s.over && s.elapsedMs < CAP_MS) {
    if (++steps > (CAP_MS / DT) * 4) break;
    if (s.pendingUpgrade) {
      applyUpgrade(s, pick(s, rng));
      continue;
    }
    if (s.special.phase === 'choice') {
      chooseSurvivorSpecial(s, 'shield');
      continue;
    }
    if (s.special.phase === 'branch-choice') {
      chooseSurvivorSpecialBranch(s, 'shield-permanent');
      continue;
    }
    stepSurvivor(s, bot(s), DT);
    if (s.adaptive && peak !== null) peak = Math.max(peak, s.adaptive.value);
  }
  const hit = s.lastHit;
  const cause = !s.over ? 'limite' : hit?.boss ? 'chefe' : hit?.grade === 'elite' || hit?.grade === 'chefao' ? 'treinador' : 'multidão';
  return { survivedMs: s.elapsedMs, level: s.player.level, kills: s.kills, adaptiveEnd: s.adaptive?.value ?? null, adaptivePeak: peak, cause };
}

const pct = (sorted: number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] ?? 0;

export function summarize(runs: BalanceRun[]) {
  const t = runs.map((r) => r.survivedMs / 60_000).sort((a, b) => a - b);
  const reach = (min: number): number => runs.filter((r) => r.survivedMs >= min * 60_000).length;
  const causes: Record<string, number> = {};
  for (const r of runs) causes[r.cause] = (causes[r.cause] ?? 0) + 1;
  const peaks = runs.map((r) => r.adaptivePeak).filter((v): v is number => v !== null).sort((a, b) => a - b);
  return {
    n: runs.length,
    min: { p10: +pct(t, 0.1).toFixed(1), mediana: +pct(t, 0.5).toFixed(1), p90: +pct(t, 0.9).toFixed(1) },
    chegou: { '3': reach(3), '5': reach(5), '10': reach(10), '15': reach(15), '18': reach(18), '20': reach(20) },
    nivelMediano: pct(runs.map((r) => r.level).sort((a, b) => a - b), 0.5),
    derrotasMediana: pct(runs.map((r) => r.kills).sort((a, b) => a - b), 0.5),
    causas: causes,
    ...(peaks.length ? { desafioPico: { mediana: +pct(peaks, 0.5).toFixed(2), max: +pct(peaks, 1).toFixed(2) } } : {}),
  };
}

describe('equilíbrio da Torre em matriz', () => {
  for (const tier of Object.keys(TIERS) as (keyof typeof TIERS)[]) {
    for (const [pickName, pick] of [['acaso', randomPick], ['esperto', smartPick]] as const) {
      for (const adaptive of [false, true]) {
        const label = `${tier}/${pickName}/${adaptive ? 'adaptavel' : 'fixo'}`;
        if (ONLY && !label.includes(ONLY)) continue;
        it(label, () => {
          const dexes = TIERS[tier];
          const runs = Array.from({ length: RUNS }, (_, i) => play(dexes[i % dexes.length]!, 7000 + i, pick, adaptive));
          console.log(`BAL ${label} ${JSON.stringify(summarize(runs))}`);
        }, 1_800_000);
      }
    }
  }
});
