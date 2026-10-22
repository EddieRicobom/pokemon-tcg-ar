import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { FURNITURE_IDS, itemDef } from './catalog';
import { add, count, emptyVillage, friendOf, normalizeVillage } from './life';
import { generateVillage } from './map';
import { birthdayOf } from './personality';
import {
  albumEntries, albumProgress, catchUp, MAX_AWAY_MOMENTS, makeEnv, pickMoment, recentGossip, relationMap, relationsOf, resolveScene, savedMoments, sceneChoice, setFavorite, sceneOfTemplate, TEMPLATE_BY_ID, TEMPLATE_COUNT, TEMPLATES, unreadCount,
} from './social';
import type { Actor, Ctx, Scene } from './social';
import { emptySocial, FX_EMOJI, MAX_DIARY, MAX_SAVED, MOMENT_KINDS, normalizeSocial, pairKey, relationStatus } from './social-state';

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

const cast12: Actor[] = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, name: `Mon${i}`, types: [['water', 'fire', 'grass', 'normal'][i % 4]!] as Actor['types'] }));
const REL_VARIANTS: { bond: number; spark: number; flag: 'casal' | 'brigados' | null }[] = [
  { bond: 0, spark: 0, flag: null },
  { bond: 70, spark: 80, flag: null },
  { bond: 80, spark: 85, flag: 'casal' },
  { bond: 10, spark: 80, flag: 'casal' },
  { bond: -50, spark: 0, flag: null },
  { bond: -20, spark: 0, flag: 'brigados' },
  { bond: 40, spark: 50, flag: null },
];

/** Mundos de teste (um por variante de relações), montados uma vez: o sorteio só lê o estado. */
const WORLDS = REL_VARIANTS.map((_, vi) => {
  const s = fresh();
  for (const f of FURNITURE_IDS) s.placed.push({ x: 1, y: 1, item: f });
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) s.rel[pairKey(`m${i}`, `m${j}`)] = { ...REL_VARIANTS[(i * 3 + j + vi) % REL_VARIANTS.length]!, since: '', met: 1 + (vi % 3) * 4 };
    friendOf(s, `m${i}`).points = i % 3 === 0 ? 90 : 10;
  }
  s.wear.player = 'chapeu-palha';
  s.wear.mons.m0 = 'oculos';
  if (vi >= 3) s.seen.push('rom-fim');
  // Cidade crescida e algumas respostas dadas às perguntas dos Pokémon (para os modelos que dependem disso).
  s.town.level = 9;
  s.lingo = [{ text: 'brigadeiro', kind: 'comida', from: 'm0', t: 1 }, { text: 'sorvete de pecha', kind: 'comida', from: 'm1', t: 2 }];
  return s;
});

/** Datas em que os modelos de datas especiais acontecem (Natal, aniversários dos 12 Pokémon do teste, dias da semana…). */
const SPECIAL_DATES = [
  '2026-10-31', '2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01', '2026-06-12', '2026-06-24', '2026-10-12', '2027-02-27', '2027-02-13', '2027-04-04', '2026-07-20',
  '2026-09-07', '2026-09-22', '2026-12-21', '2026-05-10', '2026-08-09', '2026-11-13', '2026-10-05', '2026-10-17', '2026-10-18', '2026-10-16', '2026-10-15',
  ...cast12.map((a) => {
    const b = birthdayOf(a.id);
    return `2026-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')}`;
  }),
];

