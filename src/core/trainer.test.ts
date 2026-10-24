import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS, applyEvent, dayKey, emptyTrainer, importHistory, levelOf, levelProgress, missionsFor, normalizeTrainer, previousDay, titleOf, XP, xpForLevel,
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
    for (let i = 0; i < 3; i++) events.push([{ type: 'village', action: 'talk', level: 1 }, day]);
    events.push([{ type: 'village', action: 'answer' }, day]);
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

describe('energia antiga do Treinador (agora tudo é moeda)', () => {
  it('o Treinador não guarda mais energia: progresso antigo com energia é lido sem ela', () => {
    expect('energy' in emptyTrainer()).toBe(false);
    const old = { ...JSON.parse(JSON.stringify(emptyTrainer())), xp: 350, energy: 900 } as Record<string, unknown>;
    expect('energy' in normalizeTrainer(old)).toBe(false);
    expect(normalizeTrainer(old).xp).toBe(350);
  });
});

describe('Liga no Treinador', () => {
  it('primeira vitória dá o XP do desafio; revanche dá pouco', () => {
    const first = applyEvent(emptyTrainer(), { type: 'league', title: 'Insígnia Carvão', xp: 120, first: true }, '2026-10-14');
    expect(first.state.xp).toBeGreaterThanOrEqual(120);
    expect(first.rewards.some((r) => r.text === 'Insígnia Carvão' && r.tone === 'achievement')).toBe(true);
    const again = applyEvent(first.state, { type: 'league', title: 'Revanche', xp: 120, first: false }, '2026-10-14');
    expect(again.state.xp - first.state.xp).toBeLessThan(120);
    expect(again.state.battles).toBe(2);
  });
});

