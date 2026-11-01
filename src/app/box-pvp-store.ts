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
  /** Sementes de lutas que o amigo já montou (`cx-ready`) e de `cx-go` recebidos, para a largada em conjunto. */
  friendReady: null as { seed: number; ok: boolean } | null,
  goSeed: null as number | null,
});

type Waiter = () => void;
let waiters: Waiter[] = [];
function wake(): void {
  const current = waiters;
  waiters = [];
  for (const fn of current) fn();
}

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
    wake();
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
  boxPvp.friendReady = null;
  boxPvp.goSeed = null;
  wake();
}

function onMessage(msg: WireMessage): void {
  if (msg.t === 'cx-team') {
    boxPvp.friend = msg.team;
    boxPvp.friendPlaced = msg.placed;
  } else if (msg.t === 'cx-start' && boxPvp.role === 'guest') {
    boxPvp.mode = msg.mode;
    boxPvp.friendReady = null;
    boxPvp.goSeed = null;
    boxPvp.pending = { mode: msg.mode, seed: msg.seed, host: msg.host, guest: msg.guest };
  } else if (msg.t === 'cx-ready') {
    boxPvp.friendReady = { seed: msg.seed, ok: msg.ok };
    wake();
  } else if (msg.t === 'cx-go') {
    boxPvp.goSeed = msg.seed;
    wake();
  }
}

/** Espera até `done()` ficar verdadeiro, a conexão cair ou o tempo acabar. */
function waitUntil(done: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (done()) return resolve(true);
    const timer = setTimeout(() => {
      waiters = waiters.filter((fn) => fn !== check);
      resolve(false);
    }, timeoutMs);
    const check = () => {
      if (done()) {
        clearTimeout(timer);
        resolve(true);
      } else if (!boxPvp.peer) {
        clearTimeout(timer);
        resolve(false);
      } else waiters.push(check);
    };
    waiters.push(check);
  });
}

export const PVP_START_TIMEOUT_MS = 25000;

/**
 * Largada em conjunto: cada celular avisa que terminou de montar a luta (`ready`); quando os dois estão prontos, o
 * anfitrião manda `cx-go` e espera meia ida e volta antes de começar, o convidado começa ao receber. Assim a luta
 * (que já é igual nos dois) também começa ao mesmo tempo, em vez de cada um largar quando acabar de baixar os sprites.
 * Devolve false se o amigo não ficou pronto (ou caiu): quem chamou desiste da encenação.
 */
export async function syncPvpStart(seed: number, ready: boolean, timeoutMs = PVP_START_TIMEOUT_MS): Promise<boolean> {
  const peer = boxPvp.peer;
  if (!peer) return false;
  peer.send({ t: 'cx-ready', seed, ok: ready });
  if (!ready) return false;
  if (boxPvp.role === 'host') {
    const friendOk = await waitUntil(() => boxPvp.friendReady?.seed === seed, timeoutMs);
    if (!friendOk || !boxPvp.friendReady?.ok || !boxPvp.peer) return false;
    boxPvp.peer.send({ t: 'cx-go', seed });
    await new Promise((resolve) => setTimeout(resolve, Math.min(400, peer.rtt / 2)));
    return true;
  }
  return waitUntil(() => boxPvp.goSeed === seed, timeoutMs);
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
  boxPvp.friendReady = null;
  boxPvp.goSeed = null;
  if (!boxPvp.peer.send({ t: 'cx-start', ...start })) return null;
  boxPvp.pending = start;
  return start;
}
