/**
 * Mede o custo do `update` dos moradores da Vila (só a lógica de caminhos, sem desenho): 60 s simulados a 60 quadros/s,
 * com N moradores indo a destinos distantes. `antigo` usa a regra de bloqueio varrendo listas e sem limite de buscas;
 * `novo` usa a grade de ocupação e `pathBudget` (o que o jogo faz hoje). Roda num PC, não num celular.
 *
 *   npx tsx scripts/village-path-bench.ts 30 novo
 *   npx tsx scripts/village-path-bench.ts 30 antigo
 */
import { generateVillage, isWalkable } from '../src/core/village/map';
import { emptyVillage, isPlaced, cropAt } from '../src/core/village/life';
import { pathBudget } from '../src/core/village/pathing';
import { BenchVisits, benchesFor } from '../src/core/village/benches';
import { CAFE_TABLES } from '../src/core/village/cafe-layout';
import { makeWalker, stepVillager } from '../src/core/village/actors';
import { GUIDED_DESTINATIONS } from '../src/core/village/guided-walk';
import { blockedForResident, StaticBlockGrid } from '../src/core/village/occupancy';
import { seededRng } from '../src/core/battle';

const N = Number(process.argv[2] ?? 30);
const mode = process.argv[3] ?? 'novo';
const map = generateVillage(20261014);
const state = emptyVillage(20261014, map.spawn);
for (let i = 0; i < 60; i++) state.placed.push({ x: 20 + (i % 20), y: 30 + Math.floor(i / 20), item: 'banco-ferro' } as never);
for (let i = 0; i < 40; i++) state.crops.push({ x: 60 + (i % 10), y: 40 + Math.floor(i / 10) } as never);
const benches = new BenchVisits(benchesFor(map));
const cafe = new BenchVisits(CAFE_TABLES, { distance: 60 });
const villagers = new Map<string, ReturnType<typeof makeWalker>>();
const rng = seededRng(3);
const free: { x: number; y: number }[] = [];
for (let y = 3; y < map.h - 3; y += 3) for (let x = 3; x < map.w - 3; x += 3) if (isWalkable(map, x, y)) free.push({ x, y });
for (let i = 0; i < N; i++) { const p = free[(i * 13) % free.length]!; villagers.set('m' + i, makeWalker('m' + i, p.x, p.y, 2.6)); }
const player = makeWalker('eu', map.spawn.x, map.spawn.y, 5.5);
const asleep = new Set<string>();
const zones = new Map<string, { x: number; y: number }>();
let zoneIndex = 0;
const nextZone = () => GUIDED_DESTINATIONS[(zoneIndex++ * 3 + 1) % GUIDED_DESTINATIONS.length]!;
for (const id of villagers.keys()) zones.set(id, nextZone());

function occupiedOld(x: number, y: number, except: string): boolean {
  if (benches.reserved(x, y, except)) return true;
  if (cafe.reserved(x, y, except)) return true;
  if (isPlaced(state, x, y) || cropAt(state, x, y)) return true;
  if ((player.x === x && player.y === y) || (player.tx === x && player.ty === y)) return true;
  for (const [id, w] of villagers) { if (id === except || asleep.has(id)) continue; if ((w.x === x && w.y === y) || (w.tx === x && w.ty === y)) return true; }
  return false;
}
// Reservas "do jeito antigo" (com array espalhado) para a medição do modo antigo ser fiel.
const reservedOld = (v: BenchVisits, x: number, y: number, except: string) => [...v.visits].some(([id, q]) => id !== except && q.x === x && q.y === y);
function occupiedOldFaithful(x: number, y: number, except: string): boolean {
  if (reservedOld(benches, x, y, except) || reservedOld(cafe, x, y, except)) return true;
  if (state.placed.some((f) => f.x === x && f.y === y) || state.crops.some((c) => c.x === x && c.y === y)) return true;
  if ((player.x === x && player.y === y) || (player.tx === x && player.ty === y)) return true;
  for (const [id, w] of villagers) { if (id === except || asleep.has(id)) continue; if ((w.x === x && w.y === y) || (w.tx === x && w.ty === y)) return true; }
  return false;
}
void occupiedOld;
const grid = new StaticBlockGrid(map.w, map.h);
const world = { grid, reservations: [(x: number, y: number, e?: string) => benches.reserved(x, y, e), (x: number, y: number, e?: string) => cafe.reserved(x, y, e)], player, villagers, asleep };

const frames: number[] = [];
const dt = 1 / 60;
let turn = 0;
for (let frame = 0; frame < 60 * 60; frame++) {
  const t0 = performance.now();
  if (mode === 'novo') { grid.rebuild(state.placed, state.crops); pathBudget.reset(3); } else pathBudget.reset(Number.POSITIVE_INFINITY);
  const entries = [...villagers];
  const off = mode === 'novo' ? turn++ % entries.length : 0;
  for (let n = 0; n < entries.length; n++) {
    const [id, w] = entries[(n + off) % entries.length]!;
    let zone = zones.get(id)!;
    if (Math.abs(zone.x - w.x) + Math.abs(zone.y - w.y) <= 7) { zone = nextZone(); zones.set(id, zone); }
    const blocked = mode === 'novo' ? (x: number, y: number) => blockedForResident(world, x, y, id) : (x: number, y: number) => occupiedOldFaithful(x, y, id);
    stepVillager(w, dt, map, blocked, rng, zone);
  }
  frames.push(performance.now() - t0);
}
frames.sort((a, b) => a - b);
const q = (p: number) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))]!.toFixed(2);
const over = frames.filter((f) => f > 16.7).length;
const dist = [...villagers.values()].reduce((s, w, i) => s + (Math.abs(zones.get('m' + i)!.x - w.x) + Math.abs(zones.get('m' + i)!.y - w.y)), 0) / N;
console.log(`${mode.padEnd(5)} N=${N}: update de 60 s simulados → mediana ${q(0.5)} ms · p95 ${q(0.95)} ms · p99 ${q(0.99)} ms · máx ${q(1)} ms · quadros acima de 16,7 ms: ${over}/${frames.length} · zonas trocadas: ${zoneIndex - N}`);
void dist;
