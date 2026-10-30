/**
 * Duelo por turnos da Arena, como nos jogos: um Pokémon de cada lado em campo, o jogador escolhe a cada turno um dos
 * (até) 4 golpes que montou ou troca de Pokémon; o oponente responde. Usa as mesmas contas do motor automático
 * (`battle.ts`: dano, STAB, tipos, crítico, condições, intimidade) e acrescenta PP. Puro e determinístico: o sorteio vem
 * de fora e cada turno devolve um estado novo e a lista de eventos para a tela narrar.
 */
import { calculateDamage, canGetStatus, effectivenessLabel, expectedDamage, PARALYSIS_SKIP_CHANCE, RESIDUAL_FRACTION, STATUS_CHANCE, THAW_CHANCE } from './battle';
import type { BattleMove, Fighter, Rng, StatusKind } from './battle';
import { toBattleMove } from './moveset';
import type { ChosenMove } from './moveset';

export type SideIndex = 0 | 1;

/** Pokémon pronto para o duelo: `maxPp[i]` é o PP do golpe `fighter.moves[i]`. */
export interface DuelMon {
  fighter: Fighter;
  maxPp: number[];
}

export interface DuelMonState {
  hp: number;
  pp: number[];
  status: StatusKind | null;
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

export type DuelEvent =
  | { kind: 'switch'; side: SideIndex; from: number; to: number; forced: boolean }
  | { kind: 'move'; side: SideIndex; mon: number; move: BattleMove; struggle: boolean }
  | { kind: 'miss'; side: SideIndex; mon: number }
  | { kind: 'hit'; side: SideIndex; mon: number; damage: number; critical: boolean; effectiveness: number; hpBefore: number; hpAfter: number; endured: boolean }
  | { kind: 'immune'; side: SideIndex; mon: number }
  | { kind: 'skip'; side: SideIndex; mon: number; cause: 'freeze' | 'paralysis' }
  | { kind: 'thaw'; side: SideIndex; mon: number }
  | { kind: 'status'; side: SideIndex; mon: number; status: StatusKind }
  | { kind: 'residual'; side: SideIndex; mon: number; cause: 'burn' | 'poison'; damage: number; hpBefore: number; hpAfter: number }
  | { kind: 'recoil'; side: SideIndex; mon: number; damage: number; hpBefore: number; hpAfter: number }
  | { kind: 'faint'; side: SideIndex; mon: number }
  | { kind: 'end'; winner: SideIndex };

/** Golpe de quem ficou sem PP em todos: fraco e machuca quem usa (1/4 dos PS), como nos jogos. */
export const STRUGGLE: BattleMove = { name: 'Struggle', type: 'normal', power: 50, accuracy: 100, special: false, source: 'padrao' };
export const STRUGGLE_RECOIL = 1 / 4;

/** Monta o Pokémon do duelo com os golpes escolhidos (o PP de cada um vem da PokéAPI). */
export function duelMonFrom(fighter: Fighter, moves: readonly ChosenMove[]): DuelMon {
  if (moves.length === 0) throw new Error(`${fighter.name} precisa de pelo menos 1 golpe.`);
  return {
    fighter: { ...fighter, moves: moves.map(toBattleMove), notes: fighter.notes.filter((n) => !n.includes('ataques da carta') && !n.includes('sem golpes')) },
    maxPp: moves.map((m) => m.pp),
  };
}

function freshSide(name: string, mons: readonly DuelMon[]): DuelSide {
  if (mons.length === 0) throw new Error('Cada lado do duelo precisa de pelo menos 1 Pokémon.');
  for (const mon of mons) {
    if (mon.fighter.moves.length === 0 || mon.maxPp.length !== mon.fighter.moves.length) throw new Error(`${mon.fighter.name} está sem golpes válidos.`);
  }
  return {
    name,
    mons: [...mons],
    state: mons.map((m) => ({ hp: m.fighter.maxHp, pp: [...m.maxPp], status: null, endured: false })),
    active: 0,
  };
}

export function createDuel(player: { name: string; mons: readonly DuelMon[] }, foe: { name: string; mons: readonly DuelMon[] }): DuelState {
  return { sides: [freshSide(player.name, player.mons), freshSide(foe.name, foe.mons)], turn: 0, winner: null, mustSwitch: false };
}

function cloneState(state: DuelState): DuelState {
  const side = (s: DuelSide): DuelSide => ({ ...s, mons: s.mons, state: s.state.map((m) => ({ ...m, pp: [...m.pp] })) });
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
  if (!mon.fighter.moves[action.move]) return 'Golpe inexistente.';
  return (live.pp[action.move] ?? 0) > 0 ? null : 'Este golpe está sem PP.';
}

/** Ação do oponente: um golpe com PP, ponderado pelo dano esperado contra quem está em campo (nunca troca). */
export function chooseFoeAction(state: DuelState, rng: Rng, side: SideIndex = 1): DuelAction {
  if (needsStruggle(state, side)) return { kind: 'move', move: -1 };
  const me = activeMon(state, side);
  const target = activeMon(state, other(side));
  const options = me.mon.fighter.moves.map((m, i) => ({ m, i })).filter(({ i }) => (me.live.pp[i] ?? 0) > 0);
  const weights = options.map(({ m }) => (expectedDamage(me.mon.fighter, target.mon.fighter, m, { burned: me.live.status === 'burn' }) + 1) ** 2);
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (const [k, option] of options.entries()) {
    r -= weights[k]!;
    if (r <= 0) return { kind: 'move', move: option.i };
  }
  return { kind: 'move', move: options[options.length - 1]!.i };
}

const aliveCount = (side: DuelSide): number => side.state.filter((m) => m.hp > 0).length;

/**
 * Resolve um turno: trocas primeiro, depois os golpes por Velocidade (paralisia corta pela metade; empate por sorteio),
 * condições que impedem de agir, dano, condição causada, desmaios, dano de queimadura/veneno no fim do turno (sempre
 * sobra 1 PS) e a entrada do próximo Pokémon do oponente. Se o seu desmaiar e houver outro, `mustSwitch` fica ligado.
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
  let lastAttacker: SideIndex | null = null;

  for (const side of [0, 1] as const) {
    const action = actions[side];
    if (action.kind !== 'switch') continue;
    const s = next.sides[side];
    events.push({ kind: 'switch', side, from: s.active, to: action.to, forced: false });
    s.active = action.to;
  }

  const speedOf = (side: SideIndex) => {
    const { mon, live } = activeMon(next, side);
    return mon.fighter.speed * (live.status === 'paralysis' ? 0.5 : 1) + rng() * 0.5;
  };
  const movers = ([0, 1] as const).filter((side) => actions[side].kind === 'move');
  const order = movers.map((side) => ({ side, key: speedOf(side) })).sort((a, b) => b.key - a.key).map((e) => e.side);

  for (const side of order) {
    const action = actions[side] as { kind: 'move'; move: number };
    const me = activeMon(next, side);
    if (me.live.hp <= 0) continue;
    const foeSide = other(side);
    const foe = activeMon(next, foeSide);
    if (foe.live.hp <= 0) continue;

    if (me.live.status === 'freeze') {
      if (rng() < THAW_CHANCE) {
        me.live.status = null;
        events.push({ kind: 'thaw', side, mon: me.index });
      } else {
        events.push({ kind: 'skip', side, mon: me.index, cause: 'freeze' });
        continue;
      }
    } else if (me.live.status === 'paralysis' && rng() < PARALYSIS_SKIP_CHANCE) {
      events.push({ kind: 'skip', side, mon: me.index, cause: 'paralysis' });
      continue;
    }

    const struggle = action.move === -1;
    const move = struggle ? STRUGGLE : me.mon.fighter.moves[action.move]!;
    if (!struggle) me.live.pp[action.move] = Math.max(0, me.live.pp[action.move]! - 1);
    events.push({ kind: 'move', side, mon: me.index, move, struggle });
    lastAttacker = side;

    const roll = calculateDamage(me.mon.fighter, foe.mon.fighter, move, rng, { burned: me.live.status === 'burn' });
    if (!roll.hit) {
      events.push({ kind: 'miss', side, mon: me.index });
    } else if (roll.effectiveness === 0) {
      events.push({ kind: 'immune', side: foeSide, mon: foe.index });
    } else {
      const before = foe.live.hp;
      let after = Math.max(0, before - roll.damage);
      const endured = after === 0 && before > 1 && (foe.mon.fighter.bond ?? 0) >= 4 && !foe.live.endured;
      if (endured) {
        after = 1;
        foe.live.endured = true;
      }
      foe.live.hp = after;
      events.push({ kind: 'hit', side: foeSide, mon: foe.index, damage: before - after, critical: roll.critical, effectiveness: roll.effectiveness, hpBefore: before, hpAfter: after, endured });
      const effect = STATUS_CHANCE[move.type];
      if (effect && !struggle && after > 0 && foe.live.status === null && canGetStatus(effect.status, foe.mon.fighter.types) && rng() < effect.chance) {
        foe.live.status = effect.status;
        events.push({ kind: 'status', side: foeSide, mon: foe.index, status: effect.status });
      }
      if (after === 0) events.push({ kind: 'faint', side: foeSide, mon: foe.index });
    }

    if (struggle) {
      const before = me.live.hp;
      const after = Math.max(0, before - Math.max(1, Math.floor(me.mon.fighter.maxHp * STRUGGLE_RECOIL)));
      me.live.hp = after;
      events.push({ kind: 'recoil', side, mon: me.index, damage: before - after, hpBefore: before, hpAfter: after });
      if (after === 0) events.push({ kind: 'faint', side, mon: me.index });
    }
  }

  for (const side of [0, 1] as const) {
    const { mon, live, index } = activeMon(next, side);
    if (live.hp <= 0 || (live.status !== 'burn' && live.status !== 'poison')) continue;
    const before = live.hp;
    const after = Math.max(1, before - Math.max(1, Math.floor(mon.fighter.maxHp * RESIDUAL_FRACTION[live.status])));
    if (after === before) continue;
    live.hp = after;
    events.push({ kind: 'residual', side, mon: index, cause: live.status, damage: before - after, hpBefore: before, hpAfter: after });
  }

  settle(next, events, lastAttacker);
  return { state: next, events };
}

/** Fim do turno: quem venceu, a entrada automática do oponente e se você precisa escolher o próximo. */
function settle(state: DuelState, events: DuelEvent[], lastAttacker: SideIndex | null): void {
  const left0 = aliveCount(state.sides[0]);
  const left1 = aliveCount(state.sides[1]);
  if (left0 === 0 || left1 === 0) {
    // Os dois sem ninguém (o Struggle derrubou quem usou): vence quem deu o último golpe, como nos jogos mais novos.
    state.winner = left0 === 0 && left1 === 0 ? (lastAttacker ?? 1) : left0 === 0 ? 1 : 0;
    state.mustSwitch = false;
    events.push({ kind: 'end', winner: state.winner });
    return;
  }
  const foe = state.sides[1];
  if (foe.state[foe.active]!.hp <= 0) {
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

const STATUS_GAINED_PT: Record<StatusKind, string> = {
  burn: 'ficou queimado!', poison: 'foi envenenado!', paralysis: 'ficou paralisado! Pode não conseguir se mexer.', freeze: 'foi congelado!',
};

/** Nome como a narração usa: o seu pelo nome; o do oponente com "do oponente". */
export function monLabel(state: DuelState, side: SideIndex, mon: number): string {
  const name = state.sides[side].mons[mon]?.fighter.name ?? '?';
  return side === 0 ? name : `${name} do oponente`;
}

/** Frase da narração para um evento (null quando não há o que dizer além das barras). */
export function describeDuelEvent(state: DuelState, event: DuelEvent): string | null {
  switch (event.kind) {
    case 'switch': {
      const to = state.sides[event.side].mons[event.to]?.fighter.name ?? '?';
      if (event.side === 1) return `${state.sides[1].name} enviou ${to}!`;
      if (event.forced) return `Vai, ${to}!`;
      return `Volte, ${state.sides[0].mons[event.from]?.fighter.name ?? '?'}! Vai, ${to}!`;
    }
    case 'move':
      return event.struggle
        ? `${monLabel(state, event.side, event.mon)} está sem PP e usou ${event.move.name}!`
        : `${monLabel(state, event.side, event.mon)} usou ${event.move.name}!`;
    case 'miss': return 'Mas errou!';
    case 'immune': return `Não afeta ${monLabel(state, event.side, event.mon)}…`;
    case 'hit': {
      const parts: string[] = [];
      if (event.critical) parts.push('Golpe crítico!');
      const eff = effectivenessLabel(event.effectiveness);
      if (eff) parts.push(eff);
      if (event.endured) parts.push(`${monLabel(state, event.side, event.mon)} aguentou firme!`);
      return parts.length > 0 ? parts.join(' ') : null;
    }
    case 'skip':
      return event.cause === 'freeze'
        ? `${monLabel(state, event.side, event.mon)} está congelado e não se mexe!`
        : `${monLabel(state, event.side, event.mon)} está paralisado e não consegue se mexer!`;
    case 'thaw': return `${monLabel(state, event.side, event.mon)} descongelou!`;
    case 'status': return `${monLabel(state, event.side, event.mon)} ${STATUS_GAINED_PT[event.status]}`;
    case 'residual':
      return `${monLabel(state, event.side, event.mon)} sofre com ${event.cause === 'burn' ? 'a queimadura' : 'o veneno'}.`;
    case 'recoil': return `${monLabel(state, event.side, event.mon)} se machucou com o impacto.`;
    case 'faint': return `${monLabel(state, event.side, event.mon)} desmaiou!`;
    case 'end': return event.winner === 0 ? `Você venceu ${state.sides[1].name}!` : `Você perdeu para ${state.sides[1].name}…`;
  }
}
