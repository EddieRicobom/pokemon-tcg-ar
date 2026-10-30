/**
 * Duelo por turnos da Arena, como nos jogos (regras da Gen VI em diante, simplificadas; ver `docs/ARENA_REGRAS.md`): um
 * Pokémon de cada lado em campo, o jogador escolhe a cada turno um dos (até) 4 golpes que montou ou troca de Pokémon; o
 * oponente responde. Prioridade, Velocidade, estágios de atributo (−6 a +6), crítico por estágio, condições (queimadura,
 * veneno, paralisia, congelamento, sono e confusão), hesitar, dreno, recuo, cura, vários golpes por turno e PP. Os efeitos
 * vêm dos dados da PokéAPI de cada golpe (`ChosenMove`). Puro e determinístico: o sorteio vem de fora e cada turno devolve
 * um estado novo e a lista de eventos para a tela narrar.
 */
import { canGetStatus, effectivenessLabel, STATUS_LABELS_PT, typeEffectiveness } from './battle';
import type { Fighter, Rng, StatusKind } from './battle';
import { STAGE_LABELS_PT, STAGE_STATS } from './moveset';
import type { ChosenMove, MoveAilment, StageStat } from './moveset';
import type { PokemonType } from './pokemon-data';

export type SideIndex = 0 | 1;

/** Condições que ficam até o fim do duelo (uma por Pokémon). A confusão é à parte e some ao trocar. */
export type DuelStatus = StatusKind | 'sleep';
export const DUEL_STATUS_LABELS_PT: Record<DuelStatus, string> = { ...STATUS_LABELS_PT, sleep: 'Dormindo' };
export const DUEL_STATUS_SHORT_PT: Record<DuelStatus, string> = { burn: 'QUE', poison: 'ENV', paralysis: 'PAR', freeze: 'CGL', sleep: 'DOR' };

export type Stages = Record<StageStat, number>;

/** Pokémon pronto para o duelo: atributos do jogo e os golpes escolhidos (com o PP de cada um). */
export interface DuelMon {
  fighter: Fighter;
  moves: ChosenMove[];
}

export interface DuelMonState {
  hp: number;
  pp: number[];
  status: DuelStatus | null;
  /** Turnos de sono que ainda faltam. */
  sleepTurns: number;
  /** Turnos de confusão que ainda faltam (0 = não está confuso). */
  confusion: number;
  stages: Stages;
  /** Já usou o "aguentou firme" (intimidade 4) neste duelo. */
  endured: boolean;
}

export interface DuelSide {
  name: string;
  mons: DuelMon[];
  state: DuelMonState[];
  active: number;
}

export interface DuelState {
  sides: [DuelSide, DuelSide];
  turn: number;
  winner: SideIndex | null;
  /** O seu Pokémon em campo desmaiou e você precisa escolher quem entra. */
  mustSwitch: boolean;
}

/** Ação de um turno. `move: -1` é o Struggle, só quando nenhum golpe tem PP. */
export type DuelAction = { kind: 'move'; move: number } | { kind: 'switch'; to: number };

type Who = { side: SideIndex; mon: number };
export type DuelEvent =
  | ({ kind: 'switch'; from: number; to: number; forced: boolean } & { side: SideIndex })
  | ({ kind: 'move'; move: ChosenMove; struggle: boolean } & Who)
  | ({ kind: 'miss' } & Who)
  | ({ kind: 'hit'; damage: number; critical: boolean; effectiveness: number; hpBefore: number; hpAfter: number; endured: boolean } & Who)
  | ({ kind: 'multi'; hits: number } & Who)
  | ({ kind: 'immune' } & Who)
  | ({ kind: 'fail' } & Who)
  | ({ kind: 'skip'; cause: 'freeze' | 'paralysis' | 'sleep' | 'flinch' } & Who)
  | ({ kind: 'thaw' } & Who)
  | ({ kind: 'wake' } & Who)
  | ({ kind: 'status'; status: MoveAilment } & Who)
  | ({ kind: 'confused' } & Who)
  | ({ kind: 'confusion-hit'; damage: number; hpBefore: number; hpAfter: number } & Who)
  | ({ kind: 'confusion-end' } & Who)
  | ({ kind: 'stage'; stat: StageStat; change: number; applied: number } & Who)
  | ({ kind: 'heal'; cause: 'drain' | 'heal'; hpBefore: number; hpAfter: number } & Who)
  | ({ kind: 'residual'; cause: 'burn' | 'poison'; damage: number; hpBefore: number; hpAfter: number } & Who)
  | ({ kind: 'recoil'; damage: number; hpBefore: number; hpAfter: number } & Who)
  | ({ kind: 'faint' } & Who)
  | { kind: 'end'; winner: SideIndex };

