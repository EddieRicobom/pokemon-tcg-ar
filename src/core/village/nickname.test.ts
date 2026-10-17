import { describe, expect, it } from 'vitest';
import { emptyVillage, friendOf, normalizeVillage } from './life';
import { canNickname, displayName, MAX_NICK_LEN, nickIdeas, nicknameOf, NICK_MIN_LEVEL, setNickname } from './nickname';

const fresh = () => emptyVillage(1, { x: 5, y: 5 });
const withPoints = (s: ReturnType<typeof fresh>, id: string, points: number) => {
  friendOf(s, id).points = points;
  return s;
};

describe('apelidos', () => {
  it('qualquer Pokémon aceita apelido desde o primeiro dia, sem precisar de amizade', () => {
    expect(NICK_MIN_LEVEL).toBe(0);
    const s = fresh();
    withPoints(s, 'a', 0);
    expect(canNickname(s, 'a')).toBe(true);
    expect(setNickname(s, 'a', 'Chefe', 'Squirtle').ok).toBe(true);
    expect(nicknameOf(s, 'a')).toBe('Chefe');
    // Um Pokémon que você nunca encontrou também (Digital Pokémon recém-invocado, por exemplo).
    expect(setNickname(s, 'novo', 'Faísca', 'Pikachu').ok).toBe(true);
  });

  it('o nome na tela é o apelido, e sem apelido é o nome de verdade', () => {
    const s = withPoints(fresh(), 'a', 90);
    expect(displayName(s, 'a', 'Squirtle')).toBe('Squirtle');
    setNickname(s, 'a', 'Chefe', 'Squirtle');
    expect(displayName(s, 'a', 'Squirtle')).toBe('Chefe');
    expect(displayName(s, 'b', 'Charmander')).toBe('Charmander');
  });

  it('limpa o texto, corta no limite e ignora símbolos de marcação', () => {
    const s = withPoints(fresh(), 'a', 90);
    setNickname(s, 'a', '   Dona   <b>Tartaruga</b> Muito Muito Longa  ', 'Squirtle');
    const nick = nicknameOf(s, 'a');
    expect(nick.length).toBeLessThanOrEqual(MAX_NICK_LEN);
    expect(nick).not.toMatch(/[<>]/);
    expect(nick).not.toMatch(/\s{2,}/);
    expect(nick.startsWith('Dona')).toBe(true);
  });

  it('só dá +3 de amizade na primeira vez, e nunca passa de 100', () => {
    const s = withPoints(fresh(), 'a', 80);
    setNickname(s, 'a', 'Chefe', 'Squirtle');
    expect(s.friends.a!.points).toBe(83);
    setNickname(s, 'a', 'Chefão', 'Squirtle');
    expect(s.friends.a!.points).toBe(83);
    withPoints(s, 'b', 99);
    setNickname(s, 'b', 'Docinho', 'Bulbasaur');
    expect(s.friends.b!.points).toBe(100);
  });

  it('não deixa dois Pokémon com o mesmo apelido (sem diferenciar maiúsculas)', () => {
    const s = withPoints(withPoints(fresh(), 'a', 90), 'b', 90);
    setNickname(s, 'a', 'Chefe', 'Squirtle');
    const r = setNickname(s, 'b', 'chefe', 'Bulbasaur');
    expect(r.ok).toBe(false);
    expect(nicknameOf(s, 'b')).toBe('');
    expect(setNickname(s, 'a', 'CHEFE', 'Squirtle').ok).toBe(true);
  });

  it('vazio ou o próprio nome tira o apelido', () => {
    const s = withPoints(fresh(), 'a', 90);
    expect(setNickname(s, 'a', '', 'Squirtle').ok).toBe(false);
    setNickname(s, 'a', 'Chefe', 'Squirtle');
    expect(setNickname(s, 'a', ' ', 'Squirtle').ok).toBe(true);
    expect(nicknameOf(s, 'a')).toBe('');
    setNickname(s, 'a', 'Chefe', 'Squirtle');
    expect(setNickname(s, 'a', 'squirtle', 'Squirtle').ok).toBe(true);
    expect(s.nicks).toEqual({});
  });

  it('as ideias são sempre as mesmas para o mesmo Pokémon e não repetem apelidos em uso', () => {
    const s = fresh();
    const ideas = nickIdeas(s, 'card-1');
    expect(ideas).toHaveLength(3);
    expect(new Set(ideas).size).toBe(3);
    expect(nickIdeas(s, 'card-1')).toEqual(ideas);
    s.nicks.x = ideas[0]!;
    expect(nickIdeas(s, 'card-1')).not.toContain(ideas[0]);
  });

  it('fica no arquivo da Vila: sobrevive ao recarregar e aceita arquivos antigos sem apelidos', () => {
    const s = withPoints(fresh(), 'a', 90);
    setNickname(s, 'a', 'Chefe', 'Squirtle');
    const back = normalizeVillage(JSON.parse(JSON.stringify(s)), 1, { x: 5, y: 5 });
    expect(back.nicks).toEqual({ a: 'Chefe' });
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.nicks;
    expect(normalizeVillage(old, 1, { x: 5, y: 5 }).nicks).toEqual({});
    expect(normalizeVillage({ ...old, nicks: { a: 5, b: '<>', c: 'Ok', d: 'x'.repeat(50) } }, 1, { x: 5, y: 5 }).nicks).toEqual({ c: 'Ok', d: 'x'.repeat(MAX_NICK_LEN) });
  });
});
