// Balanceamento do PvP do Survival com o MOTOR REAL da arena (`src/core/survivor-pvp.ts`).
//
// Cada lado monta uma equipe 3x3 a partir de espécies da Pokédex, com os stats estáticos reais e o golpe que o motor
// da Torre daria a elas. As duas equipes são jogadas por robôs simétricos (mesma política), então a diferença que sobra
// é do elenco, não do jogador. Não substitui gente em dois celulares: mede viés de lado, duração, empates e se a nota
// da run prevê a vitória.
//
// Fora do `npm test`:
//   npx vitest run -c vitest.eval.config.ts scripts/survivor-pvp-sim.eval.ts --silent=false
//
// Parâmetros por ambiente:
//   PVP_SIM_MATCHES (padrão 200)  confrontos aleatórios
//   PVP_SIM_MIRRORS (padrão 30)   espelhos (mesma equipe dos dois lados; mede viés de lado)
//   PVP_SIM_DT (padrão 50)        passo da simulação em ms
import { describe, it } from 'vitest';
import { seededRng } from '../src/core/battle';
import type { Rng } from '../src/core/battle';
import { LAST_DEX, typesOfDex } from '../src/core/species-filter';
import { statsOfDex } from '../src/core/survivor-stats';
import { attackProfile, moveFor } from '../src/core/survivor-moves';
import {
  activeMon,
  canGuard,
  canSpecial,
  canSwitch,
  createArena,
  stepArena,
  SV_TEAM_SIZE,
} from '../src/core/survivor-pvp';
import type { ArenaInput, ArenaSide, ArenaState, SvCombatProfile, SvMonSpec } from '../src/core/survivor-pvp';
import { svMonFromRun } from '../src/core/survivor-pvp';

const DT = Math.max(16, Math.min(100, Number(process.env.PVP_SIM_DT ?? 50)));
const MATCHES = Math.max(1, Math.min(2000, Number(process.env.PVP_SIM_MATCHES ?? 200)));
const MIRRORS = Math.max(1, Math.min(500, Number(process.env.PVP_SIM_MIRRORS ?? 30)));
/** Diagnóstico: os dois lados ficam parados, para isolar viés do motor do viés da política do robô. */
const IDLE = process.env.PVP_SIM_IDLE === '1';
/** Diagnóstico: sem o passo lateral, para ver se o viés vem da política ou do motor. */
const NO_STRAFE = process.env.PVP_SIM_NO_STRAFE === '1';

/**
 * Pokémon de arena a partir da espécie, sem passar pelas runs: o mesmo caminho de `svMonFromRun` com um `combat`
 * derivado do perfil real do golpe. A nota sintética varia com os stats ofensivos/defensivos da espécie, como uma run
 * mediana variaria.
 */
function specOf(dexId: number, id: string): SvMonSpec {
  const stats = statsOfDex(dexId);
  const types = typesOfDex(dexId);
  const move = moveFor(types, stats);
  const profile = attackProfile(move, stats);
  const kills = 10 + Math.round(((stats?.attack ?? 75) + (stats?.spAttack ?? 75)) / 20);
  const level = 5 + Math.round(((stats?.hp ?? 75) + (stats?.defense ?? 75)) / 60);
  const combat: SvCombatProfile = {
    moveName: move.name,
    category: move.category,
    effect: move.effect,
    maxHp: profile.maxHp,
    power: profile.damage,
    speed: profile.walkSpeed,
    cooldownMs: profile.cooldownMs,
    projectileSpeed: profile.projectileSpeed,
    projectileSize: profile.projectileSize,
    shots: 1,
    pierce: 0,
    attackRange: profile.range,
    attackRadius: profile.radius,
    critChance: 0.05,
    buffs: [],
  };
  const result = {
    id,
    dexId,
    name: `#${dexId}`,
    shiny: false,
    types,
    attackType: move.type,
    survivedMs: 120_000,
    kills,
    level,
    defeated: false,
    combat,
  };
  return svMonFromRun(result, id);
}

