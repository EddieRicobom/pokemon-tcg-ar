// Balanceamento da Torre de Sobrevivência com DADOS DE JOGO: um robô joga o motor real (`src/core/survivor.ts`)
// centenas de vezes e mede quanto tempo sobrevive, até que nível e onda chega e o que acontece com os chefes.
// Não substitui gente jogando (o robô não tem reflexo humano nem toque no celular), mas dá números iguais para
// comparar antes/depois de mudar um parâmetro. Fora do `npm test`:
//
//   npx vitest run -c vitest.eval.config.ts scripts/survivor-sim.eval.ts --silent=false
import { describe, it } from 'vitest';
import { seededRng } from '../src/core/battle';
import type { Rng } from '../src/core/battle';
import { applyUpgrade, ARENA_H, ARENA_W, createSurvivorState, stepSurvivor } from '../src/core/survivor';
import type { SurvivorInput, SurvivorState } from '../src/core/survivor';

const DT = 16;
const CAP_MS = 15 * 60_000;

/** Robô "jogador mediano": foge de quem está perto (chefe pesa mais), evita parede, pega orbe quando está seguro. */
function bot(s: SurvivorState): SurvivorInput {
  const p = s.player;
  let fx = 0;
  let fy = 0;
  for (const e of s.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 230) continue;
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
  return { dx: fx, dy: fy };
}

interface Run {
  survivedMs: number;
  level: number;
  wave: number;
  kills: number;
  bossesSpawned: number;
  bossesKilled: number;
  diedWithBoss: boolean;
}

function play(seed: number, pick: (s: SurvivorState, rng: Rng) => string, noBoss = false): Run {
  const s = createSurvivorState(seed, { kindCount: 6 });
  if (noBoss) s.nextBossAtMs = Number.POSITIVE_INFINITY;
  const rng = seededRng(seed ^ 0x5eed);
  let bossesSpawned = 0;
  let bossesKilled = 0;
  while (!s.over && s.elapsedMs < CAP_MS) {
    if (s.pendingUpgrade) {
      applyUpgrade(s, pick(s, rng));
      continue;
    }
    const bossesBefore = s.enemies.filter((e) => e.boss).length;
    const events = stepSurvivor(s, bot(s), DT);
    if (events.some((e) => e.type === 'bossSpawn')) bossesSpawned++;
    const bossesAfter = s.enemies.filter((e) => e.boss).length;
    const spawnedNow = events.filter((e) => e.type === 'bossSpawn').length;
    if (bossesAfter < bossesBefore + spawnedNow) bossesKilled += bossesBefore + spawnedNow - bossesAfter;
  }
  return {
    survivedMs: s.elapsedMs, level: s.player.level, wave: s.wave, kills: s.kills, bossesSpawned, bossesKilled,
    diedWithBoss: s.over && s.enemies.some((e) => e.boss),
  };
}

const randomPick = (s: SurvivorState, rng: Rng) => s.pendingUpgrade![Math.floor(rng() * s.pendingUpgrade!.length)]!.id;

function pct(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] ?? 0;
}

function report(label: string, runs: Run[]): void {
  const t = runs.map((r) => r.survivedMs / 1000).sort((a, b) => a - b);
  const lv = runs.map((r) => r.level).sort((a, b) => a - b);
  const died60 = runs.filter((r) => r.survivedMs < 60_000).length;
  const sawBoss = runs.filter((r) => r.bossesSpawned > 0);
  const killedFirst = sawBoss.filter((r) => r.bossesKilled > 0).length;
  const capped = runs.filter((r) => r.survivedMs >= CAP_MS).length;
  const out = {
    corridas: runs.length,
    sobrevivenciaS: { p10: Math.round(pct(t, 0.1)), mediana: Math.round(pct(t, 0.5)), p90: Math.round(pct(t, 0.9)) },
    nivel: { mediana: pct(lv, 0.5), p90: pct(lv, 0.9) },
    morreuAntesDe1min: `${Math.round((died60 / runs.length) * 100)}%`,
    viuChefe: `${Math.round((sawBoss.length / runs.length) * 100)}%`,
    derrotouAlgumChefe: sawBoss.length ? `${Math.round((killedFirst / sawBoss.length) * 100)}% de quem viu` : '—',
    morreuComChefeEmCampo: `${Math.round((runs.filter((r) => r.diedWithBoss).length / runs.length) * 100)}%`,
    chegouAos15min: `${Math.round((capped / runs.length) * 100)}%`,
  };
  console.log(`SIM ${label} ${JSON.stringify(out)}`);
}

describe('balanceamento da Torre (robô)', () => {
  it('200 corridas, upgrades ao acaso', () => {
    const runs = Array.from({ length: 200 }, (_, i) => play(1000 + i, randomPick));
    report('acaso', runs);
  }, 600_000);

  it('diagnóstico: as mesmas corridas sem chefe (o que mata é o chefe ou a multidão?)', () => {
    const runs = Array.from({ length: 200 }, (_, i) => play(1000 + i, randomPick, true));
    report('sem-chefe', runs);
  }, 600_000);
});
