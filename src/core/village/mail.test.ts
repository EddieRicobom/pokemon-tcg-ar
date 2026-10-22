import { describe, expect, it } from 'vitest';
import { emptyVillage, normalizeVillage } from './life';
import { emptyMail, generateDailyMail, mailFromMoment, markMailRead, queueMomentMail, respondToMail } from './mail';
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

  it('migra save antigo sem apagar progressão e cria a caixa nova vazia', () => {
    const state = normalizeVillage({ v: 1, seed: 1, player: { x: 2, y: 2, dir: 'down' }, coins: 77, town: { level: 2, mailDay: '2026-10-21', cafeDay: '' } }, 1, { x: 2, y: 2 });
    expect(state.coins).toBe(77);
    expect(state.town.mailDay).toBe('2026-10-21');
    expect(state.mail).toEqual(emptyMail());
    expect(state.mailCarrierId).toBeNull();
  });
});

