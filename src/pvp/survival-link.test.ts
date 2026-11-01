import { describe, expect, it } from 'vitest';
import { NO_INPUT, SV_COUNTDOWN_MS, SV_SNAPSHOT_MS, snapshotArena, createArena } from '../core/survivor-pvp';
import type { SvMonSpec } from '../core/survivor-pvp';
import { SurvivalGuestLink, SurvivalHostLink } from './survival-link';
import { encodeMessage, parseMessage } from './wire';
import type { WireMessage } from './wire';

const mon = (id: string, extra: Partial<SvMonSpec> = {}): SvMonSpec => ({
  id, name: id, dexId: 25, shiny: false, types: ['normal'], attackType: 'normal', maxHp: 100, power: 20, speed: 100, fireMs: 500, score: 50, estimated: false, ...extra,
});

/** Um canal que passa cada mensagem pelo mesmo texto JSON e pela mesma validação do fio de verdade. */
function pipe(): { tx: { send(m: WireMessage): boolean }; take(): WireMessage[]; dropped: number } {
  const queue: WireMessage[] = [];
  const state = { dropped: 0 };
  return {
    tx: {
      send(m) {
        const parsed = parseMessage(encodeMessage(m));
        if (parsed) queue.push(parsed);
        else state.dropped++;
        return true;
      },
    },
    take: () => queue.splice(0),
    get dropped() {
      return state.dropped;
    },
  };
}

function setup() {
  const toGuest = pipe();
  const toHost = pipe();
  const hostTeam = [mon('a'), mon('b'), mon('c')];
  const guestTeam = [mon('x'), mon('y'), mon('z')];
  const host = new SurvivalHostLink(toGuest.tx, hostTeam, guestTeam);
  const guest = new SurvivalGuestLink(toHost.tx, hostTeam, guestTeam);
  let now = 0;
  return {
    host, guest, toGuest, toHost,
    /** Um quadro de 16 ms nos dois aparelhos. */
    frame(hostInput = NO_INPUT, guestInput = NO_INPUT) {
      now += 16;
      guest.sendInput(guestInput, now);
      for (const m of toHost.take()) host.receive(m);
      host.step(16, hostInput);
      for (const m of toGuest.take()) guest.receive(m, now);
    },
    get now() {
      return now;
    },
  };
}

describe('survival pvp: ligação anfitrião ↔ convidado', () => {
  it('manda instantâneos válidos pelo fio e o convidado os adota', () => {
    const t = setup();
    for (let i = 0; i < 200; i++) t.frame({ dx: 0.5, dy: 0, switchTo: -1 });
    expect(t.toGuest.dropped).toBe(0);
    expect(t.guest.received).toBeGreaterThan(5);
    // O convidado está até um instantâneo (66 ms ≈ 3 unidades a esta velocidade) atrás do anfitrião.
    expect(Math.abs(t.guest.state.sides[0].x - t.host.state.sides[0].x)).toBeLessThan(6);
    expect(t.guest.state.countdownMs).toBeLessThan(SV_COUNTDOWN_MS);
  });

  it('os instantâneos saem a ~15 Hz, não a cada quadro', () => {
    const t = setup();
    for (let i = 0; i < 100; i++) t.frame();
    const expected = (100 * 16) / SV_SNAPSHOT_MS;
    expect(t.guest.received).toBeLessThanOrEqual(expected + 2);
    expect(t.guest.received).toBeGreaterThan(expected / 2);
  });

  it('a entrada do convidado move o Pokémon dele no anfitrião (e o parar também)', () => {
    const t = setup();
    for (let i = 0; i < 260; i++) t.frame(NO_INPUT, NO_INPUT); // contagem
    const start = t.host.state.sides[1].x;
    for (let i = 0; i < 30; i++) t.frame(NO_INPUT, { dx: 1, dy: 0, switchTo: -1 });
    const moved = t.host.state.sides[1].x;
    expect(moved).toBeGreaterThan(start + 20);
    for (let i = 0; i < 10; i++) t.frame(NO_INPUT, NO_INPUT);
    const stopped = t.host.state.sides[1].x;
    for (let i = 0; i < 30; i++) t.frame(NO_INPUT, NO_INPUT);
    expect(t.host.state.sides[1].x).toBe(stopped);
  });

  it('o pedido de troca do convidado vale uma vez e aparece nos eventos de volta', () => {
    const t = setup();
    for (let i = 0; i < 260; i++) t.frame();
    t.frame(NO_INPUT, { dx: 0, dy: 0, switchTo: 2 });
    for (let i = 0; i < 10; i++) t.frame();
    expect(t.host.state.sides[1].active).toBe(2);
    expect(t.guest.state.sides[1].active).toBe(2);
    expect(t.guest.events.some((e) => e.k === 'switch' && e.side === 1 && e.index === 2 && !e.forced)).toBe(true);
  });

  it('ignora entrada repetida ou antiga', () => {
    const toGuest = pipe();
    const host = new SurvivalHostLink(toGuest.tx, [mon('a')], [mon('x')]);
    for (let i = 0; i < 200; i++) host.step(16, NO_INPUT);
    host.receive({ t: 'sv-input', seq: 5, dx: 1, dy: 0, switchTo: -1 });
    host.receive({ t: 'sv-input', seq: 3, dx: -1, dy: 0, switchTo: -1 });
    const x = host.state.sides[1].x;
    host.step(50, NO_INPUT);
    expect(host.state.sides[1].x).toBeGreaterThan(x);
  });

  it('a luta termina para os dois e o resultado chega ao convidado', () => {
    const toGuest = pipe();
    const toHost = pipe();
    const hostTeam = [mon('a', { power: 150, fireMs: 450, maxHp: 500 })];
    const guestTeam = [mon('x', { maxHp: 20 })];
    const host = new SurvivalHostLink(toGuest.tx, hostTeam, guestTeam);
    const guest = new SurvivalGuestLink(toHost.tx, hostTeam, guestTeam);
    let now = 0;
    for (let i = 0; i < 1500 && host.state.winner === null; i++) {
      now += 16;
      host.step(16, NO_INPUT);
      for (const m of toGuest.take()) guest.receive(m, now);
    }
    expect(host.state.winner).toBe(0);
    for (const m of toGuest.take()) guest.receive(m, now);
    expect(guest.state.winner).toBe(0);
    expect(guest.events.some((e) => e.k === 'faint' && e.side === 1)).toBe(true);
  });

  it('o convidado suaviza entre dois instantâneos', () => {
    const t = setup();
    for (let i = 0; i < 300; i++) t.frame({ dx: 0.3, dy: 0, switchTo: -1 });
    const view = t.guest.view(t.now + SV_SNAPSHOT_MS * 2);
    expect(view.sides[0].x).toBeCloseTo(t.guest.state.sides[0].x, 5);
    const mid = t.guest.view(t.now + SV_SNAPSHOT_MS / 2);
    expect(mid.sides[0].x).toBeLessThanOrEqual(view.sides[0].x + 1e-9);
  });
});

