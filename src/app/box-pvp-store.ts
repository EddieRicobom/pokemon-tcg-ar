import { reactive } from 'vue';
import type { PvpPeer } from '../pvp/peer';
import type { BoxPvpMode, BoxPvpTeam } from '../pvp/box-wire';
import { sideSizes } from '../pvp/box-wire';
import type { WireMessage } from '../pvp/wire';

/** Uma luta combinada: modo, semente e quantos de cada lado (o anfitrião decide e manda ao convidado). */
export interface BoxPvpStart {
  mode: BoxPvpMode;
  seed: number;
  host: number;
  guest: number;
}

/**
 * Estado do PvP da Caixa (um só por vez). A ligação vem do mesmo pareamento por códigos do PvP de Pins (`PvpLobby`).
 * A tela da Caixa manda a equipe (`sendTeam`) e, quando chega uma luta (`pending`), monta e encena.
 */
export const boxPvp = reactive({
  peer: null as PvpPeer | null,
  role: null as 'host' | 'guest' | null,
  mode: '3x3' as BoxPvpMode,
  mine: null as BoxPvpTeam | null,
  friend: null as BoxPvpTeam | null,
  friendPlaced: false,
  /** Luta recebida (ou iniciada) e ainda não encenada. */
  pending: null as BoxPvpStart | null,
  notice: '',
});

export function connectBoxPvp(peer: PvpPeer, role: 'host' | 'guest'): void {
  leaveBoxPvp();
  boxPvp.peer = peer;
  boxPvp.role = role;
  boxPvp.notice = '';
  peer.onMessage = onMessage;
  peer.onState = (state, reason) => {
    if (state !== 'closed') return;
    boxPvp.notice = reason === 'local' ? '' : 'A ligação com o amigo caiu. Gere um convite novo para jogar de novo.';
    boxPvp.peer = null;
    boxPvp.friend = null;
    boxPvp.friendPlaced = false;
  };
}

export function leaveBoxPvp(): void {
  const p = boxPvp.peer;
  boxPvp.peer = null;
  if (p) {
    p.onState = null;
    p.onMessage = null;
    p.close();
  }
  boxPvp.role = null;
  boxPvp.friend = null;
  boxPvp.friendPlaced = false;
  boxPvp.pending = null;
}

function onMessage(msg: WireMessage): void {
  if (msg.t === 'cx-team') {
    boxPvp.friend = msg.team;
    boxPvp.friendPlaced = msg.placed;
  } else if (msg.t === 'cx-start' && boxPvp.role === 'guest') {
    boxPvp.mode = msg.mode;
    boxPvp.pending = { mode: msg.mode, seed: msg.seed, host: msg.host, guest: msg.guest };
  }
}

export function sendTeam(team: BoxPvpTeam, placed: boolean): void {
  boxPvp.mine = team;
  boxPvp.peer?.send({ t: 'cx-team', team, placed });
}

/** Anfitrião: combina a luta e avisa o convidado. Devolve null se ainda falta a equipe de alguém. */
export function startBoxPvp(random: () => number = Math.random): BoxPvpStart | null {
  if (boxPvp.role !== 'host' || !boxPvp.mine || !boxPvp.friend || !boxPvp.peer) return null;
  const sizes = sideSizes(boxPvp.mode, boxPvp.mine.mons.length, boxPvp.friend.mons.length);
  const start: BoxPvpStart = { mode: boxPvp.mode, seed: Math.floor(random() * 2 ** 32) >>> 0, host: sizes.host, guest: sizes.guest };
  if (!boxPvp.peer.send({ t: 'cx-start', ...start })) return null;
  boxPvp.pending = start;
  return start;
}
