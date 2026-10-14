import type { Link } from './mqtt';

/** Um "broker" em memória para os testes da sala: entrega a cada ligação do mesmo endereço e tópico (inclusive a quem publicou, como o MQTT faz). */
export class Hub {
  readonly links: FakeLink[] = [];
  down = new Set<string>();
}

export class FakeLink implements Link {
  connected = false;
  onMessage: ((topic: string, payload: string) => void) | null = null;
  onClose: (() => void) | null = null;
  private topic = '';
  constructor(
    readonly url: string,
    private readonly hub: Hub,
  ) {}
  async open(topic: string): Promise<void> {
    if (this.hub.down.has(this.url)) throw new Error('fora do ar');
    this.topic = topic;
    this.connected = true;
    this.hub.links.push(this);
  }
  publish(topic: string, payload: string): void {
    for (const l of this.hub.links) {
      if (l.url === this.url && l.connected && l.topic === topic) queueMicrotask(() => l.onMessage?.(topic, payload));
    }
  }
  close(): void {
    this.connected = false;
  }
}