describe('survival pvp: validação do fio', () => {
  const good = (): WireMessage => ({ t: 'sv-snap', snap: snapshotArena(createArena([mon('a')], [mon('x')]), 1), events: [] });

  it('aceita as mensagens bem formadas', () => {
    const msgs: WireMessage[] = [
      { t: 'sv-team', name: 'Ash', team: [mon('a'), mon('b')] }, { t: 'sv-progress', done: 2 }, { t: 'sv-start' }, { t: 'sv-go' },
      { t: 'sv-ready', ok: false }, { t: 'sv-input', seq: 3, dx: 0.5, dy: -1, switchTo: 2 }, good(),
    ];
    for (const m of msgs) expect(parseMessage(encodeMessage(m))).toEqual(m);
  });

  it('recusa equipe com números absurdos, tipo desconhecido, repetida ou grande demais', () => {
    const ok = { t: 'sv-team', name: 'Ash', team: [mon('a')] };
    expect(parseMessage(JSON.stringify(ok))).not.toBeNull();
    const bad = (m: Partial<SvMonSpec>): unknown => ({ ...ok, team: [mon('a', m)] });
    expect(parseMessage(JSON.stringify(bad({ maxHp: 999999 })))).toBeNull();
    expect(parseMessage(JSON.stringify(bad({ power: 0 })))).toBeNull();
    expect(parseMessage(JSON.stringify(bad({ fireMs: 1 })))).toBeNull();
    expect(parseMessage(JSON.stringify(bad({ dexId: 0 })))).toBeNull();
    expect(parseMessage(JSON.stringify(bad({ attackType: 'sombra' as never })))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...ok, team: [mon('a'), mon('a')] }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...ok, team: [mon('a'), mon('b'), mon('c'), mon('d')] }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...ok, team: [] }))).toBeNull();
    expect(parseMessage(JSON.stringify({ ...ok, name: 'N'.repeat(40) }))).toBeNull();
  });

  it('recusa entrada e instantâneo fora dos limites', () => {
    expect(parseMessage(JSON.stringify({ t: 'sv-input', seq: 1, dx: 5, dy: 0, switchTo: -1 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'sv-input', seq: 1, dx: 0, dy: 0, switchTo: 3 }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'sv-input', seq: -1, dx: 0, dy: 0, switchTo: 0 }))).toBeNull();
    const snap = JSON.parse(encodeMessage(good())) as { snap: { sides: { x: number }[]; shots: unknown[] } };
    snap.snap.sides[0]!.x = 99999;
    expect(parseMessage(JSON.stringify(snap))).toBeNull();
    const many = JSON.parse(encodeMessage(good())) as { snap: { shots: unknown[] } };
    many.snap.shots = Array.from({ length: 200 }, (_, id) => ({ id, side: 0, x: 1, y: 1, vx: 1, vy: 1, type: 'fire' }));
    expect(parseMessage(JSON.stringify(many))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'sv-snap', snap: JSON.parse(encodeMessage(good())).snap, events: [{ k: 'hit', side: 0, damage: -1, mult: 1 }] }))).toBeNull();
  });
});
