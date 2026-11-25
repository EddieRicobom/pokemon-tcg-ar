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
import { SURVIVOR_ALPHA_INCREASE_MS } from '../src/core/survivor-alpha';
import { applyUpgrade, ARENA_H, ARENA_W, createSurvivorState, resolveBlackChest, stepSurvivor } from '../src/core/survivor';
import { chooseSurvivorSpecial, chooseSurvivorSpecialBranch } from '../src/core/survivor-specials';
import type { SurvivorInput, SurvivorState } from '../src/core/survivor';
import type { SurvivorUpgradeOption } from '../src/core/survivor-types';
import { speciesName } from '../src/core/survivor-evolution';

/** Amostra e passo menores para diagnósticos locais; o padrão de avaliação continua em 200 corridas a 60 fps. */
const DT = Math.max(16, Math.min(100, Number(process.env.SURVIVOR_SIM_DT ?? 16)));
const RUNS = Math.max(1, Math.min(200, Number(process.env.SURVIVOR_SIM_RUNS ?? 200)));
// O chefe final chega aos 20 min; o teto precisa ultrapassá-lo para observar o modo infinito.
const CAP_MS = Math.max(60_000, Math.min(25 * 60_000, Number(process.env.SURVIVOR_SIM_CAP_MIN ?? 25) * 60_000));

