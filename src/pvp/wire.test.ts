import { describe, expect, it } from 'vitest';
import { seededRng } from '../core/battle';
import { aliveOf, createWorld, launch, stepWorld } from '../core/pins';
import type { PinWorld } from '../core/pins';
import {
  applyWorld, buildPvpWorld, encodeMessage, localSide, parseMessage, parseSpec, prefixSpecs, shotFromWire, shotToWire, snapshotInit, snapshotWorld,
} from './wire';
import type { WireMessage, WireSpec } from './wire';

const spec = (id: string, extra: Partial<WireSpec> = {}): WireSpec => ({
  id, name: id.toUpperCase(), types: ['fire'], stats: { hp: 60, attack: 70, defense: 50, spAttack: 60, spDefense: 50, speed: 80 }, weightKg: 25, sprite: 4,
  attacks: [{ name: 'Brasa', cost: ['Fire'], damage: '30' }, { name: 'Pancada', cost: ['Colorless', 'Colorless'], damage: '70' }], ...extra,
});

const hostSpecs = prefixSpecs('host', [spec('a'), spec('b'), spec('c')]);
const guestSpecs = prefixSpecs('guest', [spec('a'), spec('d'), spec('e')]);

function hostWorld(): PinWorld {
  return createWorld({ mine: hostSpecs, enemy: guestSpecs }, seededRng(7), { marks: true, shrink: true });
}

describe('pvp: pins com o mesmo cartão nos dois lados', () => {
  it('o prefixo evita ids repetidos quando os dois têm a mesma carta', () => {
    expect(hostSpecs[0]!.id).toBe('h:a');
    expect(guestSpecs[0]!.id).toBe('g:a');
    expect(new Set([...hostSpecs, ...guestSpecs].map((s) => s.id)).size).toBe(6);
  });
});

describe('pvp: o mundo do convidado é o espelho do anfitrião', () => {
  it('pins, chão e pinos de mola chegam girados e com os lados trocados', () => {
    const host = hostWorld();
    const init = snapshotInit(host, { shrink: true, marks: true });
    const guest = buildPvpWorld(init, hostSpecs, guestSpecs, 'guest', seededRng(1));
    expect(guest.pins.filter((p) => p.side === 0).map((p) => p.id)).toEqual(['g:a', 'g:d', 'g:e']);
    for (const hp of host.pins) {
      const gp = guest.pins.find((p) => p.id === hp.id)!;
      expect(gp.x).toBeCloseTo(-hp.x, 9);
      expect(gp.y).toBeCloseTo(-hp.y, 9);
      expect(gp.side).toBe(localSide('guest', hp.side));
    }
    // O convidado começa embaixo (y positivo) e o anfitrião também: cada um vê os seus pins embaixo.
    expect(Math.min(...guest.pins.filter((p) => p.side === 0).map((p) => p.y))).toBeGreaterThan(0);
    expect(Math.max(...guest.pins.filter((p) => p.side === 1).map((p) => p.y))).toBeLessThan(0);
    expect(guest.patches.length).toBe(host.patches.length);
    expect(guest.shrinking).toBe(true);
  });

  it('o chão gira: a marca fica no mesmo lugar visto por quem a vê', () => {
    const host = hostWorld();
    const init = snapshotInit(host, { shrink: false, marks: true });
    const guest = buildPvpWorld(init, hostSpecs, guestSpecs, 'guest', seededRng(1));
    const n = host.terrain!.over.length;
    for (let i = 0; i < n; i++) {
      expect(guest.terrain!.over[n - 1 - i]).toBe(host.terrain!.over[i]);
      expect(guest.terrain!.base[n - 1 - i]).toBe(host.terrain!.base[i]);
    }
  });
});

describe('pvp: estado depois da jogada', () => {
  it('anfitrião → convidado → anfitrião devolve o mesmo estado', () => {
    const host = hostWorld();
    const init = snapshotInit(host, { shrink: true, marks: true });
    const guest = buildPvpWorld(init, hostSpecs, guestSpecs, 'guest', seededRng(1));
    // O anfitrião dispara e a física roda no mundo dele.
    const shooter = host.pins.find((p) => p.id === 'h:b')!;
    launch(shooter, { dirX: 0, dirY: -1, power: 1 }, 1);
    for (let i = 0; i < 600; i++) stepWorld(host, 1 / 120);
    const snap = snapshotWorld(host, 'host');
    const applied = applyWorld(guest, snap, 'guest');
    expect(applied.changedCells.length).toBeGreaterThanOrEqual(0);
    for (const hp of host.pins) {
      const gp = guest.pins.find((p) => p.id === hp.id)!;
      expect(gp.x).toBeCloseTo(-hp.x, 9);
      expect(gp.y).toBeCloseTo(-hp.y, 9);
      expect(gp.alive).toBe(hp.alive);
      expect(gp.cooldowns).toEqual(hp.cooldowns);
    }
    // A ordem dos pins no mundo de cada um é diferente (cada um lista os seus primeiro); o estado é o mesmo.
    const byId = (w: ReturnType<typeof snapshotWorld>) => ({ ...w, pins: [...w.pins].sort((a, b) => a.id.localeCompare(b.id)) });
    const back = snapshotWorld(guest, 'guest');
    expect(byId(back)).toEqual(byId(snap));
  });

  it('as pontuações de quem caiu batem nos dois lados', () => {
    const host = hostWorld();
    const guest = buildPvpWorld(snapshotInit(host, { shrink: false, marks: true }), hostSpecs, guestSpecs, 'guest', seededRng(1));
    host.pins.find((p) => p.id === 'g:d')!.alive = false;
    applyWorld(guest, snapshotWorld(host, 'host'), 'guest');
    expect(aliveOf(host, 1)).toHaveLength(2);
    expect(aliveOf(guest, 0)).toHaveLength(2);
    expect(aliveOf(guest, 1)).toHaveLength(3);
  });

  it('o tiro vai e volta girado para o convidado e inteiro para o anfitrião', () => {
    const shot = { dirX: 0.6, dirY: -0.8, power: 0.7 };
    expect(shotToWire('host', shot)).toEqual(shot);
    expect(shotToWire('guest', shot)).toEqual({ dirX: -0.6, dirY: 0.8, power: 0.7 });
    const wire = shotToWire('guest', shot);
    const back = shotFromWire('host', wire);
    expect(back).toEqual({ dirX: -0.6, dirY: 0.8, power: 0.7 });
    expect(shotFromWire('guest', wire)).toEqual(shot);
  });
});

