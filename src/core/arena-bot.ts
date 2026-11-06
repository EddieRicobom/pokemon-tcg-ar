import { typeEffectiveness } from './battle';
import { canGuard, canSwapAttack, canSwitch, NO_INPUT, SV_ARENA_H, SV_ARENA_W, SV_MON_RADIUS } from './survivor-pvp';
import type { ArenaInput, ArenaMon, ArenaSide, ArenaState } from './survivor-pvp';

/**
 * O rival da luta da Arena. Usa os mesmos controles de uma pessoa (andar, trocar de Pokémon, escudo, trocar de ataque) e só
 * lê o que está na tela. `skill` (0 a 1) encurta o tempo de reação: líderes da Liga decidem mais rápido que um treino.
 * Sem sorteio: a mesma luta com as mesmas entradas dá o mesmo resultado.
 */

const THINK_SLOW_MS = 650;
const THINK_FAST_MS = 200;
const STRAFE_EVERY_MS = 1700;
const DODGE_RANGE = 90;
const GUARD_RANGE = 46;

/** A que distância do alvo cada forma de ataque rende. */
function wantedDistance(mon: ArenaMon, drawingTrail: boolean): number {
  const range = mon.attackRange ?? 200;
  const radius = mon.attackRadius ?? SV_MON_RADIUS * 2;
  switch (mon.moveCategory) {
    // A Trilha só fere quem pisa nela: enquanto desenha, passa por cima do alvo.
    case 'trilha': return drawingTrail ? 0 : 170;
    case 'aura': return Math.max(SV_MON_RADIUS * 2, radius * 0.5);
    case 'orbit': return Math.max(SV_MON_RADIUS * 2, radius * 0.72);
    case 'cone': return range * 0.55;
    case 'teleporte': return Math.min(range, 150);
    case 'area': return 190;
    default: return 170;
  }
}

const matchup = (attackType: ArenaMon['attackType'], target: ArenaMon): number => typeEffectiveness(attackType, target.types);

/** O melhor reserva contra quem está em campo do outro lado, se valer a pena trocar. */
function betterReserve(state: ArenaState, side: ArenaSide, foe: ArenaMon): number {
  const team = state.sides[side];
  const current = team.mons[team.active];
  if (!current) return -1;
  const risk = (mon: ArenaMon): number => matchup(foe.attackType, mon) - matchup(mon.attackType, foe) * 0.5 - mon.hp / mon.maxHp;
  let best = -1;
  let bestRisk = risk(current) - 0.75;
  team.mons.forEach((mon, index) => {
    if (index === team.active || mon.hp <= 0) return;
    const value = risk(mon);
    if (value < bestRisk) {
      best = index;
      bestRisk = value;
    }
  });
  return best;
}

export function createArenaBot(side: ArenaSide, skill: number): (state: ArenaState, dtMs: number) => ArenaInput {
  const thinkMs = THINK_SLOW_MS + (THINK_FAST_MS - THINK_SLOW_MS) * Math.max(0, Math.min(1, skill));
  const foeSide: ArenaSide = side === 0 ? 1 : 0;
  let wait = 0;
  let dx = 0;
  let dy = 0;

  return (state, dtMs) => {
    if (state.winner !== null || state.countdownMs > 0) return NO_INPUT;
    wait -= dtMs;
    if (wait > 0) return { dx, dy, switchTo: -1 };
    wait = thinkMs;

    const team = state.sides[side];
    const foeTeam = state.sides[foeSide];
    const mon = team.mons[team.active];
    const foe = foeTeam.mons[foeTeam.active];
    if (!mon || !foe) return NO_INPUT;

    const toFoeX = foeTeam.x - team.x;
    const toFoeY = foeTeam.y - team.y;
    const dist = Math.hypot(toFoeX, toFoeY) || 1;
    const gap = dist - wantedDistance(mon, team.trailMs > 0);
    // Anda de lado em volta do alvo, trocando de sentido de tempos em tempos: é o que também enche a Trilha.
    const strafe = Math.floor(state.timeMs / STRAFE_EVERY_MS) % 2 === 0 ? 1 : -1;
    const forward = Math.max(-1, Math.min(1, gap / 40));
    let moveX = (toFoeX / dist) * forward - (toFoeY / dist) * strafe * 0.7;
    let moveY = (toFoeY / dist) * forward + (toFoeX / dist) * strafe * 0.7;

    // Sair do círculo marcado vem antes de tudo: é o aviso mais claro que a arena dá.
    for (const marker of state.markers) {
      if (marker.side === side) continue;
      const away = Math.hypot(team.x - marker.x, team.y - marker.y) || 1;
      if (away <= marker.radius + SV_MON_RADIUS + 10) {
        moveX = (team.x - marker.x) / away;
        moveY = (team.y - marker.y) / away;
      }
    }

    let danger = false;
    let closest = Infinity;
    for (const shot of state.shots) {
      if (shot.side === side) continue;
      const d = Math.hypot(team.x - shot.x, team.y - shot.y);
      const approaching = (team.x - shot.x) * shot.vx + (team.y - shot.y) * shot.vy > 0;
      if (!approaching || d > DODGE_RANGE) continue;
      closest = Math.min(closest, d);
      if (!danger) {
        const speed = Math.hypot(shot.vx, shot.vy) || 1;
        moveX = (-shot.vy / speed) * strafe;
        moveY = (shot.vx / speed) * strafe;
        danger = true;
      }
    }

    // Longe da parede o desvio tem para onde ir.
    if (team.x < SV_MON_RADIUS * 2) moveX = Math.abs(moveX);
    if (team.x > SV_ARENA_W - SV_MON_RADIUS * 2) moveX = -Math.abs(moveX);
    if (team.y < SV_MON_RADIUS * 2) moveY = Math.abs(moveY);
    if (team.y > SV_ARENA_H - SV_MON_RADIUS * 2) moveY = -Math.abs(moveY);
    dx = moveX;
    dy = moveY;

    const reserve = canSwitch(state, side, 0) || team.switchCdMs <= 0 ? betterReserve(state, side, foe) : -1;
    const alt = mon.alt;
    const swapAttack = !!alt && canSwapAttack(state, side) && matchup(alt.attackType, foe) > matchup(mon.attackType, foe);
    const shield = closest <= GUARD_RANGE && mon.hp / mon.maxHp < 0.4 && canGuard(state, side);
    return { dx, dy, switchTo: reserve, shield, swapAttack };
  };
}
