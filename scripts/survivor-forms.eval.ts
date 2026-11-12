// Justiça entre as formas de ataque e entre os tipos da Torre, com o motor real (`src/core/survivor.ts`).
//
// Diferente de `survivor-sim.eval.ts` (espécies sorteadas), aqui a forma é FORÇADA com stats e tipo iguais, só no
// harness, para isolar o efeito da forma e do tipo. Não é reconhecimento nem AR: é um teste do motor. Fora do `npm test`:
//
//   npx vitest run -c vitest.eval.config.ts scripts/survivor-forms.eval.ts --silent=false
//
// Parâmetros por ambiente: FORMS_DT (passo, ms), FORMS_SECONDS (cenários curtos), FORMS_RUNS (corridas por forma),
// FORMS_RUN_MIN (teto da corrida, min), FORMS_TYPES=0 para pular a matriz de tipos, FORMS_ONLY=orbit,foco para medir só
// algumas formas (com as mesmas sementes, dá para paralelizar um processo por forma), FORMS_SUPREME=1 para usar o Golpe Supremo
// e FORMS_SURGES=0 para desligar os eventos-relâmpago (`survivor-surges.ts`), que ficam ligados como no jogo.
// Diagnóstico dos eventos: FORMS_SURGE_KINDS=orb-rain,swarm,wild-friend,trial deixa só esses tipos (os outros são cancelados
// no começo, sem prêmio), FORMS_SURGE_DETOUR=1 faz o robô ir ao encontro do amigo e da baliza, FORMS_POLICIES=alcance mede só uma
// política e FORMS_SKIP_CONTROLLED=1 pula o cenário controlado.
//
// O que cada cenário mede (ver `docs/SURVIVOR_BALANCE_PRINCIPLES.md`):
//  - alvo único: dano útil por segundo contra um alvo parado (sem sobra de dano em quem já morreu);
//  - multidão: abates e dano útil por minuto contra 14 inimigos fracos que se aproximam e são repostos;
//  - corrida: sobrevivência, abates, nível, dano recebido e tempo protegido com o spawn real do motor.
// Quando a corrida chega ao teto, a sobrevivência fica CENSURADA (não é vitória).
import { describe, it } from 'vitest';
import { seededRng } from '../src/core/battle';
import type { Rng } from '../src/core/battle';
import { POKEMON_TYPES } from '../src/core/pokemon-data';
import type { PokemonType } from '../src/core/pokemon-data';
import { attackProfile, moveFor, moveWith } from '../src/core/survivor-moves';
import type { BaseStats, MoveCategory, SurvivorMove } from '../src/core/survivor-moves';
import { LAST_DEX, typesOfDex } from '../src/core/species-filter';
import { statsOfDex } from '../src/core/survivor-stats';
import { teleportReach, TELEPORT_FULL_HOLD_MS, TELEPORT_MIN_HOLD_MS } from '../src/core/survivor-charge';
import { applyUpgrade, ARENA_H, ARENA_W, createSurvivorState, stepSurvivor } from '../src/core/survivor';
import { chooseSurvivorSpecial, chooseSurvivorSpecialBranch } from '../src/core/survivor-specials';
import type { SurvivorEnemy, SurvivorInput, SurvivorState } from '../src/core/survivor';

const DT = Math.max(16, Math.min(100, Number(process.env.FORMS_DT ?? 50)));
const SECONDS = Math.max(10, Number(process.env.FORMS_SECONDS ?? 60));
const RUNS = Math.max(1, Math.min(60, Number(process.env.FORMS_RUNS ?? 8)));
const RUN_CAP_MS = Math.max(60_000, Number(process.env.FORMS_RUN_MIN ?? 6) * 60_000);
const WITH_TYPES = process.env.FORMS_TYPES !== '0';
/** Vida dos inimigos da multidão: alta o bastante para as formas fortes não esbarrarem na falta de alvos. */
const CROWD_HP = 300;

