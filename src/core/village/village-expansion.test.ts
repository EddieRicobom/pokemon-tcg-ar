import { describe, expect, it } from 'vitest';
import { generateVillage, isWalkable, reachableFrom, tileAt } from './map';
import { LEISURE_SPOTS } from './expansion';
import { CAFE_TABLES } from './cafe-layout';
import { GUIDED_DESTINATIONS } from './guided-walk';
import { advance, makeWalker, moving, stepVillager, tryStep, WALK_SPEED, syncFollowerSpeed } from './actors';
import { pathStep } from './pathing';
import { emptyVillage, normalizeVillage } from './life';
import { chooseServiceResidents, PROFESSIONS, professionActive } from './professions';
import { payResidentWork, spendHousehold } from './resident-economy';
import { CafeService } from './cafe';
import { FarmSession, stepFarmWorker } from './farm';
import { seededRng } from '../battle';
import { enjoyVillagePlace } from './leisure';

describe('expansão, profissões e vida fora do centro', () => {
  it.each([1, 42, 20261014])('semente %i: passeios de ida e volta são caminháveis, com o companheiro na mesma velocidade', (seed) => {
    const map = generateVillage(seed);
    expect([map.w, map.h]).toEqual([120, 96]);
    const reached = reachableFrom(map, map.spawn.x, map.spawn.y);
    for (const destination of [...GUIDED_DESTINATIONS, map.spawn]) {
      expect([[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]].some(([dx, dy]) => reached[(destination.y + dy!) * map.w + destination.x + dx!] === 1), JSON.stringify(destination)).toBe(true);
      const player = makeWalker('eu', map.spawn.x, map.spawn.y, WALK_SPEED.player);
      const mon = makeWalker('a', map.spawn.x - 1, map.spawn.y, WALK_SPEED.resident);
      for (const target of [destination, map.spawn]) {
        let frames = 0;
        while (frames++ < 8000) {
          advance(player, .1);
          if (!moving(player) && Math.abs(player.x - target.x) + Math.abs(player.y - target.y) > 1) {
            const d = pathStep(map, player, target, () => false); expect(d).not.toBeNull();
            if (d) tryStep(player, d, map, () => false);
          }
          syncFollowerSpeed(mon, player, true);
          const before = { x: mon.x, y: mon.y };
          stepVillager(mon, .1, map, () => false, () => .5, player);
          expect(Math.abs(mon.x - before.x) + Math.abs(mon.y - before.y)).toBeLessThanOrEqual(1);
          if (Math.abs(player.x - target.x) + Math.abs(player.y - target.y) <= 1 && Math.abs(mon.x - player.x) + Math.abs(mon.y - player.y) <= 1 && !moving(mon)) break;
        }
        expect(frames).toBeLessThan(8000);
        expect(mon.speed).toBe(player.speed);
      }
    }
  });
  it('todas as mesas têm dois assentos e um acesso alcançável, com tampo sólido', () => {
    const map = generateVillage(42), reached = reachableFrom(map, map.spawn.x, map.spawn.y);
    for (const table of CAFE_TABLES) {
      for (const dx of [0, 1]) expect(reached[table.y * map.w + table.x + dx]).toBe(1);
      expect(isWalkable(map, table.x, table.y + 1)).toBe(false);
      expect(reached[table.y * map.w + table.x - 1]).toBe(1);
    }
  });
  it('mantém a cidade antiga nas mesmas coordenadas ao expandir', () => {
    const old = generateVillage(7, 96, 72), full = generateVillage(7);
    for (const b of old.buildings) expect(full.buildings.find((other) => other.id === b.id)).toEqual(b);
    for (const spot of [{ x: 45, y: 41 }, { x: 30, y: 31 }, { x: 56, y: 34 }, { x: 83, y: 46 }]) expect(tileAt(full, spot.x, spot.y)).toBe(tileAt(old, spot.x, spot.y));
    expect(LEISURE_SPOTS.every((p) => p.x >= 96 || p.y >= 72)).toBe(true);
  });
  it('ativa postos só no limite de população e escolhe profissionais distintos de forma estável', () => {
    for (const job of PROFESSIONS) { expect(professionActive(job.id, job.min - 1)).toBe(false); expect(professionActive(job.id, job.min)).toBe(true); }
    const ids = Array.from({ length: 8 }, (_, i) => `a${i}`);
    const staff = chooseServiceResidents(ids, null, null);
    expect(staff.carrier).not.toBe(staff.waiter);
    expect(chooseServiceResidents(ids.slice().reverse(), staff.carrier, staff.waiter)).toEqual(staff);
    expect(chooseServiceResidents(ids.slice(0, 5), staff.carrier, staff.waiter)).toEqual({ carrier: null, waiter: null });
  });
  it('salários exigem comprovantes únicos e compras não criam saldo nem gastam a carteira do jogador', () => {
    const s = emptyVillage(7, { x: 1, y: 1 }); const original = s.coins;
    expect(payResidentWork(s, 'a', 'mine', 'pedra-1', '2026-10-22', 80)).toBe(80);
    expect(payResidentWork(s, 'a', 'mine', 'pedra-1', '2026-10-22', 80)).toBe(0);
    expect(payResidentWork(s, 'a', 'mine', 'pedra-2', '2026-10-22', 8)).toBe(0);
    expect(spendHousehold(s, ['a'], 81)).toBe(false);
    expect(s.residentEconomy.a!.coins).toBe(80);
    expect(spendHousehold(s, ['a'], 30)).toBe(true);
    expect(s.residentEconomy.a!.coins).toBe(50);
    expect(s.coins).toBe(original);
    expect(normalizeVillage(JSON.parse(JSON.stringify(s)), 7, s.player).residentEconomy).toEqual(s.residentEconomy);
  });
  it('suspende tarefas abaixo da população mínima sem produzir nem pagar', () => {
    const map = generateVillage(42), s = emptyVillage(42, map.spawn), session = new FarmSession();
    s.farm.seeds['sem-tomate'] = 20;
    const workers = [{ id: 'a', x: 56, y: 41, types: [] as const, available: true }];
    session.tick(s, map, workers, Date.parse('2026-10-22T12:00:00'), () => 0, () => false, 2);
    expect(session.tasks).toEqual([]);
    expect(s.residentEconomy).toEqual({});
    expect(s.farm.history).toEqual([]);
  });
  it('clientes caminham, pagam apenas ao receber, compartilham mesa e sustentam o salário do atendente', () => {
    const map = generateVillage(42), s = emptyVillage(42, map.spawn), service = new CafeService(s);
    const a = makeWalker('a', 64, 26, 3), b = makeWalker('b', 65, 26, 3), waiter = makeWalker('w', 67, 25, 3);
    const walkers = new Map([['a', a], ['b', b], ['w', waiter]]);
    for (const id of ['a', 'b']) payResidentWork(s, id, 'farm', 'colheita', '2026-10-22', 40);
    let served = 0, shared = false;
    for (let frame = 0; frame < 650; frame++) {
      const now = frame * 100;
      const blocked = (id: string) => (x: number, y: number) => [...walkers].some(([other, w]) => other !== id && (w.x === x && w.y === y || w.tx === x && w.ty === y)) || service.seats.reserved(x, y, id);
      service.stepCustomer(a, .1, now, map, blocked('a'), () => 0);
      service.stepCustomer(b, .1, now, map, blocked('b'), () => 0);
      const result = service.stepWaiter(waiter, .1, now, map, blocked('w'), () => 0, '2026-10-22');
      if (result.served) served++;
      if (service.eatingTogether(walkers).length === 2) shared = true;
      if (!served) expect(s.residentEconomy.a!.coins).toBe(40);
      if (shared) break;
    }
    expect(served).toBe(2); expect(shared).toBe(true);
    expect(s.residentEconomy.a!.coins).toBe(28); expect(s.residentEconomy.b!.coins).toBe(28);
    expect(s.residentEconomy.w!.coins).toBe(8);
    const noMoney = makeWalker('sem-moedas', 66, 26, 3);
    expect(service.stepCustomer(noMoney, .1, 100000, map, () => false, () => 0)).toBe(false);
  });
  it('simula 12 minutos de trabalho por todo o mapa, com chegada real, salários e produção distribuída', () => {
    const map = generateVillage(42), s = emptyVillage(42, map.spawn), session = new FarmSession();
    s.farm.seeds['sem-tomate'] = 20;
    const walkers = Array.from({ length: 8 }, (_, i) => makeWalker(`w${i}`, 98 + i % 2, 63 + Math.floor(i / 2), WALK_SPEED.resident));
    const rng = seededRng(17), start = Date.parse('2026-10-22T12:00:00');
    const kinds = new Set<string>();
    for (let frame = 0; frame < 3600; frame++) {
      const time = start + frame * 200;
      if (frame % 25 === 0) session.tick(s, map, walkers.map((w) => ({ id: w.id, x: w.x, y: w.y, types: [], available: true })), time, rng, () => false, 8);
      for (const w of walkers) {
        const task = session.tasks.find((t) => t.residentId === w.id);
        if (task) { const before = { x: w.x, y: w.y }; stepFarmWorker(w, task, .2, map, () => false); expect(Math.abs(w.x - before.x) + Math.abs(w.y - before.y)).toBeLessThanOrEqual(1); }
      }
      for (const record of s.farm.history) if (record.kind) kinds.add(record.kind);
    }
    expect(kinds.has('mine')).toBe(true); expect(kinds.has('lumber')).toBe(true); expect(kinds.has('fish')).toBe(true);
    expect(kinds.has('plant') || kinds.has('water')).toBe(true);
    expect(Object.values(s.residentEconomy).filter((w) => w.earned > 0).length).toBeGreaterThanOrEqual(4);
    expect(s.inventory.madeira ?? 0).toBeGreaterThan(0);
  }, 30000);
  it('atividades dos bairros não repetem prêmios, e piquenique usa fruta de verdade', () => {
    const s = emptyVillage(7, { x: 1, y: 1 });
    expect(enjoyVillagePlace(s, 'grove', '2026-10-22', ['a']).ok).toBe(false);
    s.inventory.oran = 1;
    expect(enjoyVillagePlace(s, 'grove', '2026-10-22', ['a']).ok).toBe(true);
    expect(s.inventory.oran).toBe(0); expect(s.friends.a!.points).toBe(3);
    expect(enjoyVillagePlace(s, 'grove', '2026-10-22', ['a']).ok).toBe(false);
    expect(enjoyVillagePlace(s, 'beach', '2026-10-22', []).ok).toBe(true);
    expect(enjoyVillagePlace(s, 'beach', '2026-10-22', []).ok).toBe(false);
    expect(s.inventory.concha).toBe(1);
  });
});
