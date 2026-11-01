import { MqttReader } from './mqtt-lite';
import type { SocketFactory, SocketLike } from './signal';

/** Um broker MQTT de mentira, em memória, só para os testes do ponto de encontro (não entra no app). */
export class FakeBroker {
  private readonly sockets = new Set<FakeSocket>();
  /** Derruba as ligações novas (simula o broker fora do ar). */
  down = false;
  readonly factory: SocketFactory = () => new FakeSocket(this);

  /** Cada ligação aberta agora. */
  get connections(): number {
    return [...this.sockets].filter((s) => s.connected).length;
  }

  register(socket: FakeSocket): void {
    this.sockets.add(socket);
  }

  unregister(socket: FakeSocket): void {
    this.sockets.delete(socket);
  }

  fanOut(topic: string, bytes: Uint8Array): void {
    for (const socket of this.sockets) if (socket.connected && socket.topics.has(topic)) socket.deliver(bytes);
  }

  /** Derruba todas as ligações abertas (o cliente deve reconectar). */
  dropAll(): void {
    for (const socket of [...this.sockets]) socket.serverClose();
  }
}

export class FakeSocket implements SocketLike {
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  connected = false;
  readonly topics = new Set<string>();
  private readonly reader = new MqttReader();
  private closed = false;

  constructor(private readonly broker: FakeBroker) {
    broker.register(this);
    queueMicrotask(() => {
      if (this.closed) return;
      if (broker.down) return this.serverClose();
      this.onopen?.();
    });
  }

  send(data: Uint8Array): void {
    if (this.closed) return;
    const packets = this.reader.push(data) ?? [];
    for (const packet of packets) {
      if (packet.kind === 'connect') {
        this.connected = true;
        this.deliver(Uint8Array.from([0x20, 0x02, 0x00, 0x00]));
      } else if (packet.kind === 'subscribe') this.topics.add(packet.topic);
      else if (packet.kind === 'unsubscribe') this.topics.delete(packet.topic);
      else if (packet.kind === 'publish') this.broker.fanOut(packet.topic, data);
    }
  }

  /** O que o servidor entrega é o próprio pacote de publicação do cliente (QoS 0 não muda nada nele). */
  deliver(bytes: Uint8Array): void {
    const copy = bytes.slice().buffer;
    queueMicrotask(() => {
      if (!this.closed) this.onmessage?.({ data: copy });
    });
  }

  serverClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.broker.unregister(this);
    queueMicrotask(() => this.onclose?.());
  }

  close(): void {
    this.closed = true;
    this.connected = false;
    this.broker.unregister(this);
  }
}
