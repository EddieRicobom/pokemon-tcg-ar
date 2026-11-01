import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeBroker } from './fake-broker';
import { isRoomCode, Matchmaker, MATCH_TIMINGS, newRoomCode, normalizeRoomCode, ROOM_ALPHABET } from './matchmaker';
import type { MatchPeer, OpenRoom, PeerApi } from './matchmaker';
import { SignalHub } from './signal';
import type { CloseReason, PeerState } from './peer';

class FakePeer implements MatchPeer {
  state: PeerState = 'connecting';
  onState: ((state: PeerState, reason?: CloseReason) => void) | null = null;
  answers: string[] = [];
  closed = false;
  constructor(readonly tag: string) {}
  async acceptAnswer(code: string): Promise<string | null> {
    this.answers.push(code);
    return null;
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.state = 'open';
    this.onState?.('open');
  }
}

function fakeApi(): { api: PeerApi<FakePeer>; hosts: FakePeer[]; guests: FakePeer[] } {
  const hosts: FakePeer[] = [];
  const guests: FakePeer[] = [];
  return {
    hosts,
    guests,
    api: {
      host: async () => {
        const peer = new FakePeer(`host${hosts.length}`);
        hosts.push(peer);
        return { peer, code: `OFFER-${peer.tag}` };
      },
      join: async (offer) => {
        if (offer === 'BAD') return { ok: false as const, message: 'convite ruim' };
        const peer = new FakePeer(`guest${guests.length}`);
        guests.push(peer);
        return { ok: true as const, peer, code: `ANSWER-${peer.tag}` };
      },
    },
  };
}

const FAST = { ...MATCH_TIMINGS, announceMs: 50, joinRetryMs: 40, joinTries: 4, claimMs: 300, connectMs: 500, roomTtlMs: 400 };

