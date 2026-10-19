import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { add, emptyVillage, friendOf, normalizeVillage, place } from './life';
import { buildingAt, generateVillage, isSolidTile, tileAt } from './map';
import {
  assignHomes, cafeVisit, CAFE_PRICE, collectMail, HOME_DECORS, HOME_STAGES, homeComment, homeDecor, homeLevel, homeOf, homeRoof, homeValue, isAsleep, isDeepSleep, knockDoor, KNOCK_STAY_UP_MS, knockOpenChance, nextUnlock, paintRoof, ROOFS, roofIndex,
  sanitizeTown, toggleDecor, townStage, unlockedBetween, unlockedLots, upgradeHome,
} from './town';
import { CIVIC, DECOR, LOTS, TOWN, TOWN_STAGES } from './town-layout';

const map = generateVillage(20261014);
const fresh = () => emptyVillage(20261014, map.spawn);

function reach(from: { x: number; y: number }): Set<string> {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = `${n.x},${n.y}`;
      if (seen.has(k) || isSolidTile(tileAt(map, n.x, n.y))) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen;
}

describe('a cidade no mapa', () => {
  it('tem 14 terrenos de casa, os prédios da praça, o bairro dos jogos e a fonte, sem se sobrepor', () => {
    expect(map.buildings.filter((b) => b.kind === 'home')).toHaveLength(LOTS.length);
    expect(map.buildings.map((b) => b.kind).filter((k) => k !== 'home').sort()).toEqual(['arcade', 'arena', 'cafe', 'fountain', 'mail', 'museum', 'pins', 'torre']);
    expect(CIVIC).toHaveLength(7);
    const cells = new Set<string>();
    for (const b of map.buildings) {
      for (let y = b.y; y < b.y + b.h; y++) {
        for (let x = b.x; x < b.x + b.w; x++) {
          expect(cells.has(`${x},${y}`), `${b.id} sobrepõe`).toBe(false);
          cells.add(`${x},${y}`);
          expect(tileAt(map, x, y)).toBe('building');
          expect(buildingAt(map, x, y)?.id).toBe(b.id);
        }
      }
    }
    expect(map.tiles.filter((t) => t === 'building')).toHaveLength(cells.size);
    for (const b of map.buildings) {
      expect(b.x >= map.plot.x + map.plot.w || b.x + b.w <= map.plot.x || b.y >= map.plot.y + map.plot.h || b.y + b.h <= map.plot.y).toBe(true);
      expect(b.x >= map.shop.x + map.shop.w || b.x + b.w <= map.shop.x || b.y >= map.shop.y + map.shop.h || b.y + b.h <= map.shop.y).toBe(true);
    }
  });

  it('dá para chegar a pé do começo à frente de toda porta, e a porta não está bloqueada', () => {
    const ok = reach(map.spawn);
    for (const b of map.buildings) {
      expect(isSolidTile(tileAt(map, b.door.x, b.door.y)), `${b.id}: porta bloqueada`).toBe(false);
      expect(ok.has(`${b.door.x},${b.door.y}`), `${b.id}: sem caminho`).toBe(true);
    }
  });

  it('a loja, a casa do jogador, o lago e a praça seguem alcançáveis', () => {
    const ok = reach(map.spawn);
    expect(ok.has(`${map.plot.x + map.plot.w},${map.plot.y + map.plot.h - 1}`)).toBe(true);
    expect(ok.has(`${map.shop.x + 1},${map.shop.y + map.shop.h}`)).toBe(true);
    expect([...ok].some((k) => {
      const [x, y] = k.split(',').map(Number);
      return tileAt(map, x!, y!) === 'sand';
    })).toBe(true);
  });

  it('tem postes de luz nas ruas e nenhum fecha a frente de uma porta', () => {
    const lamps = map.tiles.map((t, i) => (t === 'lamp' ? { x: i % map.w, y: Math.floor(i / map.w) } : null)).filter((x) => x);
    expect(lamps.length).toBeGreaterThan(8);
    for (const b of map.buildings) expect(lamps.some((l) => l!.x === b.door.x && l!.y === b.door.y)).toBe(false);
  });

  it('coloca o mural imediatamente ao lado da fonte', () => {
    const board = DECOR.find((decor) => decor.kind === 'board')!;
    expect(board.x + board.w).toBe(TOWN.fountain.x);
    expect(board.y + board.h).toBe(TOWN.fountain.y);
  });
});

