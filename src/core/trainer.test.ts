import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS, applyEvent, dayKey, emptyTrainer, importHistory, levelOf, levelProgress, missionsFor, normalizeTrainer, previousDay, spendEnergy, STARTER_ENERGY, titleOf, XP, xpForLevel,
} from './trainer';
import type { TrainerEvent, TrainerState } from './trainer';

const scan = (n: number, setId = 'base1'): TrainerEvent => ({ type: 'scan', cardId: `${setId}-${n}`, setId, setName: 'Coleção Base', setTotal: 102 });

function play(events: [TrainerEvent, string][], from: TrainerState = emptyTrainer()) {
  let state = from;
  const all: ReturnType<typeof applyEvent>['rewards'] = [];
  for (const [event, day] of events) {
    const out = applyEvent(state, event, day);
    state = out.state;
    all.push(...out.rewards);
  }
  return { state, rewards: all };
}

describe('nível', () => {
  it('cresce de forma contínua e inversa de xpForLevel', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(5)).toBe(1000);
    for (let level = 1; level <= 40; level++) {
      expect(levelOf(xpForLevel(level))).toBe(level);
      expect(levelOf(xpForLevel(level + 1) - 1)).toBe(level);
    }
    expect(levelOf(-5)).toBe(1);
  });

  it('mostra o progresso e o título', () => {
    const p = levelProgress(150);
    expect(p.level).toBe(2);
    expect(p.into).toBe(50);
    expect(p.span).toBe(200);
    expect(p.frac).toBeCloseTo(0.25);
    expect(titleOf(1)).toBe('Novato');
    expect(titleOf(5)).toBe('Treinador');
    expect(titleOf(40)).toBe('Lenda');
  });
});