const NO_EFFECT = {
  priority: 0, ailment: null, ailmentChance: 0, flinchChance: 0, statChanges: [], statChance: 0, drain: 0, healing: 0, critRate: 0, minHits: 1, maxHits: 1,
} as const;

/** Golpe de quem ficou sem PP em todos: sem tipo (sempre dano normal), nunca erra e machuca quem usa (1/4 dos PS). */
export const STRUGGLE: ChosenMove = { slug: 'struggle', name: 'Struggle', type: 'normal', power: 50, accuracy: null, pp: 1, damageClass: 'physical', ...NO_EFFECT, statChanges: [] };
export const STRUGGLE_RECOIL = 1 / 4;
/** Golpe que o confuso dá em si mesmo. */
const CONFUSION_POWER = 40;
export const CONFUSION_SELF_HIT = 1 / 3;
export const PARALYSIS_SKIP = 1 / 4;
export const THAW = 1 / 5;
export const RESIDUAL: Record<'burn' | 'poison', number> = { burn: 1 / 16, poison: 1 / 8 };
/** Chance de crítico por estágio (0, +1, +2, +3 ou mais). */
export const CRIT_BY_STAGE = [1 / 24, 1 / 8, 1 / 2, 1] as const;
const LEVEL = 50;

const emptyStages = (): Stages => ({ attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0, accuracy: 0, evasion: 0 });

/** Multiplicador de um estágio de Atq./Def./Atq. Esp./Def. Esp./Vel.: +1 = ×1,5; −1 = ×2/3. */
export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}
/** Multiplicador de precisão/evasão: +1 = ×4/3; −1 = ×3/4. */
export function accuracyMultiplier(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
}

/** Monta o Pokémon do duelo com os golpes escolhidos. */
export function duelMonFrom(fighter: Fighter, moves: readonly ChosenMove[]): DuelMon {
  if (moves.length === 0) throw new Error(`${fighter.name} precisa de pelo menos 1 golpe.`);
  return {
    fighter: { ...fighter, notes: fighter.notes.filter((n) => !n.includes('ataques da carta') && !n.includes('sem golpes')) },
    moves: moves.map((m) => ({ ...m, statChanges: m.statChanges.map((c) => ({ ...c })) })),
  };
}

const freshMon = (m: DuelMon): DuelMonState => ({ hp: m.fighter.maxHp, pp: m.moves.map((x) => x.pp), status: null, sleepTurns: 0, confusion: 0, stages: emptyStages(), endured: false });

function freshSide(name: string, mons: readonly DuelMon[]): DuelSide {
  if (mons.length === 0) throw new Error('Cada lado do duelo precisa de pelo menos 1 Pokémon.');
  for (const mon of mons) if (mon.moves.length === 0) throw new Error(`${mon.fighter.name} está sem golpes.`);
  return { name, mons: [...mons], state: mons.map(freshMon), active: 0 };
}

export function createDuel(player: { name: string; mons: readonly DuelMon[] }, foe: { name: string; mons: readonly DuelMon[] }): DuelState {
  return { sides: [freshSide(player.name, player.mons), freshSide(foe.name, foe.mons)], turn: 0, winner: null, mustSwitch: false };
}

function cloneState(state: DuelState): DuelState {
  const side = (s: DuelSide): DuelSide => ({ ...s, state: s.state.map((m) => ({ ...m, pp: [...m.pp], stages: { ...m.stages } })) });
  return { ...state, sides: [side(state.sides[0]), side(state.sides[1])] };
}

const other = (side: SideIndex): SideIndex => (side === 0 ? 1 : 0);

export function activeMon(state: DuelState, side: SideIndex): { mon: DuelMon; live: DuelMonState; index: number } {
  const s = state.sides[side];
  return { mon: s.mons[s.active]!, live: s.state[s.active]!, index: s.active };
}

/** Nenhum golpe do Pokémon em campo tem PP: só resta o Struggle. */
export function needsStruggle(state: DuelState, side: SideIndex): boolean {
  return activeMon(state, side).live.pp.every((pp) => pp <= 0);
}

/** Quem pode entrar em campo (de pé e fora de campo). */
export function switchOptions(state: DuelState, side: SideIndex): number[] {
  const s = state.sides[side];
  return s.state.flatMap((m, i) => (m.hp > 0 && i !== s.active ? [i] : []));
}

