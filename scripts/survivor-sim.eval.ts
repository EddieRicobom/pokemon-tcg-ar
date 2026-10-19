// Balanceamento da Torre de Sobrevivência com DADOS DE JOGO: um robô joga o motor real (`src/core/survivor.ts`)
// centenas de vezes e mede quanto tempo sobrevive, até que nível e onda chega e o que acontece com os chefes.
// Não substitui gente jogando (o robô não tem reflexo humano nem toque no celular), mas dá números iguais para
// comparar antes/depois de mudar um parâmetro. Fora do `npm test`:
//
//   npx vitest run -c vitest.eval.config.ts scripts/survivor-sim.eval.ts --silent=false
import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/core/battle';
import type { Rng } from '../src/core/battle';
import { attackProfile, moveFor } from '../src/core/survivor-moves';
import { statsOfDex } from '../src/core/survivor-stats';
import { LAST_DEX, typesOfDex } from '../src/core/species-filter';
import { applyUpgrade, ARENA_H, ARENA_W, createSurvivorState, stepSurvivor } from '../src/core/survivor';
import type { SurvivorInput, SurvivorState } from '../src/core/survivor';

const DT = 16;
// O chefe final chega aos 20 min; o teto precisa ultrapassá-lo para observar o modo infinito.
const CAP_MS = 25 * 60_000;

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
  moveCategory: string;
}

function play(seed: number, pick: (s: SurvivorState, rng: Rng) => string, noBoss = false): Run {
  // Espalha as corridas pela Pokédex; cada uma usa os tipos e stats estáticos reais da espécie escolhida.
  const dexId = ((seed * 73) % LAST_DEX) + 1;
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  const move = moveFor(types, stats);
  const secondMove = types[1] ? moveFor([types[1]], stats) : undefined;
  const s = createSurvivorState(seed, {
    kindCount: 6,
    dexId,
    move,
    profile: attackProfile(move, stats),
    ...(secondMove ? { secondMove } : {}),
  });
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
    moveCategory: move.category,
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
    chegouAos25min: `${Math.round((capped / runs.length) * 100)}%`,
    porFormaDeGolpe: Object.fromEntries([...new Set(runs.map((run) => run.moveCategory))].sort().map((category) => {
      const group = runs.filter((run) => run.moveCategory === category);
      const times = group.map((run) => run.survivedMs / 1000).sort((a, b) => a - b);
      return [category, {
        corridas: group.length,
        medianaS: Math.round(pct(times, 0.5)),
        morreuAntesDe1min: `${Math.round((group.filter((run) => run.survivedMs < 60_000).length / group.length) * 100)}%`,
      }];
    })),
  };
  console.log(`SIM ${label} ${JSON.stringify(out)}`);
}

function advanceWithSafety(infinite: boolean, targetMs: number): SurvivorState {
  const s = createSurvivorState(0x5eed, { kindCount: 6, infinite });
  // O teste mede a agenda do modo, sem transformar a sobrevivência em um teste de reflexos.
  s.player.maxHp = 1_000_000_000;
  s.player.hp = s.player.maxHp;
  s.player.attackDamage = 1_000_000_000;
  s.player.attackCooldownMs = 1;
  while (!s.over && s.elapsedMs < targetMs) {
    if (s.pendingUpgrade) applyUpgrade(s, s.pendingUpgrade[0]!.id);
    else stepSurvivor(s, { dx: 0, dy: 0 }, Math.min(1000, targetMs - s.elapsedMs));
  }
  return s;
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

  it('cobre os marcos do relógio e o infinito depois de 20 minutos', () => {
    for (const minutes of [1, 5, 10, 15, 20]) {
      const state = advanceWithSafety(false, minutes * 60_000);
      expect(state.elapsedMs).toBe(minutes * 60_000);
      expect(state.over).toBe(false);
    }
    const normal = advanceWithSafety(false, 20 * 60_000);
    expect(normal.finalBossAtMs).toBeNull();
    const infinite = advanceWithSafety(true, 21 * 60_000);
    expect(infinite.elapsedMs).toBe(21 * 60_000);
    expect(infinite.finalBossAtMs).toBeNull();
    expect(infinite.infiniteScale).toBeGreaterThan(1.25);
  }, 120_000);
});