describe('níveis da cidade', () => {
  it('o nível 1 já libera 3 terrenos e cada nível libera no mínimo o que o anterior liberou', () => {
    expect(unlockedLots(1)).toHaveLength(3);
    let last = 0;
    for (let l = 1; l <= 20; l++) {
      expect(unlockedLots(l).length).toBeGreaterThanOrEqual(last);
      last = unlockedLots(l).length;
    }
    expect(unlockedLots(12)).toHaveLength(LOTS.length);
    expect(townStage(1).name).toBe('Povoado');
    expect(townStage(5).name).toBe('Vila');
    expect(townStage(99).next).toBeNull();
    expect(TOWN_STAGES[0]!.level).toBe(1);
  });

  it('avisa o que abriu entre dois níveis e qual é o próximo marco', () => {
    const u = unlockedBetween(2, 5);
    expect(u.buildings).toEqual(['Café da Vila', 'Pista de Pins', 'Correio']);
    expect(u.houses).toBe(unlockedLots(5).length - unlockedLots(2).length);
    expect(u.stage).toBe('Vila');
    expect(unlockedBetween(5, 5)).toEqual({ houses: 0, buildings: [], stage: null });
    expect(nextUnlock(1)?.level).toBe(2);
    expect(nextUnlock(1)?.text).toContain('Fliperama');
    expect(nextUnlock(50)).toBeNull();
  });

  it('o bairro dos jogos abre por nível: Fliperama, Pista de Pins e Arena, nessa ordem', () => {
    const games = CIVIC.filter((c) => ['arcade', 'pins', 'arena'].includes(c.kind));
    expect(games.map((c) => c.kind)).toEqual(['arcade', 'pins', 'arena']);
    expect(games.map((c) => c.name)).toEqual(['Fliperama', 'Pista de Pins', 'Arena']);
    expect(games[0]!.unlock).toBeLessThan(games[1]!.unlock);
    expect(games[1]!.unlock).toBeLessThan(games[2]!.unlock);
    expect(unlockedBetween(1, 2).buildings).toEqual(['Fliperama']);
    expect(unlockedBetween(5, 6).buildings).toEqual(['Arena']);
    for (const c of games) expect(map.buildings.some((b) => b.id === c.kind && b.unlock === c.unlock)).toBe(true);
  });

  it('cada Pokémon mora num terreno liberado (e dividem a casa se faltar)', () => {
    const ids = ['d', 'a', 'c', 'b', 'e'];
    const homes = assignHomes(ids, 1);
    expect(homes.size).toBe(5);
    const lots = unlockedLots(1);
    for (const l of homes.values()) expect(lots).toContain(l);
    expect(new Set(homes.values()).size).toBe(3);
    expect(assignHomes([...ids].reverse(), 1)).toEqual(homes);
    expect(new Set(assignHomes(['a', 'b'], 12).values()).size).toBe(2);
  });
});