const ALL_FORMS: readonly MoveCategory[] = ['projetil', 'aura', 'area', 'cone', 'orbit', 'foco', 'rapido', 'teleporte', 'trilha'];
const ONLY = (process.env.FORMS_ONLY ?? '').split(',').map((form) => form.trim()).filter(Boolean);
const FORMS: readonly MoveCategory[] = ONLY.length ? ALL_FORMS.filter((form) => ONLY.includes(form)) : ALL_FORMS;
/** Stats médios: nenhuma forma ganha de graça por Velocidade ou Defesa. */
const STANDARD: BaseStats = { hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75 };

type Policy = 'evasiva' | 'alcance';
const POLICY_FILTER = (process.env.FORMS_POLICIES ?? '').split(',').map((policy) => policy.trim()).filter(Boolean);
const POLICIES: readonly Policy[] = (['evasiva', 'alcance'] as const).filter((policy) => POLICY_FILTER.length === 0 || POLICY_FILTER.includes(policy));
const SURGE_KINDS = (process.env.FORMS_SURGE_KINDS ?? '').split(',').map((kind) => kind.trim()).filter(Boolean);
const SURGE_DETOUR = process.env.FORMS_SURGE_DETOUR === '1';
/** Primeira semente das corridas (FORMS_SEED_BASE); trocar mede o ruído entre amostras. */
const SEED_BASE = Number(process.env.FORMS_SEED_BASE ?? 2000);

/** Quem joga: stats e tipo iguais (`controlada`, forma forçada) ou uma espécie real com a forma que a classificação dá. */
interface Spec {
  label: string;
  form: MoveCategory;
  move: SurvivorMove;
  stats: BaseStats;
  dexId: number;
}

const controlled = (form: MoveCategory, type: PokemonType = 'normal'): Spec => ({ label: `${form}/${type}`, form, move: moveWith(type, form, STANDARD), stats: STANDARD, dexId: 1 });

const bst = (stats: BaseStats): number => stats.hp + stats.attack + stats.defense + stats.spAttack + stats.spDefense + stats.speed;

/** Por forma, as espécies reais nos quantis 10/30/50/70/90 da soma de stats: fraca, média e forte, sem escolher a dedo. */
function naturalSpecs(): Map<MoveCategory, Spec[]> {
  const groups = new Map<MoveCategory, Spec[]>();
  for (let dex = 1; dex <= LAST_DEX; dex++) {
    const stats = statsOfDex(dex);
    if (!stats) continue;
    const types = typesOfDex(dex);
    const move = moveFor(types, stats);
    const list = groups.get(move.category) ?? [];
    list.push({ label: `#${dex}`, form: move.category, move, stats, dexId: dex });
    groups.set(move.category, list);
  }
  for (const [form, list] of groups) {
    list.sort((a, b) => bst(a.stats) - bst(b.stats) || a.dexId - b.dexId);
    const picks = [0.1, 0.3, 0.5, 0.7, 0.9].map((q) => list[Math.min(list.length - 1, Math.floor((list.length - 1) * q))]!);
    groups.set(form, [...new Map(picks.map((spec) => [spec.dexId, spec])).values()]);
  }
  return groups;
}

function newState(seed: number, spec: Spec, spawn: boolean): SurvivorState {
  const state = createSurvivorState(seed, { kindCount: 6, dexId: spec.dexId, move: spec.move, profile: attackProfile(spec.move, spec.stats) });
  if (process.env.FORMS_SURGES === '0' || !spawn) delete state.surges;
  if (!spawn) {
    state.nextBossAtMs = Number.POSITIVE_INFINITY;
    state.spawnAccumMs = -1e12;
  }
  return state;
}

const dummy = (id: number, x: number, y: number, hp: number, speed: number): SurvivorEnemy => ({
  id, kind: 0, boss: false, grade: 'comum', x, y, hp, maxHp: hp, speed, damage: 0, radius: 13, hitFlashMs: 0,
});

