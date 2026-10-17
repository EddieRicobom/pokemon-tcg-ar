import { seededRng } from './battle';
import type { Rng } from './battle';
import {
  aliveOf, arenaLimit, chooseEnemyShot, GROUND_DECEL, isSettled, launch, launchSpeed, stepWorld, typesOf,
} from './pins';
import type { Difficulty, Pin, PinWorld, Shot, Side } from './pins';
import { frictionAt } from './pin-terrain';
import { TerrainGrid } from './terrain';

/**
 * Adversário do Pin Mode que **pensa antes de jogar**: monta jogadas candidatas (qual pin, em quem, por qual lado do alvo,
 * com que força e com qual golpe), simula cada uma com a mesma física do jogo (cópia do mundo, sem marcar o chão) e fica
 * com a que deixa a mesa melhor para ele: derrubar os seus, não cair junto e deixar os dele longe da borda e os seus perto.
 * Só depois disso a pontaria erra um pouco, conforme a dificuldade. O Fácil continua com a mira por regra simples.
 */

export interface EnemyPlan {
  pinId: string;
  shot: Shot;
  moveIndex: number | null;
}

/** Quantas jogadas o adversário simula, no máximo, a cada vez (custo no celular). */
export const SIM_BUDGET: Record<Difficulty, number> = { facil: 0, normal: 100, dificil: 320 };
/** Erro de mira (radianos) depois de escolher a jogada. */
const AIM_ERROR: Record<Difficulty, number> = { facil: 0.5, normal: 0.06, dificil: 0.015 };
/** Erro de força (fração). */
const POWER_ERROR: Record<Difficulty, number> = { facil: 0.3, normal: 0.05, dificil: 0.015 };

const SIM_DT = 1 / 60;
const SIM_SECONDS = 3.2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const bell = (rng: Rng) => (rng() + rng() + rng()) / 1.5 - 1;

function clonePin(p: Pin): Pin {
  return { ...p, types: [...p.types], cooldowns: [...p.cooldowns], active: p.active ? { ...p.active } : null, lastMark: null };
}

/** Cópia do mundo para simular: mesmos pins, obstáculos e chão, sem marcar o chão nem encolher a borda. */
function cloneTerrain(source: TerrainGrid | null | undefined): TerrainGrid | null {
  if (!source) return null;
  const copy = new TerrainGrid(source.cols, source.rows, source.shape);
  copy.base.set(source.base);
  copy.over.set(source.over);
  copy.inside.set(source.inside);
  return copy;
}

export function cloneWorld(world: PinWorld, seed = 0x51a7e): PinWorld {
  const terrain = cloneTerrain(world.terrain);
  return {
    radius: world.radius,
    patches: world.patches.map((p) => ({ ...p })),
    pins: world.pins.map(clonePin),
    time: world.time,
    terrain,
    markRng: terrain ? seededRng(seed) : null,
    limit: world.limit,
    round: world.round,
    shrinking: world.shrinking,
  };
}

const standing = (p: Pin) => p.alive && p.fall === 0;

/** Simula uma jogada até a mesa parar e devolve o mundo final. */
export function simulate(world: PinWorld, plan: EnemyPlan): PinWorld {
  let seed = 0x811c9dc5;
  for (const ch of plan.pinId) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  seed = Math.imul(seed ^ ((plan.moveIndex ?? -1) + 2), 16777619);
  const sim = cloneWorld(world, seed);
  const pin = sim.pins.find((p) => p.id === plan.pinId);
  if (!pin || !launch(pin, plan.shot, plan.moveIndex)) return sim;
  for (let t = 0; t < SIM_SECONDS; t += SIM_DT) {
    stepWorld(sim, SIM_DT);
    if (t > 0.2 && isSettled(sim)) break;
  }
  // Quem está caindo já está fora.
  return sim;
}

/**
 * Nota de uma mesa para o lado `me` (o adversário é `1`): cada pin derrubado do outro lado vale muito, perder um dos seus
 * custa ainda mais, e a distância até a borda pesa (perto da borda = em perigo na próxima jogada).
 */
export function evaluate(before: PinWorld, after: PinWorld, me: Side = 1): number {
  const other: Side = me === 1 ? 0 : 1;
  const limit = arenaLimit(before);
  const count = (w: PinWorld, side: Side) => w.pins.filter((p) => p.side === side && standing(p)).length;
  const knocked = count(before, other) - count(after, other);
  const lost = count(before, me) - count(after, me);
  let score = 100 * knocked - 135 * lost;
  // Todos os de um lado caíram: fim de jogo.
  if (count(after, other) === 0) score += 400;
  if (count(after, me) === 0) score -= 600;
  for (const p of after.pins) {
    if (!standing(p)) continue;
    const risk = clamp((Math.hypot(p.x, p.y) + p.r) / limit, 0, 1.2);
    score += (p.side === other ? 22 : -28) * risk * risk;
    if (after.terrain) {
      // Gelo e flores deixam o pin escorregar; mato, pedras e lodo dão segurança perto da borda.
      // A IA passa a considerar isso depois de simular as próprias marcas e reações.
      const friction = frictionAt(after.terrain, after.radius, p.x, p.y, typesOf(p));
      const slippery = clamp(1.1 - friction, -0.8, 0.8);
      score += (p.side === other ? 16 : -20) * slippery * risk;
    }
  }
  return score;
}

