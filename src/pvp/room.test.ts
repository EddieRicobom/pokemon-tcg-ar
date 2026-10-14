import { describe, expect, it, vi } from 'vitest';
import type { PeerState } from './peer';
import { hostRoom, joinRoom } from './room';
import type { HostPeer, RoomCallbacks, RoomDeps, RoomPeer } from './room';
import { RoomSignal } from './signal';
import { FakeLink, Hub } from './test-helpers';

class FakePeer implements HostPeer {
  state: PeerState = 'connecting';
  onState: ((s: PeerState) => void) | null = null;
  closed = false;
  answers: string[] = [];
  partner: FakePeer | null = null;
  acceptAnswer = async (code: string) => {
    this.answers.push(code);
    // Aceitar a resposta "abre" a ligação nos dois lados, como o WebRTC faria.
    queueMicrotask(() => {
      this.open();
      this.partner?.open();
    });
    return null;
  };
  open() {
    this.state = 'open';
    this.onState?.('open');
  }
  close() {
    this.closed = true;
  }
}

function setup(over: Partial<RoomDeps> = {}) {
  const hub = new Hub();
  const host = new FakePeer();
  const guestPeers: FakePeer[] = [];
  const deps: RoomDeps = {
    createSignal: (code) => new RoomSignal(code, ['wss://a', 'wss://b'], (u) => new FakeLink(u, hub)),
    hostPeer: async () => ({ peer: host, code: 'PINz.convite' }),
    joinPeer: async (offer) => {
      if (offer !== 'PINz.convite') return { ok: false, message: 'convite ruim' };
      const g = new FakePeer();
      g.partner = null;
      guestPeers.push(g);
      host.partner = g;
      return { ok: true, peer: g as RoomPeer, code: 'PINj.resposta' };
    },
    roomCode: () => '48213',
    ...over,
  };
  return { hub, host, guestPeers, deps };
}

function callbacks() {
  const events = { phases: [] as string[], connected: 0, failed: [] as string[] };
  const cb: RoomCallbacks = {
    onPhase: (p) => events.phases.push(p),
    onConnected: () => events.connected++,
    onFail: (m) => events.failed.push(m),
  };
  return { events, cb };
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe('sala por código curto', () => {
  it('anfitrião e convidado se encontram pelo código e abrem a ligação', async () => {
    const { deps, host, guestPeers } = setup();
    const h = callbacks();
    const g = callbacks();
    const room = hostRoom(h.cb, deps);
    expect(room.code).toBe('48213');
    await tick();
    expect(h.events.phases).toEqual(['service', 'waiting']);
    joinRoom('48213', g.cb, deps);
    await tick(40);
    expect(host.answers).toEqual(['PINj.resposta']);
    expect(guestPeers).toHaveLength(1);
    expect(h.events.connected).toBe(1);
    expect(g.events.connected).toBe(1);
    expect(h.events.failed).toEqual([]);
    expect(g.events.failed).toEqual([]);
    expect(g.events.phases).toEqual(['service', 'looking', 'linking']);
  });

  it('um terceiro jogador recebe "sala cheia"', async () => {
    const { deps, host } = setup();
    host.acceptAnswer = async () => null; // o primeiro ainda está ligando: a sala segue ocupada
    const h = callbacks();
    const first = callbacks();
    const second = callbacks();
    hostRoom(h.cb, deps);
    await tick();
    joinRoom('48213', first.cb, deps);
    await tick(5);
    joinRoom('48213', second.cb, deps);
    await tick(40);
    expect(second.events.failed).toEqual(['Essa sala já tem outro jogador.']);
    expect(first.events.failed).toEqual([]);
  });

  it('código que não existe: o convidado desiste com mensagem clara', async () => {
    vi.useFakeTimers();
    try {
      const { deps } = setup();
      const g = callbacks();
      joinRoom('99999', g.cb, deps);
      await vi.advanceTimersByTimeAsync(13000);
      expect(g.events.failed).toHaveLength(1);
      expect(g.events.failed[0]).toContain('Não achei essa sala');
      expect(g.events.connected).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem serviço de salas: os dois recebem a sugestão dos códigos longos', async () => {
    const { deps, hub } = setup();
    hub.down.add('wss://a');
    hub.down.add('wss://b');
    const h = callbacks();
    const g = callbacks();
    hostRoom(h.cb, deps);
    joinRoom('48213', g.cb, deps);
    await tick();
    expect(h.events.failed[0]).toContain('códigos longos');
    expect(g.events.failed[0]).toContain('códigos longos');
  });

  it('convite que o convidado não consegue ler vira erro do convidado', async () => {
    const { deps } = setup({ hostPeer: async () => ({ peer: new FakePeer(), code: 'lixo' }) });
    const h = callbacks();
    const g = callbacks();
    hostRoom(h.cb, deps);
    await tick();
    joinRoom('48213', g.cb, deps);
    await tick(40);
    expect(g.events.failed).toEqual(['convite ruim']);
  });

  it('cancelar fecha a ligação preparada e não dispara erro', async () => {
    const { deps, host } = setup();
    const h = callbacks();
    const room = hostRoom(h.cb, deps);
    await tick();
    room.cancel();
    expect(host.closed).toBe(true);
    expect(h.events.failed).toEqual([]);
  });

  it('a ligação direta que não abre vira erro com orientação', async () => {
    vi.useFakeTimers();
    try {
      const { deps, host } = setup();
      host.acceptAnswer = async () => null; // aceita a resposta mas nunca abre
      const h = callbacks();
      const g = callbacks();
      hostRoom(h.cb, deps);
      await vi.advanceTimersByTimeAsync(100);
      joinRoom('48213', g.cb, deps);
      await vi.advanceTimersByTimeAsync(31000);
      expect(h.events.failed[0]).toContain('ligação direta');
      expect(g.events.failed[0]).toContain('ligação direta');
    } finally {
      vi.useRealTimers();
    }
  });
});