/** Onde o jogador quer ficar em relação ao inimigo mais próximo, pelo alcance real da forma. */
function desiredDistance(s: SurvivorState): number {
  const p = s.player;
  if (p.move.category === 'aura' || p.move.category === 'orbit') return Math.max(28, p.attackRadius * 0.6);
  if (p.move.category === 'cone') return Math.max(60, p.attackRange * 0.6);
  // Trilha: passa rente à multidão para ela pisar na faixa; a carga vem da distância percorrida.
  if (p.move.category === 'trilha') return 70;
  return Math.max(90, Math.min(160, p.attackRange * 0.7));
}

function nearest(s: SurvivorState): { e: SurvivorEnemy; d: number } | null {
  let best: SurvivorEnemy | null = null;
  let bd = Infinity;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - s.player.x, e.y - s.player.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best ? { e: best, d: bd } : null;
}

function wallPush(s: SurvivorState): { x: number; y: number } {
  const p = s.player;
  const m = 90;
  return {
    x: (p.x < m ? (m - p.x) / m : 0) - (p.x > ARENA_W - m ? (p.x - (ARENA_W - m)) / m : 0),
    y: (p.y < m ? (m - p.y) / m : 0) - (p.y > ARENA_H - m ? (p.y - (ARENA_H - m)) / m : 0),
  };
}

function nearestOrb(s: SurvivorState): { dx: number; dy: number } | null {
  let best: { dx: number; dy: number } | null = null;
  let bd = Infinity;
  for (const o of s.orbs) {
    const d = Math.hypot(o.x - s.player.x, o.y - s.player.y);
    if (d < bd) { bd = d; best = { dx: (o.x - s.player.x) / (d || 1), dy: (o.y - s.player.y) / (d || 1) }; }
  }
  return best;
}

/** Evasiva: foge de quem chega perto (chefe pesa mais), evita parede e pega orbe quando está seguro. */
function moveEvasive(s: SurvivorState): { dx: number; dy: number } {
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
  const wall = wallPush(s);
  fx += wall.x * 2;
  fy += wall.y * 2;
  if (Math.hypot(fx, fy) < 0.6) {
    const orb = nearestOrb(s);
    if (orb) { fx += orb.dx; fy += orb.dy; }
  }
  return { dx: fx, dy: fy };
}

/** Alcance: mantém a distância que a forma pede, foge quando o cerco fecha e coleta orbe quando calmo. */
function moveReach(s: SurvivorState): { dx: number; dy: number } {
  const p = s.player;
  // Golpes de contato (aura, órbita) aguentam mais gente por perto; os de distância fogem cedo.
  const melee = p.move.category === 'aura' || p.move.category === 'orbit' || p.move.category === 'trilha';
  // O Teleporte não tem golpe automático: o alcance dele é o salto, então joga fugindo da multidão e saltando por ela.
  if (p.move.category === 'teleporte') return moveEvasive(s);
  if (crowdSize(s, melee ? 110 : 140) >= (melee ? 6 : 3)) return moveEvasive(s);
  const near = nearest(s);
  let fx = 0;
  let fy = 0;
  if (near) {
    const want = desiredDistance(s);
    const ux = (near.e.x - p.x) / (near.d || 1);
    const uy = (near.e.y - p.y) / (near.d || 1);
    const k = Math.max(-1.5, Math.min(1, (near.d - want) / 60));
    fx += ux * k;
    fy += uy * k;
  }
  for (const e of s.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 70) continue;
    fx += (dx / d) * (70 - d) / 35;
    fy += (dy / d) * (70 - d) / 35;
  }
  const wall = wallPush(s);
  fx += wall.x * 2;
  fy += wall.y * 2;
  if (Math.hypot(fx, fy) < 0.3 && (!near || near.d > desiredDistance(s) + 120)) {
    const orb = nearestOrb(s);
    if (orb) { fx += orb.dx; fy += orb.dy; }
  }
  return { dx: fx, dy: fy };
}

/** Quantos inimigos vivos há num raio em volta do jogador. */
function crowdSize(s: SurvivorState, radius: number): number {
  return s.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - s.player.x, e.y - s.player.y) <= radius).length;
}

