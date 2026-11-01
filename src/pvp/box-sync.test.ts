import { afterEach, describe, expect, it, vi } from 'vitest';
import { boxPvp, connectBoxPvp, leaveBoxPvp, syncPvpStart } from '../app/box-pvp-store';
import { parseMessage } from './wire';

function fakePeer() {
  const sent: unknown[] = [];
  return { sent, send: vi.fn((m: unknown) => (sent.push(m), true)), close: vi.fn(), rtt: 100, onMessage: null as ((m: never) => void) | null, onState: null as unknown };
}

afterEach(() => {
  leaveBoxPvp();
  vi.useRealTimers();
});

describe('largada em conjunto do PvP da Caixa', () => {
  it('as mensagens cx-ready e cx-go passam pela validação do fio', () => {
    expect(parseMessage(JSON.stringify({ t: 'cx-ready', seed: 5, ok: true }))).toEqual({ t: 'cx-ready', seed: 5, ok: true });
    expect(parseMessage(JSON.stringify({ t: 'cx-go', seed: 5 }))).toEqual({ t: 'cx-go', seed: 5 });
    expect(parseMessage(JSON.stringify({ t: 'cx-ready', seed: -1, ok: true }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'cx-ready', seed: 5 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'cx-go', seed: 1.5 }))).toBeNull();
  });

  it('o anfitrião só manda cx-go quando o convidado avisa que está pronto', async () => {
    vi.useFakeTimers();
    const peer = fakePeer();
    connectBoxPvp(peer as never, 'host');
    const done = syncPvpStart(77, true, 5000);
    expect(peer.sent).toEqual([{ t: 'cx-ready', seed: 77, ok: true }]);
    peer.onMessage!({ t: 'cx-ready', seed: 77, ok: true } as never);
    await vi.advanceTimersByTimeAsync(100);
    expect(await done).toBe(true);
    expect(peer.sent).toContainEqual({ t: 'cx-go', seed: 77 });
  });

  it('o convidado começa ao receber o cx-go da mesma luta, e ignora o de outra', async () => {
    vi.useFakeTimers();
    const peer = fakePeer();
    connectBoxPvp(peer as never, 'guest');
    const done = syncPvpStart(77, true, 5000);
    peer.onMessage!({ t: 'cx-go', seed: 12 } as never);
    let resolved = false;
    void done.then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(resolved).toBe(false);
    peer.onMessage!({ t: 'cx-go', seed: 77 } as never);
    expect(await done).toBe(true);
  });

  it('amigo que não responde: desiste no limite de tempo em vez de travar a tela', async () => {
    vi.useFakeTimers();
    const peer = fakePeer();
    connectBoxPvp(peer as never, 'host');
    const done = syncPvpStart(1, true, 3000);
    await vi.advanceTimersByTimeAsync(3100);
    expect(await done).toBe(false);
  });

  it('conexão que cai durante a espera encerra na hora', async () => {
    const peer = fakePeer();
    connectBoxPvp(peer as never, 'guest');
    const done = syncPvpStart(1, true, 60000);
    leaveBoxPvp();
    expect(await done).toBe(false);
    expect(boxPvp.peer).toBeNull();
  });
});