describe('dias', () => {
  it('formata e volta um dia pelo calendário', () => {
    expect(dayKey(new Date(2026, 9, 4))).toBe('2026-10-04');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });

  it('missões do dia são fixas, são 3, diferentes e sempre incluem uma de leitura', () => {
    for (const day of ['2026-10-14', '2026-10-15', '2027-01-01', '2026-12-31']) {
      const a = missionsFor(day);
      expect(missionsFor(day)).toEqual(a);
      expect(a).toHaveLength(3);
      expect(new Set(a.map((m) => m.kind)).size).toBe(3);
      expect(['scan', 'new']).toContain(a[0]!.kind);
    }
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => missionsFor(`2026-11-${String(i + 1).padStart(2, '0')}`).map((m) => m.kind).join()));
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe('leituras', () => {
  it('carta nova rende XP e vira conquista; repetida só rende uma vez por dia', () => {
    const day = '2026-10-14';
    const first = applyEvent(emptyTrainer(), scan(1), day);
    expect(first.state.xp).toBeGreaterThanOrEqual(XP.newCard);
    expect(first.rewards.map((r) => r.tone)).toContain('new');
    expect(first.state.achievements['primeira-carta']).toBe(day);
    const again = applyEvent(first.state, scan(1), day);
    expect(again.state.xp).toBe(first.state.xp);
    expect(again.state.scans).toBe(first.state.scans);
    const nextDay = applyEvent(again.state, scan(1), '2026-10-15');
    expect(nextDay.state.xp).toBeGreaterThanOrEqual(first.state.xp + XP.repeatCardDaily);
    expect(nextDay.state.cardIds).toEqual(['base1-1']);
  });

  it('não altera o estado recebido', () => {
    const s = emptyTrainer();
    const copy = JSON.stringify(s);
    applyEvent(s, scan(1), '2026-10-14');
    expect(JSON.stringify(s)).toBe(copy);
  });

  it('agrupa as cartas por coleção', () => {
    const { state } = play([[scan(1), '2026-10-14'], [scan(2), '2026-10-14'], [scan(3, 'jungle'), '2026-10-14']]);
    expect(state.sets.base1!.ids).toHaveLength(2);
    expect(state.sets.jungle!.ids).toHaveLength(1);
  });
});

describe('sequência', () => {
  it('conta dias seguidos, bonifica e quebra quando pula um dia', () => {
    const { state, rewards } = play([[scan(1), '2026-10-14'], [scan(2), '2026-10-15'], [scan(3), '2026-10-16']]);
    expect(state.streak.current).toBe(3);
    expect(state.streak.best).toBe(3);
    expect(rewards.filter((r) => r.tone === 'streak')).toHaveLength(2);
    expect(state.achievements['sequencia-3']).toBeDefined();
    const broken = applyEvent(state, scan(4), '2026-10-19').state;
    expect(broken.streak.current).toBe(1);
    expect(broken.streak.best).toBe(3);
  });

  it('várias atividades no mesmo dia contam uma vez', () => {
    const { state } = play([[scan(1), '2026-10-14'], [scan(2), '2026-10-14'], [{ type: 'battle', team: false }, '2026-10-14']]);
    expect(state.streak.current).toBe(1);
  });
});

describe('missões', () => {
  it('cumprir uma missão dá XP uma vez e todas dão o bônus do dia', () => {
    const day = '2026-10-14';
    const missions = missionsFor(day);
    const events: [TrainerEvent, string][] = [];
    // Faz o suficiente de tudo para cumprir qualquer sorteio.
    for (let i = 1; i <= 6; i++) events.push([scan(i), day]);
    for (let i = 0; i < 3; i++) events.push([{ type: 'battle', team: true }, day]);
    for (let i = 0; i < 3; i++) events.push([{ type: 'minigame', game: 'quem', won: true, score: 80 }, day]);
    const { state, rewards } = play(events);
    expect(state.today.done.sort()).toEqual(missions.map((m) => m.id).sort());
    expect(rewards.filter((r) => r.text === 'Missão cumprida!')).toHaveLength(3);
    expect(rewards.filter((r) => r.text === 'Todas as missões de hoje!')).toHaveLength(1);
    expect(state.today.bonus).toBe(true);
  });

  it('o progresso zera num dia novo', () => {
    const { state } = play([[scan(1), '2026-10-14'], [scan(2), '2026-10-15']]);
    expect(state.today.day).toBe('2026-10-15');
    expect(state.today.cards).toEqual(['base1-2']);
  });
});

describe('batalhas e conquistas', () => {
  it('batalha em equipe conta e destrava a conquista', () => {
    const { state } = play([[{ type: 'battle', team: true }, '2026-10-14']]);
    expect(state.battles).toBe(1);
    expect(state.teamBattles).toBe(1);
    expect(state.achievements.equipe).toBeDefined();
    const solo = play([[{ type: 'battle', team: false }, '2026-10-14']]).state;
    expect(solo.teamBattles).toBe(0);
    expect(solo.achievements.equipe).toBeUndefined();
  });

  it('só as primeiras batalhas do dia rendem XP', () => {
    const day = '2026-10-14';
    const events: [TrainerEvent, string][] = Array.from({ length: XP.battlesPerDay + 3 }, () => [{ type: 'battle', team: false }, day]);
    const { state } = play(events);
    expect(state.battles).toBe(XP.battlesPerDay + 3);
    const capped = play(events.slice(0, XP.battlesPerDay)).state;
    // As batalhas extras não somam XP além do que as missões já deram.
    expect(state.xp).toBe(capped.xp);
  });

  it('subir de nível gera recompensa e conquistas não se repetem', () => {
    const base = { ...emptyTrainer(), xp: 95 };
    const out = applyEvent(base, scan(1), '2026-10-14');
    expect(out.rewards.some((r) => r.tone === 'level' && r.text === 'Nível 2!')).toBe(true);
    const again = applyEvent(out.state, scan(2), '2026-10-14');
    expect(again.rewards.filter((r) => r.sub === 'Primeira carta')).toHaveLength(0);
  });

  it('todas as conquistas têm id único e texto', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(2);
      expect(a.hint.endsWith('.')).toBe(true);
    }
  });
});

describe('minigames', () => {
  const day = '2026-10-14';

  it('guardam partidas e melhor pontuação e destravam conquistas', () => {
    const a = applyEvent(emptyTrainer(), { type: 'minigame', game: 'quem', won: true, score: 60 }, day);
    const b = applyEvent(a.state, { type: 'minigame', game: 'quem', won: false, score: 20 }, day);
    const c = applyEvent(b.state, { type: 'minigame', game: 'tipos', won: true, score: 100 }, day);
    expect(c.state.games.quem).toEqual({ played: 2, best: 60 });
    expect(c.state.games.tipos).toEqual({ played: 1, best: 100 });
    expect(c.state.minigames).toBe(3);
    expect(c.state.minigameWins).toBe(2);
    expect(c.state.achievements['minigame-1']).toBe(day);
    expect(c.state.achievements['minigame-perfeito']).toBe(day);
  });

  it('só vitória rende XP e só nas primeiras do dia', () => {
    const lost = applyEvent(emptyTrainer(), { type: 'minigame', game: 'quem', won: false, score: 20 }, day);
    expect(lost.rewards.some((r) => r.text === 'Minigame vencido!')).toBe(false);
    let state = emptyTrainer();
    const xpAfter: number[] = [];
    for (let i = 0; i < XP.minigamesPerDay + 3; i++) {
      state = applyEvent(state, { type: 'minigame', game: 'memoria', won: true, score: 70 }, day).state;
      xpAfter.push(state.xp);
    }
    expect(xpAfter[0]).toBeGreaterThanOrEqual(XP.minigameWin);
    // Depois do limite diário nada soma (as missões do dia já foram cumpridas antes).
    expect(xpAfter.at(-1)).toBe(xpAfter[XP.minigamesPerDay - 1]);
  });

  it('a pontuação é limitada de 0 a 100', () => {
    const s = applyEvent(emptyTrainer(), { type: 'minigame', game: 'x', won: true, score: 900 }, day).state;
    expect(s.games.x!.best).toBe(100);
  });

  it('missões de minigame podem aparecer no sorteio do dia', () => {
    const kinds = new Set<string>();
    for (let d = 1; d <= 28; d++) for (const m of missionsFor(`2026-11-${String(d).padStart(2, '0')}`)) kinds.add(m.kind);
    expect(kinds.has('play')).toBe(true);
  });
});