/** Monta uma cena para um modelo: sorteia em vários mundos (horas, clima, relações, datas) até ele sair. */
function sceneFor(id: string): Scene | null {
  const tpl = TEMPLATE_BY_ID.get(id)!;
  if (id.startsWith('data-')) {
    for (const date of SPECIAL_DATES) {
      for (let vi = 0; vi < WORLDS.length; vi++) {
        for (const hour of [14, 20, 23, 8]) {
          for (const weather of [null, 'chuva', 'neve']) {
            const s = WORLDS[vi]!;
            const env = { ...makeEnv(s, date, hour, weather, 'Ash'), crops: 3, ripeCrops: 2 };
            const sc = sceneOfTemplate(tpl, cast12, s, env, seededRng(vi * 31 + hour), 25);
            if (sc) return sc;
          }
        }
      }
    }
    return null;
  }
  // Monta o modelo direto, em vários mundos (relações, horas, clima e dias da semana); o sorteio de verdade é testado à parte.
  for (const date of ['2026-10-14', '2026-10-12', '2026-10-16', '2026-10-18', '2026-10-17', '2026-10-15']) {
    for (let vi = 0; vi < WORLDS.length; vi++) {
      for (const hour of [14, 23, 8, 19, 6, 21]) {
        for (const weather of [null, 'chuva', 'neve']) {
          const s = WORLDS[vi]!;
          if (id.startsWith('work-') && s.farm.history.length === 0) {
            s.farm.history.push(
              { residentId: 'm0', at: 1, message: 'Minerou na pedreira.', kind: 'mine' },
              { residentId: 'm1', at: 2, message: 'Trabalhou na madeireira.', kind: 'lumber' },
              { residentId: 'm2', at: 3, message: 'Pescou no lago.', kind: 'fish' },
            );
          }
          const env = { ...makeEnv(s, date, hour, weather), crops: 3, ripeCrops: 2 };
          const sc = sceneOfTemplate(tpl, cast12, s, env, seededRng(vi * 17 + hour), 40);
          if (sc) return sc;
        }
      }
    }
  }
  return null;
}

