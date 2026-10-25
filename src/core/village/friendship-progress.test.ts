import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { bookPage, moodOf, unlocksAt } from './book';
import {
  add, claimFriendMilestones, dislikeOf, emptyVillage, favoriteOf, FRIEND_LEVELS, FRIEND_LOSS, friendLevel, friendOf, friendProgressText, gainFriendship, giveGift, normalizeVillage, talk, TALK_FRIENDSHIP,
} from './life';
import { generateVillage } from './map';
import { L } from './moments/kit';
import type { Template } from './moments/kit';
import { claimRequest, REQUEST_FRIENDSHIP } from './requests';
import type { VillageRequest } from './requests';
import { FRIEND_MILESTONE_TPL, makeEnv, MOMENT_FRIEND_SCALE, recentGossip, recordFriendMilestone, resolveScene, sceneOfTemplate } from './social';
import type { Actor } from './social';
import { villageSummary } from './summary';

const map = generateVillage(20261014);
const fresh = () => emptyVillage(20261014, map.spawn);
const DAY = '2026-10-14';
const dayN = (n: number) => `2026-10-${String(14 + n).padStart(2, '0')}`;

describe('nível de amizade e caminho até o próximo marco', () => {
  it('mostra quanto falta para o próximo nível e, depois de «Melhor amigo», para a amizade máxima', () => {
    expect(friendLevel(0)).toMatchObject({ level: 0, next: { name: 'Colega', min: 20 }, toNext: 20 });
    expect(friendLevel(52)).toMatchObject({ level: 2, name: 'Amigo', next: { name: 'Grande amigo', min: 70 }, toNext: 18 });
    expect(friendLevel(94)).toMatchObject({ level: 4, next: { name: 'amizade máxima', min: 100 }, toNext: 6 });
    expect(friendLevel(100)).toMatchObject({ level: 4, next: null, toNext: 0 });
    expect(friendProgressText(52)).toBe('faltam 18 para Grande amigo');
    expect(friendProgressText(100)).toBe('amizade máxima');
  });

  it('gainFriendship respeita o limite de 0 a 100 e devolve o que mudou de verdade', () => {
    const s = fresh();
    friendOf(s, 'p').points = 97;
    expect(gainFriendship(s, 'p', 10)).toBe(3);
    expect(friendOf(s, 'p').points).toBe(100);
    friendOf(s, 'q').points = 2;
    expect(gainFriendship(s, 'q', -9)).toBe(-2);
    expect(friendOf(s, 'q').points).toBe(0);
  });

  it('o Livro mostra o caminho até o próximo marco', () => {
    const page = bookPage({ id: 'p', name: 'Pikachu', types: ['electric'] }, [], { points: 30, lastTalk: '', lastGift: '', request: null }, DAY, 12);
    expect(page.progress).toBe('faltam 15 para Amigo');
  });
});