describe('histórico e armazenamento', () => {
  it('importa cartas já guardadas sem dar XP e sem repetir', () => {
    const cards = [
      { id: 'base1-1', setId: 'base1', setName: 'Base', setOfficial: 102, scanCount: 3 },
      { id: 'base1-2', setId: 'base1', setName: 'Base', setOfficial: 102, scanCount: 1 },
    ];
    const s = importHistory(emptyTrainer(), cards, '2026-10-14');
    expect(s.xp).toBe(0);
    expect(s.cardIds).toHaveLength(2);
    expect(s.scans).toBe(4);
    expect(s.achievements['primeira-carta']).toBeDefined();
    expect(importHistory(s, cards, '2026-10-14')).toEqual(s);
    // Carta importada não conta como nova depois.
    expect(applyEvent(s, scan(1), '2026-10-14').rewards.some((r) => r.tone === 'new')).toBe(false);
  });

  it('normaliza dados estranhos', () => {
    expect(normalizeTrainer(null)).toEqual(emptyTrainer());
    expect(normalizeTrainer({ v: 99, xp: 5 })).toEqual(emptyTrainer());
    const dirty = normalizeTrainer({ v: 1, xp: -4, cardIds: ['a', 3], sets: { x: { name: 'X', total: 'a', ids: ['a'] }, y: 7 }, streak: { current: 'z' }, achievements: { a: 'd', b: 4 } });
    expect(dirty.xp).toBe(0);
    expect(dirty.cardIds).toEqual(['a']);
    expect(dirty.sets).toEqual({ x: { name: 'X', total: 0, ids: ['a'] } });
    expect(dirty.streak.current).toBe(0);
    expect(dirty.achievements).toEqual({ a: 'd' });
    expect(normalizeTrainer({ v: 1, games: { q: { played: 3, best: 500 }, z: 4 } }).games).toEqual({ q: { played: 3, best: 100 } });
    const live = play([[scan(1), '2026-10-14']]).state;
    expect(normalizeTrainer(JSON.parse(JSON.stringify(live)))).toEqual(live);
  });
});

describe('energia do Pin Mode', () => {
  const scan = (id: string): TrainerEvent => ({ type: 'scan', cardId: id, setId: 's', setName: 'S', setTotal: 100 });

  it('quem começa agora tem a energia inicial', () => {
    expect(emptyTrainer().energy).toBe(STARTER_ENERGY);
  });

  it('sobe na mesma quantia do XP ganho', () => {
    const before = emptyTrainer();
    const { state } = applyEvent(before, scan('a'), '2026-10-14');
    expect(state.xp).toBeGreaterThan(0);
    expect(state.energy - before.energy).toBe(state.xp - before.xp);
  });

  it('gastar não mexe no XP e não passa do que há', () => {
    const s = { ...emptyTrainer(), xp: 200, energy: 30 };
    const spent = spendEnergy(s, 12)!;
    expect(spent.energy).toBe(18);
    expect(spent.xp).toBe(200);
    expect(s.energy).toBe(30);
    expect(spendEnergy(s, 31)).toBeNull();
    expect(spendEnergy(s, 30)!.energy).toBe(0);
  });

  it('progresso antigo sem energia parte do XP já ganho', () => {
    const old = JSON.parse(JSON.stringify({ ...emptyTrainer(), xp: 350 })) as Record<string, unknown>;
    delete old.energy;
    expect(normalizeTrainer(old).energy).toBe(350);
    const fresh = JSON.parse(JSON.stringify({ ...emptyTrainer(), xp: 0 })) as Record<string, unknown>;
    delete fresh.energy;
    expect(normalizeTrainer(fresh).energy).toBe(STARTER_ENERGY);
    expect(normalizeTrainer({ ...emptyTrainer(), energy: 12 }).energy).toBe(12);
  });
});
