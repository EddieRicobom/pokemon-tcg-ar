/**
 * Mínimo do protocolo MQTT 3.1.1 que o ponto de encontro do PvP usa: conectar, assinar um tópico, publicar (QoS 0) e
 * manter a ligação viva. Só pacotes puros (bytes de entrada e saída); a ligação em si fica em `signal.ts`.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function remainingLength(length: number): number[] {
  const out: number[] = [];
  let rest = length;
  do {
    let digit = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) digit |= 0x80;
    out.push(digit);
  } while (rest > 0);
  return out;
}

function utf8(text: string): number[] {
  const bytes = encoder.encode(text);
  return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
}

function packet(first: number, body: number[] | Uint8Array): Uint8Array {
  const rest = Array.from(body);
  return Uint8Array.from([first, ...remainingLength(rest.length), ...rest]);
}

export function connectPacket(clientId: string, keepAliveSeconds = 30): Uint8Array {
  return packet(0x10, [...utf8('MQTT'), 4, 0x02, keepAliveSeconds >> 8, keepAliveSeconds & 0xff, ...utf8(clientId)]);
}

export function subscribePacket(packetId: number, topic: string): Uint8Array {
  return packet(0x82, [packetId >> 8, packetId & 0xff, ...utf8(topic), 0]);
}

export function unsubscribePacket(packetId: number, topic: string): Uint8Array {
  return packet(0xa2, [packetId >> 8, packetId & 0xff, ...utf8(topic)]);
}

export function publishPacket(topic: string, payload: string): Uint8Array {
  const body = encoder.encode(payload);
  const head = utf8(topic);
  const all = new Uint8Array(head.length + body.length);
  all.set(head, 0);
  all.set(body, head.length);
  return packet(0x30, all);
}

export const PING_PACKET = Uint8Array.from([0xc0, 0x00]);
export const DISCONNECT_PACKET = Uint8Array.from([0xe0, 0x00]);

export type MqttIncoming =
  | { kind: 'connect' }
  | { kind: 'subscribe'; topic: string }
  | { kind: 'unsubscribe'; topic: string }
  | { kind: 'connack'; ok: boolean }
  | { kind: 'suback' }
  | { kind: 'pingresp' }
  | { kind: 'publish'; topic: string; payload: string; retained: boolean }
  | { kind: 'other' };

/** Maior pacote aceito do servidor: o canal de encontro só leva mensagens curtas. */
const MAX_PACKET = 64 * 1024;

/** Junta os pedaços que chegam e entrega um pacote por vez (um pacote pode vir partido, ou vários juntos). */
export class MqttReader {
  private buffer = new Uint8Array(0);

  /** Devolve os pacotes completos; `null` se o servidor mandou algo inválido (a ligação deve ser descartada). */
  push(chunk: Uint8Array): MqttIncoming[] | null {
    const joined = new Uint8Array(this.buffer.length + chunk.length);
    joined.set(this.buffer, 0);
    joined.set(chunk, this.buffer.length);
    this.buffer = joined;
    const out: MqttIncoming[] = [];
    for (;;) {
      if (this.buffer.length < 2) break;
      let length = 0;
      let multiplier = 1;
      let at = 1;
      let done = false;
      while (at < this.buffer.length && at <= 4) {
        const digit = this.buffer[at]!;
        length += (digit & 0x7f) * multiplier;
        multiplier *= 128;
        at++;
        if ((digit & 0x80) === 0) {
          done = true;
          break;
        }
      }
      if (!done) {
        if (at > 4) return null;
        break;
      }
      if (length > MAX_PACKET) return null;
      if (this.buffer.length < at + length) break;
      const first = this.buffer[0]!;
      const body = this.buffer.subarray(at, at + length);
      this.buffer = this.buffer.slice(at + length);
      const parsed = parseBody(first, body);
      if (!parsed) return null;
      out.push(parsed);
    }
    return out;
  }
}

function parseBody(first: number, body: Uint8Array): MqttIncoming | null {
  const type = first >> 4;
  if (type === 1) return { kind: 'connect' };
  if (type === 8 || type === 10) {
    // Só os testes (um servidor de mentira) leem pacotes de cliente: identificador de 2 bytes e o tópico.
    if (body.length < 4) return null;
    const length = (body[2]! << 8) | body[3]!;
    if (4 + length > body.length) return null;
    return { kind: type === 8 ? 'subscribe' : 'unsubscribe', topic: decoder.decode(body.subarray(4, 4 + length)) };
  }
  if (type === 2) return body.length >= 2 ? { kind: 'connack', ok: body[1] === 0 } : null;
  if (type === 9) return { kind: 'suback' };
  if (type === 13) return { kind: 'pingresp' };
  if (type !== 3) return { kind: 'other' };
  if (body.length < 2) return null;
  const topicLength = (body[0]! << 8) | body[1]!;
  let at = 2 + topicLength;
  if (at > body.length) return null;
  const topic = decoder.decode(body.subarray(2, at));
  const qos = (first >> 1) & 3;
  if (qos > 0) at += 2;
  if (at > body.length) return null;
  return { kind: 'publish', topic, payload: decoder.decode(body.subarray(at)), retained: (first & 1) === 1 };
}