describe('marcos de amizade', () => {
  it('cada nível novo é comemorado uma vez; cair e voltar aparecem como queda e recuperação', () => {
    const s = fresh();
    expect(friendOf(s, 'p').milestone).toBe(0);
    gainFriendship(s, 'p', 25);
    expect(claimFriendMilestones(s)).toEqual([{ id: 'p', kind: 'up', level: 1, name: 'Colega', from: 0, passed: [1] }]);
    expect(claimFriendMilestones(s)).toEqual([]);
    gainFriendship(s, 'p', -10);
    expect(claimFriendMilestones(s)).toEqual([{ id: 'p', kind: 'down', level: 0, name: 'Conhecido', from: 1, passed: [1] }]);
    gainFriendship(s, 'p', 10);
    expect(claimFriendMilestones(s)).toEqual([{ id: 'p', kind: 'back', level: 1, name: 'Colega', from: 0, passed: [] }]);
    expect(friendOf(s, 'p').milestone).toBe(1);
  });

  it('perder e ganhar de volta sem trocar de nível não anuncia nada', () => {
    const s = fresh();
    gainFriendship(s, 'p', 50);
    claimFriendMilestones(s);
    gainFriendship(s, 'p', -3);
    gainFriendship(s, 'p', 3);
    expect(claimFriendMilestones(s)).toEqual([]);
  });

  it('um ganho grande que atravessa vários níveis lista todos os que se abriram', () => {
    const s = fresh();
    gainFriendship(s, 'p', 75);
    const [m] = claimFriendMilestones(s);
    expect(m).toMatchObject({ level: 3, name: 'Grande amigo', passed: [1, 2, 3] });
    expect(m!.passed.flatMap(unlocksAt).length).toBeGreaterThanOrEqual(3);
  });

  it('só anuncia quem está na lista pedida (os outros esperam até aparecerem)', () => {
    const s = fresh();
    gainFriendship(s, 'a', 30);
    gainFriendship(s, 'b', 30);
    expect(claimFriendMilestones(s, ['a']).map((m) => m.id)).toEqual(['a']);
    expect(claimFriendMilestones(s, ['a', 'b']).map((m) => m.id)).toEqual(['b']);
  });

  it('save antigo (sem marcos) não despeja avisos do que já tinha conquistado; o próximo nível é anunciado', () => {
    const raw = JSON.parse(JSON.stringify(fresh())) as { friends: Record<string, unknown> };
    raw.friends = { velho: { points: 50, lastTalk: '', lastGift: '', request: null }, estranho: { points: 'x' } };
    const s = normalizeVillage(raw, 20261014, map.spawn);
    expect(friendOf(s, 'velho')).toMatchObject({ milestone: 2, known: 2 });
    expect(friendOf(s, 'estranho').points).toBe(0);
    expect(claimFriendMilestones(s)).toEqual([]);
    gainFriendship(s, 'velho', 20);
    expect(claimFriendMilestones(s)).toEqual([{ id: 'velho', kind: 'up', level: 3, name: 'Grande amigo', from: 2, passed: [3] }]);
  });

  it('o marco vira uma página do Diário com a fala do Pokémon e o que se abriu; «Melhor amigo» fica no Álbum', () => {
    const s = fresh();
    gainFriendship(s, 'p', 45);
    const [m] = claimFriendMilestones(s);
    const moment = recordFriendMilestone(s, { id: 'p', name: 'Pikachu' }, m!, Date.parse(`${DAY}T15:00:00Z`), DAY, 15);
    expect(s.diary.at(-1)).toBe(moment);
    expect(moment).toMatchObject({ tpl: FRIEND_MILESTONE_TPL, kind: 'amizade', title: 'Amizade: Amigo', result: ['Pikachu agora é seu Amigo 💖'] });
    expect(moment.lines.map((l) => l.text).join(' ')).toContain(unlocksAt(2)[0]!);
    expect(moment.fav).toBeUndefined();
    gainFriendship(s, 'p', 50);
    const [best] = claimFriendMilestones(s);
    expect(recordFriendMilestone(s, { id: 'p', name: 'Pikachu' }, best!, Date.parse(`${DAY}T16:00:00Z`), DAY, 16).fav).toBe(true);
  });

  it('a queda vira uma página de Diário com a mágoa e o que fica fechado; a volta, uma reconciliação', () => {
    const s = fresh();
    gainFriendship(s, 'p', 75);
    claimFriendMilestones(s);
    gainFriendship(s, 'p', -10);
    const [down] = claimFriendMilestones(s);
    const now = Date.parse(`${DAY}T15:00:00Z`);
    const drop = recordFriendMilestone(s, { id: 'p', name: 'Pikachu' }, down!, now, DAY, 15);
    expect(drop).toMatchObject({ kind: 'drama', emoji: '💔', title: 'Amizade abalada: Amigo', result: ['Pikachu e você: de Grande amigo para Amigo 💔'] });
    expect(drop.lines.map((l) => l.text).join(' ')).toContain(unlocksAt(3)[0]!);
    expect(drop.fav).toBeUndefined();
    gainFriendship(s, 'p', 10);
    const [back] = claimFriendMilestones(s);
    const again = recordFriendMilestone(s, { id: 'p', name: 'Pikachu' }, back!, now + 1, DAY, 15);
    expect(again).toMatchObject({ kind: 'amizade', title: 'Amizade recuperada: Grande amigo', result: ['Pikachu voltou a ser seu Grande amigo 💖'] });
    expect(again.id).not.toBe(drop.id);
  });

  it('o resumo do dia conta o marco entre as mudanças', () => {
    const s = fresh();
    gainFriendship(s, 'p', 20);
    const [m] = claimFriendMilestones(s);
    const now = Date.parse(`${DAY}T15:00:00Z`);
    recordFriendMilestone(s, { id: 'p', name: 'Pikachu' }, m!, now, DAY, 15);
    const summary = villageSummary(s, [{ id: 'p', name: 'Pikachu' }], now + 60_000);
    expect(summary.changed.map((c) => c.text).join(' ')).toContain('Pikachu agora é seu Colega');
  });
});

