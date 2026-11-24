import { describe, expect, it } from 'vitest';
import { filterMail, villageChatterExchange } from './chatter';
import type { VillageMail } from './mail';

const mail = (over: Partial<VillageMail>): VillageMail => ({
  id: 'm1', day: '2026-11-24', fromId: 'p1', fromName: 'Pikachu', kind: 'agradecimento',
  subject: 'Obrigado pela ajuda', body: 'A horta ficou ótima.', involvedIds: [], read: false, responded: false, ...over,
});

describe('conversas e correio da Vila', () => {
  it('gera uma observação e uma resposta curtas e determinísticas', () => {
    const a = villageChatterExchange(42, { hour: 9, weather: 'chuva', friendPoints: 60, recentTitle: 'Chá na praça' });
    expect(a).toEqual(villageChatterExchange(42, { hour: 9, weather: 'chuva', friendPoints: 60, recentTitle: 'Chá na praça' }));
    expect(a.a.length).toBeGreaterThan(0);
    expect(a.b.length).toBeGreaterThan(0);
    expect(a.b).not.toBe(a.a);
  });

  it('usa o clima e o período do dia como assunto', () => {
    const lines = new Set(Array.from({ length: 24 }, (_, seed) => villageChatterExchange(seed, { hour: 22, weather: 'neve' }).a));
    expect([...lines].some((line) => /neve|luvas|branco/i.test(line))).toBe(true);
    expect([...lines].some((line) => /noite|dormir|postes/i.test(line))).toBe(true);
  });

  it('filtra por novas, todas e arquivo, com busca sem acento', () => {
    const inbox = [mail({ id: 'a', body: 'Obrigado pela ajuda.' }), mail({ id: 'b', read: true, subject: 'A horta cresceu', body: 'As cenouras estão grandes.' }), mail({ id: 'c', fromName: 'Bulbasaur', body: 'Oi!' })];
    const archive = [mail({ id: 'z', read: true, subject: 'Carta antiga' })];
    expect(filterMail(inbox, archive, 'novas').map((m) => m.id)).toEqual(['a', 'c']);
    expect(filterMail(inbox, archive, 'todas')).toHaveLength(3);
    expect(filterMail(inbox, archive, 'todas', 'HORTA').map((m) => m.id)).toEqual(['b']);
    expect(filterMail(inbox, archive, 'todas', 'bulba').map((m) => m.id)).toEqual(['c']);
    expect(filterMail(inbox, archive, 'arquivo').map((m) => m.id)).toEqual(['z']);
  });
});
