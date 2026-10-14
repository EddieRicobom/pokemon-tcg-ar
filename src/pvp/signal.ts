import { MqttLink } from './mqtt';
import type { Link } from './mqtt';

/**
 * O "toque na porta" da sala: convite e resposta da ligação viajam por brokers MQTT públicos e gratuitos, num tópico que
 * leva o código de 5 dígitos. É a única parte que passa por terceiros; assim que o WebRTC abre, o jogo vai direto de um
 * celular ao outro. O app liga em todos os brokers ao mesmo tempo e aceita a primeira cópia de cada mensagem: se um broker
 * cair, os outros seguram.
 */

export const DEFAULT_BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081'];

const STORAGE_KEY = 'pins-pvp-brokers';

/** Brokers a usar. Quem mantém o app pode trocar a lista sem novo build: `localStorage['pins-pvp-brokers'] = '["wss://..."]'`. */
export function brokerUrls(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const urls = parsed.filter((u): u is string => typeof u === 'string' && /^wss?:\/\/[^\s]{1,200}$/.test(u)).slice(0, 5);
        if (urls.length > 0) return urls;
      }
    }
  } catch {
    /* sem armazenamento ou valor inválido: usa a lista padrão */
  }
  return DEFAULT_BROKERS;
}

export type SignalMessage =
  | { k: 'join'; g: string }
  | { k: 'full'; g: string }
  | { k: 'offer'; g: string; c: string }
  | { k: 'answer'; g: string; c: string };

interface Envelope {
  i: string;
  f: string;
  m: SignalMessage;
}

const MAX_PAYLOAD = 9000;
const MAX_CODE = 6000;
const ID = /^[a-z0-9]{4,24}$/;

export function parseSignal(text: string): Envelope | null {
  if (text.length > MAX_PAYLOAD) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const m = o.m as Record<string, unknown> | undefined;
  if (typeof o.i !== 'string' || !ID.test(o.i) || typeof o.f !== 'string' || !ID.test(o.f) || !m || typeof m !== 'object') return null;
  if (typeof m.g !== 'string' || !ID.test(m.g)) return null;
  if (m.k === 'join' || m.k === 'full') return { i: o.i, f: o.f, m: { k: m.k, g: m.g } };
  if ((m.k === 'offer' || m.k === 'answer') && typeof m.c === 'string' && m.c.length > 0 && m.c.length <= MAX_CODE) {
    return { i: o.i, f: o.f, m: { k: m.k, g: m.g, c: m.c } };
  }
  return null;
}

export function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/** Código de sala: 5 dígitos. */
export function newRoomCode(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0]! % 100000).padStart(5, '0');
}

/** Aceita "48213", "48 213", "48-213"… e devolve só os 5 dígitos, ou null. */
export function normalizeRoomCode(text: string): string | null {
  const digits = text.replace(/[\s.\-–—]/g, '');
  return /^\d{5}$/.test(digits) ? digits : null;
}

export function topicFor(code: string): string {
  return `pokemon-tcg-ar/pvp/1/${code}`;
}

export type LinkFactory = (url: string) => Link;

export class RoomSignal {
  onMessage: ((msg: SignalMessage) => void) | null = null;
  readonly selfId = newId();
  private links: Link[] = [];
  private readonly seen = new Set<string>();
  private readonly topic: string;

  constructor(
    code: string,
    private readonly urls: string[] = brokerUrls(),
    private readonly makeLink: LinkFactory = (url) => new MqttLink(url),
  ) {
    this.topic = topicFor(code);
  }

  /** Conecta em todos os brokers. Resolve com quantos responderam (pelo menos 1) ou rejeita se nenhum respondeu. */
  async open(timeoutMs = 8000): Promise<number> {
    const links = this.urls.map((u) => this.makeLink(u));
    this.links = links;
    for (const link of links) {
      link.onMessage = (_topic, payload) => this.receive(payload);
    }
    const results = await Promise.allSettled(links.map((l) => l.open(this.topic, timeoutMs)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok === 0) {
      this.close();
      throw new Error('nenhum serviço de salas respondeu');
    }
    return ok;
  }

  send(msg: SignalMessage): void {
    const payload = JSON.stringify({ i: newId(), f: this.selfId, m: msg } satisfies Envelope);
    for (const link of this.links) link.publish(this.topic, payload);
  }

  close(): void {
    this.onMessage = null;
    for (const link of this.links) {
      link.onMessage = null;
      link.close();
    }
    this.links = [];
  }

  private receive(payload: string): void {
    const env = parseSignal(payload);
    if (!env || env.f === this.selfId || this.seen.has(env.i)) return;
    this.seen.add(env.i);
    if (this.seen.size > 500) this.seen.clear();
    this.onMessage?.(env.m);
  }
}
