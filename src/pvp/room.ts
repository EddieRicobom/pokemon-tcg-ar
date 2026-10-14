import { PvpPeer } from './peer';
import type { PeerState } from './peer';
import { RoomSignal, newId, newRoomCode } from './signal';
import type { SignalMessage } from './signal';

/**
 * Sala por código curto. O anfitrião sorteia 5 dígitos e espera num tópico; o amigo digita o código, o app dele bate na
 * porta (`join`) e os dois trocam convite e resposta da ligação por ali (`signal.ts`). Quando o WebRTC abre, a sala sai
 * de cena e o jogo vai direto de um celular ao outro.
 */

export type RoomPhase = 'service' | 'waiting' | 'looking' | 'linking';

/** O mínimo que a sala precisa de uma ligação (o `PvpPeer` de verdade, ou um de teste). */
export interface RoomPeer {
  state: PeerState;
  onState: ((state: PeerState) => void) | null;
  close(): void;
}
export interface HostPeer extends RoomPeer {
  acceptAnswer(code: string): Promise<string | null>;
}
export interface RoomDeps {
  createSignal(code: string): RoomSignal;
  hostPeer(): Promise<{ peer: HostPeer; code: string }>;
  joinPeer(offerCode: string): Promise<{ ok: true; peer: RoomPeer; code: string } | { ok: false; message: string }>;
  roomCode(): string;
}

export const defaultRoomDeps: RoomDeps = {
  createSignal: (code) => new RoomSignal(code),
  hostPeer: () => PvpPeer.host(),
  joinPeer: (offer) => PvpPeer.join(offer),
  roomCode: newRoomCode,
};

export interface RoomCallbacks {
  onPhase(phase: RoomPhase): void;
  onConnected(peer: PvpPeer): void;
  onFail(message: string): void;
}

export interface RoomHandle {
  readonly code: string;
  cancel(): void;
}

export const SERVICE_DOWN =
  'Não consegui falar com o serviço de salas (a internet pode estar bloqueando). Tente de novo ou use os códigos longos, que não dependem dele.';
const TIMEOUT = {
  service: 8000,
  /** Quanto o anfitrião espera pelo amigo. */
  waiting: 10 * 60 * 1000,
  /** Quanto o convidado procura a sala. */
  looking: 12000,
  /** Depois de achada, quanto a ligação direta tem para abrir. */
  linking: 30000,
  retry: 2000,
};
const LINK_FAIL = 'A ligação direta entre os celulares não abriu. Se vocês estão em redes diferentes (4G e Wi-Fi), tente os códigos longos ou deixem os dois no mesmo Wi-Fi.';

export function hostRoom(cb: RoomCallbacks, deps: RoomDeps = defaultRoomDeps): RoomHandle {
  const code = deps.roomCode();
  let signal: RoomSignal | null = null;
  let peer: HostPeer | null = null;
  let offerCode = '';
  let guest = '';
  let over = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const stop = (keepPeer: boolean) => {
    over = true;
    timers.forEach(clearTimeout);
    signal?.close();
    signal = null;
    if (!keepPeer && peer) {
      peer.onState = null;
      peer.close();
    }
  };
  const fail = (message: string) => {
    if (over) return;
    stop(false);
    cb.onFail(message);
  };

  cb.onPhase('service');
  const preparing = deps.hostPeer().then(
    (made) => {
      peer = made.peer;
      offerCode = made.code;
    },
    () => fail('Este navegador não conseguiu criar a conexão (WebRTC). Tente no Chrome ou no Safari atualizados.'),
  );

  const sig = deps.createSignal(code);
  signal = sig;
  sig
    .open(TIMEOUT.service)
    .then(() => {
      if (over) return;
      sig.onMessage = (msg) => void onSignal(msg);
      cb.onPhase('waiting');
      timers.push(setTimeout(() => fail('A sala ficou aberta por muito tempo e fechou. Crie uma nova.'), TIMEOUT.waiting));
    })
    .catch(() => fail(SERVICE_DOWN));

  async function onSignal(msg: SignalMessage): Promise<void> {
    if (over) return;
    if (msg.k === 'join') {
      if (guest && guest !== msg.g) {
        signal?.send({ k: 'full', g: msg.g });
        return;
      }
      await preparing;
      if (over || !peer) return;
      if (!guest) {
        guest = msg.g;
        cb.onPhase('linking');
        timers.push(setTimeout(() => fail(LINK_FAIL), TIMEOUT.linking));
        const p = peer;
        p.onState = (state) => {
          if (state === 'open') {
            p.onState = null;
            stop(true);
            cb.onConnected(p as unknown as PvpPeer);
          } else if (state === 'closed') {
            fail('A conexão caiu antes de começar. Crie uma sala nova.');
          }
        };
      }
      signal?.send({ k: 'offer', g: guest, c: offerCode });
    } else if (msg.k === 'answer' && guest && msg.g === guest && peer) {
      const problem = await peer.acceptAnswer(msg.c);
      if (problem && peer.state !== 'open') fail(problem);
    }
  }

  return { code, cancel: () => stop(false) };
}

export function joinRoom(code: string, cb: RoomCallbacks, deps: RoomDeps = defaultRoomDeps): RoomHandle {
  const me = newId();
  let signal: RoomSignal | null = null;
  let peer: RoomPeer | null = null;
  let answerCode = '';
  let over = false;
  let gotOffer = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];

  const stop = (keepPeer: boolean) => {
    over = true;
    timers.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    signal?.close();
    signal = null;
    if (!keepPeer && peer) {
      peer.onState = null;
      peer.close();
    }
  };
  const fail = (message: string) => {
    if (over) return;
    stop(false);
    cb.onFail(message);
  };

  cb.onPhase('service');
  const sig = deps.createSignal(code);
  signal = sig;
  sig
    .open(TIMEOUT.service)
    .then(() => {
      if (over) return;
      sig.onMessage = (msg) => void onSignal(msg);
      cb.onPhase('looking');
      const knock = () => signal?.send({ k: 'join', g: me });
      knock();
      intervals.push(setInterval(() => (gotOffer ? signal?.send(answerCode ? { k: 'answer', g: me, c: answerCode } : { k: 'join', g: me }) : knock()), TIMEOUT.retry));
      timers.push(setTimeout(() => !gotOffer && fail('Não achei essa sala. Confira os 5 dígitos e peça ao amigo para deixar a tela de criar sala aberta.'), TIMEOUT.looking));
    })
    .catch(() => fail(SERVICE_DOWN));

  async function onSignal(msg: SignalMessage): Promise<void> {
    if (over || msg.g !== me) return;
    if (msg.k === 'full') return fail('Essa sala já tem outro jogador.');
    if (msg.k !== 'offer' || gotOffer) return;
    gotOffer = true;
    cb.onPhase('linking');
    const made = await deps.joinPeer(msg.c);
    if (over) {
      if (made.ok) made.peer.close();
      return;
    }
    if (!made.ok) return fail(made.message);
    peer = made.peer;
    answerCode = made.code;
    timers.push(setTimeout(() => fail(LINK_FAIL), TIMEOUT.linking));
    made.peer.onState = (state) => {
      if (state === 'open') {
        made.peer.onState = null;
        stop(true);
        cb.onConnected(made.peer as unknown as PvpPeer);
      } else if (state === 'closed') {
        fail('A conexão caiu antes de começar. Peça ao amigo para criar uma sala nova.');
      }
    };
    signal?.send({ k: 'answer', g: me, c: answerCode });
  }

  return { code, cancel: () => stop(false) };
}
