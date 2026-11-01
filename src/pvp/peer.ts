import { decodeCode, encodeCode } from './codec';
import { encodeMessage, parseMessage } from './wire';
import type { WireMessage } from './wire';

/**
 * A ligação direta entre os dois celulares (WebRTC, canal de dados). Não há servidor do app: o pareamento é feito
 * trocando dois códigos de texto (`codec.ts`) e, depois disso, as mensagens vão de um celular ao outro.
 *
 * Servidores STUN públicos só ajudam cada celular a descobrir o próprio endereço de fora da rede (eles não veem o jogo).
 * Na mesma rede Wi-Fi nem são necessários. Em algumas operadoras (CGNAT) a ligação direta pode não fechar; a tela avisa.
 */

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  // Retransmissão pública para as redes em que a ligação direta não fecha (operadoras com CGNAT). O jogo vai cifrado
  // (DTLS) por ela: o servidor só repassa bytes. Só entra em ação se o caminho direto falhar.
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];

/** Espera pelos candidatos de rede antes de gerar o código (o código leva todos: não há servidor para trocar candidatos depois). */
const GATHER_TIMEOUT_MS = 4500;
const PING_EVERY_MS = 3500;
const SILENCE_LIMIT_MS = 13000;

export type PeerState = 'new' | 'connecting' | 'open' | 'closed';
export type CloseReason = 'local' | 'remote' | 'timeout' | 'failed';

export interface PeerOptions {
  iceServers?: RTCIceServer[];
}

export class PvpPeer {
  state: PeerState = 'new';
  onState: ((state: PeerState, reason?: CloseReason) => void) | null = null;
  onMessage: ((msg: WireMessage) => void) | null = null;
  /** Mensagens que chegaram e foram ignoradas por estarem fora do formato (para diagnóstico). */
  ignored = 0;
  /** Ida e volta até o outro celular, em ms (medida pelo ping/pong; começa numa estimativa até a primeira medida). */
  rtt = 150;

  private readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private pingSentAt = 0;

  private constructor(options: PeerOptions) {
    this.pc = new RTCPeerConnection({ iceServers: options.iceServers ?? DEFAULT_ICE_SERVERS });
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed') this.finish('failed');
      else if (s === 'closed') this.finish('remote');
    };
  }

  /** O anfitrião: cria o convite. Mostre `code` ao amigo e depois chame `acceptAnswer` com o código que ele devolver. */
  static async host(options: PeerOptions = {}): Promise<{ peer: PvpPeer; code: string }> {
    const peer = new PvpPeer(options);
    peer.attach(peer.pc.createDataChannel('pins', { ordered: true }));
    peer.setState('connecting');
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    await peer.gathered();
    return { peer, code: await encodeCode('offer', peer.pc.localDescription!.sdp) };
  }

  /** O convidado: lê o convite e gera a resposta (`code`) para o anfitrião colar. A conexão abre sozinha depois disso. */
  static async join(offerCode: string, options: PeerOptions = {}): Promise<{ ok: true; peer: PvpPeer; code: string } | { ok: false; message: string }> {
    const decoded = await decodeCode(offerCode, 'offer');
    if (!decoded.ok) return decoded;
    const peer = new PvpPeer(options);
    peer.setState('connecting');
    peer.pc.ondatachannel = (e) => peer.attach(e.channel);
    try {
      await peer.pc.setRemoteDescription({ type: 'offer', sdp: decoded.sdp });
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      await peer.gathered();
    } catch {
      peer.close();
      return { ok: false, message: 'Não consegui ler esse convite. Peça um código novo ao anfitrião.' };
    }
    return { ok: true, peer, code: await encodeCode('answer', peer.pc.localDescription!.sdp) };
  }

  /** Anfitrião: recebe o código de resposta do amigo. Devolve null se deu certo, ou a mensagem do problema. */
  async acceptAnswer(answerCode: string): Promise<string | null> {
    const decoded = await decodeCode(answerCode, 'answer');
    if (!decoded.ok) return decoded.message;
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: decoded.sdp });
      return null;
    } catch {
      return 'Esse código de resposta não é deste convite. Gere um convite novo ou peça a resposta de novo.';
    }
  }

  /** Quantidade ainda enfileirada no canal; a transferência de backup usa isso para não estourar a memória do navegador. */
  get bufferedAmount(): number {
    return this.channel?.bufferedAmount ?? 0;
  }

  /** Aguarda o canal esvaziar antes de enviar outro fragmento grande. */
  waitForBuffer(maxBytes = 256 * 1024): Promise<void> {
    if (this.bufferedAmount <= maxBytes) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (this.state === 'closed') {
          reject(new Error('conexão fechada'));
          return;
        }
        if (this.bufferedAmount <= maxBytes) {
          resolve();
          return;
        }
        if (Date.now() - started > 30_000) {
          reject(new Error('canal P2P congestionado'));
          return;
        }
        setTimeout(check, 25);
      };
      check();
    });
  }

  send(msg: WireMessage): boolean {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(encodeMessage(msg));
    return true;
  }

  close(): void {
    if (this.state === 'closed') return;
    try {
      this.send({ t: 'bye' });
    } catch {
      /* o canal já caiu */
    }
    this.finish('local');
  }

  private gathered(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timeout);
        this.pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      const check = () => {
        if (this.pc.iceGatheringState === 'complete') done();
      };
      const timeout = setTimeout(done, GATHER_TIMEOUT_MS);
      this.pc.addEventListener('icegatheringstatechange', check);
    });
  }

  private attach(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => {
      this.lastHeard = Date.now();
      this.setState('open');
      const ping = () => {
        this.pingSentAt = performance.now();
        this.send({ t: 'ping' });
      };
      this.timer = setInterval(() => {
        if (Date.now() - this.lastHeard > SILENCE_LIMIT_MS) return this.finish('timeout');
        ping();
      }, PING_EVERY_MS);
      this.send({ t: 'hello', v: 1 });
      // Medida logo na abertura, para a sincronização do começo da partida já ter uma ida e volta real.
      ping();
    };
    channel.onclose = () => this.finish('remote');
    channel.onmessage = (e) => {
      this.lastHeard = Date.now();
      const msg = parseMessage(e.data);
      if (!msg) {
        this.ignored++;
        return;
      }
      if (msg.t === 'ping') {
        this.send({ t: 'pong' });
        return;
      }
      if (msg.t === 'pong') {
        if (this.pingSentAt > 0) {
          const sample = performance.now() - this.pingSentAt;
          this.pingSentAt = 0;
          if (sample >= 0 && sample < 5000) this.rtt = this.rtt === 150 ? sample : this.rtt * 0.6 + sample * 0.4;
        }
        return;
      }
      if (msg.t === 'bye') return this.finish('remote');
      this.onMessage?.(msg);
    };
  }

  private setState(state: PeerState, reason?: CloseReason): void {
    if (this.state === state) return;
    this.state = state;
    this.onState?.(state, reason);
  }

  private finish(reason: CloseReason): void {
    if (this.state === 'closed') return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setState('closed', reason);
    try {
      this.channel?.close();
      this.pc.close();
    } catch {
      /* já fechado */
    }
  }
}