describe('casas, enfeites e telhado', () => {
  it('o número da casa guarda nível, enfeites e telhado sem se misturar', () => {
    for (let level = 0; level < 4; level++) {
      for (const d of [0, 5, 15]) {
        for (const r of [0, 3, 6]) {
          const v = homeValue(level, d, r);
          expect([homeLevel(v), homeDecor(v), homeRoof(v)]).toEqual([level, d, r]);
        }
      }
    }
  });

  it('reformar gasta materiais, sobe o nível e dá amizade; falta de material é dito com clareza', () => {
    const s = fresh();
    const no = upgradeHome(s, 0, ['a']);
    expect(no.ok).toBe(false);
    expect(no.message).toContain('faltam');
    for (const [k, n] of Object.entries(HOME_STAGES[1]!.cost)) add(s, k as never, n!);
    const r = upgradeHome(s, 0, ['a']);
    expect(r.ok).toBe(true);
    expect(homeLevel(homeOf(s, 0))).toBe(1);
    expect(friendOf(s, 'a').points).toBe(4);
    expect(s.inventory.madeira ?? 0).toBe(0);
    for (const lvl of [2, 3]) {
      for (const [k, n] of Object.entries(HOME_STAGES[lvl]!.cost)) add(s, k as never, n!);
      expect(upgradeHome(s, 0, []).ok).toBe(true);
    }
    expect(homeLevel(homeOf(s, 0))).toBe(3);
    expect(upgradeHome(s, 0, []).ok).toBe(false);
  });

  it('enfeites custam moedas para pôr e saem de graça; a reforma não apaga o enfeite', () => {
    const s = fresh();
    s.coins = 100;
    const d = HOME_DECORS[0]!;
    expect(toggleDecor(s, 2, d, ['a']).ok).toBe(true);
    expect(s.coins).toBe(100 - d.cost);
    expect(homeDecor(homeOf(s, 2)) & d.bit).toBe(d.bit);
    add(s, 'madeira', 99);
    add(s, 'pedra', 99);
    upgradeHome(s, 2, []);
    expect(homeDecor(homeOf(s, 2)) & d.bit).toBe(d.bit);
    expect(toggleDecor(s, 2, d, []).ok).toBe(true);
    expect(s.coins).toBe(100 - d.cost);
    s.coins = 1;
    expect(toggleDecor(s, 2, HOME_DECORS[3]!, []).ok).toBe(false);
  });

  it('pintar o telhado custa moedas e a casa mostra a cor escolhida', () => {
    const s = fresh();
    s.coins = 50;
    expect(roofIndex(homeOf(s, 5), 5)).toBe(5 % ROOFS.length);
    expect(paintRoof(s, 5, 1, ['a']).ok).toBe(true);
    expect(roofIndex(homeOf(s, 5), 5)).toBe(1);
    expect(paintRoof(s, 5, 1, []).ok).toBe(false);
    s.coins = 0;
    expect(paintRoof(s, 5, 2, []).ok).toBe(false);
    expect(paintRoof(s, 5, 99, []).ok).toBe(false);
  });

  it('os moradores comentam o que você fez na casa (e dormem quando é hora)', () => {
    const s = fresh();
    const rng = seededRng(3);
    expect(homeComment(s, 0, [], false, rng)).toContain('Terreno livre');
    expect(homeComment(s, 0, ['Squirtle'], true, rng)).toContain('dorme');
    s.coins = 500;
    toggleDecor(s, 0, HOME_DECORS[2]!, []);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(homeComment(s, 0, ['Squirtle', 'Pikachu'], false, seededRng(i)));
    expect([...seen].some((t) => t.includes('Squirtle e Pikachu'))).toBe(true);
    expect([...seen].some((t) => t.includes('lampião'))).toBe(true);
  });

  it('o save com casas continua válido e valores absurdos são limitados', () => {
    const s = fresh();
    s.homes = { '0': homeValue(2, 5, 3), '4': 7 };
    const back = normalizeVillage(JSON.parse(JSON.stringify(s)), 20261014, map.spawn);
    expect(back.homes).toEqual(s.homes);
    const bad = normalizeVillage({ v: 1, seed: 20261014, homes: { x: 99999, y: -5, z: 'oi' }, town: { level: -3, mailDay: 7 } }, 20261014, map.spawn);
    expect(bad.homes.x).toBe(511);
    expect(bad.homes.y).toBe(0);
    expect(bad.homes.z).toBeUndefined();
    expect(bad.town).toEqual({ level: 1, mailDay: '', cafeDay: '' });
    expect(normalizeVillage({ v: 1 }, 20261014, map.spawn).homes).toEqual({});
  });
});

describe('dormir', () => {
  it('à noite todos dormem, de dia ninguém dorme, e a hora de deitar varia por Pokémon', () => {
    const ids = Array.from({ length: 24 }, (_, i) => `mon-${i}`);
    for (const id of ids) {
      expect(isAsleep(id, 3)).toBe(true);
      expect(isAsleep(id, 12)).toBe(false);
      expect(isAsleep(id, 18)).toBe(false);
    }
    expect(new Set(ids.map((id) => isAsleep(id, 21))).size).toBe(2);
    expect(new Set(ids.map((id) => isAsleep(id, 1))).size).toBe(2);
    expect(new Set(ids.map((id) => isAsleep(id, 6))).size).toBe(2);
  });
});

describe('Correio, Café e saves antigos', () => {
  it('o correio entrega uma vez por dia, com moedas', () => {
    const s = fresh();
    const c0 = s.coins;
    const r = collectMail(s, '2026-10-15', seededRng(1), {});
    expect(r.ok).toBe(true);
    expect(s.coins).toBeGreaterThan(c0);
    expect(collectMail(s, '2026-10-15', seededRng(2), {}).ok).toBe(false);
    expect(collectMail(s, '2026-10-16', seededRng(2), {}).ok).toBe(true);
  });

  it('o correio às vezes traz carta de um Pokémon sobre o que você respondeu', () => {
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      const s = fresh();
      s.lingo = [{ text: 'brigadeiro', kind: 'comida', from: 'a', t: 1 }];
      found = collectMail(s, `d${i}`, seededRng(i), { a: 'Squirtle' }).message.includes('brigadeiro');
    }
    expect(found).toBe(true);
  });

  it('o café cobra, dá amizade a quem está perto e só vale uma vez por dia', () => {
    const s = fresh();
    s.coins = 100;
    const r = cafeVisit(s, 'd1', ['a', 'b', 'c', 'd', 'e'], { a: 'A', b: 'B' });
    expect(r.ok).toBe(true);
    expect(s.coins).toBe(100 - CAFE_PRICE);
    expect(friendOf(s, 'a').points).toBe(3);
    expect(friendOf(s, 'e').points).toBe(0);
    expect(cafeVisit(s, 'd1', ['a'], {}).ok).toBe(false);
    s.coins = 3;
    expect(cafeVisit(s, 'd2', ['a'], {}).ok).toBe(false);
  });

  it('móveis, plantas e o jogador que ficaram onde agora há casa saem do caminho', () => {
    const s = fresh();
    const b = map.buildings.find((x) => x.kind === 'home')!;
    s.placed.push({ x: b.x, y: b.y, item: 'cadeira' });
    s.placed.push({ x: map.spawn.x, y: map.spawn.y + 1, item: 'cadeira' });
    s.crops.push({ x: b.x + 1, y: b.y, seed: 'sem-tomate', planted: 0, stage: 0, watered: '' } as never);
    s.player.x = b.x;
    s.player.y = b.y;
    const fixed = sanitizeTown(s, map);
    expect(fixed).toBe(3);
    expect(s.placed).toHaveLength(1);
    expect(s.crops).toHaveLength(0);
    expect(s.inventory.cadeira).toBe(1);
    expect(s.player).toMatchObject({ x: map.spawn.x, y: map.spawn.y });
    expect(place(s, map, 'cadeira', map.spawn.x + 1, map.spawn.y, () => false).ok).toBe(true);
    expect(sanitizeTown(s, map)).toBe(0);
  });
});