/** Por que a ação não vale agora (ou null se vale). */
export function actionBlocker(state: DuelState, side: SideIndex, action: DuelAction): string | null {
  if (state.winner !== null) return 'O duelo já acabou.';
  if (side === 0 && state.mustSwitch && action.kind !== 'switch') return 'Escolha quem entra no lugar do Pokémon que desmaiou.';
  if (action.kind === 'switch') return switchOptions(state, side).includes(action.to) ? null : 'Esse Pokémon não pode entrar agora.';
  const { mon, live } = activeMon(state, side);
  if (action.move === -1) return needsStruggle(state, side) ? null : 'Ainda há golpes com PP.';
  if (!mon.moves[action.move]) return 'Golpe inexistente.';
  return (live.pp[action.move] ?? 0) > 0 ? null : 'Este golpe está sem PP.';
}

/** Velocidade em campo: estágio de Velocidade e paralisia (×0,5). */
export function effectiveSpeed(state: DuelState, side: SideIndex): number {
  const { mon, live } = activeMon(state, side);
  return mon.fighter.speed * stageMultiplier(live.stages.speed) * (live.status === 'paralysis' ? 0.5 : 1);
}

/**
 * Quem age primeiro se o seu usar este golpe e o oponente um golpe de prioridade 0 (só para a dica do menu: o oponente
 * pode usar um golpe de prioridade). 'tie' = Velocidade igual, decidido no sorteio.
 */
export function orderHint(state: DuelState, moveIndex: number): 'first' | 'second' | 'tie' {
  const move = moveIndex === -1 ? STRUGGLE : activeMon(state, 0).mon.moves[moveIndex];
  const priority = move?.priority ?? 0;
  if (priority !== 0) return priority > 0 ? 'first' : 'second';
  const mine = effectiveSpeed(state, 0);
  const theirs = effectiveSpeed(state, 1);
  return mine === theirs ? 'tie' : mine > theirs ? 'first' : 'second';
}

function moveOf(state: DuelState, side: SideIndex, action: { move: number }): ChosenMove {
  return action.move === -1 ? STRUGGLE : activeMon(state, side).mon.moves[action.move]!;
}

/** O golpe precisa acertar o alvo (dano, condição ou atributo do alvo)? Golpes só em si mesmo sempre funcionam. */
function targetsFoe(move: ChosenMove): boolean {
  return move.damageClass !== 'status' || move.ailment !== null || move.statChanges.some((c) => c.target === 'foe');
}

interface DamageResult { damage: number; critical: boolean; effectiveness: number }

function computeDamage(att: DuelMon, attLive: DuelMonState, def: DuelMon, defLive: DuelMonState, move: ChosenMove, struggle: boolean, rng: Rng): DamageResult {
  const effectiveness = struggle ? 1 : typeEffectiveness(move.type, def.fighter.types);
  const critStage = Math.min(3, move.critRate + ((att.fighter.bond ?? 0) >= 3 ? 1 : 0));
  const critical = rng() < CRIT_BY_STAGE[critStage]!;
  const roll = 0.85 + rng() * 0.15;
  if (effectiveness === 0) return { damage: 0, critical: false, effectiveness };
  const physical = move.damageClass === 'physical';
  let aStage = attLive.stages[physical ? 'attack' : 'spAttack'];
  let dStage = defLive.stages[physical ? 'defense' : 'spDefense'];
  if (critical) {
    // Crítico ignora a queda de quem ataca e a alta de quem defende.
    aStage = Math.max(0, aStage);
    dStage = Math.min(0, dStage);
  }
  const a = (physical ? att.fighter.attack : att.fighter.spAttack) * stageMultiplier(aStage);
  const d = (physical ? def.fighter.defense : def.fighter.spDefense) * stageMultiplier(dStage);
  const base = (Math.floor((2 * LEVEL) / 5) + 2) * move.power * (a / d) / 50 + 2;
  const stab = !struggle && att.fighter.types.includes(move.type) ? 1.5 : 1;
  const burn = attLive.status === 'burn' && physical ? 0.5 : 1;
  return { damage: Math.max(1, Math.floor(base * stab * effectiveness * (critical ? 1.5 : 1) * roll * burn)), critical, effectiveness };
}

