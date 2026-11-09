import { typeEffectiveness } from './battle';
import { arenaSpecialOf } from './arena-specials';
import { distanceToSegment } from './survivor-charge';
import { inSurvivorCone } from './survivor-shapes';
import { canDodge, canGuard, canSpecial, canSwapAttack, NO_INPUT, SV_ARENA_H, SV_ARENA_W, SV_DODGE_MS, SV_MON_RADIUS } from './survivor-pvp';
import type { ArenaInput, ArenaMon, ArenaSide, ArenaState } from './survivor-pvp';

/**
 * O rival da luta da Arena. Usa os mesmos controles de uma pessoa (andar, trocar de Pokémon, escudo, trocar de ataque) e só
 * lê o que está na tela. `skill` (0 a 1) encurta o tempo de reação: líderes da Liga decidem mais rápido que um treino.
 * Sem sorteio: a mesma luta com as mesmas entradas dá o mesmo resultado. O ritmo varia por uma conta sobre o relógio da
 * luta, e os rivais espertos guardam o Especial para a hora em que a esquiva de quem joga está recarregando.
 */

const THINK_SLOW_MS = 650;
const THINK_FAST_MS = 200;
/** Quanto dura cada direção andando de lado: um intervalo fixo vira um ritmo que dá para decorar. */
const STRAFE_MIN_MS = 900;
const STRAFE_MAX_MS = 2600;
/** Distância em que o rival começa a desviar: um rival mais esperto vê o golpe chegando de mais longe. */
const DODGE_NEAR = 50;
const DODGE_FAR = 130;
const GUARD_RANGE = 46;
/** Depois de trocar por vontade própria, fica um tempo em campo: o rival não vira uma roleta de Pokémon. */
const SWITCH_MIN_STAY_MS = 14_000;
/** Quanto tempo o rival esperto segura o Especial à espera de uma abertura, antes de lançar assim mesmo. */
const SPECIAL_HOLD_MS = 5000;

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
function betterReserve(state: ArenaState, side: ArenaSide, foe: ArenaMon, margin: number): number {
  const team = state.sides[side];
  const current = team.mons[team.active];
  if (!current) return -1;
  const risk = (mon: ArenaMon): number => matchup(foe.attackType, mon) - matchup(mon.attackType, foe) * 0.5 - mon.hp / mon.maxHp;
  let best = -1;
  let bestRisk = risk(current) - margin;
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

/** Número entre 0 e 1 que só depende das entradas: a mesma luta anda igual, mas sem um padrão fixo. */
function mix(a: number, b: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** O que o rival sabe fazer. Tudo ligado por padrão; os testes desligam um de cada vez para medir quanto cada um rende. */
export interface ArenaBotTraits {
  dodge: boolean;
  switching: boolean;
  guard: boolean;
  swapAttack: boolean;
  dash: boolean;
  special: boolean;
  /** Muda o ritmo: aperta, recua e troca o lado sem seguir um relógio. */
  variety: boolean;
  /** Segura o Especial até o alvo ficar sem esquiva, atordoado, lento ou quase caindo. */
  ambush: boolean;
}

export function createArenaBot(side: ArenaSide, skill: number, traits: Partial<ArenaBotTraits> = {}): (state: ArenaState, dtMs: number) => ArenaInput {
  const can: ArenaBotTraits = { dodge: true, switching: true, guard: true, swapAttack: true, dash: true, special: true, variety: true, ambush: true, ...traits };
  const level = Math.max(0, Math.min(1, skill));
  const thinkMs = THINK_SLOW_MS + (THINK_FAST_MS - THINK_SLOW_MS) * level;
  const dodgeRange = DODGE_NEAR + (DODGE_FAR - DODGE_NEAR) * level;
  // Quem é fraco só usa o escudo quase caindo; quem é forte guarda antes.
  const guardBelow = 0.2 + 0.35 * level;
  // Trocar de Pokémon e de ataque pelo tipo é o que mais decide a luta (medido em `arena-prep.test.ts`): o rival fraco
  // quase não faz isso, o forte faz sempre que vale.
  const switchMargin = 1.6 - level * 1.2;
  const swapsAttack = level >= 0.25;
  // A esquiva pede reflexo: o rival fraco não usa, e o forte espera o golpe estar mais perto para não gastar à toa.
  const dashes = level >= 0.3;
  const dashTrigger = 34 + 46 * level;
  // O rival fraco é o mais previsível de propósito: é contra ele que se aprende.
  const varies = can.variety && level >= 0.3;
  const ambushes = can.ambush && level >= 0.5;
  let lastSwitchMs = -Infinity;
  let strafeUntil = 0;
  let strafeDir = 1;
  let beat = 0;
  /** Quão perto joga agora: 1 é o normal, menos é apertar, mais é recuar. */
  let stance = 1;
  let foeDodgeSeen = false;
  let specialSince = Infinity;
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
    // Anda de lado em volta do alvo, trocando de sentido de tempos em tempos: é o que também enche a Trilha.
    if (state.timeMs >= strafeUntil) {
      beat++;
      const seed = side + team.active * 7 + 1;
      const roll = varies ? mix(beat, seed) : 0.45;
      strafeUntil = state.timeMs + STRAFE_MIN_MS + (STRAFE_MAX_MS - STRAFE_MIN_MS) * roll;
      strafeDir = varies ? (mix(beat * 3, seed) < 0.5 ? 1 : -1) : -strafeDir;
      stance = varies ? 0.7 + mix(beat * 5, seed) * 0.6 : 1;
    }
    // Quem esquiva muda o lado do rival esperto: ele não fica correndo para onde o alvo estava.
    const foeDodging = foeTeam.dodgeMs > 0;
    if (level >= 0.6 && foeDodging && !foeDodgeSeen) strafeDir = -strafeDir;
    foeDodgeSeen = foeDodging;
    const strafe = strafeDir;
    const gap = dist - wantedDistance(mon, team.trailMs > 0) * stance;
    const useSpecial = can.special && canSpecial(state, side);
    if (!useSpecial) specialSince = Infinity;
    else if (specialSince === Infinity) specialSince = state.timeMs;
    const special = arenaSpecialOf(mon.attackType);
    const foeHelpless = foeTeam.stunMs > 0;
    // Com o Especial à mão, ou com o alvo atordoado, vai para perto em vez de ficar rodeando.
    const forward = foeHelpless && !mon.moveCategory?.includes('projetil') ? 1 : Math.max(-1, Math.min(1, gap / 40));
    const closing = useSpecial && dist > special.reach * 0.85 ? 1 : forward;
    let moveX = (toFoeX / dist) * closing - (toFoeY / dist) * strafe * 0.7;
    let moveY = (toFoeY / dist) * closing + (toFoeX / dist) * strafe * 0.7;
    let wantDash = false;

    // Sair do que está marcado no chão vem antes de tudo: é o aviso mais claro que a arena dá.
    let wantGuard = false;
    for (const marker of state.markers) {
      if (marker.side === side) continue;
      if (marker.kind === 'cone') {
        if (level < 0.25 || !inSurvivorCone({ x: marker.x, y: marker.y, aimAngle: marker.angle ?? 0, facing: 1 }, team.x, team.y, marker.radius + 8, SV_MON_RADIUS)) continue;
        // O leque é largo perto de quem bate: a saída é pelo lado.
        const ax = Math.cos(marker.angle ?? 0);
        const ay = Math.sin(marker.angle ?? 0);
        const off = (team.x - marker.x) * -ay + (team.y - marker.y) * ax >= 0 ? 1 : -1;
        moveX = -ay * off;
        moveY = ax * off;
        if (marker.leftMs <= thinkMs + SV_DODGE_MS) wantDash = true;
        if (marker.special && marker.leftMs <= thinkMs) wantGuard = true;
        continue;
      }
      const away = Math.hypot(team.x - marker.x, team.y - marker.y) || 1;
      if (marker.kind === 'aura' && level < 0.25) continue;
      if (away <= marker.radius + SV_MON_RADIUS + 10) {
        moveX = (team.x - marker.x) / away;
        moveY = (team.y - marker.y) / away;
        // Andando não dá tempo de sair: a esquiva resolve, e o rival esperto espera o último instante.
        if (marker.radius + SV_MON_RADIUS - away > (mon.speed * marker.leftMs) / 1000 && marker.leftMs <= Math.max(thinkMs + SV_DODGE_MS, level < 0.5 ? 1500 : 0)) wantDash = true;
        if (marker.special && marker.leftMs <= thinkMs) wantGuard = true;
      }
    }

    // O feixe marcado também é aviso na tela: sai para o lado da linha em que já está.
    for (const beam of state.beams) {
      if (beam.side === side || level < 0.2) continue;
      const reach = beam.width + SV_MON_RADIUS;
      const off = distanceToSegment(team.x, team.y, beam.x0, beam.y0, beam.x1, beam.y1);
      if (off > reach + 8) continue;
      const bx = beam.x1 - beam.x0;
      const by = beam.y1 - beam.y0;
      const len = Math.hypot(bx, by) || 1;
      const sign = (team.x - beam.x0) * -by + (team.y - beam.y0) * bx >= 0 ? 1 : -1;
      moveX = (-by / len) * sign;
      moveY = (bx / len) * sign;
      if (reach - off > (mon.speed * beam.leftMs) / 1000) {
        wantDash = true;
        if (beam.special && beam.leftMs <= thinkMs) wantGuard = true;
      }
    }

    let danger = false;
    let closest = Infinity;
    for (const shot of state.shots) {
      if (shot.side === side) continue;
      const d = Math.hypot(team.x - shot.x, team.y - shot.y);
      const approaching = (team.x - shot.x) * shot.vx + (team.y - shot.y) * shot.vy > 0;
      if (!approaching || d > dodgeRange) continue;
      const speed = Math.hypot(shot.vx, shot.vy) || 1;
      // Distância entre o Pokémon e a linha do tiro: longe dela, o tiro passa reto e não vale desviar.
      const cross = ((team.x - shot.x) * shot.vy - (team.y - shot.y) * shot.vx) / speed;
      if (Math.abs(cross) > SV_MON_RADIUS + shot.radius + 6) continue;
      closest = Math.min(closest, d);
      if (can.dodge && !danger) {
        // Sai para o lado da linha em que já está, nunca atravessando o tiro.
        const away = cross >= 0 ? -1 : 1;
        moveX = (-shot.vy / speed) * away;
        moveY = (shot.vx / speed) * away;
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

    // Quem está voltando à bola não é o adversário de verdade: espera a troca dele acabar antes de responder.
    const mayStay = state.timeMs - lastSwitchMs >= SWITCH_MIN_STAY_MS;
    const reserve = can.switching && team.switchCdMs <= 0 && foeTeam.swapMs <= 0 && mayStay ? betterReserve(state, side, foe, switchMargin) : -1;
    if (reserve >= 0) lastSwitchMs = state.timeMs;
    const alt = mon.alt;
    const swapAttack = can.swapAttack && swapsAttack && !!alt && canSwapAttack(state, side) && matchup(alt.attackType, foe) > matchup(mon.attackType, foe);
    const dodge = can.dash && dashes && reserve < 0 && (wantDash || closest <= dashTrigger) && canDodge(state, side);
    // Quando não dá para sair nem esquivar, o rival esperto segura o golpe grande com o escudo.
    const blockSpecial = wantGuard && level >= 0.4 && !dodge;
    const shield = can.guard && canGuard(state, side) && ((closest <= GUARD_RANGE && mon.hp / mon.maxHp < guardBelow) || blockSpecial);
    const foeImmune = foeTeam.shieldMs > 0 || foeTeam.guardMs > 0 || foeTeam.swapMs > 0;
    // A abertura: o alvo acabou de gastar a esquiva, não consegue andar direito, ou está por um fio.
    const opening = foeTeam.dodgeCdMs > 0 || foeTeam.stunMs > 0 || foeTeam.slowMs > 0 || foe.hp / foe.maxHp < 0.3;
    const held = ambushes && !opening && state.timeMs - specialSince < SPECIAL_HOLD_MS;
    // Só o rival esperto segura o Especial enquanto o alvo está protegido.
    const launch = useSpecial && reserve < 0 && dist <= special.reach && !held && !(level >= 0.5 && foeImmune);
    return { dx, dy, switchTo: reserve, shield, swapAttack, dodge, special: launch };
  };
}