describe('bater na porta', () => {
  const squirtle = { id: 'a', name: 'Squirtle', asleep: true };
  const bulba = { id: 'b', name: 'Bulbasaur', asleep: false };

  it('casa vazia: ninguém atende e ninguém sai', () => {
    const r = knockDoor([], 14, seededRng(1));
    expect(r.wake).toEqual([]);
    expect(r.text).toMatch(/Ninguém mora/);
  });

  it('quem já está lá fora continua por lá, sem ser "acordado" nem recusar', () => {
    const r = knockDoor([{ ...bulba }], 14, seededRng(1));
    expect(r.wake).toEqual([]);
    expect(r.refused).toEqual([]);
    expect(r.stayUpMs).toBe(0);
    expect(r.text).toContain('Bulbasaur já está lá fora');
    expect(knockDoor([bulba, { id: 'c', name: 'Charmander', asleep: false }], 14, seededRng(1)).text).toContain('Bulbasaur e Charmander já estão lá fora');
  });

  it('o sono pesado da madrugada recusa mais que o leve, e cada batida a mais aumenta a chance de abrirem', () => {
    expect(isDeepSleep(2)).toBe(true);
    expect(isDeepSleep(23)).toBe(true);
    expect(isDeepSleep(22)).toBe(false);
    expect(isDeepSleep(6)).toBe(false);
    expect(knockOpenChance(2, 0)).toBeLessThan(knockOpenChance(22, 0));
    expect(knockOpenChance(2, 1)).toBeGreaterThan(knockOpenChance(2, 0));
    expect(knockOpenChance(2, 2)).toBe(0.95);
    expect(knockOpenChance(2, 3)).toBe(1);
    expect(knockOpenChance(22, 2)).toBe(1);
  });

  it('numa batida só pode abrir ou recusar, nunca os dois, e o texto cita quem dorme', () => {
    let opened = 0;
    let refusedN = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = knockDoor([squirtle], 2, seededRng(seed));
      expect(r.wake.length + r.refused.length).toBe(1);
      expect(r.text).toContain('Squirtle');
      if (r.wake.length) {
        opened++;
        expect(r.stayUpMs).toBe(KNOCK_STAY_UP_MS);
        expect(r.grumpy).toEqual(['a']);
      } else {
        refusedN++;
        expect(r.stayUpMs).toBe(0);
        expect(r.text).toMatch(/dormir|Volta amanhã|Shhh|minutinhos/);
        expect(r.text).toContain('insistir');
      }
    }
    expect(opened).toBeGreaterThan(40);
    expect(refusedN).toBeGreaterThan(40);
  });

  it('de manhã cedo ou de noitinha ninguém sai de mau humor', () => {
    for (let seed = 1; seed <= 60; seed++) expect(knockDoor([squirtle], 22, seededRng(seed)).grumpy).toEqual([]);
  });

  it('insistindo, a porta abre: na terceira batida seguida todos saem', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = knockDoor([squirtle, { id: 'd', name: 'Wartortle', asleep: true }], 3, seededRng(seed), 3);
      expect(r.wake.sort()).toEqual(['a', 'd']);
      expect(r.refused).toEqual([]);
    }
  });

  it('numa casa com dois, só mexe com quem estava dentro; o sorteio é determinístico', () => {
    const r = knockDoor([squirtle, bulba], 22, seededRng(2), 3);
    expect(r.wake).toEqual(['a']);
    expect(r.text).not.toContain('Bulbasaur');
    expect(knockDoor([squirtle], 2, seededRng(7)).text).toBe(knockDoor([squirtle], 2, seededRng(7)).text);
  });
});