describe('momentos: catálogo de modelos', () => {
  it('são muitos, com ids únicos e todos os tipos de momento representados', () => {
    expect(TEMPLATE_COUNT).toBeGreaterThanOrEqual(150);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATE_COUNT);
    expect(TEMPLATE_BY_ID.size).toBe(TEMPLATE_COUNT);
    for (const k of MOMENT_KINDS) expect(TEMPLATES.some((t) => t.kind === k), k).toBe(true);
    expect(TEMPLATES.some((t) => t.choice)).toBe(true);
  });

  it('tem cenas engraçadas para os novos trabalhos da Vila', () => {
    for (const id of ['bos-turno-da-picareta', 'bos-madeira-com-medida', 'lago-isca-improvisada', 'lago-balde-vazio']) {
      const tpl = TEMPLATE_BY_ID.get(id);
      expect(tpl, id).toBeDefined();
      expect(tpl!.lines({
        n: ['Ana', 'Beto'], p: ['Brincalhão', 'Curioso'], types: [['normal'], ['water']], rel: undefined, rel02: undefined, rel12: undefined,
        env: { player: 'Treinador', hour: 14, day: '2026-10-21', weather: null, placed: new Set(), crops: 0, ripeCrops: 0, town: 5, lingo: [] },
        seen: new Set(), rng: seededRng(7), memo: {}, pts: () => 0, has: () => false, rolling: false, ids: ['a', 'b'], date: { y: 2026, m: 10, d: 21, dow: 3 },
      }).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('o sorteio de verdade chega à grande maioria dos modelos de um dia comum', () => {
    const got = new Set<string>();
    let n = 0;
    for (let vi = 0; vi < WORLDS.length; vi++) {
      for (const hour of [8, 14, 20, 23]) {
        for (const weather of [null, 'chuva', 'neve']) {
          const s = WORLDS[vi]!;
          const env = { ...makeEnv(s, '2026-10-14', hour, weather), crops: 3, ripeCrops: 2 };
          for (let seed = 1; seed <= 120; seed++) {
            const sc = pickMoment(cast12, s, env, seededRng(seed * 13 + vi + hour));
            if (sc) got.add(sc.tpl.id);
            n++;
          }
        }
      }
    }
    const common = TEMPLATES.filter((t) => !t.id.startsWith('data-'));
    const reached = common.filter((t) => got.has(t.id)).length;
    expect(n).toBeGreaterThan(1000);
    expect(reached / common.length).toBeGreaterThan(0.85);
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
  }, 60_000);
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

  it('não repete imediatamente o mesmo momento comum quando há alternativas', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { s, env } = richEnv();
      const previous = pickMoment(actors, s, env, seededRng(seed));
      expect(previous).not.toBeNull();
      s.diary.push({
        id: `previous-${seed}`, t: 1_000, day: '2026-10-14', hour: 14, tpl: previous!.tpl.id,
        kind: previous!.tpl.kind, title: previous!.tpl.title, emoji: previous!.tpl.emoji,
        cast: previous!.cast.map((actor) => ({ id: actor.id, name: actor.name })), lines: previous!.lines, result: [],
      });
      const next = pickMoment(actors, s, env, seededRng(seed + 10_000));
      expect(next?.tpl.id).not.toBe(previous!.tpl.id);
    }
  });

  it('memórias recentes de rivalidade puxam revanche e permitem uma reconciliação', () => {
    const s = fresh();
    s.rel[pairKey('a', 'b')] = { bond: -8, spark: 0, flag: null, since: '2026-10-10', met: 2 };
    s.memories.push({
      id: 'rivalidade:a', mon: 'a', with: ['b'], kind: 'rivalidade',
      text: 'Duelo: a revanche ficou marcada', day: '2026-10-12', t: Date.parse('2026-10-12T12:00:00Z'), momentId: 'rivalidade',
    });
    const env = makeEnv(s, '2026-10-14', 14, null);
    const found = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const scene = pickMoment(actors.slice(0, 2), s, env, seededRng(seed));
      if (scene) found.add(scene.tpl.id);
    }
    expect(found.has('duo-revanche')).toBe(true);
    expect(found.has('par-pazes')).toBe(true);
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

  it('transforma uma promessa em comportamento futuro e a consome quando acontece', () => {
    const s = fresh();
    const env = makeEnv(s, '2026-10-14', 14, null);
    const base = sceneOfTemplate(TEMPLATE_BY_ID.get('par-piquenique')!, actors.slice(0, 2), s, env, seededRng(8))!;
    const scene = { ...base, tpl: { ...base.tpl, outcome: { plan: { kind: 'visitar' as const, from: 0 as const, to: 1 as const, days: 3 } } } };
    resolveScene(s, scene, null, Date.parse('2026-10-14T14:00:00Z'));
    expect(s.plans).toHaveLength(1);
    expect(s.plans[0]).toMatchObject({ from: 'a', to: 'b', kind: 'visitar', expiresDay: '2026-10-17' });

    const followUp = pickMoment(actors.slice(0, 2), s, makeEnv(s, '2026-10-15', 14, null), seededRng(2));
    expect(followUp?.tpl.id).toBe('social-plano-visita');
    const completed = resolveScene(s, followUp!, null, Date.parse('2026-10-15T14:00:00Z'));
    expect(s.plans).toEqual([]);
    const memories = s.memories.filter((memory) => memory.momentId === completed.moment.id);
    expect(memories).toHaveLength(2);
    expect(memories.map((memory) => memory.mon).sort()).toEqual(['a', 'b']);
    expect(memories[0]?.text).toContain('Promessa cumprida: Ana visitou Beto.');
    expect(recentGossip(s, 'a', completed.moment.t + 1)).toContain('Promessa cumprida: Ana visitou Beto.');
  });

  it('não trata compromisso vencido como promessa cumprida nem cria a cena especial', () => {
    const s = fresh();
    s.plans.push({ id: 'plano-vencido', from: 'a', to: 'b', kind: 'visitar', createdDay: '2026-10-14', expiresDay: '2026-10-15', sourceMomentId: 'momento-real' });
    const scene = pickMoment(actors.slice(0, 2), s, makeEnv(s, '2026-10-16', 14, null), seededRng(2))!;
    expect(scene.tpl.id).not.toBe('social-plano-visita');
    resolveScene(s, scene, null, Date.parse('2026-10-16T14:00:00Z'));
    expect(s.memories.some((memory) => memory.text.includes('Promessa cumprida'))).toBe(false);
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

  it('o Diário guarda só os últimos 60 momentos, mas nunca perde o que foi guardado no Álbum', () => {
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
    expect(s.diary.length).toBeLessThanOrEqual(MAX_DIARY + 1);
    expect(s.diary.some((m) => m.id === first)).toBe(true);
    expect(setFavorite(s, 'nao-existe', true)).toBe(false);
    expect(setFavorite(s, first, false)).toBe(true);
    expect(s.diary.find((m) => m.id === first)?.fav).toBeUndefined();
  });

  it('o Álbum guarda até MAX_SAVED momentos para sempre e recusa o excedente', () => {
    const s = fresh();
    const env = makeEnv(s, '2026-10-14', 14, null);
    let refused = 0;
    for (let i = 0; i < MAX_SAVED + 20; i++) {
      const r = resolveScene(s, pickMoment(actors, s, env, seededRng(i + 1))!, null, 1000 + i);
      if (!setFavorite(s, r.moment.id, true)) refused++;
    }
    expect(refused).toBeGreaterThan(0);
    expect(savedMoments(s).length).toBe(MAX_SAVED);
    expect(s.diary.length).toBeLessThanOrEqual(MAX_SAVED + MAX_DIARY);
  });

  it('marcos da vida vão sozinhos para o Álbum e continuam lá depois que o Diário enche', () => {
    const s = fresh();
    const sc = sceneFor('data-natal')!;
    expect(sc).not.toBeNull();
    expect(sc.tpl.keep).toBe(true);
    const r = resolveScene(s, sc, null, 5000);
    expect(r.moment.fav).toBe(true);
    expect(savedMoments(s).map((m) => m.id)).toContain(r.moment.id);
    const env = makeEnv(s, '2026-10-14', 14, null);
    for (let i = 0; i < MAX_DIARY * 3; i++) resolveScene(s, pickMoment(actors, s, env, seededRng(i + 3))!, null, 6000 + i);
    expect(s.diary.some((m) => m.id === r.moment.id && m.fav)).toBe(true);
    expect(s.diary.filter((m) => !m.fav).length).toBeLessThanOrEqual(MAX_DIARY);
  });

  it('um Diário antigo e enorme é cortado ao carregar, mas o que está guardado fica', () => {
    const s = fresh();
    const env = makeEnv(s, '2026-10-14', 14, null);
    const big: unknown[] = [];
    for (let i = 0; i < 200; i++) {
      const r = resolveScene(s, pickMoment(actors, s, env, seededRng(i + 1))!, null, 100 + i);
      big.push(i % 50 === 0 ? { ...r.moment, fav: true } : r.moment);
    }
    const loaded = normalizeSocial({ diary: big, seen: [] });
    expect(loaded.diary.filter((m) => !m.fav).length).toBe(MAX_DIARY);
    // Os guardados (os 4 marcados aqui e os marcos que já nascem guardados) ficam todos, na ordem em que aconteceram.
    const kept = (big as { fav?: boolean; t: number }[]).filter((m) => m.fav).map((m) => m.t);
    expect(kept.length).toBeGreaterThanOrEqual(4);
    expect(loaded.diary.filter((m) => m.fav).map((m) => m.t)).toEqual(kept);
  });

  it('o Álbum lista todos os modelos, marcando os já vistos, e os guardados vêm do mais novo ao mais antigo', () => {
    const s = fresh();
    s.seen.push('solo-espelho', 'nao-existe');
    const entries = albumEntries(s);
    expect(entries).toHaveLength(TEMPLATE_COUNT);
    expect(entries.filter((e) => e.seen).map((e) => e.id)).toEqual(['solo-espelho']);
    expect(albumProgress(s)).toEqual({ seen: 1, total: TEMPLATE_COUNT });
    const env = makeEnv(s, '2026-10-14', 14, null);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = resolveScene(s, pickMoment(actors, s, env, seededRng(i + 40))!, null, 100 + i * 10);
      setFavorite(s, r.moment.id, true);
      ids.push(r.moment.id);
    }
    expect(savedMoments(s).map((m) => m.id)).toEqual([...ids].reverse());
  });
});

describe('momentos: datas especiais', () => {
  const countOn = (date: string, hour: number, weather: string | null, picks = 400) => {
    const { s } = richEnv(hour, weather);
    const env = { ...makeEnv(s, date, hour, weather, 'Ash'), crops: 3, ripeCrops: 2 };
    const found = new Map<string, number>();
    for (let i = 0; i < picks; i++) {
      const sc = pickMoment(cast12, s, env, seededRng(i + 11));
      if (sc) found.set(sc.tpl.id, (found.get(sc.tpl.id) ?? 0) + 1);
    }
    return found;
  };

  it('num dia comum nenhum momento de feriado acontece', () => {
    const got = countOn('2026-10-14', 14, null);
    const dated = [...got.keys()].filter((id) => id.startsWith('data-') && !['data-segunda', 'data-sabado', 'data-domingo', 'data-sexta-noite', 'data-lua-cheia', 'data-treinador', 'data-treinador-solo'].includes(id));
    expect(dated).toEqual([]);
  });

  it('no Natal, na noite das bruxas e no Ano Novo, os momentos da data aparecem', () => {
    expect([...countOn('2026-12-25', 20, null).keys()].some((id) => id === 'data-natal' || id === 'data-natal-duo')).toBe(true);
    expect([...countOn('2026-10-31', 21, null).keys()].some((id) => id.startsWith('data-halloween'))).toBe(true);
    expect(countOn('2026-12-31', 22, null).has('data-ano-novo')).toBe(true);
    expect(countOn('2026-10-12', 14, null).has('data-dia-criancas')).toBe(true);
  });

  it('no aniversário de um Pokémon do elenco, há festa (e fica no Álbum); fora do dia, não', () => {
    const b = birthdayOf('m0');
    const date = `2026-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')}`;
    const got = countOn(date, 14, null, 600);
    expect([...got.keys()].some((id) => id.startsWith('data-aniversario'))).toBe(true);
    const sc = sceneFor('data-aniversario-surpresa')!;
    expect(sc).not.toBeNull();
    expect(sc.tpl.keep).toBe(true);
    const bds = new Set(cast12.map((a) => {
      const x = birthdayOf(a.id);
      return x.m * 100 + x.d;
    }));
    const quiet = Array.from({ length: 28 }, (_, i) => 100 + i + 1).find((v) => !bds.has(v))!;
    const plain = countOn(`2026-01-${String(quiet - 100).padStart(2, '0')}`, 14, null, 300);
    expect([...plain.keys()].some((id) => id.startsWith('data-aniversario'))).toBe(false);
  });

  it('as falas usam o nome do treinador do perfil', () => {
    const sc = sceneFor('data-natal')!;
    expect(sc.lines.some((l) => l.text.includes('Ash'))).toBe(true);
    const talk = sceneFor('data-treinador')!;
    expect(talk.lines.some((l) => l.text.includes('Ash'))).toBe(true);
  });

  it('sexta-feira 13 só acontece numa sexta dia 13', () => {
    expect([...countOn('2026-11-13', 14, null).keys()]).toContain('data-sexta-13');
    expect([...countOn('2026-10-16', 14, null).keys()]).not.toContain('data-sexta-13');
  });
});

describe('momentos: fora da Vila e conversas', () => {
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

  it('compacta apenas a memória da fala e usa o apelido atual dos envolvidos', () => {
    const s = fresh();
    s.diary.push({ id: 'm-10', t: 10, day: '2026-10-14', hour: 14, tpl: 'par-piquenique', kind: 'amizade', title: 'Piquenique', emoji: '🧺', cast: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }], lines: [], result: ['+5 amizade'] });
    s.memories.push({ id: 'm-10:a', mon: 'a', with: ['b'], kind: 'amizade', text: 'Piquenique: +5 amizade', day: '2026-10-14', t: 10, momentId: 'm-10' });
    const full = recentGossip(s, 'a', 20);
    const compact = recentGossip(s, 'a', 20, { compact: true, nameOf: (id, fallback) => id === 'b' ? 'Brisa' : fallback });
    expect(full).toContain('Piquenique: +5 amizade');
    expect(compact).toContain('Piquenique — amizade fortalecida');
    expect(compact).toContain('Brisa');
    expect(compact).not.toContain('+5 amizade');
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