/** Dano esperado por uso (sem crítico, variação média, ponderado pela precisão e pelo número médio de golpes). */
export function expectedDuelDamage(state: DuelState, side: SideIndex, move: ChosenMove): number {
  if (move.damageClass === 'status') return 0;
  const me = activeMon(state, side);
  const foe = activeMon(state, other(side));
  const eff = typeEffectiveness(move.type, foe.mon.fighter.types);
  if (eff === 0) return 0;
  const physical = move.damageClass === 'physical';
  const a = (physical ? me.mon.fighter.attack : me.mon.fighter.spAttack) * stageMultiplier(me.live.stages[physical ? 'attack' : 'spAttack']);
  const d = (physical ? foe.mon.fighter.defense : foe.mon.fighter.spDefense) * stageMultiplier(foe.live.stages[physical ? 'defense' : 'spDefense']);
  const base = (Math.floor((2 * LEVEL) / 5) + 2) * move.power * (a / d) / 50 + 2;
  const stab = me.mon.fighter.types.includes(move.type) ? 1.5 : 1;
  const burn = me.live.status === 'burn' && physical ? 0.5 : 1;
  const accuracy = move.accuracy === null ? 1 : Math.min(1, (move.accuracy / 100) * accuracyMultiplier(me.live.stages.accuracy - foe.live.stages.evasion));
  return base * stab * eff * 0.925 * burn * accuracy * ((move.minHits + move.maxHits) / 2);
}

/**
 * Golpe de status barrado pelo tipo do alvo. Nos jogos, golpes de status ignoram a tabela de tipos; a exceção comum é a
 * dos golpes elétricos que paralisam (Onda Trovão não afeta tipo Terra).
 */
export function statusBlockedByType(move: ChosenMove, types: readonly PokemonType[]): boolean {
  return move.damageClass === 'status' && move.type === 'electric' && move.ailment !== null && typeEffectiveness(move.type, types) === 0;
}

function canInflict(target: DuelMon, live: DuelMonState, ailment: MoveAilment): boolean {
  if (ailment === 'confusion') return live.confusion === 0;
  if (live.status !== null) return false;
  return ailment === 'sleep' || canGetStatus(ailment, target.fighter.types);
}

/**
 * Ação do oponente: um golpe com PP, sorteado com peso pelo que ele rende agora — dano esperado, condição num alvo que
 * ainda pode recebê-la, alta de atributo com os PS altos, queda no alvo, cura com os PS baixos. Nunca troca.
 */
export function chooseFoeAction(state: DuelState, rng: Rng, side: SideIndex = 1): DuelAction {
  if (needsStruggle(state, side)) return { kind: 'move', move: -1 };
  const me = activeMon(state, side);
  const foe = activeMon(state, other(side));
  const options = me.mon.moves.map((m, i) => ({ m, i })).filter(({ i }) => (me.live.pp[i] ?? 0) > 0);
  const best = Math.max(30, ...me.mon.moves.map((m) => expectedDuelDamage(state, side, m)));
  const hpFrac = me.live.hp / me.mon.fighter.maxHp;
  const value = (m: ChosenMove): number => {
    if (m.damageClass !== 'status') return expectedDuelDamage(state, side, m);
    let v = 0;
    if (m.ailment && !statusBlockedByType(m, foe.mon.fighter.types) && canInflict(foe.mon, foe.live, m.ailment)) v = Math.max(v, best * (m.ailment === 'confusion' ? 0.5 : 0.7));
    for (const c of m.statChanges) {
      if (c.target === 'self' && c.change > 0 && hpFrac > 0.6 && me.live.stages[c.stat] < 2) v = Math.max(v, best * 0.6);
      if (c.target === 'foe' && c.change < 0 && foe.live.stages[c.stat] > -2) v = Math.max(v, best * 0.4);
    }
    if (m.healing > 0 && hpFrac < 0.5) v = Math.max(v, best * 0.9);
    return v;
  };
  const weights = options.map(({ m }) => (value(m) + 1) ** 2);
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (const [k, option] of options.entries()) {
    r -= weights[k]!;
    if (r <= 0) return { kind: 'move', move: option.i };
  }
  return { kind: 'move', move: options[options.length - 1]!.i };
}

const aliveCount = (side: DuelSide): number => side.state.filter((m) => m.hp > 0).length;

/** Quem sai de campo perde os estágios e a confusão (a condição fica). */
function leaveField(live: DuelMonState): void {
  live.stages = emptyStages();
  live.confusion = 0;
}