/** Força (0 a 1) para o pin percorrer `distance` e ainda chegar com embalo no chão comum. */
function powerFor(pin: Pin, distance: number, moveIndex: number | null, extra: number): number {
  const want = Math.sqrt(2 * GROUND_DECEL * Math.max(1, distance + extra));
  const unit = launchSpeed(pin, { dirX: 1, dirY: 0, power: 1 }, moveIndex === null ? null : pin.moves[moveIndex]!.effect);
  return clamp(want / Math.max(1, unit), 0.25, 1);
}

/**
 * Candidatas: para cada pin dele e cada alvo seu, mira no centro do alvo e em três "pontos de toque" que empurram o alvo
 * para fora (direto para a borda e girado ±28°), com três forças; cada uma com o disparo normal e com um golpe pronto.
 */
export function candidatePlans(world: PinWorld, me: Side = 1): EnemyPlan[] {
  const other: Side = me === 1 ? 0 : 1;
  const shooters = aliveOf(world, me);
  const targets = aliveOf(world, other);
  const plans: EnemyPlan[] = [];
  for (const pin of shooters) {
    const moveOptions: (number | null)[] = [null];
    pin.moves.forEach((m, i) => {
      if ((pin.cooldowns[i] ?? 0) === 0 && m.effect.kind !== 'escudo') moveOptions.push(i);
    });
    for (const target of targets) {
      const cd = Math.hypot(target.x, target.y) || 1e-6;
      const out = { x: target.x / cd, y: target.y / cd };
      const aims: { x: number; y: number }[] = [{ x: target.x, y: target.y }];
      for (const turn of [0, 0.5, -0.5]) {
        const ux = out.x * Math.cos(turn) - out.y * Math.sin(turn);
        const uy = out.x * Math.sin(turn) + out.y * Math.cos(turn);
        // Ponto de toque: para empurrar o alvo na direção u, o centro do atirador encosta no lado oposto do alvo.
        aims.push({ x: target.x - ux * (pin.r + target.r) * 0.95, y: target.y - uy * (pin.r + target.r) * 0.95 });
      }
      for (const aim of aims) {
        const dx = aim.x - pin.x;
        const dy = aim.y - pin.y;
        const d = Math.hypot(dx, dy);
        if (d < 1) continue;
        for (const moveIndex of moveOptions) {
          for (const extra of [60, 180, 420]) {
            plans.push({ pinId: pin.id, shot: { dirX: dx / d, dirY: dy / d, power: powerFor(pin, d, moveIndex, extra) }, moveIndex });
          }
        }
      }
    }
  }
  return plans;
}

/** Fica com até `budget` candidatas, espalhadas (sorteio estável) quando há mais do que dá para simular. */
function pickBudget(plans: EnemyPlan[], budget: number, _rng: Rng): EnemyPlan[] {
  if (plans.length <= budget) return plans;
  // O sorteio antigo podia remover todas as jogadas de um alvo ou de um golpe. A amostra
  // espaçada mantém variedade entre atiradores, alvos, ângulos e forças em toda partida.
  const selected: EnemyPlan[] = [];
  const step = plans.length / budget;
  for (let i = 0; i < budget; i++) selected.push(plans[Math.min(plans.length - 1, Math.floor(i * step))]!);
  return selected;
}

/** A melhor jogada pela simulação (sem o erro de mira), ou null se não há o que jogar. */
export function bestPlan(world: PinWorld, rng: Rng, budget: number, me: Side = 1): { plan: EnemyPlan; score: number } | null {
  const plans = pickBudget(candidatePlans(world, me), budget, rng);
  let best: { plan: EnemyPlan; score: number } | null = null;
  for (const plan of plans) {
    const score = evaluate(world, simulate(world, plan), me) + (rng() - 0.5) * 2;
    if (!best || score > best.score) best = { plan, score };
  }
  return best;
}

/**
 * O disparo do adversário. No Fácil, a mira por regra (`chooseEnemyShot`); no Normal e no Difícil, simula as jogadas e
 * escolhe a melhor, e só então aplica o erro de mira e de força da dificuldade.
 */
export function planEnemyShot(world: PinWorld, rng: Rng, difficulty: Difficulty): EnemyPlan | null {
  if (aliveOf(world, 0).length === 0 || aliveOf(world, 1).length === 0) return null;
  if (SIM_BUDGET[difficulty] === 0) return chooseEnemyShot(world, rng, difficulty);
  const found = bestPlan(world, rng, SIM_BUDGET[difficulty]);
  if (!found) return chooseEnemyShot(world, rng, difficulty);
  const { plan } = found;
  const angle = Math.atan2(plan.shot.dirY, plan.shot.dirX) + bell(rng) * AIM_ERROR[difficulty];
  const power = clamp(plan.shot.power * (1 + bell(rng) * POWER_ERROR[difficulty]), 0.2, 1);
  return { pinId: plan.pinId, moveIndex: plan.moveIndex, shot: { dirX: Math.cos(angle), dirY: Math.sin(angle), power } };
}

