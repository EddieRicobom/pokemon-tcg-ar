import { describe, expect, it } from 'vitest';
import { seededRng } from '../battle';
import { emptyVillage, friendOf, normalizeVillage } from './life';
import { generateVillage } from './map';
import {
  applyFollow, canAsk, FOLLOWS, markAsked, oddReaction, pickEcho, pickFollow, pickQuestion, QUESTION_BY_ID, QUESTIONS, recordAnswer, setWord, spreadWords, withWords, wordOf,
} from './quiz';
import type { QKind } from './quiz';
import { cleanAnswer, MAX_ANSWERS, MAX_LINGO, FX_EMOJI } from './social-state';

const map = generateVillage(20261014);
const fresh = () => emptyVillage(20261014, map.spawn);
const sq = QUESTION_BY_ID.get('doce')!;
const mon = { id: 'a', name: 'Squirtle' };
const KINDS: QKind[] = ['comida', 'coisa', 'lugar', 'bicho', 'pessoa', 'opiniao', 'palavra', 'sonho', 'medo', 'musica', 'cor', 'poder', 'bordao'];

describe('perguntas dos Pokémon', () => {
  it('há muitas perguntas, com ids únicos, texto, sugestões e todos os tipos', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(QUESTIONS.map((x) => x.id)).size).toBe(QUESTIONS.length);
    for (const k of KINDS) expect(QUESTIONS.some((x) => x.kind === k), k).toBe(true);
    for (const x of QUESTIONS) {
      expect(x.ask('Ash').length, x.id).toBeGreaterThan(8);
      expect(x.ask('Ash'), x.id).not.toMatch(/undefined|\[object|NaN/);
      expect(x.chips.length, x.id).toBeGreaterThanOrEqual(2);
      expect(x.placeholder.length, x.id).toBeGreaterThan(3);
    }
  });

  it('todo tipo tem segundas perguntas com 3 respostas, e as falas citam o que você respondeu', () => {
    for (const k of KINDS) {
      expect(FOLLOWS[k].length, k).toBeGreaterThanOrEqual(1);
      for (const fo of FOLLOWS[k]) {
        const text = fo.ask('bunda fedida');
        expect(text.length, k).toBeGreaterThan(5);
        expect(text, k).not.toMatch(/undefined|\[object|NaN/);
        expect(fo.options.length, k).toBeGreaterThanOrEqual(k === 'bordao' ? 3 : 3);
        for (const op of fo.options) {
          expect(op.label.length).toBeGreaterThan(2);
          expect(op.reply('bunda fedida').length).toBeGreaterThan(5);
          expect(FX_EMOJI[op.fx]).toBeDefined();
          expect(op.friend).toBeGreaterThanOrEqual(0);
        }
      }
    }
    // O exemplo do jogador: a resposta digitada volta na pergunta seguinte.
    const comida = FOLLOWS.comida.map((x) => x.ask('bunda fedida'));
    expect(comida.some((t) => t.includes('bunda fedida'))).toBe(true);
  });

  it('limpa o que foi digitado: sem lixo, sem tamanho absurdo, sem sinais de tag', () => {
    expect(cleanAnswer('  bunda   fedida  ')).toBe('bunda fedida');
    expect(cleanAnswer('<b>oi</b>\n\tmundo')).toBe('b oi /b mundo');
    expect(cleanAnswer('x'.repeat(200)).length).toBe(28);
    expect(cleanAnswer('')).toBe('');
    expect(cleanAnswer(42)).toBe('');
  });

  it('guarda a resposta, vira gíria da Vila, dá amizade e respeita os limites', () => {
    const s = fresh();
    const r = recordAnswer(s, mon, sq, '  bunda fedida ', 1000, '2026-10-15', 'Ash')!;
    expect(r.answer.a).toBe('bunda fedida');
    expect(s.answers).toHaveLength(1);
    expect(s.lingo.map((x) => x.text)).toEqual(['bunda fedida']);
    expect(friendOf(s, 'a').points).toBe(2);
    expect(recordAnswer(s, mon, sq, '   ', 1000, '2026-10-15', 'Ash')).toBeNull();
    for (let i = 0; i < MAX_ANSWERS + 20; i++) recordAnswer(s, mon, sq, `resposta ${i}`, 2000 + i, '2026-10-15', 'Ash');
    expect(s.answers.length).toBe(MAX_ANSWERS);
    expect(s.lingo.length).toBeLessThanOrEqual(MAX_LINGO);
  });

  it('o jogador pode escolher como o Pokémon reage depois: a amizade muda', () => {
    const s = fresh();
    friendOf(s, 'a').points = 10;
    const fo = FOLLOWS.comida[0]!;
    applyFollow(s, 'a', fo.options[0]!);
    expect(friendOf(s, 'a').points).toBe(13);
    applyFollow(s, 'a', { ...fo.options[2]!, friend: -50 });
    expect(friendOf(s, 'a').points).toBe(0);
  });

  it('reage a respostas esquisitas (o nome dele, o seu, repetida, número, gritaria, pergunta)', () => {
    const s = fresh();
    expect(oddReaction(s, sq, 'squirtle', mon, 'Ash')).toMatch(/meu nome/);
    expect(oddReaction(s, sq, 'ash', mon, 'Ash')).toMatch(/seu nome/);
    expect(oddReaction(s, sq, 'a', mon, 'Ash')).toMatch(/Só isso/);
    expect(oddReaction(s, sq, 'dez 10', mon, 'Ash')).toMatch(/número/);
    expect(oddReaction(s, sq, 'PIZZA', mon, 'Ash')).toMatch(/gritar/);
    expect(oddReaction(s, sq, 'e você?', mon, 'Ash')).toMatch(/pergunta/);
    recordAnswer(s, mon, sq, 'pizza', 1, 'd', 'Ash');
    expect(oddReaction(s, QUESTION_BY_ID.get('comida-fav')!, 'pizza', mon, 'Ash')).toMatch(/já tinha dito/);
    expect(oddReaction(s, sq, 'brigadeiro', mon, 'Ash')).toBeNull();
  });

  it('limita as perguntas por dia (2 por Pokémon e 7 na Vila) e não repete enquanto houver novas', () => {
    const s = fresh();
    expect(canAsk(s, 'a', 'd1')).toBe(true);
    markAsked(s, 'a', 'd1');
    markAsked(s, 'a', 'd1');
    expect(canAsk(s, 'a', 'd1')).toBe(false);
    expect(canAsk(s, 'a', 'd2')).toBe(true);
    for (const id of ['b', 'c', 'd', 'e']) {
      markAsked(s, id, 'd1');
      markAsked(s, id, 'd1');
    }
    expect(canAsk(s, 'z', 'd1')).toBe(false);
    const done = fresh();
    for (const x of QUESTIONS.slice(0, QUESTIONS.length - 1)) recordAnswer(done, mon, x, 'ok', 1, 'd', 'Ash');
    const left = QUESTIONS[QUESTIONS.length - 1]!;
    // mesmo com poucas sobrando, sai só uma que ainda não foi respondida
    for (let i = 0; i < 20; i++) expect(pickQuestion(done, seededRng(i + 1)).id).toBe(left.id);
    expect(pickFollow('comida', seededRng(1)).options.length).toBe(3);
  });

  it('os Pokémon repetem o que ouviram ("Hmmm, que fome de…") e nenhum fala sem ter o que repetir', () => {
    const s = fresh();
    const names = { a: 'Squirtle', b: 'Bulbasaur' };
    expect(pickEcho(s, ['a', 'b'], names, seededRng(1))).toBeNull();
    recordAnswer(s, mon, sq, 'bunda fedida', 1, 'd', 'Ash');
    const lines = new Set<string>();
    const speakers = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const e = pickEcho(s, ['a', 'b'], names, seededRng(i + 1))!;
      expect(e.text).toContain('bunda fedida');
      expect(FX_EMOJI[e.fx]).toBeDefined();
      lines.add(e.text);
      speakers.add(e.id);
    }
    expect([...lines].some((t) => t.includes('Hmmm, que fome de bunda fedida'))).toBe(true);
    expect(lines.size).toBeGreaterThanOrEqual(4);
    expect(speakers).toEqual(new Set(['a', 'b']));
    // quem perguntou nunca diz "Squirtle me disse"; os outros podem
    for (let i = 0; i < 300; i++) {
      const e = pickEcho(s, ['a', 'b'], names, seededRng(i + 7))!;
      if (e.id === 'a') expect(e.text).not.toContain('Squirtle');
    }
    // se o autor da pergunta não está na Vila, só outros falam
    expect(pickEcho(s, ['b'], names, seededRng(3))!.id).toBe('b');
  });

  it('bordões: cada um tem o seu (fixo), dá para dar um novo, aparece nas falas e passa de um para o outro', () => {
    const s = fresh();
    const w = wordOf(s, 'a');
    expect(w.length).toBeGreaterThan(2);
    expect(wordOf(s, 'a')).toBe(w);
    const bq = QUESTION_BY_ID.get('bordao-1')!;
    const r = recordAnswer(s, mon, bq, 'Tá pago!', 1, 'd', 'Ash')!;
    expect(r.bordao).toBe(true);
    expect(wordOf(s, 'a')).toBe('Tá pago!');
    expect(s.lingo).toHaveLength(0);
    const lines = [{ who: 0, text: 'Oi!' }, { who: 1, text: 'Olá.' }, { who: 0, text: 'Tchau.' }];
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      const out = withWords(lines, ['a', 'b'], s, seededRng(i + 1));
      expect(out[0]!.text).toBe('Oi!');
      if (out[2]!.text.endsWith('Tá pago!')) hits++;
      expect(lines[2]!.text).toBe('Tchau.');
    }
    expect(hits).toBeGreaterThan(40);
    expect(hits).toBeLessThan(120);
    let spread = 0;
    for (let i = 0; i < 400; i++) {
      const t = fresh();
      setWord(t, 'a', 'Tá pago!');
      const msg = spreadWords(t, [mon, { id: 'b', name: 'Bulbasaur' }], seededRng(i + 1));
      if (msg) {
        spread++;
        expect(msg).toContain('pegou o bordão');
      }
    }
    expect(spread).toBeGreaterThan(5);
    expect(spreadWords(s, [mon], seededRng(1))).toBeNull();
  });

  it('tudo isso persiste: ao abrir um salvamento, respostas, gírias, bordões e perguntas do dia voltam', () => {
    const s = fresh();
    recordAnswer(s, mon, sq, 'bunda fedida', 1000, '2026-10-15', 'Ash');
    setWord(s, 'b', 'Oxe!');
    markAsked(s, 'a', '2026-10-15');
    const back = normalizeVillage(JSON.parse(JSON.stringify(s)), 20261014, map.spawn);
    expect(back.answers).toEqual(s.answers);
    expect(back.lingo.map((x) => x.text)).toEqual(['bunda fedida']);
    expect(back.words).toEqual({ b: 'Oxe!' });
    expect(back.asked).toEqual({ a: { day: '2026-10-15', n: 1 } });
    // lixo no disco vira vazio, sem quebrar
    const junk = normalizeVillage({ ...JSON.parse(JSON.stringify(s)), answers: [1, null, { q: 5 }, { q: 'x', a: '', mon: 'a' }], words: { a: 5 }, lingo: 'no', asked: 7 }, 20261014, map.spawn);
    expect(junk.answers).toEqual([]);
    expect(junk.words).toEqual({});
    expect(junk.lingo).toEqual([]);
    expect(junk.asked).toEqual({});
  });
});