/**
 * Resolve um turno: trocas primeiro; depois os golpes por prioridade e, dentro dela, Velocidade (empate exato: sorteio);
 * condições que impedem de agir, confusão, PP, precisão com estágios, dano (vários golpes), dreno, recuo, hesitar,
 * condições e estágios causados, cura, desmaios, queimadura/veneno no fim do turno e a entrada do próximo Pokémon do
 * oponente. Se o seu desmaiar e houver outro, `mustSwitch` fica ligado.
 */
export function resolveTurn(state: DuelState, playerAction: DuelAction, foeAction: DuelAction, rng: Rng): { state: DuelState; events: DuelEvent[] } {
  const playerBlock = actionBlocker(state, 0, playerAction);
  if (playerBlock) throw new Error(playerBlock);
  if (state.mustSwitch) throw new Error('Use sendReplacement para pôr o próximo Pokémon em campo.');
  const foeBlock = actionBlocker(state, 1, foeAction);
  if (foeBlock) throw new Error(foeBlock);
  const next = cloneState(state);
  next.turn++;
  const events: DuelEvent[] = [];
  const actions: Record<SideIndex, DuelAction> = { 0: playerAction, 1: foeAction };
  const acted = new Set<SideIndex>();
  const flinched = new Set<SideIndex>();
  let lastAttacker: SideIndex | null = null;

  for (const side of [0, 1] as const) {
    const action = actions[side];
    if (action.kind !== 'switch') continue;
    const s = next.sides[side];
    leaveField(s.state[s.active]!);
    events.push({ kind: 'switch', side, from: s.active, to: action.to, forced: false });
    s.active = action.to;
    acted.add(side);
  }

  const movers = ([0, 1] as const).filter((side) => actions[side].kind === 'move');
  const prio = (side: SideIndex) => moveOf(next, side, actions[side] as { move: number }).priority;
  let order = movers;
  if (movers.length === 2) {
    const [a, b] = movers as unknown as [SideIndex, SideIndex];
    const byPriority = prio(a) - prio(b);
    const bySpeed = effectiveSpeed(next, a) - effectiveSpeed(next, b);
    const aFirst = byPriority !== 0 ? byPriority > 0 : bySpeed !== 0 ? bySpeed > 0 : rng() < 0.5;
    order = aFirst ? [a, b] : [b, a];
  }

  const damageHp = (live: DuelMonState, amount: number): { before: number; after: number } => {
    const before = live.hp;
    live.hp = Math.max(0, before - amount);
    return { before, after: live.hp };
  };

  const applyStage = (side: SideIndex, stat: StageStat, change: number) => {
    const { live, index } = activeMon(next, side);
    const before = live.stages[stat];
    const after = Math.max(-6, Math.min(6, before + change));
    live.stages[stat] = after;
    events.push({ kind: 'stage', side, mon: index, stat, change, applied: after - before });
    return after !== before;
  };

  const inflict = (side: SideIndex, ailment: MoveAilment): boolean => {
    const { mon, live, index } = activeMon(next, side);
    if (live.hp <= 0 || !canInflict(mon, live, ailment)) return false;
    if (ailment === 'confusion') live.confusion = 2 + Math.floor(rng() * 4);
    else {
      live.status = ailment;
      if (ailment === 'sleep') live.sleepTurns = 1 + Math.floor(rng() * 3);
    }
    events.push({ kind: 'status', side, mon: index, status: ailment });
    return true;
  };

  for (const side of order) {
    const action = actions[side] as { kind: 'move'; move: number };
    const me = activeMon(next, side);
    const foeSide = other(side);
    if (me.live.hp <= 0) continue;
    if (activeMon(next, foeSide).live.hp <= 0) continue;
    acted.add(side);

    if (me.live.status === 'sleep') {
      if (me.live.sleepTurns <= 0) {
        me.live.status = null;
        events.push({ kind: 'wake', side, mon: me.index });
      } else {
        me.live.sleepTurns--;
        events.push({ kind: 'skip', side, mon: me.index, cause: 'sleep' });
        continue;
      }
    } else if (me.live.status === 'freeze') {
      if (rng() < THAW) {
        me.live.status = null;
        events.push({ kind: 'thaw', side, mon: me.index });
      } else {
        events.push({ kind: 'skip', side, mon: me.index, cause: 'freeze' });
        continue;
      }
    }
    if (flinched.has(side)) {
      events.push({ kind: 'skip', side, mon: me.index, cause: 'flinch' });
      continue;
    }
    if (me.live.status === 'paralysis' && rng() < PARALYSIS_SKIP) {
      events.push({ kind: 'skip', side, mon: me.index, cause: 'paralysis' });
      continue;
    }
    if (me.live.confusion > 0) {
      me.live.confusion--;
      if (me.live.confusion === 0) {
        events.push({ kind: 'confusion-end', side, mon: me.index });
      } else {
        events.push({ kind: 'confused', side, mon: me.index });
        if (rng() < CONFUSION_SELF_HIT) {
          const a = me.mon.fighter.attack * stageMultiplier(me.live.stages.attack);
          const d = me.mon.fighter.defense * stageMultiplier(me.live.stages.defense);
          const amount = Math.max(1, Math.floor(((Math.floor((2 * LEVEL) / 5) + 2) * CONFUSION_POWER * (a / d) / 50 + 2) * (0.85 + rng() * 0.15)));
          const { before, after } = damageHp(me.live, amount);
          events.push({ kind: 'confusion-hit', side, mon: me.index, damage: before - after, hpBefore: before, hpAfter: after });
          if (after === 0) events.push({ kind: 'faint', side, mon: me.index });
          continue;
        }
      }
    }

    const struggle = action.move === -1;
    const move = moveOf(next, side, action);
    if (!struggle) me.live.pp[action.move] = Math.max(0, me.live.pp[action.move]! - 1);
    events.push({ kind: 'move', side, mon: me.index, move, struggle });
    lastAttacker = side;
    const foe = activeMon(next, foeSide);

    if (targetsFoe(move) && move.accuracy !== null) {
      const chance = (move.accuracy / 100) * accuracyMultiplier(me.live.stages.accuracy - foe.live.stages.evasion);
      if (rng() >= chance) {
        events.push({ kind: 'miss', side, mon: me.index });
        continue;
      }
    }

    if (move.damageClass !== 'status') {
      const hits = move.minHits + Math.floor(rng() * (move.maxHits - move.minHits + 1));
      let total = 0;
      let landed = 0;
      for (let h = 0; h < hits && foe.live.hp > 0; h++) {
        const roll = computeDamage(me.mon, me.live, foe.mon, foe.live, move, struggle, rng);
        if (roll.effectiveness === 0) {
          events.push({ kind: 'immune', side: foeSide, mon: foe.index });
          break;
        }
        const before = foe.live.hp;
        let after = Math.max(0, before - roll.damage);
        const endured = after === 0 && before > 1 && (foe.mon.fighter.bond ?? 0) >= 4 && !foe.live.endured;
        if (endured) {
          after = 1;
          foe.live.endured = true;
        }
        foe.live.hp = after;
        total += before - after;
        landed++;
        events.push({ kind: 'hit', side: foeSide, mon: foe.index, damage: before - after, critical: roll.critical, effectiveness: roll.effectiveness, hpBefore: before, hpAfter: after, endured });
      }
      if (hits > 1 && landed > 0) events.push({ kind: 'multi', side, mon: me.index, hits: landed });
      if (landed > 0) {
        if (foe.live.hp === 0) events.push({ kind: 'faint', side: foeSide, mon: foe.index });
        if (foe.live.status === 'freeze' && move.type === 'fire' && foe.live.hp > 0) {
          foe.live.status = null;
          events.push({ kind: 'thaw', side: foeSide, mon: foe.index });
        }
        if (move.drain > 0 && me.live.hp < me.mon.fighter.maxHp) {
          const before = me.live.hp;
          me.live.hp = Math.min(me.mon.fighter.maxHp, before + Math.max(1, Math.floor((total * move.drain) / 100)));
          events.push({ kind: 'heal', side, mon: me.index, cause: 'drain', hpBefore: before, hpAfter: me.live.hp });
        }
        const recoil = struggle ? Math.max(1, Math.floor(me.mon.fighter.maxHp * STRUGGLE_RECOIL)) : move.drain < 0 ? Math.max(1, Math.floor((total * -move.drain) / 100)) : 0;
        if (recoil > 0) {
          const { before, after } = damageHp(me.live, recoil);
          events.push({ kind: 'recoil', side, mon: me.index, damage: before - after, hpBefore: before, hpAfter: after });
          if (after === 0) events.push({ kind: 'faint', side, mon: me.index });
        }
        if (foe.live.hp > 0 && move.flinchChance > 0 && !acted.has(foeSide) && rng() < move.flinchChance / 100) flinched.add(foeSide);
        if (move.ailment && foe.live.hp > 0 && rng() < move.ailmentChance / 100) inflict(foeSide, move.ailment);
        if (move.statChanges.length > 0 && rng() < move.statChance / 100) {
          for (const c of move.statChanges) {
            const target = c.target === 'self' ? side : foeSide;
            if (activeMon(next, target).live.hp > 0) applyStage(target, c.stat, c.change);
          }
        }
      } else if (struggle) {
        const { before, after } = damageHp(me.live, Math.max(1, Math.floor(me.mon.fighter.maxHp * STRUGGLE_RECOIL)));
        events.push({ kind: 'recoil', side, mon: me.index, damage: before - after, hpBefore: before, hpAfter: after });
        if (after === 0) events.push({ kind: 'faint', side, mon: me.index });
      }
      continue;
    }

    // Golpe de status.
    let worked = false;
    if (move.ailment) {
      if (statusBlockedByType(move, foe.mon.fighter.types)) {
        events.push({ kind: 'immune', side: foeSide, mon: foe.index });
        continue;
      }
      if (rng() < move.ailmentChance / 100) worked = inflict(foeSide, move.ailment) || worked;
    }
    if (move.statChanges.length > 0 && rng() < move.statChance / 100) {
      for (const c of move.statChanges) worked = applyStage(c.target === 'self' ? side : foeSide, c.stat, c.change) || worked;
    }
    if (move.healing > 0 && me.live.hp < me.mon.fighter.maxHp) {
      const before = me.live.hp;
      me.live.hp = Math.min(me.mon.fighter.maxHp, before + Math.max(1, Math.floor((me.mon.fighter.maxHp * move.healing) / 100)));
      events.push({ kind: 'heal', side, mon: me.index, cause: 'heal', hpBefore: before, hpAfter: me.live.hp });
      worked = true;
    }
    if (!worked && move.statChanges.length === 0) events.push({ kind: 'fail', side, mon: me.index });
  }

  for (const side of [0, 1] as const) {
    const { mon, live, index } = activeMon(next, side);
    if (live.hp <= 0 || (live.status !== 'burn' && live.status !== 'poison')) continue;
    const { before, after } = damageHp(live, Math.max(1, Math.floor(mon.fighter.maxHp * RESIDUAL[live.status])));
    events.push({ kind: 'residual', side, mon: index, cause: live.status, damage: before - after, hpBefore: before, hpAfter: after });
    if (after === 0) events.push({ kind: 'faint', side, mon: index });
  }

  settle(next, events, lastAttacker);
  return { state: next, events };
}