function teamOf(rng: Rng, tag: string): SvMonSpec[] {
  const picked = new Set<number>();
  const team: SvMonSpec[] = [];
  while (team.length < SV_TEAM_SIZE) {
    const dexId = 1 + Math.floor(rng() * LAST_DEX);
    if (picked.has(dexId)) continue;
    picked.add(dexId);
    team.push(specOf(dexId, `${tag}-${dexId}`));
  }
  return team;
}

/**
 * Robô simétrico: mantém a distância preferida do próprio golpe, anda de lado para não ficar parado, usa o Especial
 * quando enche e troca de Pokémon quando o da frente cai. Não usa escudo por reflexo: o escudo é decisão humana e
 * deixá-lo de fora mantém a comparação entre elencos mais limpa.
 */
function bot(state: ArenaState, side: ArenaSide, now: number): ArenaInput {
  if (IDLE) return { dx: 0, dy: 0, switchTo: -1 };
  const me = state.sides[side];
  const foe = state.sides[side ^ 1] as ArenaState['sides'][number];
  const mon = activeMon(me);
  if (!mon) return { dx: 0, dy: 0, switchTo: -1 };
  const alive = me.mons.findIndex((m, i) => i !== me.active && m.hp > 0);
  if (mon.hp <= 0) return { dx: 0, dy: 0, switchTo: alive, shield: false, special: false };
  const dx = foe.x - me.x;
  const dy = foe.y - me.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const preferred = Math.max(70, Math.min(230, (mon.attackRange ?? 120) * 0.75));
  let mx = 0;
  let my = 0;
  if (dist > preferred + 24) {
    mx += ux;
    my += uy;
  } else if (dist < preferred - 40) {
    mx -= ux;
    my -= uy;
  }
  // Passo lateral alternado: evita dois robôs parados trocando tiro no mesmo eixo e dá tempo de desviar de projéteis.
  const strafe = NO_STRAFE ? 0 : Math.sin(now / 900 + side * 1.7) >= 0 ? 1 : -1;
  mx += -uy * 0.55 * strafe;
  my += ux * 0.55 * strafe;
  // Volta para o centro quando encosta na borda.
  if (me.x < 70) mx += 0.8;
  if (me.x > 640 - 70) mx -= 0.8;
  if (me.y < 70) my += 0.8;
  if (me.y > 960 - 70) my -= 0.8;
  const norm = Math.hypot(mx, my) || 1;
  const switchTo = canSwitch(state, side, alive) && (mon.hp <= 0 || me.switchCdMs <= 0 && mon.hp < mon.maxHp * 0.25) ? alive : -1;
  return {
    dx: mx / norm,
    dy: my / norm,
    switchTo,
    special: canSpecial(state, side) && dist < 260,
    shield: canGuard(state, side) && mon.hp < mon.maxHp * 0.2 && state.timeMs % 800 < DT,
  };
}

interface Match {
  winner: 0 | 1 | 'draw' | 'timeout';
  durationMs: number;
  scoreA: number;
  scoreB: number;
  categoryA: string;
  categoryB: string;
}