describe('as ações do dia a dia fazem a amizade andar', () => {
  it('conversar e dar o favorito todo dia leva de Conhecido a Amigo em poucos dias, passando pelos marcos', () => {
    const s = fresh();
    const types = ['electric'] as const;
    const levels: number[] = [];
    let days = 0;
    while (friendLevel(friendOf(s, 'p').points).level < 2 && days < 30) {
      const day = dayN(days++);
      talk(s, 'p', 'Pikachu', types, day, 10, seededRng(days));
      add(s, favoriteOf(types));
      giveGift(s, 'p', types, favoriteOf(types), day);
      levels.push(...claimFriendMilestones(s).map((m) => m.level));
    }
    expect(days).toBeLessThanOrEqual(3);
    expect(levels).toEqual([1, 2]);
  });

  it('a conversa repetida no mesmo dia muda de tom com a intimidade', () => {
    const s = fresh();
    talk(s, 'p', 'Pikachu', ['electric'], DAY, 10, seededRng(1));
    const stranger = talk(s, 'p', 'Pikachu', ['electric'], DAY, 10, seededRng(2)).text;
    friendOf(s, 'p').points = 95;
    const best = talk(s, 'p', 'Pikachu', ['electric'], DAY, 10, seededRng(2)).text;
    expect(stranger).not.toBe(best);
    expect(stranger).toContain('acena');
    expect(best).toContain('encosta em você');
  });

  it('o presente que o Livro diz que ele não gosta afasta um pouco e deixa ele chateado no dia', () => {
    const s = fresh();
    const types = ['electric'] as const;
    friendOf(s, 'p').points = 30;
    const disliked = dislikeOf('p', types);
    add(s, disliked);
    const r = giveGift(s, 'p', types, disliked, DAY);
    expect(r).toMatchObject({ ok: true, gained: -FRIEND_LOSS.dislikedGift });
    expect(r.text).toContain('não gosto muito disso');
    expect(friendOf(s, 'p').points).toBe(30 - FRIEND_LOSS.dislikedGift);
    expect(moodOf('p', friendOf(s, 'p'), DAY, 12).name).toBe('Chateado');
    expect(moodOf('p', friendOf(s, 'p'), dayN(1), 12).name).not.toBe('Chateado');
    expect(TALK_FRIENDSHIP).toBeGreaterThan(FRIEND_LOSS.dislikedGift);
  });

  it('o pedido do mural para visitar ou entregar a um morador dá amizade e diz quanto', () => {
    const s = fresh();
    const req: VillageRequest = { id: 'r', day: DAY, kind: 'talk', title: 'Visitar', detail: '', location: '', targetId: 'p', targetName: 'Pikachu', rewardCoins: 10, rewardItem: 'flor', rewardQty: 1, rewardFriend: REQUEST_FRIENDSHIP.talk, done: false };
    s.requests = { day: DAY, items: [req], story: [] };
    friendOf(s, 'p').lastTalk = DAY;
    const claim = claimRequest(s, 'r', DAY);
    expect(claim.ok).toBe(true);
    expect(friendOf(s, 'p').points).toBe(REQUEST_FRIENDSHIP.talk);
    expect(claim.message).toContain(`+${REQUEST_FRIENDSHIP.talk} amizade`);
    expect(REQUEST_FRIENDSHIP.deliver).toBeGreaterThan(REQUEST_FRIENDSHIP.talk);
  });
});