/** Fim do turno: quem venceu, a entrada automática do oponente e se você precisa escolher o próximo. */
function settle(state: DuelState, events: DuelEvent[], lastAttacker: SideIndex | null): void {
  const left0 = aliveCount(state.sides[0]);
  const left1 = aliveCount(state.sides[1]);
  if (left0 === 0 || left1 === 0) {
    // Os dois sem ninguém (recuo derrubou quem usou): vence quem deu o último golpe, como nos jogos mais novos.
    state.winner = left0 === 0 && left1 === 0 ? (lastAttacker ?? 1) : left0 === 0 ? 1 : 0;
    state.mustSwitch = false;
    events.push({ kind: 'end', winner: state.winner });
    return;
  }
  const foe = state.sides[1];
  if (foe.state[foe.active]!.hp <= 0) {
    leaveField(foe.state[foe.active]!);
    const to = foe.state.findIndex((m) => m.hp > 0);
    events.push({ kind: 'switch', side: 1, from: foe.active, to, forced: true });
    foe.active = to;
  }
  state.mustSwitch = state.sides[0].state[state.sides[0].active]!.hp <= 0;
}

/** Põe em campo quem você escolheu depois de um desmaio (não gasta turno). */
export function sendReplacement(state: DuelState, to: number): { state: DuelState; events: DuelEvent[] } {
  if (!state.mustSwitch) throw new Error('Não há troca obrigatória agora.');
  if (!switchOptions(state, 0).includes(to)) throw new Error('Esse Pokémon não pode entrar agora.');
  const next = cloneState(state);
  const from = next.sides[0].active;
  leaveField(next.sides[0].state[from]!);
  next.sides[0].active = to;
  next.mustSwitch = false;
  return { state: next, events: [{ kind: 'switch', side: 0, from, to, forced: true }] };
}

