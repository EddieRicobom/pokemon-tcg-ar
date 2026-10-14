import { describe, expect, it } from 'vitest';
import { FakeLink, Hub } from './test-helpers';
import { RoomSignal, newRoomCode, normalizeRoomCode, parseSignal, topicFor } from './signal';

describe('código da sala', () => {
  it('sempre tem 5 dígitos, com zeros à esquerda', () => {
    for (let i = 0; i < 200; i++) expect(newRoomCode()).toMatch(/^\d{5}$/);
  });
  it('aceita espaço, hífen e ponto ao digitar', () => {
    expect(normalizeRoomCode('48213')).toBe('48213');
    expect(normalizeRoomCode(' 48 213 ')).toBe('48213');
    expect(normalizeRoomCode('482-13')).toBe('48213');
    expect(normalizeRoomCode('0123')).toBeNull();
    expect(normalizeRoomCode('123456')).toBeNull();
    expect(normalizeRoomCode('12a45')).toBeNull();
  });
  it('o tópico leva o código', () => {
    expect(topicFor('00042')).toContain('00042');
  });
});

describe('parseSignal', () => {
  const env = (m: unknown) => JSON.stringify({ i: 'abc12345', f: 'zzzz1111', m });
  it('aceita as quatro mensagens', () => {
    expect(parseSignal(env({ k: 'join', g: 'guest123' }))?.m).toEqual({ k: 'join', g: 'guest123' });
    expect(parseSignal(env({ k: 'full', g: 'guest123' }))?.m.k).toBe('full');
    expect(parseSignal(env({ k: 'offer', g: 'guest123', c: 'PINz.abc' }))?.m).toEqual({ k: 'offer', g: 'guest123', c: 'PINz.abc' });
    expect(parseSignal(env({ k: 'answer', g: 'guest123', c: 'PINj.abc' }))?.m.k).toBe('answer');
  });
  it('recusa lixo, tipos errados e cargas gigantes', () => {
    expect(parseSignal('não é json')).toBeNull();
    expect(parseSignal('null')).toBeNull();
    expect(parseSignal(env({ k: 'join' }))).toBeNull();
    expect(parseSignal(env({ k: 'offer', g: 'guest123' }))).toBeNull();
    expect(parseSignal(env({ k: 'offer', g: 'guest123', c: 'x'.repeat(7000) }))).toBeNull();
    expect(parseSignal(env({ k: 'hack', g: 'guest123' }))).toBeNull();
    expect(parseSignal(env({ k: 'join', g: 'Maiúsculas!' }))).toBeNull();
    expect(parseSignal('x'.repeat(10000))).toBeNull();
  });
});

describe('RoomSignal', () => {
  it('entrega a mesma mensagem uma vez só, mesmo vinda de vários brokers, e não devolve a própria', async () => {
    const hub = new Hub();
    const urls = ['wss://a', 'wss://b', 'wss://c'];
    const a = new RoomSignal('11111', urls, (u) => new FakeLink(u, hub));
    const b = new RoomSignal('11111', urls, (u) => new FakeLink(u, hub));
    await a.open();
    await b.open();
    const gotA: string[] = [];
    const gotB: string[] = [];
    a.onMessage = (m) => gotA.push(m.k);
    b.onMessage = (m) => gotB.push(m.k);
    a.send({ k: 'join', g: 'guest123' });
    await new Promise((r) => setTimeout(r, 5));
    expect(gotB).toEqual(['join']);
    expect(gotA).toEqual([]);
  });

  it('funciona com um broker fora do ar e falha quando todos caem', async () => {
    const hub = new Hub();
    hub.down.add('wss://a');
    const ok = new RoomSignal('22222', ['wss://a', 'wss://b'], (u) => new FakeLink(u, hub));
    await expect(ok.open()).resolves.toBe(1);
    hub.down.add('wss://b');
    const bad = new RoomSignal('22222', ['wss://a', 'wss://b'], (u) => new FakeLink(u, hub));
    await expect(bad.open()).rejects.toThrow();
  });

  it('salas diferentes não se misturam', async () => {
    const hub = new Hub();
    const a = new RoomSignal('33333', ['wss://a'], (u) => new FakeLink(u, hub));
    const b = new RoomSignal('44444', ['wss://a'], (u) => new FakeLink(u, hub));
    await a.open();
    await b.open();
    const got: string[] = [];
    b.onMessage = (m) => got.push(m.k);
    a.send({ k: 'join', g: 'guest123' });
    await new Promise((r) => setTimeout(r, 5));
    expect(got).toEqual([]);
  });
});