describe('Vila, Liga e PvP no Treinador', () => {
  const day = '2026-10-14';
  const talk = (level = 1): TrainerEvent => ({ type: 'village', action: 'talk', level });

  it('a primeira conversa do dia com um Pokémon dá XP, mas só as primeiras do dia', () => {
    let s = emptyTrainer();
    const gains: number[] = [];
    for (let i = 0; i < XP.villagePerDay + 3; i++) {
      const before = s.xp;
      s = applyEvent(s, talk(), day).state;
      gains.push(s.xp - before);
    }
    expect(s.life.talks).toBe(XP.villagePerDay + 3);
    expect(gains.slice(0, XP.villagePerDay).every((g) => g >= XP.villageTalk)).toBe(true);
    expect(gains.slice(XP.villagePerDay).every((g) => g === 0 || g >= 40)).toBe(true);
    expect(s.today.life).toBe(XP.villagePerDay + 3);
    // Num dia novo o limite volta.
    expect(applyEvent(s, talk(), '2026-10-15').state.today.life).toBe(1);
  });

  it('perguntas respondidas valem mais XP, momentos novos e apelidos só contam', () => {
    const a = applyEvent(emptyTrainer(), { type: 'village', action: 'answer' }, day);
    expect(a.state.life.answers).toBe(1);
    expect(a.state.xp).toBeGreaterThanOrEqual(XP.villageAnswer);
    const m = applyEvent(emptyTrainer(), { type: 'village', action: 'moment' }, day);
    expect(m.state.life.moments).toBe(1);
    expect(m.state.xp).toBe(0);
    const n = applyEvent(emptyTrainer(), { type: 'village', action: 'nickname', level: 3 }, day);
    expect(n.state.life.nicknames).toBe(1);
    expect(n.state.achievements['vila-apelido']).toBeDefined();
  });

  it('o evento de depuração dá exatamente o XP pedido, sem contar como escaneamento, batalha ou minigame', () => {
    const before = emptyTrainer();
    const { state, rewards } = applyEvent(before, { type: 'debug', xp: 1000, label: 'Depuração: sprite do dex 666' }, day);
    expect(state.xp).toBe(1000);
    expect(state.scans).toBe(before.scans);
    expect(state.battles).toBe(before.battles);
    expect(state.minigames).toBe(before.minigames);
    expect(rewards.some((r) => r.text === 'Depuração: sprite do dex 666' && r.sub?.includes('1000'))).toBe(true);
    // Não aceita XP negativo por engano.
    expect(applyEvent(before, { type: 'debug', xp: -50, label: 'x' }, day).state.xp).toBe(0);
  });

  it('a amizade mais alta fica guardada e destrava as conquistas de amizade', () => {
    let s = applyEvent(emptyTrainer(), talk(2), day).state;
    expect(s.bestFriend).toBe(2);
    expect(s.achievements['vila-grande-amigo']).toBeUndefined();
    s = applyEvent(s, talk(3), day).state;
    expect(s.achievements['vila-grande-amigo']).toBeDefined();
    expect(s.achievements['vila-melhor-amigo']).toBeUndefined();
    s = applyEvent(s, talk(1), day).state;
    expect(s.bestFriend).toBe(3);
    s = applyEvent(s, talk(4), day).state;
    expect(s.achievements['vila-melhor-amigo']).toBeDefined();
    expect(applyEvent(s, talk(99), day).state.bestFriend).toBe(4);
  });

  it('as missões da Vila contam conversas e perguntas', () => {
    const d = Array.from({ length: 400 }, (_, i) => `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);
    const withTalk = d.find((x) => missionsFor(x).some((m) => m.id === 'talk-3'))!;
    const withAnswer = d.find((x) => missionsFor(x).some((m) => m.id === 'answer-1'))!;
    expect(withTalk).toBeDefined();
    expect(withAnswer).toBeDefined();
    let s = emptyTrainer();
    for (let i = 0; i < 3; i++) s = applyEvent(s, talk(), withTalk).state;
    expect(s.today.done).toContain('talk-3');
    const r = applyEvent(emptyTrainer(), { type: 'village', action: 'answer' }, withAnswer);
    expect(r.state.today.done).toContain('answer-1');
    for (const x of d) expect(missionsFor(x)).toHaveLength(3);
  });

  it('Liga: insígnias e Campeã (só sobem) e as conquistas delas', () => {
    let s = applyEvent(emptyTrainer(), { type: 'league', title: 'Insígnia', xp: 100, first: true, badges: 1 }, day).state;
    expect(s.league.badges).toBe(1);
    expect(s.achievements['liga-insignia']).toBeDefined();
    expect(s.achievements['liga-oito']).toBeUndefined();
    s = applyEvent(s, { type: 'league', title: 'Revanche', xp: 100, first: false, badges: 0 }, day).state;
    expect(s.league.badges).toBe(1);
    s = applyEvent(s, { type: 'league', title: 'Oitava', xp: 100, first: true, badges: 8 }, day).state;
    expect(s.achievements['liga-oito']).toBeDefined();
    expect(s.achievements['liga-campea']).toBeUndefined();
    s = applyEvent(s, { type: 'league', title: 'Campeã', xp: 300, first: true, badges: 8, championWins: 1 }, day).state;
    expect(s.achievements['liga-campea']).toBeDefined();
    expect(applyEvent(s, { type: 'league', title: 'x', xp: 1, first: false, badges: 99 }, day).state.league.badges).toBe(48);
  });

  it('PvP conta como batalha, rende XP e destrava as conquistas', () => {
    const lost = applyEvent(emptyTrainer(), { type: 'pvp', won: false }, day);
    expect(lost.state.pvp).toEqual({ played: 1, wins: 0 });
    expect(lost.state.battles).toBe(1);
    expect(lost.state.xp).toBeGreaterThanOrEqual(XP.battle);
    expect(lost.state.achievements['pvp-1']).toBeDefined();
    expect(lost.state.achievements['pvp-vitoria']).toBeUndefined();
    const won = applyEvent(lost.state, { type: 'pvp', won: true }, day);
    expect(won.state.pvp).toEqual({ played: 2, wins: 1 });
    expect(won.state.achievements['pvp-vitoria']).toBeDefined();
    expect(won.unlocked).toContain('pvp-vitoria');
  });

  it('carta nova shiny conta; a mesma carta de novo não', () => {
    const ev: TrainerEvent = { type: 'scan', cardId: 'base1-1', setId: 'base1', setName: 'Coleção Base', setTotal: 102, shiny: true };
    const a = applyEvent(emptyTrainer(), ev, day);
    expect(a.state.shinies).toBe(1);
    expect(a.state.achievements['shiny-1']).toBeDefined();
    expect(applyEvent(a.state, ev, day).state.shinies).toBe(1);
    expect(applyEvent(emptyTrainer(), scan(1), day).state.shinies).toBe(0);
  });

  it('applyEvent devolve só as conquistas que acabaram de abrir', () => {
    const first = applyEvent(emptyTrainer(), scan(1), day);
    expect(first.unlocked).toEqual(['primeira-carta']);
    expect(applyEvent(first.state, scan(1), day).unlocked).toEqual([]);
  });

  it('arquivos antigos (sem Vila, Liga, PvP nem shiny) abrem com zeros', () => {
    const old = JSON.parse(JSON.stringify(emptyTrainer())) as Record<string, unknown>;
    for (const k of ['life', 'bestFriend', 'league', 'pvp', 'shinies']) delete old[k];
    delete (old.today as Record<string, unknown>).life;
    const n = normalizeTrainer(old);
    expect(n.life).toEqual({ talks: 0, answers: 0, moments: 0, nicknames: 0 });
    expect(n.league).toEqual({ badges: 0, champion: 0 });
    expect(n.pvp).toEqual({ played: 0, wins: 0 });
    expect([n.bestFriend, n.shinies, n.today.life]).toEqual([0, 0, 0]);
    const wild = normalizeTrainer({ ...emptyTrainer(), bestFriend: 9, league: { badges: 50, champion: -3 }, pvp: { played: 1, wins: 5 } });
    expect([wild.bestFriend, wild.league.badges, wild.league.champion, wild.pvp.wins]).toEqual([4, 48, 0, 1]);
  });

  it('registra corridas reais da Torre uma vez e mantém um histórico limitado no save', () => {
    const run: TrainerEvent = { type: 'survivor', runId: 'corrida-1', survivedMs: 60_000, trainersBeaten: 1, bossesBeaten: 0, clearedTorre: false, infinite: false, wave: 4, kills: 18, level: 5, completedObjectives: ['tempo-1m', 'abates-20', 'inventado'] };
    const first = applyEvent(emptyTrainer(), run, day);
    expect(first.state.torre).toMatchObject({ runs: 1, bestWave: 4, bestLevel: 5, runIds: ['corrida-1'], completedObjectives: ['tempo-1m', 'abates-20'] });
    expect(first.state.torre.recentRuns).toEqual([{ id: 'corrida-1', day, survivedMs: 60_000, wave: 4, kills: 18, level: 5, infinite: false, cleared: false }]);
    const repeated = applyEvent(first.state, run, '2026-10-20');
    expect(repeated.state).toEqual(first.state);
    expect(repeated.rewards).toEqual([]);
    expect(repeated.state.torre.runs).toBe(1);
  });

  it('completa compatibilidade de saves antigos da Torre sem sobrescrever marcas existentes', () => {
    const old = normalizeTrainer({ ...emptyTrainer(), torre: { bestMs: 30_000, infiniteUnlocked: true } });
    expect(old.torre).toMatchObject({ runs: 1, bestMs: 30_000, infiniteUnlocked: true, bestWave: 0, runIds: [], recentRuns: [], completedObjectives: [] });
  });

  it('preserva objetivos novos no save e descarta IDs que não existem', () => {
    const state = normalizeTrainer({ ...emptyTrainer(), torre: { completedObjectives: ['abates-20', 'treinador-3', 'inventado'] } });
    expect(state.torre.completedObjectives).toEqual(['abates-20', 'treinador-3']);
  });

  it('Pins concede marcos só a partir de partidas registradas e da pontuação concluída', () => {
    const missed = applyEvent(emptyTrainer(), { type: 'minigame', game: 'pins', won: false, score: 40 }, day);
    expect(missed.state.achievements['pins-primeiro']).toBeDefined();
    expect(missed.state.achievements['pins-perfeito']).toBeUndefined();
    const perfect = applyEvent(missed.state, { type: 'minigame', game: 'pins', won: true, score: 100 }, day);
    expect(perfect.state.achievements['pins-perfeito']).toBeDefined();
  });

  it('toda conquista tem título, dica e id único', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) expect(a.title.length > 2 && a.hint.length > 5).toBe(true);
  });
});