/**
 * O grupo mais denso entre `minDist` e `maxDist` do jogador (o inimigo com mais vizinhos a 90 px; empate: o mais perto).
 * É para onde o Foco e o Teleporte miram; o centro da multidão não serve, porque numa roda ele cai em cima do jogador.
 */
function hotspot(s: SurvivorState, minDist: number, maxDist: number): { x: number; y: number; n: number } | null {
  const alive = s.enemies.filter((e) => e.hp > 0);
  let best: { x: number; y: number; n: number; d: number } | null = null;
  for (const e of alive) {
    const d = Math.hypot(e.x - s.player.x, e.y - s.player.y);
    if (d < minDist || d > maxDist) continue;
    const n = alive.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) <= 90).length;
    if (!best || n > best.n || (n === best.n && d < best.d)) best = { x: e.x, y: e.y, n, d };
  }
  return best ? { x: best.x, y: best.y, n: best.n } : null;
}

interface ChargeMemory { holdMs: number; wantMs: number }

/** Segurar e soltar como uma pessoa competente: Foco mira o grupo e solta cheio; Teleporte escolhe a carga pela distância. */
function chargeControl(s: SurvivorState, memory: ChargeMemory): { charge: boolean; aim?: number } {
  const p = s.player;
  const style = p.move.category;
  if (style === 'foco') {
    const target = hotspot(s, 0, 320);
    if (!target) { memory.holdMs = 0; return { charge: false }; }
    const aim = Math.atan2(target.y - p.y, target.x - p.x);
    const close = nearest(s)?.d ?? Infinity;
    const level = s.charge.level;
    if (level >= 1 || (level >= 0.5 && close < 110)) { memory.holdMs = 0; return { charge: false, aim }; }
    return { charge: true, aim };
  }
  // Trilha: o botão fica pressionado (como no automático) e a faixa sai assim que a carga enche.
  if (style === 'trilha') return { charge: true };
  if (style === 'teleporte') {
    if (s.charge.teleportCooldownMs > 0) { memory.holdMs = 0; return { charge: false }; }
    const range = teleportReach(p.attackRange, p.attackRadius, p.shots).range;
    const target = hotspot(s, range * 0.45, range + 40);
    if (!target) { memory.holdMs = 0; return { charge: false }; }
    const dist = Math.hypot(target.x - p.x, target.y - p.y);
    const level = Math.max(0, Math.min(1, (dist / range - 0.45) / 0.55));
    const aim = Math.atan2(target.y - p.y, target.x - p.x);
    memory.wantMs = TELEPORT_MIN_HOLD_MS + level * (TELEPORT_FULL_HOLD_MS - TELEPORT_MIN_HOLD_MS);
    if (s.charge.teleportHoldMs >= memory.wantMs) return { charge: false, aim };
    return { charge: true, aim };
  }
  return { charge: false };
}

const SPECIAL_CHOICE = 'shield' as const;

/** Escolhas que pausam o motor, resolvidas sem sorteio de tipo de carta além do que o jogo oferece. */
function resolvePause(s: SurvivorState, pick: (s: SurvivorState) => string): boolean {
  if (s.pendingUpgrade) { applyUpgrade(s, pick(s)); return true; }
  if (s.special.phase === 'choice') { chooseSurvivorSpecial(s, SPECIAL_CHOICE); return true; }
  if (s.special.phase === 'branch-choice') { chooseSurvivorSpecialBranch(s, 'shield-permanent'); return true; }
  return false;
}

