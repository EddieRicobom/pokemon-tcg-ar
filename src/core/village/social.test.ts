import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { FURNITURE_IDS, itemDef } from './catalog';
import { add, count, emptyVillage, friendOf, normalizeVillage } from './life';
import { generateVillage } from './map';
import {
  albumProgress, catchUp, MAX_AWAY_MOMENTS, makeEnv, pickMoment, recentGossip, relationMap, relationsOf, resolveScene, sceneChoice, setFavorite, TEMPLATE_BY_ID, TEMPLATE_COUNT, TEMPLATES, unreadCount,
} from './social';
import type { Actor, Ctx, Scene } from './social';
import { emptySocial, FX_EMOJI, MAX_DIARY, MAX_FAVS, MOMENT_KINDS, normalizeSocial, pairKey, relationStatus } from './social-state';

const map = generateVillage(20261014);
const fresh = () => emptyVillage(20261014, map.spawn);
const actors: Actor[] = [
  { id: 'a', name: 'Ana', types: ['fire'] },
  { id: 'b', name: 'Beto', types: ['water'] },
  { id: 'c', name: 'Caio', types: ['grass'] },
  { id: 'd', name: 'Duda', types: ['electric'] },
];
/** Um ambiente em que quase todo modelo pode acontecer (móveis, horta pronta, dia de sol). */
const richEnv = (hour = 14, weather: string | null = null) => {
  const s = fresh();
  for (const id of FURNITURE_IDS) s.placed.push({ x: 1, y: 1, item: id });
  return { s, env: { ...makeEnv(s, '2026-10-14', hour, weather), crops: 3, ripeCrops: 2 } };
};

const cast12: Actor[] = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, name: `Mon${i}`, types: ['normal'] }));
const REL_VARIANTS: { bond: number; spark: number; flag: 'casal' | 'brigados' | null }[] = [
  { bond: 0, spark: 0, flag: null },
  { bond: 70, spark: 80, flag: null },
  { bond: 80, spark: 85, flag: 'casal' },
  { bond: 10, spark: 80, flag: 'casal' },
  { bond: -50, spark: 0, flag: null },
  { bond: -20, spark: 0, flag: 'brigados' },
  { bond: 40, spark: 50, flag: null },
];

/** Monta uma cena para um modelo: sorteia em vários mundos (horas, clima, relações de todo jeito) até ele sair. */
function sceneFor(id: string): Scene | null {
  for (let vi = 0; vi < REL_VARIANTS.length; vi++) {
    for (const hour of [14, 23, 8]) {
      for (const weather of [null, 'chuva', 'neve']) {
        for (let seed = 1; seed < 150; seed++) {
          const s = fresh();
          for (const f of FURNITURE_IDS) s.placed.push({ x: 1, y: 1, item: f });
          for (let i = 0; i < 12; i++) {
            for (let j = i + 1; j < 12; j++) s.rel[pairKey(`m${i}`, `m${j}`)] = { ...REL_VARIANTS[(i * 3 + j + vi) % REL_VARIANTS.length]!, since: '', met: 1 };
            friendOf(s, `m${i}`).points = i % 3 === 0 ? 90 : 10;
          }
          const env = { ...makeEnv(s, '2026-10-14', hour, weather), crops: 3, ripeCrops: 2 };
          const sc = pickMoment(cast12, s, env, seededRng(seed * 7 + vi));
          if (sc?.tpl.id === id) return sc;
        }
      }
    }
  }
  return null;
}