/** Desistir: o oponente vence. */
export function forfeitDuel(state: DuelState): { state: DuelState; events: DuelEvent[] } {
  if (state.winner !== null) return { state, events: [] };
  const next = cloneState(state);
  next.winner = 1;
  next.mustSwitch = false;
  return { state: next, events: [{ kind: 'end', winner: 1 }] };
}

// ----------------------------------------------------------------------------- textos

const STATUS_GAINED_PT: Record<MoveAilment, string> = {
  burn: 'ficou queimado!', poison: 'foi envenenado!', paralysis: 'ficou paralisado! Pode não conseguir se mexer.', freeze: 'foi congelado!',
  sleep: 'adormeceu!', confusion: 'ficou confuso!',
};

function stageVerb(change: number, applied: number): string {
  if (applied === 0) return change > 0 ? 'não pode subir mais!' : 'não pode cair mais!';
  const size = Math.abs(applied);
  if (applied > 0) return size >= 3 ? 'subiu drasticamente!' : size === 2 ? 'subiu muito!' : 'subiu!';
  return size >= 3 ? 'caiu drasticamente!' : size === 2 ? 'caiu muito!' : 'caiu!';
}

/** Nome como a narração usa: o seu pelo nome; o do oponente com "do oponente". */
export function monLabel(state: DuelState, side: SideIndex, mon: number): string {
  const name = state.sides[side].mons[mon]?.fighter.name ?? '?';
  return side === 0 ? name : `${name} do oponente`;
}