/** Robô "jogador mediano": foge de quem está perto (chefe pesa mais), evita parede, pega orbe quando está seguro. */
function bot(s: SurvivorState): SurvivorInput {
  const p = s.player;
  let fx = 0;
  let fy = 0;
  let bossNear = false;
  for (const e of s.enemies) {
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
  return { dx: fx, dy: fy, special: bossNear && s.special.phase === 'ready' && s.special.cooldownMs === 0 };
}

interface Run {
  survivedMs: number;
  level: number;
  wave: number;
  kills: number;
  bossesSpawned: number;
  bossesKilled: number;
  diedWithBoss: boolean;
  diedFromBoss: boolean;
  oneShotFromFull: boolean;
  defenseCards: number;
  moveCategory: string;
  alphaSpawned: number;
  alphaDefeated: number;
  upgradeInterruptions: number;
}

function play(seed: number, pick: (s: SurvivorState, rng: Rng) => string, noBoss = false, forcedDex?: number): Run {
  // Espalha as corridas pela Pokédex; cada uma usa os tipos e stats estáticos reais da espécie escolhida.
  const dexId = forcedDex ?? (((seed * 73) % LAST_DEX) + 1);
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
  let alphaSpawned = 0;
  let alphaDefeated = 0;
  let upgradeInterruptions = 0;
  let steps = 0;
  while (!s.over && s.elapsedMs < CAP_MS) {
    if (++steps > (CAP_MS / DT) * 3) throw new Error(`Simulação parada aos ${s.elapsedMs} ms (${s.special.phase})`);
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
    if (s.pendingBlackChest != null) {
      resolveBlackChest(s, false);
      continue;
    }
    const bossesBefore = s.enemies.filter((e) => e.boss).length;
    const events = stepSurvivor(s, bot(s), DT);
    if (s.elapsedMs >= SURVIVOR_ALPHA_INCREASE_MS) {
      for (const event of events) {
        if (event.type === 'alphaSpawn') alphaSpawned++;
        if (event.type === 'alphaDefeated') alphaDefeated++;
      }
      if (s.pendingUpgrade) upgradeInterruptions++;
    }
    if (events.some((e) => e.type === 'bossSpawn')) bossesSpawned++;
    const bossesAfter = s.enemies.filter((e) => e.boss).length;
    const spawnedNow = events.filter((e) => e.type === 'bossSpawn').length;
    if (bossesAfter < bossesBefore + spawnedNow) bossesKilled += bossesBefore + spawnedNow - bossesAfter;
  }
  return {
    survivedMs: s.elapsedMs, level: s.player.level, wave: s.wave, kills: s.kills, bossesSpawned, bossesKilled,
    diedWithBoss: s.over && s.enemies.some((e) => e.boss),
    diedFromBoss: s.over && s.lastHit?.boss === true,
    oneShotFromFull: s.over && !!s.lastHit && s.lastHit.hpBefore >= s.player.maxHp && s.lastHit.damage >= s.lastHit.hpBefore,
    defenseCards: ['guard-physical', 'guard-special', 'guard-balanced'].reduce((count, id) => count + (s.player.upgradeLevels[id] ?? 0), 0),
    moveCategory: move.category,
    alphaSpawned, alphaDefeated, upgradeInterruptions,
  };
}

const randomPick = (s: SurvivorState, rng: Rng) => s.pendingUpgrade![Math.floor(rng() * s.pendingUpgrade!.length)]!.id;
const defensePick = (s: SurvivorState, rng: Rng) => {
  const preferred = ['guard-physical', 'guard-balanced', 'guard-special', 'second-wind', 'vigor'];
  return preferred.map((id) => s.pendingUpgrade?.find((card) => card.id === id)).find((card) => card !== undefined)?.id ?? randomPick(s, rng);
};
/**
 * Política "competente": raridade primeiro, defesa quando a vida está baixa, evolução e segundo fôlego quase sempre,
 * e nunca escolhe a carta que só aumenta a dificuldade ou paga moedas. Serve para medir o teto de uma pessoa que lê as
 * cartas, em vez do piso do robô que sorteia.
 */
const RARITY_SCORE: Record<string, number> = { ancestral: 4, lendario: 3, raro: 2, normal: 1 };
const smartPick = (s: SurvivorState, rng: Rng): string => {
  const offer = s.pendingUpgrade ?? [];
  const hpRatio = s.player.maxHp > 0 ? s.player.hp / s.player.maxHp : 1;
  const lowHp = hpRatio < 0.5;
  const early = s.player.level < 10;
  const score = (o: SurvivorUpgradeOption): number => {
    let value = RARITY_SCORE[o.rarity ?? 'normal'] ?? 1;
    if (o.id === 'difficulty') value -= 8;
    if (o.id.startsWith('coins-')) value -= 3;
    if (o.id.startsWith('evolve:')) value += 3;
    if (o.id === 'second-wind' || o.id === 'guard-balanced') value += 1.5;
    if (o.id === 'heal-30' || o.id === 'vigor') value += lowHp ? 3.5 : 0.5;
    if (o.family === 'defesa') value += lowHp ? 2.5 : 0.5;
    if (o.family === 'ataque') value += lowHp ? 0.5 : 1.5;
    if (o.family === 'progresso' && early) value += 1;
    if (o.family === 'movimento' && lowHp) value += 1;
    return value;
  };
  return offer.slice().sort((a, b) => score(b) - score(a))[0]?.id ?? randomPick(s, rng);
};

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
  const lateMinutes = runs.reduce((sum, r) => sum + Math.max(0, r.survivedMs - SURVIVOR_ALPHA_INCREASE_MS), 0) / 60_000;
  const perLateMinute = (metric: 'alphaSpawned' | 'alphaDefeated' | 'upgradeInterruptions') =>
    lateMinutes ? Number((runs.reduce((sum, r) => sum + r[metric], 0) / lateMinutes).toFixed(2)) : 0;
  const out = {
    corridas: runs.length,
    sobrevivenciaS: { p10: Math.round(pct(t, 0.1)), mediana: Math.round(pct(t, 0.5)), p90: Math.round(pct(t, 0.9)) },
    nivel: { mediana: pct(lv, 0.5), p90: pct(lv, 0.9) },
    morreuAntesDe1min: `${Math.round((died60 / runs.length) * 100)}%`,
    viuChefe: `${Math.round((sawBoss.length / runs.length) * 100)}%`,
    derrotouAlgumChefe: sawBoss.length ? `${Math.round((killedFirst / sawBoss.length) * 100)}% de quem viu` : '—',
    morreuComChefeEmCampo: `${Math.round((runs.filter((r) => r.diedWithBoss).length / runs.length) * 100)}%`,
    golpeFinalDeChefe: `${Math.round((runs.filter((r) => r.diedFromBoss).length / runs.length) * 100)}%`,
    morteComVidaCheia: `${Math.round((runs.filter((r) => r.oneShotFromFull).length / runs.length) * 100)}%`,
    cartasDeDefesaMediana: pct(runs.map((r) => r.defenseCards).sort((a, b) => a - b), 0.5),
    chegouAosMinutos: Object.fromEntries([3, 5, 10, 15, 18, 20].filter((minutes) => minutes * 60_000 <= CAP_MS)
      .map((minutes) => [minutes, runs.filter((r) => r.survivedMs >= minutes * 60_000).length])),
    porMinutoDepoisDe3Min: {
      alfasNascidos: perLateMinute('alphaSpawned'),
      alfasDerrotados: perLateMinute('alphaDefeated'),
      interrupcoesParaMelhoria: perLateMinute('upgradeInterruptions'),
    },
    limiteMin: CAP_MS / 60_000,
    chegouAoLimite: `${Math.round((capped / runs.length) * 100)}%`,
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
  it(`${RUNS} corridas, upgrades ao acaso`, () => {
    const runs = Array.from({ length: RUNS }, (_, i) => play(1000 + i, randomPick));
    report('acaso', runs);
  }, 600_000);

  it('diagnóstico: as mesmas corridas sem chefe (o que mata é o chefe ou a multidão?)', () => {
    const runs = Array.from({ length: RUNS }, (_, i) => play(1000 + i, randomPick, true));
    report('sem-chefe', runs);
  }, 600_000);

  it('diagnóstico: as mesmas corridas priorizando cartas de defesa', () => {
    const runs = Array.from({ length: RUNS }, (_, i) => play(1000 + i, defensePick));
    report('defesa', runs);
  }, 600_000);

  it('diagnóstico: as mesmas corridas com escolhas competentes (não sorteia)', () => {
    const runs = Array.from({ length: RUNS }, (_, i) => play(1000 + i, smartPick));
    report('competente', runs);
  }, 600_000);

  /**
   * Uma amostra de espécies espalhadas pela Pokédex, várias corridas por espécie, com a política competente. Mostra
   * quais espécies nunca saem do primeiro minuto e quais passam de 20. A amostra é pequena de propósito: serve para
   * achar lanternas, não para provar equilíbrio. `SURVIVOR_SIM_SPECIES=0` desliga e `SURVIVOR_SIM_SPECIES_RUNS` muda
   * as corridas por espécie.
   */
  it('amostra por espécie (lanternas e campeãs)', () => {
    const sample = Math.max(0, Math.min(40, Number(process.env.SURVIVOR_SIM_SPECIES ?? 8)));
    if (sample === 0) return;
    const perSpecies = Math.max(1, Math.min(20, Number(process.env.SURVIVOR_SIM_SPECIES_RUNS ?? 4)));
    const rows = Array.from({ length: sample }, (_, i) => {
      const dexId = Math.max(1, Math.floor((LAST_DEX * (i + 0.5)) / sample));
      const runs = Array.from({ length: perSpecies }, (_, r) => play(90_000 + i * 31 + r, smartPick, false, dexId));
      const times = runs.map((run) => run.survivedMs / 1000).sort((a, b) => a - b);
      return {
        dexId,
        nome: speciesName(dexId),
        forma: runs[0]!.moveCategory,
        medianaS: Math.round(pct(times, 0.5)),
        chegouA5min: runs.filter((run) => run.survivedMs >= 5 * 60_000).length,
        chegouA20min: runs.filter((run) => run.survivedMs >= 20 * 60_000).length,
      };
    }).sort((a, b) => a.medianaS - b.medianaS);
    console.log(`SIM porEspécie ${JSON.stringify({ corridasPorEspecie: perSpecies, amostra: rows })}`);
  }, 2_400_000);

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
