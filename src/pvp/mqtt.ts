/**
 * Um cliente MQTT 3.1.1 mínimo sobre WebSocket: só o que a sala do PvP precisa (conectar, assinar um tópico, publicar com
 * QoS 0 e ouvir). Existe para o código da sala ter 5 dígitos: os brokers públicos de MQTT só carregam o "toque na porta"
 * (convite e resposta da ligação); o jogo em si vai direto de um celular ao outro (WebRTC, `peer.ts`).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const MQTT_CONNECT = 1;
export const MQTT_CONNACK = 2;
export const MQTT_PUBLISH = 3;
export const MQTT_PUBACK = 4;
export const MQTT_SUBSCRIBE = 8;
export const MQTT_SUBACK = 9;
export const MQTT_PINGREQ = 12;
export const MQTT_PINGRESP = 13;
export const MQTT_DISCONNECT = 14;

export interface MqttPacket {
  type: number;
  flags: number;
  body: Uint8Array;
}

function varint(n: number): number[] {
  const out: number[] = [];
  do {
    let digit = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) digit |= 0x80;
    out.push(digit);
  } while (n > 0);
  return out;
}

function str(s: string): number[] {
  const bytes = enc.encode(s);
  return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
}

function packet(type: number, flags: number, body: number[] | Uint8Array): Uint8Array {
  const head = [(type << 4) | flags, ...varint(body.length)];
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

export function encodeConnect(clientId: string, keepAliveS: number): Uint8Array {
  return packet(MQTT_CONNECT, 0, [...str('MQTT'), 4, 0x02, keepAliveS >> 8, keepAliveS & 0xff, ...str(clientId)]);
}

export function encodeSubscribe(packetId: number, topic: string): Uint8Array {
  return packet(MQTT_SUBSCRIBE, 2, [packetId >> 8, packetId & 0xff, ...str(topic), 0]);
}

export function encodePublish(topic: string, payload: string): Uint8Array {
  const topicBytes = str(topic);
  const data = enc.encode(payload);
  const body = new Uint8Array(topicBytes.length + data.length);
  body.set(topicBytes, 0);
  body.set(data, topicBytes.length);
  return packet(MQTT_PUBLISH, 0, body);
}

export const PINGREQ = new Uint8Array([MQTT_PINGREQ << 4, 0]);
export const DISCONNECT = new Uint8Array([MQTT_DISCONNECT << 4, 0]);

/** Junta pedaços recebidos e devolve os pacotes completos (um quadro de WebSocket pode trazer vários, ou só parte de um). */
export class MqttParser {
  private buffer = new Uint8Array(0);

  feed(chunk: Uint8Array): MqttPacket[] {
    const joined = new Uint8Array(this.buffer.length + chunk.length);
    joined.set(this.buffer, 0);
    joined.set(chunk, this.buffer.length);
    this.buffer = joined;
    const out: MqttPacket[] = [];
    for (;;) {
      if (this.buffer.length < 2) break;
      let length = 0;
      let mult = 1;
      let i = 1;
      let complete = false;
      for (; i < Math.min(this.buffer.length, 5); i++) {
        const byte = this.buffer[i]!;
        length += (byte & 0x7f) * mult;
        mult *= 128;
        if ((byte & 0x80) === 0) {
          complete = true;
          i++;
          break;
        }
      }
      if (!complete) {
        if (i >= 5) throw new Error('tamanho de pacote MQTT inválido');
        break;
      }
      if (this.buffer.length < i + length) break;
      const first = this.buffer[0]!;
      out.push({ type: first >> 4, flags: first & 0x0f, body: this.buffer.slice(i, i + length) });
      this.buffer = this.buffer.slice(i + length);
    }
    return out;
  }
}

/** Lê um PUBLISH recebido. Aceita QoS 0 e 1 (o broker pode entregar com QoS 1 se assim quiser; `ackId` pede o PUBACK). */
export function decodePublish(p: MqttPacket): { topic: string; payload: string; ackId: number | null } | null {
  if (p.type !== MQTT_PUBLISH || p.body.length < 2) return null;
  const topicLen = (p.body[0]! << 8) | p.body[1]!;
  let pos = 2 + topicLen;
  if (pos > p.body.length) return null;
  const topic = dec.decode(p.body.slice(2, pos));
  const qos = (p.flags >> 1) & 3;
  let ackId: number | null = null;
  if (qos > 0) {
    if (pos + 2 > p.body.length) return null;
    ackId = qos === 1 ? (p.body[pos]! << 8) | p.body[pos + 1]! : null;
    pos += 2;
  }
  return { topic, payload: dec.decode(p.body.slice(pos)), ackId };
}

export function encodePuback(id: number): Uint8Array {
  return packet(MQTT_PUBACK, 0, [id >> 8, id & 0xff]);
}

/** Uma ligação com um broker. Substituível nos testes (`Link`). */
export interface Link {
  readonly url: string;
  connected: boolean;
  onMessage: ((topic: string, payload: string) => void) | null;
  onClose: (() => void) | null;
  /** Conecta e assina o tópico; rejeita se o broker recusar ou demorar. */
  open(topic: string, timeoutMs: number): Promise<void>;
  publish(topic: string, payload: string): void;
  close(): void;
}

const KEEP_ALIVE_S = 30;

export class MqttLink implements Link {
  connected = false;
  onMessage: ((topic: string, payload: string) => void) | null = null;
  onClose: (() => void) | null = null;

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(readonly url: string) {}

  open(topic: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = new MqttParser();
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.close();
        reject(new Error(message));
      };
      const timer = setTimeout(() => fail('tempo esgotado'), timeoutMs);
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url, 'mqtt');
      } catch {
        clearTimeout(timer);
        reject(new Error('endereço inválido'));
        return;
      }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => ws.send(encodeConnect(`pins-${Math.random().toString(36).slice(2, 12)}`, KEEP_ALIVE_S));
      ws.onerror = () => fail('erro de rede');
      ws.onclose = () => {
        if (!settled) return fail('conexão fechada');
        this.drop();
      };
      ws.onmessage = (e) => {
        if (!(e.data instanceof ArrayBuffer)) return;
        let packets: MqttPacket[];
        try {
          packets = parser.feed(new Uint8Array(e.data));
        } catch {
          return fail('resposta inválida');
        }
        for (const p of packets) {
          if (p.type === MQTT_CONNACK) {
            if (p.body[1] !== 0) return fail('broker recusou');
            ws.send(encodeSubscribe(1, topic));
          } else if (p.type === MQTT_SUBACK) {
            if ((p.body[2] ?? 0x80) === 0x80) return fail('assinatura recusada');
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              this.connected = true;
              this.pingTimer = setInterval(() => this.rawSend(PINGREQ), (KEEP_ALIVE_S * 1000) / 2);
              resolve();
            }
          } else if (p.type === MQTT_PUBLISH) {
            const msg = decodePublish(p);
            if (!msg) continue;
            if (msg.ackId !== null) this.rawSend(encodePuback(msg.ackId));
            this.onMessage?.(msg.topic, msg.payload);
          }
        }
      };
    });
  }

  publish(topic: string, payload: string): void {
    if (this.connected) this.rawSend(encodePublish(topic, payload));
  }

  close(): void {
    this.closed = true;
    const ws = this.ws;
    this.drop();
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(DISCONNECT);
      ws?.close();
    } catch {
      /* já fechado */
    }
  }

  private rawSend(data: Uint8Array): void {
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    } catch {
      /* a ligação caiu: onclose avisa */
    }
  }

  private drop(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected && !this.closed) this.onClose?.();
  }
}
