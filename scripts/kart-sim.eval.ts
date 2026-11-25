// Análise do Kart com o motor real (`src/core/kart-race.ts`). Mede se os itens realmente ajudam quem está atrás,
// sem depender de tela, GPU ou toque. Fora do `npm test`:
//
//   npx vitest run -c vitest.eval.config.ts scripts/kart-sim.eval.ts --silent=false
//
// Parâmetros: KART_SIM_RUNS (padrão 120), KART_SIM_SKILL (0..1, padrão 0.9) e KART_SIM_DT (padrão 1/60 em ms).
import { describe, it } from 'vitest';
import { createKartRace, kartPlacementOrder, kartPosition, opponentInput, stepKartRace, trackPoint, trackTangent, useKartItem } from '../src/core/kart-race';
import type { KartRaceState } from '../src/core/kart-race';
import { KART_ITEMS, kartItemOdds, kartItemTierOdds } from '../src/core/kart-items';

const RUNS = Math.max(10, Math.min(1000, Number(process.env.KART_SIM_RUNS ?? 120)));
const SKILL = Math.max(0.3, Math.min(1.2, Number(process.env.KART_SIM_SKILL ?? 0.9)));
const DT = Math.max(1 / 120, Math.min(0.05, Number(process.env.KART_SIM_DT ?? 1 / 60)));

interface Result {
  place: number;
  elapsed: number;
  hits: number;
  hitsTaken: number;
  picks: number;
  used: number;
  wasLastAt25: boolean;
  finished: boolean;
  wonFromLast: boolean;
}