function setup() {
  const broker = new FakeBroker();
  const make = () => new SignalHub({ brokers: ['fake://0'], factory: (url) => broker.factory(url), retryBaseMs: 10 });
  const hostHub = make();
  const guestHub = make();
  hostHub.start();
  guestHub.start();
  const fake = fakeApi();
  return {
    newHub: make,
    hostHub,
    guestHub,
    ...fake,
    host: new Matchmaker<FakePeer>(hostHub, 'pins', fake.api, FAST),
    guest: new Matchmaker<FakePeer>(guestHub, 'pins', fake.api, FAST),
    close: () => {
      hostHub.close();
      guestHub.close();
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('código de sala', () => {
  it('usa só letras e números fáceis de ler, no tamanho pedido', () => {
    for (let i = 0; i < 200; i++) {
      const code = newRoomCode(4);
      expect(code).toHaveLength(4);
      expect([...code].every((c) => ROOM_ALPHABET.includes(c))).toBe(true);
    }
    expect(ROOM_ALPHABET).not.toMatch(/[01OI]/);
  });

  it('aceita o que o amigo digita: minúsculas, espaços e traços', () => {
    expect(normalizeRoomCode(' k7-m2 ')).toBe('K7M2');
    expect(isRoomCode('K7M2', 4)).toBe(true);
    expect(isRoomCode('K7M', 4)).toBe(false);
    expect(isRoomCode('K7M!', 4)).toBe(false);
  });
});

describe('pareamento pelo ponto de encontro', () => {
  it('o convidado entra pelo código curto e os dois recebem a ligação aberta', async () => {
    vi.useFakeTimers();
    const t = setup();
    await vi.advanceTimersByTimeAsync(20);
    let code = '';
    const hostPeers: FakePeer[] = [];
    const guestPeers: FakePeer[] = [];
    t.host.host({ listed: true, name: 'Ana', note: 'Pins' }, { onCode: (c) => (code = c), onPeer: (p) => hostPeers.push(p), onError: (m) => { throw new Error(m); } });
    await vi.advanceTimersByTimeAsync(100);
    t.guest.join(code, 'Beto', { onStatus: () => undefined, onPeer: (p) => guestPeers.push(p), onError: (m) => { throw new Error(m); } });
    await vi.advanceTimersByTimeAsync(300);
    // A resposta do convidado chegou ao anfitrião.
    expect(t.hosts[0]!.answers).toEqual(['ANSWER-guest0']);
    t.hosts[0]!.open();
    t.guests[0]!.open();
    expect(hostPeers).toHaveLength(1);
    expect(guestPeers).toHaveLength(1);
    t.close();
  });

  it('a resposta repetida do convidado só vale uma vez', async () => {
    vi.useFakeTimers();
    const t = setup();
    await vi.advanceTimersByTimeAsync(20);
    let code = '';
    t.host.host({ listed: false, name: 'Ana' }, { onCode: (c) => (code = c), onPeer: () => undefined, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(100);
    t.guest.join(code, 'Beto', { onStatus: () => undefined, onPeer: () => undefined, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.hosts[0]!.answers).toHaveLength(1);
    t.close();
  });

  it('a sala aparece na lista pública e some quando o anfitrião cancela', async () => {
    vi.useFakeTimers();
    const t = setup();
    await vi.advanceTimersByTimeAsync(20);
    let rooms: OpenRoom[] = [];
    const stop = t.guest.watchRooms((list) => (rooms = list));
    const session = t.host.host({ listed: true, name: 'Ana', note: '3 pins' }, { onCode: () => undefined, onPeer: () => undefined, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(200);
    expect(rooms.map((r) => [r.code, r.name, r.note])).toEqual([[session.code(), 'Ana', '3 pins']]);
    session.cancel();
    await vi.advanceTimersByTimeAsync(100);
    expect(rooms).toEqual([]);
    stop();
    t.close();
  });

  it('sala privada (backup) não entra na lista', async () => {
    vi.useFakeTimers();
    const t = setup();
    await vi.advanceTimersByTimeAsync(20);
    let rooms: OpenRoom[] = [];
    const stop = t.guest.watchRooms((list) => (rooms = list));
    t.host.host({ listed: false, name: 'Ana', codeLength: 6 }, { onCode: () => undefined, onPeer: () => undefined, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(300);
    expect(rooms).toEqual([]);
    stop();
    t.close();
  });

  it('quem chega depois da sala cheia recebe «sala ocupada»', async () => {
    vi.useFakeTimers();
    const t = setup();
    await vi.advanceTimersByTimeAsync(20);
    let code = '';
    t.host.host({ listed: false, name: 'Ana' }, { onCode: (c) => (code = c), onPeer: () => undefined, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(100);
    t.guest.join(code, 'Beto', { onStatus: () => undefined, onPeer: () => undefined, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(60);
    const lateHub = t.newHub();
    lateHub.start();
    await vi.advanceTimersByTimeAsync(20);
    const errors: string[] = [];
    new Matchmaker<FakePeer>(lateHub, 'pins', t.api, FAST).join(code, 'Caio', { onStatus: () => undefined, onPeer: () => undefined, onError: (m) => errors.push(m) });
    await vi.advanceTimersByTimeAsync(120);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('outro jogador');
    lateHub.close();
    t.close();
  });

  it('código que não existe: avisa depois de algumas tentativas, sem travar', async () => {
    vi.useFakeTimers();
    const t = setup();
    await vi.advanceTimersByTimeAsync(20);
    const errors: string[] = [];
    t.guest.join('ZZZZ', 'Beto', { onStatus: () => undefined, onPeer: () => undefined, onError: (m) => errors.push(m) });
    await vi.advanceTimersByTimeAsync(1000);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Não achei a sala ZZZZ');
    t.close();
  });

  it('código com tamanho errado é recusado na hora, com a explicação', () => {
    const t = setup();
    const errors: string[] = [];
    t.guest.join('AB', 'Beto', { onStatus: () => undefined, onPeer: () => undefined, onError: (m) => errors.push(m) });
    expect(errors[0]).toContain('4 letras ou números');
    t.close();
  });

  it('convidado que não conclui libera a sala para o próximo', async () => {
    vi.useFakeTimers();
    const t = setup();
    await vi.advanceTimersByTimeAsync(20);
    let code = '';
    const hostPeers: FakePeer[] = [];
    t.host.host({ listed: false, name: 'Ana' }, { onCode: (c) => (code = c), onPeer: (p) => hostPeers.push(p), onError: () => undefined });
    await vi.advanceTimersByTimeAsync(100);
    // Primeiro convidado bate à porta e some antes de responder.
    const cancel = t.guest.join(code, 'Beto', { onStatus: () => undefined, onPeer: () => undefined, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(50);
    cancel();
    await vi.advanceTimersByTimeAsync(400);
    const second: FakePeer[] = [];
    t.guest.join(code, 'Caio', { onStatus: () => undefined, onPeer: (p) => second.push(p), onError: (m) => { throw new Error(m); } });
    await vi.advanceTimersByTimeAsync(300);
    t.hosts[0]!.open();
    t.guests.at(-1)!.open();
    expect(hostPeers).toHaveLength(1);
    expect(second).toHaveLength(1);
    t.close();
  });
});