describe('pvp: mensagens do fio', () => {
  const host = hostWorld();
  const init = snapshotInit(host, { shrink: true, marks: false });
  const messages: WireMessage[] = [
    { t: 'hello', v: 1 },
    { t: 'team', ready: true, specs: hostSpecs },
    { t: 'options', shrink: true, marks: false },
    { t: 'start', hostSpecs, guestSpecs, init },
    { t: 'shot', pinId: 'h:b', moveIndex: null, dirX: 0, dirY: -1, power: 0.5 },
    { t: 'shot', pinId: 'h:b', moveIndex: 1, dirX: 0.6, dirY: -0.8, power: 1 },
    { t: 'settled', world: snapshotWorld(host, 'host') },
    { t: 'backup-offer', id: 'transfer-1', name: 'backup.dat', bytes: 12, chunks: 1 },
    { t: 'backup-chunk', id: 'transfer-1', index: 0, total: 1, data: 'YWJj' },
    { t: 'backup-end', id: 'transfer-1' },
    { t: 'backup-received', id: 'transfer-1' },
    { t: 'backup-failed', id: 'transfer-1', reason: 'integridade' },
    { t: 'bye' },
    { t: 'ping' },
    { t: 'pong' },
  ];

  it('toda mensagem válida faz a ida e volta', () => {
    for (const m of messages) expect(parseMessage(encodeMessage(m))).toEqual(m);
  });

  it('recusa lixo, tipos errados e valores fora dos limites', () => {
    const bad: unknown[] = [
      null, 42, '', 'oi', '[]', '{}', '{"t":"nada"}', '{"t":"hello","v":"1"}', '{"t":"team","ready":"sim","specs":[]}',
      JSON.stringify({ t: 'team', ready: true, specs: Array.from({ length: 7 }, (_, i) => spec(`x${i}`)) }),
      JSON.stringify({ t: 'team', ready: true, specs: [spec('x'), spec('x')] }),
      JSON.stringify({ t: 'team', ready: true, specs: [spec('x', { types: ['fogo' as never] })] }),
      JSON.stringify({ t: 'team', ready: true, specs: [spec('x', { sprite: 0 })] }),
      JSON.stringify({ t: 'team', ready: true, specs: [spec('x', { name: 'n'.repeat(200) })] }),
      JSON.stringify({ t: 'team', ready: true, specs: [spec('x', { weightKg: -5 })] }),
      JSON.stringify({ t: 'shot', pinId: 'h:b', moveIndex: null, dirX: 5, dirY: 0, power: 1 }),
      JSON.stringify({ t: 'shot', pinId: 'h:b', moveIndex: 9, dirX: 1, dirY: 0, power: 1 }),
      JSON.stringify({ t: 'shot', pinId: 'h:b', moveIndex: null, dirX: 1, dirY: 0, power: 2 }),
      JSON.stringify({ t: 'shot', pinId: 'h:b', moveIndex: null, dirX: 1, dirY: 0, power: Number.NaN }),
      JSON.stringify({ t: 'backup-offer', id: 'x', name: 'x', bytes: 0, chunks: 1 }),
      JSON.stringify({ t: 'backup-offer', id: 'x', name: 'x', bytes: 12, chunks: 0 }),
      JSON.stringify({ t: 'backup-chunk', id: 'x', index: 2, total: 1, data: 'YWJj' }),
      JSON.stringify({ t: 'backup-chunk', id: 'x', index: 0, total: 1, data: 'não-base64' }),
      JSON.stringify({ t: 'settled', world: { ...snapshotWorld(host, 'host'), over: [1, 2] } }),
      JSON.stringify({ t: 'settled', world: { ...snapshotWorld(host, 'host'), limit: 99999 } }),
      JSON.stringify({ t: 'settled', world: { ...snapshotWorld(host, 'host'), pins: [{ id: 'h:b', x: 1e9, y: 0, alive: true, fall: 0, cooldowns: [], active: null }] } }),
      JSON.stringify({ t: 'start', hostSpecs, guestSpecs: guestSpecs.slice(1), init }),
      'x'.repeat(70000),
    ];
    for (const raw of bad) expect(parseMessage(raw)).toBeNull();
  });

  it('o efeito do golpe só aceita tipos conhecidos', () => {
    const world = snapshotWorld(host, 'host');
    const withEffect = { ...world, pins: world.pins.map((p, i) => (i === 0 ? { ...p, active: { kind: 'hacker', type: null } } : p)) };
    expect(parseMessage(JSON.stringify({ t: 'settled', world: withEffect }))).toBeNull();
  });

  it('parseSpec aceita pin sem dados (valores neutros) e sem ataques', () => {
    expect(parseSpec({ id: 'h:x', name: 'X', types: [], stats: null, weightKg: null, sprite: 1 })).not.toBeNull();
  });
});