/** Prefere cartas do próprio golpe, depois dano, cadência e defesa; só escolhe entre as ofertas reais. */
function smartPick(s: SurvivorState): string {
  const options = s.pendingUpgrade ?? [];
  const category = s.player.move.category;
  const rank = (id: string): number => {
    if (id.startsWith(`attack-tree-${category}-`)) return 0;
    if (id === 'power' || id.startsWith('damage-') || id === 'resonance' || id === 'haste') return 1;
    if (id.startsWith('charge-')) return 1;
    if (id.startsWith('guard-') || id === 'vigor' || id === 'second-wind') return 2;
    // Dificuldade é escolha voluntária de quem quer mais pressão: sem isto, o robô a pegava no empate e cada nível a mais
    // (por exemplo, XP dos eventos) virava mais inimigos. FORMS_PICK_DIFFICULTY=1 volta ao comportamento antigo.
    if (id === 'difficulty' && process.env.FORMS_PICK_DIFFICULTY !== '1') return 9;
    return 3;
  };
  return [...options].sort((a, b) => rank(a.id) - rank(b.id))[0]?.id ?? options[0]?.id ?? '';
}

/**
 * Amigo selvagem ou baliza de desafio esperando. Os dois vêm até você; com FORMS_SURGE_DETOUR=1 o robô ainda vai ao encontro
 * deles quando o entorno está calmo (a medição de 12/11/2026 mostrou que isso custava p10 à Trilha).
 */
function surgeDetour(s: SurvivorState): { dx: number; dy: number } | null {
  const surge = s.surge;
  if (!SURGE_DETOUR || !surge || surge.phase !== 'offer' || crowdSize(s, 120) >= 2) return null;
  const at = surge.friend ?? { x: surge.x ?? s.player.x, y: surge.y ?? s.player.y };
  return { dx: at.x - s.player.x, dy: at.y - s.player.y };
}

/** Controle de quem joga: movimento da política + carga + especial. */
function control(s: SurvivorState, policy: Policy, memory: ChargeMemory): SurvivorInput {
  const move = surgeDetour(s) ?? (policy === 'evasiva' ? moveEvasive(s) : moveReach(s));
  const charge = chargeControl(s, memory);
  const input: SurvivorInput = {
    dx: move.dx,
    dy: move.dy,
    charge: charge.charge,
    special: s.special.phase === 'ready' && s.special.cooldownMs === 0 && crowdSize(s, 200) >= 4,
    // FORMS_SUPREME=1: solta o Golpe Supremo quando cheio e há gente por perto; sem a opção, nunca usa (base de comparação).
    supreme: process.env.FORMS_SUPREME === '1' && s.supreme.meter >= 1 && crowdSize(s, 300) >= 3,
  };
  if (charge.aim !== undefined) input.aimAngle = charge.aim;
  return input;
}

/** Soma só o dano útil: o que cada inimigo realmente perdeu (quem morreu conta pela vida que tinha). */
class Ledger {
  private hp = new Map<number, number>();
  private playerHp: number;
  useful = 0;
  taken = 0;
  protectedMs = 0;
  constructor(s: SurvivorState) {
    this.playerHp = s.player.hp;
    this.snapshot(s);
  }
  private snapshot(s: SurvivorState): void {
    this.hp = new Map(s.enemies.map((e) => [e.id, Math.max(0, e.hp)]));
  }
  settle(s: SurvivorState, dtMs: number): void {
    const now = new Map(s.enemies.map((e) => [e.id, Math.max(0, e.hp)]));
    for (const [id, before] of this.hp) this.useful += Math.max(0, before - (now.get(id) ?? 0));
    this.hp = now;
    this.taken += Math.max(0, this.playerHp - s.player.hp);
    this.playerHp = s.player.hp;
    if (s.player.invulnMs > 0) this.protectedMs += dtMs;
  }
}

interface Fixed { dps: number; kills: number }