const teams = [25, 6, 95];
const randomSeed = (index: number): number => (0x9e3779b9 ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;

function play(index: number, items: boolean, skill: number, back: boolean, drift = false): Result {
  const race = createKartRace(3, [25, ...teams], null, { items, seed: randomSeed(index), countdown: 0 });
  const player = race.cars[0]!;
  let driftHold = 0;
  if (back) {
    // Largada no fundo do grid: mede se os itens puxam quem está atrás.
    const angle = 5.6;
    const point = trackPoint(angle);
    const tangent = trackTangent(angle);
    player.x = point.x;
    player.z = point.z;
    player.heading = Math.atan2(tangent.x, tangent.z);
    player.speed = 0;
    player.lap = 0;
    player.checkpoint = 0;
  }
  let wasLastAt25 = false;
  let steps = 0;
  while (player.finishedAt === null && race.elapsed < 240) {
    if (++steps > 240 / DT) break;
    if (items && player.item) useKartItem(race, 0);
    const base = opponentInput(player, 0, false);
    let input = { ...base, throttle: base.throttle * skill };
    if (drift) {
      if (Math.abs(base.steer) > 0.5 && player.speed > 16) driftHold = Math.max(driftHold, 0.4);
      if (driftHold > 0) {
        input = { ...input, brake: true };
        driftHold = Math.max(0, driftHold - DT);
      }
    }
    stepKartRace(race, input, DT);
    if (!wasLastAt25 && race.elapsed >= 25 && kartPosition(race, 0) === race.cars.length) wasLastAt25 = true;
  }
  const rivalsDone = race.cars.slice(1).every((car) => car.finishedAt !== null);
  const completed = player.finishedAt !== null;
  const order = kartPlacementOrder(race);
  const place = completed || !rivalsDone
    ? order.indexOf(0) + 1
    : race.cars.length;
  return {
    place,
    elapsed: race.elapsed,
    hits: player.hits,
    hitsTaken: race.itemEvents.filter((event) => event.kind === 'hit' && event.target === 0).length,
    picks: race.itemEvents.filter((event) => event.kind === 'pickup' && event.car === 0).length,
    used: race.itemEvents.filter((event) => event.kind === 'use' && event.car === 0).length,
    wasLastAt25,
    finished: completed,
    wonFromLast: wasLastAt25 && place === 1,
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

function report(label: string, results: Result[]): Record<string, number | string> {
  const wins = results.filter((result) => result.place === 1).length;
  const podium = results.filter((result) => result.place <= 3).length;
  const lastAt25 = results.filter((result) => result.wasLastAt25);
  return {
    modo: label,
    corridas: results.length,
    vitorias: `${Math.round((wins / results.length) * 100)}%`,
    podio: `${Math.round((podium / results.length) * 100)}%`,
    posicaoMediana: median(results.map((result) => result.place)),
    tempoMedianoS: Math.round(median(results.map((result) => result.elapsed))),
    terminou: `${Math.round((results.filter((result) => result.finished).length / results.length) * 100)}%`,
    acertosCausados: Number((results.reduce((sum, result) => sum + result.hits, 0) / results.length).toFixed(2)),
    acertosSofridos: Number((results.reduce((sum, result) => sum + result.hitsTaken, 0) / results.length).toFixed(2)),
    itensPegos: Number((results.reduce((sum, result) => sum + result.picks, 0) / results.length).toFixed(2)),
    itensUsados: Number((results.reduce((sum, result) => sum + result.used, 0) / results.length).toFixed(2)),
    ultimoAos25s: lastAt25.length,
    vitoriasSaindoDoUltimo: lastAt25.filter((result) => result.wonFromLast).length,
  };
}

describe('Kart: corrida de recuperação com itens', () => {
  it(`chance por posição e ${RUNS} corridas com e sem itens (habilidade ${SKILL})`, () => {
    const odds = Object.fromEntries([1, 2, 3, 4].map((position) => {
      const tiers = kartItemTierOdds(position, 4);
      const items = Object.fromEntries(Object.entries(kartItemOdds(position, 4)).map(([id, value]) => [id, `${Math.round(value * 100)}%`]));
      return [position, { comuns: `${Math.round(tiers[1] * 100)}%`, raros: `${Math.round(tiers[2] * 100)}%`, epicos: `${Math.round(tiers[3] * 100)}%`, ...items }];
    }));
    console.log(`KART chances ${JSON.stringify(odds)}`);
    const without = Array.from({ length: RUNS }, (_, i) => play(i, false, SKILL, false));
    const withItems = Array.from({ length: RUNS }, (_, i) => play(i, true, SKILL, false));
    const backWithout = Array.from({ length: RUNS }, (_, i) => play(i, false, SKILL, true));
    const backWith = Array.from({ length: RUNS }, (_, i) => play(i, true, SKILL, true));
    const driftWith = Array.from({ length: RUNS }, (_, i) => play(i, true, SKILL, false, true));
    const backDriftWith = Array.from({ length: RUNS }, (_, i) => play(i, true, SKILL, true, true));
    console.log(`KART semItens ${JSON.stringify(report('sem', without))}`);
    console.log(`KART comItens ${JSON.stringify(report('com', withItems))}`);
    console.log(`KART fundoDoGridSemItens ${JSON.stringify(report('fundo-sem', backWithout))}`);
    console.log(`KART fundoDoGridComItens ${JSON.stringify(report('fundo-com', backWith))}`);
    console.log(`KART comItensEDerrapagem ${JSON.stringify(report('com-drift', driftWith))}`);
    console.log(`KART fundoDoGridComItensEDerrapagem ${JSON.stringify(report('fundo-com-drift', backDriftWith))}`);
    const itemCounts = [...new Set(withItems.map((result) => result.used))].sort((a, b) => a - b);
    console.log(`KART itensUsadosPorCorrida ${JSON.stringify(itemCounts)}`);
    const kinds = Object.values(KART_ITEMS).length;
    console.log(`KART catalogo ${JSON.stringify({ itens: kinds, porTipo: Object.values(KART_ITEMS).map((item) => `${item.icon} ${item.name} (${item.tier})`) })}`);
  }, 1_800_000);
});
