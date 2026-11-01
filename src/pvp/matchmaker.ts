import { HAS_TURN, NO_CANDIDATES_MESSAGE, NoCandidatesError, PvpPeer } from './peer';
import { pvpLog } from './pvp-log';
import type { CloseReason, PeerState } from './peer';
import { randomId, SIGNAL_ROOT } from './signal';
import type { SignalData, SignalHub } from './signal';

/**
 * Pareamento sem copiar código longo: o anfitrião cria uma sala com um código curto (4 letras) e, se quiser, ela aparece
 * numa lista pública do modo; o convidado toca na sala ou digita o código. O convite e a resposta da conexão (WebRTC)
 * viajam pelo ponto de encontro (`signal.ts`) e a partida segue direto de um celular ao outro.
 *
 * Tópicos: `tcgar/v1/<jogo>/lobby` (anúncios das salas abertas) e `tcgar/v1/<jogo>/room/<código>` (convite e resposta).
 * Tudo o que chega é dado não confiável: formato e tamanhos são conferidos antes de usar.
 */

export type PvpGame = 'pins' | 'box' | 'dungeon' | 'survival' | 'backup';

/** Sem 0/O, 1/I: o código é lido em voz alta e digitado no celular. */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(length = 4): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

/** Maiúsculas, sem espaços nem traços; o que sobra tem de ser só letras e números do alfabeto de salas. */
export function normalizeRoomCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '').replace(/I/g, '').replace(/[01]/g, '');
}

export function isRoomCode(code: string, length: number): boolean {
  return code.length === length && [...code].every((c) => ROOM_ALPHABET.includes(c));
}

export interface OpenRoom {
  code: string;
  name: string;
  note: string;
  /** Quando o último anúncio chegou (ms). */
  seenAt: number;
}

export interface MatchPeer {
  state: PeerState;
  onState: ((state: PeerState, reason?: CloseReason) => void) | null;
  acceptAnswer(code: string): Promise<string | null>;
  close(): void;
}

export interface PeerApi<P extends MatchPeer> {
  host(): Promise<{ peer: P; code: string }>;
  join(offerCode: string): Promise<{ ok: true; peer: P; code: string } | { ok: false; message: string }>;
}

const realApi: PeerApi<PvpPeer> = {
  host: () => PvpPeer.host(),
  join: (code) => PvpPeer.join(code),
};

export interface MatchTimings {
  announceMs: number;
  joinRetryMs: number;
  joinTries: number;
  claimMs: number;
  connectMs: number;
  roomTtlMs: number;
}

export const MATCH_TIMINGS: MatchTimings = { announceMs: 3000, joinRetryMs: 2000, joinTries: 7, claimMs: 25000, connectMs: 30000, roomTtlMs: 9000 };

export interface HostOptions {
  /** Aparece na lista pública do modo; sem isso, só entra quem souber o código (transferência de backup). */
  listed: boolean;
  name: string;
  /** Texto curto na lista («3x3», «3 pins»…). */
  note?: string;
  codeLength?: number;
}

export interface HostHandlers<P> {
  onCode(code: string): void;
  onGuest?(name: string): void;
  /** Etapas da conexão para a tela («Resposta recebida, abrindo a conexão…», «Aguardando um amigo entrar…»). */
  onStatus?(text: string): void;
  onPeer(peer: P): void;
  onError(message: string): void;
}

export interface JoinHandlers<P> {
  onStatus(text: string): void;
  onPeer(peer: P): void;
  onError(message: string): void;
}

const MAX_OFFER = 20000;
const MAX_ROOMS = 20;
/** Quando a conexão direta não fecha: o texto muda se o build tem retransmissão (TURN) ou não. */
const NETWORK_PROBLEM = HAS_TURN
  ? 'Não conectou. A rede de um dos dois bloqueou a conexão. Tente de novo, ou os dois na mesma rede Wi-Fi.'
  : 'Não conectou: as redes de vocês não deixaram os celulares se ligarem direto (comum no 4G). Tentem os dois na mesma rede Wi-Fi.';
const WEBRTC_PROBLEM = 'Este navegador não conseguiu criar a conexão (WebRTC). Tente no Chrome ou no Safari atualizados.';

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

const ROOM_CODE = /^[A-Z2-9]{4,6}$/;

