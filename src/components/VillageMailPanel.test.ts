import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, type App } from 'vue';
import type { MailState } from '../core/village/mail';
import VillageMailPanel from './VillageMailPanel.vue';

let app: App | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { app?.unmount(); host?.remove(); });

describe('painel do Correio da Vila', () => {
  it('mostra cartas reais e encaminha as ações sem alterar o estado por conta própria', () => {
    const mail: MailState = { generatedDay: '', archive: [], inbox: [{ id: 'carta-1', day: '2026-10-26', fromId: 'pika', fromName: 'Pikachu', kind: 'pedido', subject: 'Pedido', body: 'Vamos juntos?', involvedIds: ['pika', 'eevee'], read: false, responded: false }] };
    const read = vi.fn(); const readAll = vi.fn(); const answer = vi.fn();
    host = document.createElement('div'); document.body.append(host);
    app = createApp({ render: () => h(VillageMailPanel, { mail, unread: 1, nameOf: (id: string) => id, onRead: read, onReadAll: readAll, onAnswer: answer }) });
    app.mount(host);
    expect(host.textContent).toContain('Vamos juntos?');
    expect(host.textContent).toContain('pika, eevee');
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons).toHaveLength(5);
    buttons[0]!.click(); buttons[1]!.click(); buttons[2]!.click(); buttons[3]!.click(); buttons[4]!.click();
    expect(readAll).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith('carta-1');
    expect(answer.mock.calls).toEqual([['carta-1', 'responder'], ['carta-1', 'ajudar'], ['carta-1', 'arquivar']]);
    expect(mail.inbox[0]!.read).toBe(false);
  });
});