describe('a amizade também esfria, sem despencar', () => {
  it('pedido sem resposta pesa pouco na conversa seguinte, que ainda soma no saldo', () => {
    const s = fresh();
    const f = friendOf(s, 'p');
    f.points = 30;
    f.lastTalk = DAY;
    f.request = { day: DAY, item: 'flor', qty: 2, done: false };
    const r = talk(s, 'p', 'Pikachu', ['electric'], dayN(1), 10, seededRng(4));
    expect(r.lost).toBe(FRIEND_LOSS.ignoredRequest);
    expect(r.gained).toBe(TALK_FRIENDSHIP);
    expect(r.text).toContain('Da última vez eu te pedi 2');
    expect(friendOf(s, 'p').points).toBe(30 - FRIEND_LOSS.ignoredRequest + TALK_FRIENDSHIP);
  });

  it('pedido entregue ou de hoje não conta como ignorado', () => {
    const s = fresh();
    const f = friendOf(s, 'p');
    f.lastTalk = DAY;
    f.request = { day: DAY, item: 'flor', qty: 1, done: true };
    expect(talk(s, 'p', 'Pikachu', ['electric'], dayN(1), 10, seededRng(4)).lost).toBe(0);
  });

  it('a saudade só pesa depois de uma semana, cresce por semana e tem teto', () => {
    const lossAfter = (days: number) => {
      const s = fresh();
      Object.assign(friendOf(s, 'p'), { points: 60, lastTalk: DAY, request: null });
      return talk(s, 'p', 'Pikachu', ['electric'], new Date(Date.parse(`${DAY}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10), 10, seededRng(5)).lost;
    };
    expect(lossAfter(3)).toBe(0);
    expect(lossAfter(6)).toBe(0);
    expect(lossAfter(7)).toBe(FRIEND_LOSS.absencePerWeek);
    expect(lossAfter(15)).toBe(2 * FRIEND_LOSS.absencePerWeek);
    expect(lossAfter(200)).toBe(FRIEND_LOSS.absenceMax);
  });

  it('depois de muito tempo fora, ele comenta a saudade no tom do nível', () => {
    const s = fresh();
    Object.assign(friendOf(s, 'p'), { points: 80, lastTalk: DAY, request: null });
    const r = talk(s, 'p', 'Pikachu', ['electric'], dayN(16), 10, seededRng(6));
    expect(r.text).toContain('Você sumiu');
    expect(friendOf(s, 'p').hurt).toBe(dayN(16));
  });

  it('um Grande amigo que some um mês cai de nível, e alguns dias de cuidado recuperam', () => {
    const s = fresh();
    const types = ['electric'] as const;
    Object.assign(friendOf(s, 'p'), { points: 71, lastTalk: DAY, request: null, milestone: 3, known: 3 });
    // Volta depois de um mês sem um presente: −8 de saudade, +6 da conversa.
    talk(s, 'p', 'Pikachu', types, '2026-11-13', 10, () => 0.9);
    expect(friendOf(s, 'p').points).toBe(71 - FRIEND_LOSS.absenceMax + TALK_FRIENDSHIP);
    expect(claimFriendMilestones(s)).toMatchObject([{ kind: 'down', level: 2 }]);
    let days = 14;
    let back: ReturnType<typeof claimFriendMilestones> = [];
    while (back.length === 0 && days < 20) {
      const day = `2026-11-${days++}`;
      talk(s, 'p', 'Pikachu', types, day, 10, () => 0.9);
      add(s, favoriteOf(types));
      giveGift(s, 'p', types, favoriteOf(types), day);
      back = claimFriendMilestones(s);
    }
    expect(back).toMatchObject([{ kind: 'back', level: 3 }]);
    expect(days - 14).toBeLessThanOrEqual(1);
  });

  it('as perdas por descuido são pequenas perto do que uma conversa e um presente devolvem', () => {
    const worstDay = FRIEND_LOSS.absenceMax + FRIEND_LOSS.ignoredRequest + FRIEND_LOSS.dislikedGift;
    expect(worstDay).toBeLessThan(FRIEND_LEVELS[2].min - FRIEND_LEVELS[1].min);
    expect(TALK_FRIENDSHIP + 10).toBeGreaterThan(worstDay);
  });

  it('nunca abaixo de zero', () => {
    const s = fresh();
    Object.assign(friendOf(s, 'p'), { points: 1, lastTalk: DAY, request: { day: DAY, item: 'flor', qty: 1, done: false } });
    const r = talk(s, 'p', 'Pikachu', ['electric'], dayN(15), 10, seededRng(7));
    expect(r.lost).toBe(1);
    expect(friendOf(s, 'p').points).toBe(TALK_FRIENDSHIP);
  });
});

describe('momentos entre os Pokémon e a amizade com você', () => {
  const actors: Actor[] = [{ id: 'a', name: 'Ana', types: ['fire'] }, { id: 'b', name: 'Beto', types: ['water'] }];
  const tpl: Template = {
    id: 'teste-carinho', kind: 'amizade', title: 'Teste', emoji: '🧪', cast: 2, weight: 1,
    lines: () => [L(0, 'Oi!'), L(1, 'Oi!')],
    outcome: { bond: 5, friend: 2 },
    choice: { prompt: 'E agora?', options: [{ label: () => 'Ficar do lado da Ana', lines: () => [L(0, 'Obrigada!')], outcome: { bond: 3, friendBy: [2, -1] } }] },
  };
  const play = (choice: number | null, away = false, startPoints = 0) => {
    const s = fresh();
    for (const a of actors) friendOf(s, a.id).points = startPoints;
    const scene = sceneOfTemplate(tpl, actors, s, makeEnv(s, DAY, 14, null), seededRng(3))!;
    const ids = scene.cast.map((c) => c.id);
    const r = resolveScene(s, scene, choice, Date.parse(`${DAY}T14:00:00Z`), away);
    return { s, ids, r };
  };

  it('quando você decide, o carinho conta bem mais e aparece com número e nome', () => {
    const { s, ids, r } = play(0);
    expect(friendOf(s, ids[0]!).points).toBe(2 * MOMENT_FRIEND_SCALE.chosen);
    expect(friendOf(s, ids[1]!).points).toBe(0);
    const first = r.moment.cast[0]!.name;
    expect(r.moment.result).toContain(`+${2 * MOMENT_FRIEND_SCALE.chosen} amizade com você (${first})`);
  });

  it('perto de você conta o dobro do que acontece enquanto você está fora', () => {
    const near = play(null);
    const away = play(null, true);
    for (const id of near.ids) expect(friendOf(near.s, id).points).toBe(2 * MOMENT_FRIEND_SCALE.near);
    for (const id of away.ids) expect(friendOf(away.s, id).points).toBe(2 * MOMENT_FRIEND_SCALE.away);
    expect(MOMENT_FRIEND_SCALE.chosen).toBeGreaterThan(MOMENT_FRIEND_SCALE.near);
    expect(MOMENT_FRIEND_SCALE.near).toBeGreaterThan(MOMENT_FRIEND_SCALE.away);
  });

  it('um ganho que vem de um momento também dispara o marco', () => {
    const { s, ids } = play(0, false, FRIEND_LEVELS[1].min - 1);
    expect(claimFriendMilestones(s, ids)).toEqual([{ id: ids[0], kind: 'up', level: 1, name: 'Colega', from: 0, passed: [1] }]);
  });
});

describe('o que os moradores lembram na conversa', () => {
  const memoryAt = (s: ReturnType<typeof fresh>, n: number, t: number) => {
    s.diary.push({ id: `m${n}`, t, day: DAY, hour: 12, tpl: 'par-piquenique', kind: 'amizade', title: `Momento ${n}`, emoji: '🧺', cast: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }], lines: [{ who: 0, text: 'Oi' }], result: ['+5 amizade'] });
    s.memories.push({ id: `m${n}:a`, mon: 'a', with: ['b'], kind: 'amizade', text: `Momento ${n}: +5 amizade`, day: DAY, t, momentId: `m${n}` });
  };

  it('reveza entre as lembranças recentes de um dia para o outro em vez de repetir sempre a mesma', () => {
    const s = fresh();
    const base = Date.parse(`${DAY}T12:00:00Z`);
    for (let n = 1; n <= 4; n++) memoryAt(s, n, base + n * 60_000);
    const said = new Set(Array.from({ length: 3 }, (_, d) => recentGossip(s, 'a', base + d * 86_400_000 + 3_600_000, { compact: true })));
    expect(said.size).toBe(3);
    expect([...said].join(' ')).not.toContain('Momento 1');
  });

  it('a lembrança vira assunto por duas semanas, sem os números do Diário', () => {
    const s = fresh();
    const base = Date.parse(`${DAY}T12:00:00Z`);
    memoryAt(s, 1, base);
    const talkAbout = recentGossip(s, 'a', base + 86_400_000, { compact: true })!;
    expect(talkAbout).toContain('“Momento 1” com Beto');
    expect(talkAbout).not.toContain('+5');
    expect(recentGossip(s, 'a', base + 15 * 86_400_000, { compact: true })).toBeNull();
  });
});