/** Nome vindo de um estranho: sem caracteres de controle ou de direção, espaços juntos, curto. */
function cleanName(value: unknown): string {
  return text(value, 40).replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

export class Matchmaker<P extends MatchPeer = PvpPeer> {
  constructor(
    private readonly hub: SignalHub,
    private readonly game: PvpGame,
    private readonly api: PeerApi<P> = realApi as unknown as PeerApi<P>,
    private readonly timings: MatchTimings = MATCH_TIMINGS,
  ) {}

  private lobbyTopic(): string {
    return `${SIGNAL_ROOT}/${this.game}/lobby`;
  }

  private roomTopic(code: string): string {
    return `${SIGNAL_ROOT}/${this.game}/room/${code}`;
  }

  /** Salas abertas do modo, em tempo real. Devolve a função que para de ouvir. */
  watchRooms(onRooms: (rooms: OpenRoom[]) => void): () => void {
    const rooms = new Map<string, OpenRoom & { hid: string; firstSeen: number }>();
    const emit = () => {
      const now = Date.now();
      for (const [code, room] of rooms) if (now - room.seenAt > this.timings.roomTtlMs) rooms.delete(code);
      // Ordem pela chegada da sala (não pelo último anúncio): a lista não pula enquanto a pessoa vai tocar.
      onRooms([...rooms.values()].sort((a, b) => b.firstSeen - a.firstSeen).map(({ code, name, note, seenAt }) => ({ code, name, note, seenAt })));
    };
    const off = this.hub.subscribe(this.lobbyTopic(), (m) => {
      if (m.r !== 'h') return;
      const code = text(m.code, 8);
      const hid = text(m.hid, 24);
      if (!ROOM_CODE.test(code) || !hid) return;
      const known = rooms.get(code);
      if (m.t === 'closed') {
        if (known?.hid !== hid) return;
        rooms.delete(code);
      } else if (m.t === 'open') {
        if (!known && rooms.size >= MAX_ROOMS) return;
        rooms.set(code, { code, hid, name: cleanName(m.name) || 'Treinador', note: cleanName(m.note), seenAt: Date.now(), firstSeen: known?.firstSeen ?? Date.now() });
      } else return;
      emit();
    });
    // Pede a quem já está esperando que se anuncie de novo, em vez de esperar o próximo ciclo. O primeiro pedido costuma
    // sair antes de algum broker ligar; por isso vai de novo quando o primeiro broker conecta.
    const ask = () => this.hub.publish(this.lobbyTopic(), { r: 'g', t: 'who' });
    ask();
    const offOnline = this.hub.whenOnline(ask);
    const timer = setInterval(emit, 1500);
    return () => {
      off();
      offOnline();
      clearInterval(timer);
    };
  }

  /** Cria a sala. A conexão se prepara sozinha; `onPeer` é chamado quando o amigo entrar e o canal abrir. */
  host(options: HostOptions, handlers: HostHandlers<P>): { cancel(): void; code: () => string } {
    const hid = randomId(10);
    const length = options.codeLength ?? 4;
    let code = newRoomCode(length);
    let alive = true;
    let ready: { peer: P; offer: string } | null = null;
    let claimed: string | null = null;
    let claimTimer: ReturnType<typeof setTimeout> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let announceTimer: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;
    let preparing = false;
    let answerApplied = false;
    let offWho: (() => void) | null = null;

    const send = (data: SignalData) => this.hub.publish(this.roomTopic(code), { r: 'h', hid, ...data });
    const waiting = () => handlers.onStatus?.('Aguardando um amigo entrar…');
    const announce = () => {
      send({ t: 'here' });
      if (options.listed && !claimed) this.hub.publish(this.lobbyTopic(), { r: 'h', t: 'open', hid, code, name: options.name, note: options.note ?? '' });
    };
    const clearClaim = () => {
      claimed = null;
      answerApplied = false;
      if (claimTimer) clearTimeout(claimTimer);
      if (connectTimer) clearTimeout(connectTimer);
      claimTimer = null;
      connectTimer = null;
    };

    const listen = () => {
      unsubscribe?.();
      unsubscribe = this.hub.subscribe(this.roomTopic(code), (m) => {
        if (!alive) return;
        if (m.r === 'h') {
          // Outro anfitrião com o mesmo código (raro): só troca quem tem o `hid` menor e ainda não tem convidado, para os
          // dois não trocarem juntos.
          if (typeof m.hid === 'string' && m.hid !== hid && m.hid > hid && !claimed && m.t === 'here') {
            if (options.listed) this.hub.publish(this.lobbyTopic(), { r: 'h', t: 'closed', hid, code });
            code = newRoomCode(length);
            pvpLog('HC', code);
            listen();
            handlers.onCode(code);
            announce();
          }
          return;
        }
        const gid = text(m.gid, 24);
        if (!gid) return;
        if (m.t === 'join') {
          if (claimed && claimed !== gid) return send({ t: 'busy', gid });
          if (!ready) return;
          if (!claimed) {
            claimed = gid;
            const guest = cleanName(m.name) || 'Amigo';
            pvpLog('H3', guest);
            handlers.onGuest?.(guest);
            if (options.listed) this.hub.publish(this.lobbyTopic(), { r: 'h', t: 'closed', hid, code });
            claimTimer = setTimeout(() => {
              if (!alive || !claimed) return;
              // O convidado sumiu: a sala volta para a lista com o mesmo convite.
              pvpLog('H9', 'convidado sumiu');
              clearClaim();
              waiting();
              announce();
            }, this.timings.claimMs);
          }
          send({ t: 'offer', gid, offer: ready.offer });
          pvpLog('H4');
        } else if (m.t === 'answer' && claimed === gid && ready) {
          const answer = text(m.answer, MAX_OFFER);
          // A resposta chega repetida (o convidado manda mais de uma vez por segurança): só a primeira vale.
          if (!answer || answerApplied) return;
          answerApplied = true;
          pvpLog('H5', `${answer.length}c`);
          handlers.onStatus?.('Resposta do amigo recebida. Abrindo a conexão direta…');
          const current = ready;
          if (claimTimer) clearTimeout(claimTimer);
          claimTimer = null;
          void current.peer.acceptAnswer(answer).then((problem) => {
            if (!alive || ready !== current) return;
            if (problem) {
              pvpLog('H7', problem.slice(0, 30));
              clearClaim();
              waiting();
              announce();
              return;
            }
            pvpLog('H6');
            connectTimer ??= setTimeout(() => {
              if (!alive || ready !== current || current.peer.state === 'open') return;
              // A ligação direta não fechou (rede do amigo): descarta e prepara um convite novo para a próxima tentativa.
              pvpLog('H9', 'tempo');
              handlers.onStatus?.(`${NETWORK_PROBLEM} A sala continua aberta.`);
              current.peer.onState = null;
              current.peer.close();
              ready = null;
              clearClaim();
              void prepare();
            }, this.timings.connectMs);
          });
        }
      });
    };

    const prepare = async () => {
      if (preparing || !alive) return;
      preparing = true;
      try {
        const made = await this.api.host();
        if (!alive) {
          made.peer.close();
          return;
        }
        const record = { peer: made.peer, offer: made.code };
        ready = record;
        pvpLog('H2', `${made.code.length}c`);
        made.peer.onState = (state, reason) => {
          if (!alive || ready !== record) return;
          if (state === 'open') {
            pvpLog('H8');
            made.peer.onState = null;
            stop(false);
            handlers.onPeer(made.peer);
          } else if (state === 'closed') {
            // A ligação falhou (rede): avisa e prepara um convite novo, com a sala ainda aberta.
            pvpLog('H9', reason ?? 'fechou');
            if (claimed) handlers.onStatus?.(`${NETWORK_PROBLEM} A sala continua aberta.`);
            ready = null;
            clearClaim();
            void prepare();
          }
        };
        announce();
      } catch (e) {
        pvpLog('HX', e instanceof NoCandidatesError ? 'sem-candidatos' : 'erro');
        handlers.onError(e instanceof NoCandidatesError ? NO_CANDIDATES_MESSAGE : WEBRTC_PROBLEM);
        stop(true);
      } finally {
        preparing = false;
      }
    };

    const stop = (closePeer: boolean) => {
      if (!alive) return;
      alive = false;
      if (announceTimer) clearInterval(announceTimer);
      offWho?.();
      offWho = null;
      clearClaim();
      if (options.listed) this.hub.publish(this.lobbyTopic(), { r: 'h', t: 'closed', hid, code });
      unsubscribe?.();
      unsubscribe = null;
      if (closePeer && ready) {
        ready.peer.onState = null;
        ready.peer.close();
      }
      ready = null;
    };

    listen();
    pvpLog('H1', code);
    handlers.onCode(code);
    waiting();
    announceTimer = setInterval(() => announce(), this.timings.announceMs);
    // Quem entra na lista pede a lista: responde logo, sem esperar o próximo ciclo.
    offWho = options.listed ? this.hub.subscribe(this.lobbyTopic(), (m) => { if (m.r === 'g' && m.t === 'who' && alive && !claimed) announce(); }) : null;
    void prepare();
    return {
      code: () => code,
      cancel: () => stop(true),
    };
  }

  /** Entra na sala `rawCode`. Devolve a função que cancela a tentativa. */
  join(rawCode: string, name: string, handlers: JoinHandlers<P>, codeLength = 4): () => void {
    const code = normalizeRoomCode(rawCode);
    if (!isRoomCode(code, codeLength)) {
      handlers.onError(`O código da sala tem ${codeLength} letras ou números. Confira com o seu amigo.`);
      return () => undefined;
    }
    const gid = randomId(12);
    let alive = true;
    let tries = 0;
    let joinTimer: ReturnType<typeof setInterval> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let answered = false;
    let peer: P | null = null;
    const topic = this.roomTopic(code);
    const finish = () => {
      alive = false;
      if (joinTimer) clearInterval(joinTimer);
      if (connectTimer) clearTimeout(connectTimer);
      off();
    };
    const fail = (message: string) => {
      if (!alive) return;
      finish();
      if (peer) {
        peer.onState = null;
        peer.close();
      }
      handlers.onError(message);
    };
    const knock = () => {
      if (!alive || answered) return;
      // Sem nenhum broker ligado a tentativa não conta: a falha seria de conexão, não de código.
      if (this.hub.online === 0) return handlers.onStatus('Sem ponto de encontro no momento. Tentando de novo…');
      if (tries >= this.timings.joinTries) {
        pvpLog('G8', code);
        return fail(`Não achei a sala ${code}. Confira o código e se o anfitrião continua com a tela aberta.`);
      }
      tries++;
      this.hub.publish(topic, { r: 'g', t: 'join', gid, name });
    };
    const off = this.hub.subscribe(topic, (m) => {
      if (!alive || m.r !== 'h' || text(m.gid, 24) !== gid) return;
      if (m.t === 'busy') pvpLog('G7');
      if (m.t === 'busy') return fail('Essa sala já está com outro jogador. Peça para o anfitrião abrir outra, ou espere um instante.');
      if (m.t !== 'offer' || answered) return;
      const offer = text(m.offer, MAX_OFFER);
      if (!offer) return;
      answered = true;
      if (joinTimer) clearInterval(joinTimer);
      pvpLog('G2', `${offer.length}c`);
      handlers.onStatus('Sala encontrada. Preparando a resposta…');
      void this.api.join(offer).then((made) => {
        if (!alive) {
          if (made.ok) made.peer.close();
          return;
        }
        if (!made.ok) return fail(made.message);
        pvpLog('G3', `${made.code.length}c`);
        peer = made.peer;
        made.peer.onState = (state, reason) => {
          if (!alive) return;
          if (state === 'open') {
            pvpLog('G5');
            made.peer.onState = null;
            peer = null;
            finish();
            handlers.onPeer(made.peer);
          } else if (state === 'closed') {
            pvpLog('G6', reason ?? 'fechou');
            fail(reason === 'failed' ? NETWORK_PROBLEM : 'A conexão caiu antes de começar. Tente entrar de novo.');
          }
        };
        // A resposta vai algumas vezes: um broker pode perder uma mensagem, e a repetida é descartada pelo anfitrião.
        const sendAnswer = () => alive && this.hub.publish(topic, { r: 'g', t: 'answer', gid, answer: made.code });
        sendAnswer();
        pvpLog('G4');
        handlers.onStatus('Resposta enviada. Abrindo a conexão direta com o anfitrião…');
        setTimeout(sendAnswer, 1200);
        setTimeout(sendAnswer, 3000);
        connectTimer = setTimeout(() => {
          pvpLog('G9');
          fail(NETWORK_PROBLEM);
        }, this.timings.connectMs);
      }).catch(() => fail(WEBRTC_PROBLEM));
    });
    handlers.onStatus(`Procurando a sala ${code}…`);
    pvpLog('G1', code);
    knock();
    joinTimer = setInterval(knock, this.timings.joinRetryMs);
    return () => {
      if (!alive) return;
      finish();
      if (peer) {
        peer.onState = null;
        peer.close();
      }
    };
  }
}
