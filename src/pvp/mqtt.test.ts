import { describe, expect, it } from 'vitest';
import { MQTT_PUBLISH, MQTT_SUBSCRIBE, MqttParser, decodePublish, encodeConnect, encodePublish, encodeSubscribe } from './mqtt';

describe('MQTT mínimo', () => {
  it('codifica um PUBLISH e lê de volta, inclusive com acento', () => {
    const bytes = encodePublish('pokemon-tcg-ar/pvp/1/48213', '{"k":"join","nome":"João"}');
    const [p] = new MqttParser().feed(bytes);
    expect(p?.type).toBe(MQTT_PUBLISH);
    expect(decodePublish(p!)).toEqual({ topic: 'pokemon-tcg-ar/pvp/1/48213', payload: '{"k":"join","nome":"João"}', ackId: null });
  });

  it('usa o tamanho em bytes variável para cargas grandes (acima de 127 e de 16383)', () => {
    const big = 'x'.repeat(20000);
    const [p] = new MqttParser().feed(encodePublish('t', big));
    expect(decodePublish(p!)?.payload.length).toBe(20000);
  });

  it('junta pacotes que chegam em pedaços e separa os que chegam colados', () => {
    const a = encodePublish('t', 'um');
    const b = encodePublish('t', 'dois');
    const all = new Uint8Array(a.length + b.length);
    all.set(a, 0);
    all.set(b, a.length);
    const parser = new MqttParser();
    expect(parser.feed(all.slice(0, 3))).toEqual([]);
    const got = parser.feed(all.slice(3));
    expect(got.map((x) => decodePublish(x)?.payload)).toEqual(['um', 'dois']);
  });

  it('SUBSCRIBE leva o id e o tópico; CONNECT leva o protocolo MQTT 3.1.1', () => {
    const [sub] = new MqttParser().feed(encodeSubscribe(1, 'a/b'));
    expect(sub?.type).toBe(MQTT_SUBSCRIBE);
    expect(Array.from(sub!.body)).toEqual([0, 1, 0, 3, 97, 47, 98, 0]);
    const conn = encodeConnect('abc', 30);
    expect(Array.from(conn.slice(2, 10))).toEqual([0, 4, 77, 81, 84, 84, 4, 2]);
  });

  it('PUBLISH com QoS 1 pede confirmação com o id', () => {
    const body = new Uint8Array([0, 1, 116, 0, 7, 111, 107]);
    expect(decodePublish({ type: MQTT_PUBLISH, flags: 2, body })).toEqual({ topic: 't', payload: 'ok', ackId: 7 });
  });

  it('tamanho inválido (mais de 4 bytes) é erro', () => {
    expect(() => new MqttParser().feed(new Uint8Array([0x30, 0x80, 0x80, 0x80, 0x80, 0x01]))).toThrow();
  });
});
