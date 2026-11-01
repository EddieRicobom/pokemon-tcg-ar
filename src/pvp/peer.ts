import { decodeCode, encodeCode } from './codec';
import { encodeMessage, parseMessage } from './wire';
import type { WireMessage } from './wire';
import { candidateSummary, pvpLog } from './pvp-log';

/**
 * A ligação direta entre os dois celulares (WebRTC, canal de dados). Não há servidor do app: o pareamento é feito
 * trocando dois códigos de texto (`codec.ts`) e, depois disso, as mensagens vão de um celular ao outro.
 *
 * Servidores STUN públicos só ajudam cada celular a descobrir o próprio endereço de fora da rede (eles não veem o jogo).
 * Na mesma rede Wi-Fi nem são necessários. Em algumas operadoras (CGNAT) a ligação direta pode não fechar; a tela avisa.
 */

/**
 * Retransmissão (TURN) opcional, para as redes em que a ligação direta não fecha (4G com CGNAT, redes com NAT simétrico).
 * Vem do build (`VITE_PVP_TURN_URLS` separados por vírgula, `VITE_PVP_TURN_USER`, `VITE_PVP_TURN_PASS`, definidos como
 * variáveis do repositório no GitHub). Sem elas, só STUN: funciona na maioria das redes, mas não em todas. O jogo vai
 * cifrado (DTLS) pela retransmissão; ela só repassa bytes. A retransmissão pública antiga (Open Relay) parou de responder
 * e travava a coleta de candidatos por 4,5 s em cada lado, por isso saiu.
 */
function turnFromEnv(): RTCIceServer[] {
  const urls = ((import.meta.env.VITE_PVP_TURN_URLS as string | undefined) ?? '').split(',').map((u) => u.trim()).filter((u) => /^turns?:/.test(u));
  if (urls.length === 0) return [];
  return [{ urls, username: (import.meta.env.VITE_PVP_TURN_USER as string | undefined) ?? '', credential: (import.meta.env.VITE_PVP_TURN_PASS as string | undefined) ?? '' }];
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ...turnFromEnv(),
];

/** Há retransmissão configurada neste build (a tela usa para explicar a falha de rede). */
export const HAS_TURN = DEFAULT_ICE_SERVERS.length > 1;

/** Espera pelos candidatos de rede antes de gerar o código (o código leva todos: não há servidor para trocar candidatos depois). */
const GATHER_TIMEOUT_MS = 4500;
const PING_EVERY_MS = 3500;
const SILENCE_LIMIT_MS = 13000;

/** O navegador terminou de coletar endereços de rede sem achar nenhum: não há por onde ligar os celulares. */
export class NoCandidatesError extends Error {
  constructor() {
    super('sem candidatos de rede');
  }
}

export const NO_CANDIDATES_MESSAGE =
  'Este navegador não gerou nenhum endereço de rede para a conexão (WebRTC bloqueado). Desligue VPN, modo privado ou extensões de privacidade e tente no Chrome ou no Safari atualizados.';

/** Quantos candidatos de rede há num SDP. */
export function countCandidates(sdp: string): number {
  return (sdp.match(/^a=candidate:/gm) ?? []).length;
}

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
    // Cada candidato que o navegador acha, em código curto: «K host/udp», «K srflx/udp», «K host/udp/m» (endereço oculto por mDNS).
    this.pc.onicecandidate = (e) => {
      const c = e.candidate;
      if (c) pvpLog('K', `${c.type ?? '?'}/${c.protocol ?? '?'}${c.address?.endsWith('.local') ? '/m' : ''}`);
    };
    this.pc.onicecandidateerror = (e) => {
      const ev = e as RTCPeerConnectionIceErrorEvent;
      pvpLog('KE', `${ev.errorCode} ${(ev.url ?? '').slice(0, 24)}`);
    };
    pvpLog('UA', shortAgent());
    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc.iceConnectionState;
      pvpLog(`I:${s}`);
      if (s === 'connected' || s === 'completed') void this.logPath();
    };
  }

  /** Registra o caminho escolhido (ex.: «P:host-srflx»: candidato local host, remoto srflx). */
  /** Estado de coleta e de conexão, para o diário. */
  private async logPath(): Promise<void> {
    try {
      const stats = await this.pc.getStats();
      let pairId = '';
      stats.forEach((r: { type?: string; selectedCandidatePairId?: string }) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
      });
      let pair: { localCandidateId?: string; remoteCandidateId?: string; nominated?: boolean; state?: string } | undefined;
      stats.forEach((r: { type?: string; id?: string; nominated?: boolean; state?: string }) => {
        if (r.type === 'candidate-pair' && (r.id === pairId || (!pairId && r.nominated && r.state === 'succeeded'))) pair = r as typeof pair;
      });
      if (!pair) return;
      const type = (id?: string) => (stats.get(id ?? '') as { candidateType?: string } | undefined)?.candidateType ?? '?';
      pvpLog(`P:${type(pair.localCandidateId)}-${type(pair.remoteCandidateId)}`);
    } catch {
      /* navegador sem getStats completo */
    }
  }

  /** O anfitrião: cria o convite. Mostre `code` ao amigo e depois chame `acceptAnswer` com o código que ele devolver. */
  static async host(options: PeerOptions = {}): Promise<{ peer: PvpPeer; code: string }> {
    const peer = new PvpPeer(options);
    peer.attach(peer.pc.createDataChannel('pins', { ordered: true }));
    peer.setState('connecting');
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      await peer.gathered();
      return { peer, code: await encodeCode('offer', peer.pc.localDescription!.sdp) };
    } catch (e) {
      peer.close();
      throw e;
    }
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
    } catch (e) {
      peer.close();
      if (e instanceof NoCandidatesError) return { ok: false, message: NO_CANDIDATES_MESSAGE };
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
    const started = Date.now();
    const report = () => {
      const sdp = this.pc.localDescription?.sdp ?? '';
      pvpLog(`C ${candidateSummary(sdp)}`, `${Date.now() - started}ms`);
      // Sem nenhum endereço o outro celular não tem para onde ligar: falha já, com a explicação, em vez de esperar 30 s.
      if (countCandidates(sdp) === 0) throw new NoCandidatesError();
    };
    if (this.pc.iceGatheringState === 'complete') {
      try {
        report();
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timeout);
        this.pc.removeEventListener('icegatheringstatechange', check);
        try {
          report();
          resolve();
        } catch (e) {
          reject(e);
        }
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

/** Navegador e sistema em poucas letras («Cr/And», «Sf/iOS»), só para o diário. */
function shortAgent(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Ed' : /Firefox\//.test(ua) ? 'Fx' : /(Chrome|CriOS)\//.test(ua) ? 'Cr' : /Safari\//.test(ua) ? 'Sf' : '?';
  const os = /Android/.test(ua) ? 'And' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Win' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Lin' : '?';
  return `${browser}/${os}`;
}
