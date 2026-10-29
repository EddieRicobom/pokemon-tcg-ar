import { describe, expect, it } from 'vitest';
import { emptyVillage, normalizeVillage } from './life';
import { emptyMail, generateDailyMail, mailFromMoment, markAllMailRead, markMailRead, queueMomentMail, respondToMail } from './mail';
import type { Moment } from './social-state';

const moment: Moment = {
  id: 'momento-1', t: Date.parse('2026-10-22T14:00:00Z'), day: '2026-10-22', hour: 14, tpl: 'par-piquenique', kind: 'amizade', title: 'Piquenique improvisado', emoji: '🧺',
  cast: [{ id: 'a', name: 'Pikachu' }, { id: 'b', name: 'Eevee' }],
  lines: [{ who: 0, text: 'Trouxe um sanduíche.' }, { who: 1, text: 'Eu trouxe o guardanapo.' }], result: ['+8 amizade'],
};

describe('Correio ligado aos momentos', () => {
  it('cria uma carta com remetente e envolvidos do Diário', () => {
    const mail = mailFromMoment(moment);
    expect(mail?.fromId).toBe('a');
    expect(mail?.involvedIds).toEqual(['a', 'b']);
    expect(mail?.body).toContain('Piqueni');
  });

  it('não duplica a mesma carta e uma resposta cria um compromisso social', () => {
    const state = emptyVillage(1, { x: 2, y: 2 });
    expect(queueMomentMail(state.mail, moment)).not.toBeNull();
    expect(queueMomentMail(state.mail, moment)).toBeNull();
    const result = respondToMail(state, 'carta-momento-1', 'ajudar', '2026-10-22');
    expect(result.ok).toBe(true);
    expect(state.mail.inbox).toHaveLength(0);
    expect(state.mail.archive).toHaveLength(1);
    expect(state.plans[0]).toMatchObject({ from: 'a', to: 'b', kind: 'ajudar', sourceMomentId: 'momento-1' });
  });

  it('gera uma edição diária factual e marca carta como lida', () => {
    const state = emptyVillage(1, { x: 2, y: 2 });
    state.mail = emptyMail();
    state.diary = [moment];
    const generated = generateDailyMail(state, '2026-10-22', { a: 'Pikachu', b: 'Eevee' });
    expect(generated?.momentId).toBe('momento-1');
    expect(markMailRead(state.mail, generated!.id)).toBe(true);
    expect(state.mail.inbox[0]?.read).toBe(true);
    expect(generateDailyMail(state, '2026-10-22', { a: 'Pikachu' })).toBeNull();
  });

  it('marca todas as cartas pendentes sem arquivá-las nem mexer nas que já estavam lidas', () => {
    const state = emptyVillage(1, { x: 2, y: 2 });
    queueMomentMail(state.mail, moment);
    state.mail.inbox.push({ ...mailFromMoment({ ...moment, id: 'momento-2' })!, id: 'carta-momento-2', read: true });
    expect(markAllMailRead(state.mail)).toBe(1);
    expect(state.mail.inbox).toHaveLength(2);
    expect(state.mail.inbox.every((mail) => mail.read)).toBe(true);
    expect(markAllMailRead(state.mail)).toBe(0);
  });

  it('migra save antigo sem apagar progressão e cria a caixa nova vazia', () => {
    const state = normalizeVillage({ v: 1, seed: 1, player: { x: 2, y: 2, dir: 'down' }, coins: 77, town: { level: 2, mailDay: '2026-10-21', cafeDay: '' } }, 1, { x: 2, y: 2 });
    expect(state.coins).toBe(77);
    expect(state.town.mailDay).toBe('2026-10-21');
    expect(state.mail).toEqual(emptyMail());
    expect(state.mailCarrierId).toBeNull();
  });
});


describe('cartas com a voz de quem escreve', () => {
  it('a carta traz a fala do remetente, quem estava junto (sem repetir o remetente) e o registro do Diário', () => {
    const mail = mailFromMoment(moment)!;
    expect(mail.body).toContain('com Eevee');
    expect(mail.body).not.toContain('com Pikachu');
    expect(mail.body).toContain('“Trouxe um sanduíche.”');
    expect(mail.body).toContain('No Diário: +8 amizade');
  });

  it('a despedida acompanha a amizade de quem escreve', () => {
    expect(mailFromMoment(moment, 0)!.body.endsWith('— Pikachu')).toBe(true);
    expect(mailFromMoment(moment, 2)!.body.endsWith('Um abraço, Pikachu')).toBe(true);
    expect(mailFromMoment(moment, 4)!.body.endsWith('Do seu melhor amigo, Pikachu')).toBe(true);
    const state = emptyVillage(1, { x: 2, y: 2 });
    expect(queueMomentMail(state.mail, moment, (id) => (id === 'a' ? 3 : 0))!.body).toContain('Com carinho, Pikachu');
  });

  it('o marco de amizade vira uma carta pessoal, e a queda vira um pedido', () => {
    const up: Moment = { ...moment, id: 'marco', tpl: 'amizade-marco', title: 'Amizade: Amigo', cast: [{ id: 'a', name: 'Pikachu' }], lines: [{ who: 0, text: 'Somos amigos!' }], result: ['Pikachu agora é seu Amigo 💖'] };
    const mail = mailFromMoment(up, 2)!;
    expect(mail).toMatchObject({ kind: 'agradecimento', subject: 'Amizade: Amigo' });
    expect(mail.body.startsWith('Somos amigos!')).toBe(true);
    expect(mailFromMoment({ ...up, id: 'queda', kind: 'drama', title: 'Amizade abalada: Colega' })!.kind).toBe('pedido');
  });

  it('o jornal fala como jornal e responder a ele não promete amizade', () => {
    const state = emptyVillage(1, { x: 2, y: 2 });
    const bulletin = generateDailyMail(state, '2026-10-22', { a: 'Pikachu', b: 'Eevee' })!;
    expect(bulletin.body).toContain('Na praça hoje: Pikachu e Eevee');
    expect(bulletin.body).not.toMatch(/inventad|real/);
    expect(respondToMail(state, bulletin.id, 'responder', '2026-10-22').message).not.toContain('amizade');
  });

  it('responder uma carta diz quanto a amizade subiu', () => {
    const state = emptyVillage(1, { x: 2, y: 2 });
    queueMomentMail(state.mail, moment);
    expect(respondToMail(state, 'carta-momento-1', 'responder', '2026-10-22').message).toContain('+4 amizade com Pikachu');
  });
});