describe('momentos: catálogo de modelos', () => {
  it('são muitos, com ids únicos e todos os tipos de momento representados', () => {
    expect(TEMPLATE_COUNT).toBeGreaterThanOrEqual(40);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATE_COUNT);
    expect(TEMPLATE_BY_ID.size).toBe(TEMPLATE_COUNT);
    for (const k of MOMENT_KINDS) expect(TEMPLATES.some((t) => t.kind === k), k).toBe(true);
    expect(TEMPLATES.some((t) => t.choice)).toBe(true);
  });

  it('toda fala aponta para alguém do elenco, tem texto e usa só efeitos conhecidos; os pares ficam bem escritos', () => {
    const missing: string[] = [];
    for (const t of TEMPLATES) {
      const sc = sceneFor(t.id);
      if (!sc) {
        missing.push(t.id);
        continue;
      }
      expect(sc.cast.length, t.id).toBe(t.cast);
      expect(sc.lines.length, t.id).toBeGreaterThanOrEqual(2 - (t.cast === 1 ? 1 : 0));
      for (const l of sc.lines) {
        expect(l.who, t.id).toBeGreaterThanOrEqual(0);
        expect(l.who, t.id).toBeLessThan(t.cast);
        expect(l.text.trim().length, t.id).toBeGreaterThan(2);
        expect(l.text, t.id).not.toMatch(/undefined|\[object|NaN/);
        if (l.fx) expect(FX_EMOJI[l.fx], t.id).toBeDefined();
      }
      const ch = sceneChoice(sc);
      if (t.choice) {
        expect(ch?.options.length, t.id).toBeGreaterThanOrEqual(2);
        t.choice.options.forEach((o, i) => {
          const follow = o.lines?.(sc.ctx) ?? [];
          for (const l of follow) expect(l.who, `${t.id}#${i}`).toBeLessThan(t.cast);
          if (o.needs) expect(itemDef(o.needs.item), `${t.id}#${i}`).toBeDefined();
        });
      }
    }
    // Poucos modelos dependem de condições raríssimas; todos os outros precisam acontecer.
    expect(missing, `modelos que nunca saíram: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('momentos: sorteio', () => {
  it('é determinístico com a mesma semente e respeita o tamanho do elenco', () => {
    const { s, env } = richEnv();
    const a = pickMoment(actors, s, env, seededRng(7));
    const b = pickMoment(actors, s, env, seededRng(7));
    expect(a?.tpl.id).toBe(b?.tpl.id);
    expect(a?.lines).toEqual(b?.lines);
    for (let seed = 1; seed < 60; seed++) {
      const only = pickMoment([actors[0]!], s, env, seededRng(seed));
      expect(only?.cast.length).toBe(1);
      const two = pickMoment(actors.slice(0, 2), s, env, seededRng(seed));
      expect(two ? two.cast.length : 1).toBeLessThanOrEqual(2);
      if (two && two.cast.length === 2) expect(new Set(two.cast.map((c) => c.id)).size).toBe(2);
    }
    expect(pickMoment([], s, env, seededRng(1))).toBeNull();
  });

  it('o elenco de três nunca repete Pokémon e momentos a dois ficam de fora com um Pokémon só', () => {
    const { s, env } = richEnv();
    for (let seed = 1; seed < 120; seed++) {
      const sc = pickMoment(actors, s, env, seededRng(seed))!;
      expect(new Set(sc.cast.map((c) => c.id)).size).toBe(sc.cast.length);
    }
  });

  it('modelos recentes saem menos (variedade) e o que você nunca viu pesa mais', () => {
    const { s, env } = richEnv();
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const sc = pickMoment(actors, s, env, seededRng(seed))!;
      counts.set(sc.tpl.id, (counts.get(sc.tpl.id) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(20);
  });

  it('modelos de noite só saem de noite e os de chuva só na chuva', () => {
    const { s } = richEnv();
    for (let seed = 1; seed < 200; seed++) {
      const day = pickMoment(actors, s, makeEnv(s, '2026-10-14', 14, null), seededRng(seed))!;
      expect(day.tpl.id).not.toBe('solo-sonambulo');
      expect(day.tpl.id).not.toBe('solo-chuva');
      expect(day.tpl.id).not.toBe('solo-neve');
    }
  });
});

describe('momentos: resultado', () => {
  it('grava no Diário, registra no Álbum (+10 moedas só na primeira vez) e atualiza a relação', () => {
    const s = fresh();
    const env = makeEnv(s, '2026-10-14', 14, null);
    const sc = pickMoment(actors, s, env, seededRng(3))!;
    const coins = s.coins;
    const r = resolveScene(s, sc, null, 1_000_000);
    expect(r.firstTime).toBe(true);
    expect(s.diary).toHaveLength(1);
    expect(s.diary[0]!.lines.length).toBeGreaterThan(0);
    expect(s.seen).toContain(sc.tpl.id);
    expect(s.coins).toBeGreaterThanOrEqual(coins + 10);
    expect(albumProgress(s)).toEqual({ seen: 1, total: TEMPLATE_COUNT });
    if (sc.cast.length > 1) expect(s.rel[pairKey(sc.cast[0]!.id, sc.cast[1]!.id)]?.met).toBeGreaterThan(0);
    const again = resolveScene(s, { ...sc }, null, 2_000_000);
    expect(again.firstTime).toBe(false);
    expect(albumProgress(s).seen).toBe(1);
  });

  it('as escolhas mudam o resultado e itens exigidos só são gastos se você tiver', () => {
    const withChoice = TEMPLATES.find((t) => t.choice?.options.some((o) => o.needs));
    expect(withChoice).toBeDefined();
    const scene = sceneFor(withChoice!.id)!;
    const idx = withChoice!.choice!.options.findIndex((o) => o.needs);
    const need = withChoice!.choice!.options[idx]!.needs!;
    const poor = fresh();
    const r1 = resolveScene(poor, scene, idx, 5);
    expect(count(poor, need.item)).toBe(0);
    expect(r1.moment.choice).toBeUndefined();
    const rich = fresh();
    add(rich, need.item, need.qty + 1);
    const r2 = resolveScene(rich, sceneFor(withChoice!.id)!, idx, 5);
    expect(count(rich, need.item)).toBe(1);
    expect(r2.moment.choice).toBeTruthy();
  });

  it('romance vira casal e o fim do namoro vira briga ou separação; brigados voltam às pazes', () => {
    const s = fresh();
    const rel = { bond: 80, spark: 95, flag: null as 'casal' | 'brigados' | null, since: '', met: 4 };
    s.rel[pairKey('a', 'b')] = rel;
    // Ao longo de muitos sorteios com o par apaixonado, o casal se forma ou se mexe.
    let flags = 0;
    for (let seed = 1; seed < 300 && flags === 0; seed++) {
      const copy = structuredClone(s);
      const env = makeEnv(copy, '2026-10-14', 20, null);
      const sc = pickMoment(actors.slice(0, 2), copy, env, seededRng(seed));
      if (!sc) continue;
      resolveScene(copy, sc, null, 10_000 + seed);
      if (copy.rel[pairKey('a', 'b')]?.flag) flags++;
    }
    expect(flags).toBeGreaterThan(0);
    expect(relationStatus({ ...rel, flag: 'casal' }).key).toBe('casal');
    expect(relationStatus({ ...rel, flag: 'brigados' }).key).toBe('brigados');
    expect(relationStatus({ ...rel, flag: null, bond: -50 }).key).toBe('rivais');
    expect(relationStatus(undefined).key).toBe('conhecidos');
  });

  it('o Diário guarda no máximo 160 momentos, mas nunca perde favoritos', () => {
    const s = fresh();
    const env = makeEnv(s, '2026-10-14', 14, null);
    let first = '';
    for (let i = 0; i < MAX_DIARY + 30; i++) {
      const sc = pickMoment(actors, s, env, seededRng(i + 1))!;
      const r = resolveScene(s, sc, null, 1000 + i);
      if (i === 0) {
        first = r.moment.id;
        expect(setFavorite(s, first, true)).toBe(true);
      }
    }
    expect(s.diary.length).toBeLessThanOrEqual(MAX_DIARY);
    expect(s.diary.some((m) => m.id === first)).toBe(true);
    expect(setFavorite(s, 'nao-existe', true)).toBe(false);
    expect(setFavorite(s, first, false)).toBe(true);
    expect(s.diary.find((m) => m.id === first)?.fav).toBeUndefined();
  });

  it('há um limite de favoritos', () => {
    const s = fresh();
    const env = makeEnv(s, '2026-10-14', 14, null);
    for (let i = 0; i < MAX_FAVS + 5; i++) resolveScene(s, pickMoment(actors, s, env, seededRng(i + 1))!, null, 1000 + i);
    let ok = 0;
    for (const m of s.diary) if (setFavorite(s, m.id, true)) ok++;
    expect(ok).toBe(MAX_FAVS);
  });

  it('mensagens não lidas contam o que é mais novo que a última abertura do Diário', () => {
    const s = fresh();
    const env = makeEnv(s, '2026-10-14', 14, null);
    resolveScene(s, pickMoment(actors, s, env, seededRng(1))!, null, 100);
    resolveScene(s, pickMoment(actors, s, env, seededRng(2))!, null, 200);
    expect(unreadCount(s)).toBe(2);
    s.diaryRead = 150;
    expect(unreadCount(s)).toBe(1);
    s.diaryRead = 300;
    expect(unreadCount(s)).toBe(0);
  });
});

describe('momentos: fora da Vila, comentários e mapa', () => {
  it('enquanto você está fora acontece 1 momento a cada 15 min, até 6, sem decisões', () => {
    const s = fresh();
    s.lastSeen = 1_000_000_000_000;
    expect(catchUp(s, actors, s.lastSeen + 5 * 60_000, null, seededRng(1))).toHaveLength(0);
    const one = catchUp(fresh(), actors, 5, null, seededRng(1));
    expect(one).toHaveLength(0);
    const two = catchUp(s, actors, s.lastSeen + 31 * 60_000, null, seededRng(2));
    expect(two).toHaveLength(2);
    const many = fresh();
    many.lastSeen = 1_000_000_000_000;
    const lots = catchUp(many, actors, many.lastSeen + 5 * 24 * 3_600_000, null, seededRng(3));
    expect(lots).toHaveLength(MAX_AWAY_MOMENTS);
    expect(lots.every((m) => m.away && !m.choice)).toBe(true);
    expect(lots.every((m) => m.t > many.lastSeen)).toBe(true);
    expect(catchUp(many, [], many.lastSeen + 9e8, null, seededRng(3))).toEqual([]);
  });

  it('quem viveu um momento comenta com você, e só nas próximas 36 horas', () => {
    const s = fresh();
    const withAfter = TEMPLATES.find((t) => t.after && t.cast === 1 && sceneFor(t.id))!;
    const sc = sceneFor(withAfter.id)!;
    const now = 5_000_000;
    resolveScene(s, sc, null, now);
    const who = sc.cast[0]!.id;
    expect(recentGossip(s, who, now + 1000)).toBeTruthy();
    expect(recentGossip(s, who, now + 40 * 3_600_000)).toBeNull();
    expect(recentGossip(s, 'zzz', now + 1000)).toBeNull();
  });

  it('o mapa de relações e as páginas do Livro mostram só quem já viveu algo junto', () => {
    const s = fresh();
    expect(relationMap(s, actors)).toEqual([]);
    s.rel[pairKey('a', 'b')] = { bond: 70, spark: 10, flag: null, since: '', met: 3 };
    s.rel[pairKey('a', 'c')] = { bond: 5, spark: 0, flag: 'casal', since: '', met: 0 };
    const map2 = relationMap(s, actors);
    expect(map2).toHaveLength(2);
    expect(map2[0]!.status.key).toBe('casal');
    const rows = relationsOf(s, 'a', actors);
    expect(rows.map((r) => r.name).sort()).toEqual(['Beto', 'Caio']);
    expect(relationsOf(s, 'd', actors)).toEqual([]);
  });

  it('personalidades vêm de falas e atravessam o contexto', () => {
    const sc = sceneFor('solo-espelho')!;
    const ctx: Ctx = sc.ctx;
    expect(ctx.n).toEqual([sc.cast[0]!.name]);
    expect(ctx.p).toHaveLength(1);
  });
});

describe('momentos: arquivo salvo', () => {
  it('um arquivo antigo (sem vida social) continua válido e ganha os campos novos vazios', () => {
    const old = { v: 1, seed: 20261014, player: { x: 3, y: 3, dir: 'up' }, inventory: { madeira: 2 }, house: 1, placed: [], friends: {}, harvested: {}, follower: null, coins: 50, crops: [] };
    const s = normalizeVillage(old, 20261014, map.spawn);
    expect(s.coins).toBe(50);
    expect(s.diary).toEqual([]);
    expect(s.rel).toEqual({});
    expect(s.seen).toEqual([]);
    expect(s.fishing).toEqual({ day: '', casts: 0 });
  });

  it('lixo no Diário é descartado e os limites são respeitados', () => {
    const good = { id: 'x', t: 5, day: '2026-10-14', hour: 9, tpl: 'solo-espelho', kind: 'solo', title: 'T', emoji: '💭', cast: [{ id: 'a', name: 'Ana' }], lines: [{ who: 0, text: 'oi', fx: 'heart' }], result: [] };
    const s = normalizeSocial({
      diary: [good, { ...good, id: 'y', kind: 'xyz' }, { ...good, id: 'z', lines: [{ who: 5, text: 'fora do elenco' }] }, 'lixo', null, { ...good, id: 'w', cast: [] }],
      rel: { 'a|b': { bond: 999, spark: -4, flag: 'casal', since: 'd', met: 3 }, semBarra: { bond: 1 } },
      seen: ['a', 'a', 7, 'b'],
      lastSeen: -3,
      diaryRead: 'x',
    });
    expect(s.diary.map((m) => m.id)).toEqual(['x']);
    expect(s.rel['a|b']).toMatchObject({ bond: 100, spark: 0, flag: 'casal' });
    expect(s.rel['semBarra']).toBeUndefined();
    expect(s.seen).toEqual(['a', 'b']);
    expect(s.lastSeen).toBe(0);
    expect(s.diaryRead).toBe(0);
    expect(emptySocial().diary).toEqual([]);
  });

  it('amizade com você sobe quando o momento dá carinho (friend)', () => {
    const s = fresh();
    const tpl = TEMPLATES.find((t) => typeof t.outcome === 'object' && (t.outcome as { friend?: number }).friend)!;
    const sc = sceneFor(tpl.id)!;
    const before = sc.cast.map((c) => friendOf(s, c.id).points);
    resolveScene(s, sc, null, 99);
    sc.cast.forEach((c, i) => expect(friendOf(s, c.id).points).toBeGreaterThanOrEqual(before[i]!));
  });
});
