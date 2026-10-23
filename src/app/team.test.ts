import { beforeEach, describe, expect, it } from 'vitest';
import { includeMember, loadSavedTeam, resolveTeam, sanitizeTeam, saveTeam, TEAM_SIZE, toggleMember } from './team';

const card = (id: string, lastSeenAt: number, state = 'ok') => ({ id, lastSeenAt, sprite: { state } });

describe('equipe', () => {
  it('toggleMember adiciona, remove e respeita o limite', () => {
    let team: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) team = toggleMember(team, id, 6).team;
    expect(team).toHaveLength(6);
    const blocked = toggleMember(team, 'g', 6);
    expect(blocked.full).toBe(true);
    expect(blocked.team).toEqual(team);
    expect(toggleMember(team, 'c', 6).team).toEqual(['a', 'b', 'd', 'e', 'f']);
    expect(TEAM_SIZE).toBe(40);
  });

  it('sanitizeTeam tira cartas removidas e repetidas, mas mantém quem está sem sprite no momento', () => {
    const cards = [card('a', 1), card('b', 2, 'missing'), card('c', 3)];
    expect(sanitizeTeam(['a', 'b', 'x', 'c', 'a', 7], cards)).toEqual(['a', 'b', 'c']);
    expect(sanitizeTeam('nada', cards)).toEqual([]);
  });

  it('resolveTeam usa a escolha do usuário', () => {
    const cards = [card('a', 1), card('b', 2)];
    expect(resolveTeam(['a'], cards)).toEqual({ ids: ['a'], auto: false });
  });

  it('sem escolha, pega as mais recentes com sprite e marca como automática', () => {
    const cards = [card('old', 1), card('mid', 5), card('nosprite', 9, 'missing'), card('new', 8)];
    expect(resolveTeam([], cards, 2)).toEqual({ ids: ['new', 'mid'], auto: true });
  });

  it('escolha que sumiu do cache volta ao automático', () => {
    expect(resolveTeam(['gone'], [card('a', 1)])).toEqual({ ids: ['a'], auto: true });
  });

  it('inclui uma carta pronta na equipe automática ou escolhida sem perder os membros atuais', () => {
    expect(includeMember([], [card('older', 1), card('new', 2)], 'older', 6)).toEqual({ kind: 'already', ids: ['new', 'older'], auto: true });
    expect(includeMember(['older'], [card('older', 1), card('new', 2)], 'new', 6)).toEqual({ kind: 'added', ids: ['older', 'new'] });
  });

  it('incluir uma carta nova não apaga membros da equipe cujo sprite está faltando', () => {
    // Caso real: a equipe tinha 30 Pokémon, 18 com sprite temporariamente fora do cache; ao escanear uma carta,
    // a equipe gravada não pode cair para as 12 que ainda tinham sprite.
    const members = Array.from({ length: 30 }, (_, i) => `m${i}`);
    const cards = members.map((id, i) => card(id, i, i < 12 ? 'ok' : 'missing')).concat(card('new', 99));
    const result = includeMember(members, cards, 'new');
    expect(result).toEqual({ kind: 'added', ids: [...members, 'new'] });
  });

  it('explica equipe cheia e não inclui carta sem Pokémon pronto', () => {
    const full = Array.from({ length: 2 }, (_, i) => card(`m${i}`, i));
    expect(includeMember(['m0', 'm1'], [...full, card('new', 3)], 'new', 2).kind).toBe('full');
    expect(includeMember([], [card('broken', 1, 'missing')], 'broken').kind).toBe('unavailable');
  });
});

describe('persistência da equipe', () => {
  beforeEach(() => localStorage.clear());
  it('salva e lê', () => {
    saveTeam(['a', 'b']);
    expect(loadSavedTeam()).toEqual(['a', 'b']);
  });
  it('lixo no armazenamento vira equipe vazia', () => {
    localStorage.setItem('tcg-ar-team-v1', '{"x":1}');
    expect(loadSavedTeam()).toEqual([]);
    localStorage.setItem('tcg-ar-team-v1', 'não é json');
    expect(loadSavedTeam()).toEqual([]);
  });
});
