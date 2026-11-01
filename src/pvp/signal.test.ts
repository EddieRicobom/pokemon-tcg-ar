import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeBroker } from './fake-broker';
import { connectPacket, MqttReader, publishPacket, subscribePacket } from './mqtt-lite';
import { SignalHub } from './signal';

const flush = async (rounds = 6) => {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
};

afterEach(() => vi.useRealTimers());

describe('MQTT mínimo', () => {
  it('entrega um pacote por vez mesmo quando chegam colados ou partidos', () => {
    const reader = new MqttReader();
    const a = publishPacket('t/a', '{"x":1}');
    const b = publishPacket('t/b', 'ola');
    const joined = new Uint8Array(a.length + b.length);
    joined.set(a, 0);
    joined.set(b, a.length);
    expect(reader.push(joined)).toEqual([
      { kind: 'publish', topic: 't/a', payload: '{"x":1}', retained: false },
      { kind: 'publish', topic: 't/b', payload: 'ola', retained: false },
    ]);
    const half = Math.floor(a.length / 2);
    expect(reader.push(a.slice(0, half))).toEqual([]);
    expect(reader.push(a.slice(half))).toEqual([{ kind: 'publish', topic: 't/a', payload: '{"x":1}', retained: false }]);
  });

  it('textos acima de 127 bytes usam o tamanho em mais de um byte', () => {
    const payload = 'á'.repeat(300);
    expect(new MqttReader().push(publishPacket('t', payload))).toEqual([{ kind: 'publish', topic: 't', payload, retained: false }]);
  });

  it('lê os pacotes de cliente usados pelo broker de teste', () => {
    const reader = new MqttReader();
    expect(reader.push(connectPacket('abc'))).toEqual([{ kind: 'connect' }]);
    expect(reader.push(subscribePacket(7, 'tcgar/x'))).toEqual([{ kind: 'subscribe', topic: 'tcgar/x' }]);
  });

  it('descarta a ligação quando o servidor manda lixo (tamanho absurdo)', () => {
    expect(new MqttReader().push(Uint8Array.from([0x30, 0xff, 0xff, 0xff, 0xff, 0x7f]))).toBeNull();
  });
});

describe('ponto de encontro (SignalHub)', () => {
  function pair(brokers: FakeBroker[]) {
    const make = () => new SignalHub({
      brokers: brokers.map((_, i) => `fake://${i}`),
      factory: (url) => brokers[Number(url.slice(-1))]!.factory(url),
      retryBaseMs: 10,
    });
    return [make(), make()] as const;
  }

  it('uma mensagem publicada chega ao outro celular, uma vez só, mesmo com vários brokers', async () => {
    const brokers = [new FakeBroker(), new FakeBroker(), new FakeBroker()];
    const [a, b] = pair(brokers);
    a.start();
    b.start();
    await flush();
    expect(a.online).toBe(3);
    const got: unknown[] = [];
    b.subscribe('sala', (m) => got.push(m));
    await flush();
    a.publish('sala', { oi: 1 });
    await flush();
    expect(got).toEqual([{ oi: 1 }]);
    a.close();
    b.close();
  });

  it('basta um broker no ar: os outros caídos não impedem de se achar', async () => {
    const up = new FakeBroker();
    const down = new FakeBroker();
    down.down = true;
    const [a, b] = pair([down, up]);
    a.start();
    b.start();
    await flush();
    expect(a.online).toBe(1);
    const got: unknown[] = [];
    b.subscribe('sala', (m) => got.push(m));
    await flush();
    a.publish('sala', { ok: true });
    await flush();
    expect(got).toEqual([{ ok: true }]);
    a.close();
    b.close();
  });

  it('reconecta e reassina os tópicos depois que o broker cai', async () => {
    vi.useFakeTimers();
    const broker = new FakeBroker();
    const [a, b] = pair([broker]);
    a.start();
    b.start();
    await vi.advanceTimersByTimeAsync(5);
    const got: unknown[] = [];
    b.subscribe('sala', (m) => got.push(m));
    await vi.advanceTimersByTimeAsync(5);
    broker.dropAll();
    await vi.advanceTimersByTimeAsync(5);
    expect(b.online).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(b.online).toBe(1);
    a.publish('sala', { depois: 1 });
    await vi.advanceTimersByTimeAsync(5);
    expect(got).toEqual([{ depois: 1 }]);
    a.close();
    b.close();
  });

  it('ignora o que não é uma mensagem do app (lixo no tópico público)', async () => {
    const broker = new FakeBroker();
    const [a, b] = pair([broker]);
    a.start();
    b.start();
    await flush();
    const got: unknown[] = [];
    b.subscribe('sala', (m) => got.push(m));
    await flush();
    // Um terceiro cliente qualquer publica lixo direto no broker.
    const stranger = broker.factory('fake://0');
    stranger.onopen = () => {
      stranger.send(connectPacket('intruso'));
      stranger.send(publishPacket('sala', 'isto não é json'));
      stranger.send(publishPacket('sala', '{"i":"x","d":[1,2]}'));
      stranger.send(publishPacket('sala', '{"d":{"a":1}}'));
    };
    await flush();
    expect(got).toEqual([]);
    a.close();
    b.close();
  });
});