/** Frase da narração para um evento (null quando não há o que dizer além das barras). */
export function describeDuelEvent(state: DuelState, event: DuelEvent): string | null {
  if (event.kind === 'end') return event.winner === 0 ? `Você venceu ${state.sides[1].name}!` : `Você perdeu para ${state.sides[1].name}…`;
  if (event.kind === 'switch') {
    const to = state.sides[event.side].mons[event.to]?.fighter.name ?? '?';
    if (event.side === 1) return `${state.sides[1].name} enviou ${to}!`;
    if (event.forced) return `Vai, ${to}!`;
    return `Volte, ${state.sides[0].mons[event.from]?.fighter.name ?? '?'}! Vai, ${to}!`;
  }
  const who = monLabel(state, event.side, event.mon);
  switch (event.kind) {
    case 'move': return event.struggle ? `${who} está sem PP e usou ${event.move.name}!` : `${who} usou ${event.move.name}!`;
    case 'miss': return `${who} errou!`;
    case 'immune': return `Não afeta ${who}…`;
    case 'fail': return 'Mas não funcionou!';
    case 'multi': return `Acertou ${event.hits} ${event.hits === 1 ? 'vez' : 'vezes'}!`;
    case 'hit': {
      const parts: string[] = [];
      if (event.critical) parts.push('Golpe crítico!');
      const eff = effectivenessLabel(event.effectiveness);
      if (eff) parts.push(eff);
      if (event.endured) parts.push(`${who} aguentou firme!`);
      return parts.length > 0 ? parts.join(' ') : null;
    }
    case 'skip':
      if (event.cause === 'sleep') return `${who} está dormindo.`;
      if (event.cause === 'freeze') return `${who} está congelado e não se mexe!`;
      if (event.cause === 'flinch') return `${who} hesitou e não agiu!`;
      return `${who} está paralisado e não consegue se mexer!`;
    case 'thaw': return `${who} descongelou!`;
    case 'wake': return `${who} acordou!`;
    case 'status': return `${who} ${STATUS_GAINED_PT[event.status]}`;
    case 'confused': return `${who} está confuso…`;
    case 'confusion-hit': return `${who} se atingiu na confusão!`;
    case 'confusion-end': return `${who} não está mais confuso!`;
    case 'stage': return `${STAGE_LABELS_PT[event.stat]} de ${who} ${stageVerb(event.change, event.applied)}`;
    case 'heal': return event.cause === 'drain' ? `${who} drenou energia do alvo.` : `${who} recuperou PS.`;
    case 'residual': return `${who} sofre com ${event.cause === 'burn' ? 'a queimadura' : 'o veneno'}.`;
    case 'recoil': return `${who} sofreu recuo.`;
    case 'faint': return `${who} desmaiou!`;
  }
}

/** Estágios diferentes de zero, para os indicadores da tela ("Atq. +2"). */
export function stageBadges(stages: Stages): { stat: StageStat; label: string; value: number }[] {
  return STAGE_STATS.filter((s) => stages[s] !== 0).map((s) => ({ stat: s, label: `${STAGE_LABELS_PT[s]} ${stages[s] > 0 ? '+' : '−'}${Math.abs(stages[s])}`, value: stages[s] }));
}