/** Alvo parado (sem vida real) ou multidão reposta; sem spawn do motor, para isolar a forma. */
function fixedScenario(spec: Spec, policy: Policy, crowd: boolean): Fixed {
  const s = newState(7, spec, false);
  const rng: Rng = seededRng(0x1234);
  let id = 1000;
  const spawnCrowd = (): void => {
    const a = rng() * Math.PI * 2;
    s.enemies.push(dummy(id++, s.player.x + Math.cos(a) * 300, s.player.y + Math.sin(a) * 300, CROWD_HP, 55));
  };
  if (crowd) for (let i = 0; i < 14; i++) spawnCrowd();
  else s.enemies.push(dummy(id++, s.player.x + 180, s.player.y, 1e12, 0));
  const ledger = new Ledger(s);
  const memory: ChargeMemory = { holdMs: 0, wantMs: 0 };
  let kills = 0;
  while (!s.over && s.elapsedMs < SECONDS * 1000) {
    if (resolvePause(s, smartPick)) continue;
    stepSurvivor(s, control(s, policy, memory), DT);
    ledger.settle(s, DT);
    s.player.hp = s.player.maxHp;
    if (crowd) while (s.enemies.filter((e) => e.hp > 0).length < 14) spawnCrowd();
    kills = s.kills;
  }
  return { dps: ledger.useful / SECONDS, kills: (kills * 60) / SECONDS };
}

interface RunResult {
  survivedMs: number; kills: number; level: number; taken: number; protectedMs: number; capped: boolean;
  /** Evento-relâmpago em curso na hora da morte (diagnóstico) e dano recebido durante eventos. */
  deathSurge?: string;
  /** Diagnóstico (FORMS_DUMP=1): eventos vividos e o dano recebido em cada tipo de evento. */
  surgeLog: string[];
  takenByKind: Record<string, number>;
  difficulty: number;
  surgeTaken: number;
}

function realRun(seed: number, spec: Spec, policy: Policy): RunResult {
  const s = newState(seed, spec, true);
  const ledger = new Ledger(s);
  const memory: ChargeMemory = { holdMs: 0, wantMs: 0 };
  let steps = 0;
  let surgeTaken = 0;
  let deathSurge: string | undefined;
  const surgeLog: string[] = [];
  const takenByKind: Record<string, number> = {};
  while (!s.over && s.elapsedMs < RUN_CAP_MS) {
    if (++steps > (RUN_CAP_MS / DT) * 4) throw new Error(`Relógio parado em ${s.elapsedMs} ms (${spec.label}, ${policy})`);
    if (resolvePause(s, smartPick)) continue;
    const surgeBefore = s.surge?.kind;
    const takenBefore = ledger.taken;
    stepSurvivor(s, control(s, policy, memory), DT);
    ledger.settle(s, DT);
    if (surgeBefore) {
      surgeTaken += ledger.taken - takenBefore;
      const key = `${surgeBefore}:${s.surge?.phase ?? 'fim'}`;
      takenByKind[key] = (takenByKind[key] ?? 0) + ledger.taken - takenBefore;
    }
    if (s.surge && s.surge.kind !== surgeBefore) surgeLog.push(`${Math.round(s.elapsedMs / 1000)}s:${s.surge.kind}`);
    if (s.over && surgeBefore) deathSurge = surgeBefore;
    if (s.surge && SURGE_KINDS.length > 0 && !SURGE_KINDS.includes(s.surge.kind)) s.surge = null;
  }
  return { survivedMs: s.elapsedMs, kills: s.kills, level: s.player.level, taken: ledger.taken, protectedMs: ledger.protectedMs, capped: !s.over, surgeTaken, surgeLog, takenByKind, difficulty: s.player.difficultyStacks ?? 0, ...(deathSurge ? { deathSurge } : {}) };
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
};
const quantile = (values: number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] ?? 0;
};
const round = (value: number, digits = 1): number => Math.round(value * 10 ** digits) / 10 ** digits;