const averageScore = (team: SvMonSpec[]): number => team.reduce((sum, mon) => sum + mon.score, 0) / team.length;
const dominantCategory = (team: SvMonSpec[]): string => {
  const counts = new Map<string, number>();
  for (const mon of team) counts.set(mon.moveCategory ?? 'projétil', (counts.get(mon.moveCategory ?? 'projétil') ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
};

function fight(host: SvMonSpec[], guest: SvMonSpec[]): Match {
  const state = createArena(host, guest);
  let steps = 0;
  while (state.winner === null && state.timeMs < state.maxMs) {
    if (++steps > state.maxMs / DT + 500) break;
    stepArena(state, [bot(state, 0, state.timeMs), bot(state, 1, state.timeMs)], DT);
  }
  return {
    winner: state.winner === null ? 'timeout' : state.winner,
    durationMs: state.timeMs,
    scoreA: averageScore(host),
    scoreB: averageScore(guest),
    categoryA: dominantCategory(host),
    categoryB: dominantCategory(guest),
  };
}

function pct(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] ?? 0;
}
const rate = (count: number, total: number): string => `${Math.round((count / Math.max(1, total)) * 100)}%`;

describe('balanceamento do PvP do Survival (robô)', () => {
  it(`viés de lado: ${MIRRORS} espelhos`, () => {
    const rng = seededRng(0x5eed);
    let side0 = 0;
    let draws = 0;
    let timeouts = 0;
    const durations: number[] = [];
    for (let i = 0; i < MIRRORS; i++) {
      const team = teamOf(rng, `m${i}`);
      const match = fight(team, team);
      durations.push(match.durationMs / 1000);
      if (match.winner === 0) side0++;
      else if (match.winner === 'draw') draws++;
      else if (match.winner === 'timeout') timeouts++;
    }
    durations.sort((a, b) => a - b);
    const decided = MIRRORS - draws - timeouts;
    console.log(`PVP espelho ${JSON.stringify({
      lutas: MIRRORS,
      venceuLado0: rate(side0, MIRRORS),
      venceuLado1: rate(MIRRORS - side0 - draws - timeouts, MIRRORS),
      venceuLado0NasDecididas: rate(side0, decided),
      venceuLado1NasDecididas: rate(MIRRORS - side0 - draws - timeouts, decided),
      empates: rate(draws, MIRRORS),
      semVencedorNoLimite: rate(timeouts, MIRRORS),
      duracaoS: { p10: Math.round(pct(durations, 0.1)), mediana: Math.round(pct(durations, 0.5)), p90: Math.round(pct(durations, 0.9)) },
    })}`);
  }, 1_800_000);

  it(`${MATCHES} confrontos aleatórios`, () => {
    const rng = seededRng(0xc0ffee);
    const matches: Match[] = [];
    for (let i = 0; i < MATCHES; i++) matches.push(fight(teamOf(rng, `a${i}`), teamOf(rng, `b${i}`)));
    const decided = matches.filter((m) => m.winner === 0 || m.winner === 1);
    const durations = matches.map((m) => m.durationMs / 1000).sort((a, b) => a - b);
    const stronger = decided.filter((m) => (m.scoreA > m.scoreB ? m.winner === 0 : m.winner === 1)).length;
    const close = decided.filter((m) => Math.abs(m.scoreA - m.scoreB) <= 2);
    const categories = [...new Set(matches.flatMap((m) => [m.categoryA, m.categoryB]))].sort();
    console.log(`PVP aleatório ${JSON.stringify({
      lutas: MATCHES,
      venceuLado0: rate(matches.filter((m) => m.winner === 0).length, MATCHES),
      empates: rate(matches.filter((m) => m.winner === 'draw').length, MATCHES),
      semVencedorNoLimite: rate(matches.filter((m) => m.winner === 'timeout').length, MATCHES),
      duracaoS: { p10: Math.round(pct(durations, 0.1)), mediana: Math.round(pct(durations, 0.5)), p90: Math.round(pct(durations, 0.9)) },
      notaDaEquipePreviu: rate(stronger, decided.length),
      confrontosEquilibrados: rate(close.length, MATCHES),
      confrontosEquilibradosVencidosPelaNota: rate(close.filter((m) => m.winner === 0 ? m.scoreA >= m.scoreB : m.scoreB > m.scoreA).length, close.length),
      porFormaDeGolpe: Object.fromEntries(categories.map((category) => {
        const own = matches.filter((m) => m.categoryA === category);
        const foe = matches.filter((m) => m.categoryB === category);
        const wins = own.filter((m) => m.winner === 0).length + foe.filter((m) => m.winner === 1).length;
        const total = own.length + foe.length;
        return [category, { aparencias: total, vitorias: rate(wins, total) }];
      })),
    })}`);
  }, 2_400_000);
});
