import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, isProxy, nextTick, type App } from 'vue';
const { apply } = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock('../app/backup', async (original) => ({ ...await original<typeof import('../app/backup')>(), applyFullBackup: apply }));
vi.mock('../components/LeagueCard.vue', () => ({ default: { render: () => null } }));
vi.mock('../components/MinigameHub.vue', () => ({ default: { render: () => null } }));
vi.mock('../components/TrainerAvatar.vue', () => ({ default: { render: () => null } }));
import TreinadorView from './TreinadorView.vue';
import { BACKUP_FORMAT } from '../app/backup';
let app: App | null = null, host: HTMLElement | null = null;
afterEach(() => { app?.unmount(); host?.remove(); vi.restoreAllMocks(); apply.mockReset(); });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); await nextTick(); };
describe('restauração pela interface do Treinador', () => {
  it('mantém coleção sem proxies Vue para o IndexedDB e restaura só após confirmar', async () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    apply.mockImplementation(async (file) => {
      expect(isProxy(file)).toBe(false);
      expect(isProxy(file.collection.cards[0])).toBe(false);
      expect(isProxy(file.collection.meta[0].value)).toBe(false);
    });
    host = document.createElement('div'); document.body.append(host);
    app = createApp({ render: () => h(TreinadorView) }); app.mount(host);
    [...host.querySelectorAll('button')].find((button) => button.textContent === 'Dados')!.click(); await nextTick();
    const file = new File([JSON.stringify({ format: BACKUP_FORMAT, version: 2, exportedAt: '2026-10-21T00:00:00Z', data: {}, collection: { cards: [{ id: 'diagnostic' }], records: [], meta: [{ key: 'x', value: { nested: true } }], assets: [] } })], 'backup.json', { type: 'application/json' });
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change')); await flush();
    expect(apply).not.toHaveBeenCalled();
    const confirm = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Confirmar e substituir');
    expect(confirm).toBeDefined(); confirm!.click(); await flush();
    expect(apply).toHaveBeenCalledTimes(1); expect(reload).toHaveBeenCalledTimes(1);
  });
});