/** Agrega uma lista de números por mediana, para não deixar uma espécie ou semente decidir sozinha. */
function summarize(runs: RunResult[]): Record<string, unknown> {
  const t = runs.map((r) => r.survivedMs / 1000);
  return {
    // A sobrevivência é censurada pelo teto: a média restrita (cada corrida vale no máximo o teto) separa o que a mediana esconde.
    sobrevivenciaS: { p10: round(quantile(t, 0.1), 0), p25: round(quantile(t, 0.25), 0), mediana: round(median(t), 0), mediaRestrita: round(t.reduce((a, b) => a + b, 0) / t.length, 0), p90: round(quantile(t, 0.9), 0) },
    abates: round(median(runs.map((r) => r.kills)), 0),
    nivel: median(runs.map((r) => r.level)),
    danoRecebido: round(median(runs.map((r) => r.taken)), 0),
    protegidoS: round(median(runs.map((r) => r.protectedMs / 1000))),
    noTeto: `${Math.round((runs.filter((r) => r.capped).length / runs.length) * 100)}%`,
    danoEmEventos: round(median(runs.map((r) => r.surgeTaken)), 0),
    dificuldadeMedia: round(runs.reduce((a, r) => a + r.difficulty, 0) / runs.length),
    mortesEmEvento: runs.reduce<Record<string, number>>((acc, r) => { if (r.deathSurge) acc[r.deathSurge] = (acc[r.deathSurge] ?? 0) + 1; return acc; }, {}),
  };
}

function formRows(specsOf: (form: MoveCategory) => Spec[]): Record<string, unknown>[] {
  return FORMS.map((form) => {
    const specs = specsOf(form);
    const row: Record<string, unknown> = { forma: form, especies: specs.map((spec) => spec.label).join(',') };
    const fixed = specs.map((spec) => ({ single: fixedScenario(spec, 'alcance', false), crowd: fixedScenario(spec, 'alcance', true) }));
    row['alvoUnicoDps'] = round(median(fixed.map((f) => f.single.dps)));
    row['multidaoDps'] = round(median(fixed.map((f) => f.crowd.dps)));
    row['multidaoAbatesMin'] = round(median(fixed.map((f) => f.crowd.kills)), 0);
    for (const policy of POLICIES) {
      const runs = specs.flatMap((spec) => Array.from({ length: RUNS }, (_, i) => realRun(SEED_BASE + i, spec, policy)));
      row[`corrida:${policy}`] = summarize(runs);
      if (process.env.FORMS_DUMP === '1') row[`dump:${policy}`] = runs.map((r, i) => ({ seed: SEED_BASE + (i % RUNS), esp: specs[Math.floor(i / RUNS)]?.label, s: Math.round(r.survivedMs / 1000), lv: r.level, dif: r.difficulty, morte: r.deathSurge, ev: r.surgeLog.join(' '), dano: Object.fromEntries(Object.entries(r.takenByKind).map(([k, v]) => [k, Math.round(v)])) }));
    }
    return row;
  });
}

describe('justiça entre as formas de ataque (motor real)', () => {
  it.skipIf(process.env.FORMS_SKIP_CONTROLLED === '1')('controlada: stats e tipo iguais, forma forçada', () => {
    const rows = formRows((form) => [controlled(form)]);
    console.log(`FORMAS-CONTROLADA dt=${DT} s=${SECONDS} runs=${RUNS} tetoMin=${RUN_CAP_MS / 60000} ${JSON.stringify(rows)}`);
  }, 3_600_000);

  it('natural: espécies reais nos quantis de força de cada forma', () => {
    const groups = naturalSpecs();
    const rows = formRows((form) => groups.get(form) ?? []);
    console.log(`FORMAS-NATURAL dt=${DT} s=${SECONDS} runs=${RUNS} tetoMin=${RUN_CAP_MS / 60000} ${JSON.stringify(rows)}`);
  }, 3_600_000);

  it.runIf(WITH_TYPES)('matriz tipo × forma, alvo único e multidão (política de alcance)', () => {
    const table: Record<string, Record<string, { alvo: number; multidao: number }>> = {};
    for (const type of POKEMON_TYPES) {
      table[type] = {};
      for (const form of FORMS) {
        const spec = controlled(form, type);
        table[type]![form] = { alvo: round(fixedScenario(spec, 'alcance', false).dps), multidao: round(fixedScenario(spec, 'alcance', true).dps) };
      }
    }
    console.log(`TIPOS-FORMAS dt=${DT} s=${SECONDS} ${JSON.stringify(table)}`);
  }, 3_600_000);
});
