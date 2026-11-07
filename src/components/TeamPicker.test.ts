import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import TeamPicker from './TeamPicker.vue';
import { savedTeam } from '../app/team-store';
import { emptyDigital, grantStarter } from '../core/village/digital';

const mocks = vi.hoisted(() => ({ list: vi.fn(), blob: vi.fn(), village: vi.fn() }));
vi.mock('../app/services', () => ({ getCache: async () => ({ list: mocks.list, getAssetBlob: mocks.blob }) }));
vi.mock('../app/village-store', () => ({ loadVillage: mocks.village }));
let app: ReturnType<typeof createApp> | null = null;
let host: HTMLElement | null = null;
afterEach(() => { app?.unmount(); app = null; host?.remove(); host = null; savedTeam.value = []; vi.restoreAllMocks(); });

describe('TeamPicker', () => {
  it('preserva e permite selecionar Digital Pokémon na equipe da Arena', async () => {
    const digital = grantStarter(emptyDigital(), { dexId: 1, name: 'Bulbasaur', cardId: 'det1-1' }, '2026-10-16T10:00:00Z')!;
    mocks.village.mockReturnValue({ digital }); mocks.list.mockResolvedValue([]);
    savedTeam.value = [digital.instances[0]!.instanceId];
    const ready = vi.fn(); const changed = vi.fn();
    host = document.createElement('div'); document.body.append(host);
    app = createApp({ render: () => h(TeamPicker, { max: 6, onReady: ready, onChange: changed }) }); app.mount(host);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledWith(savedTeam.value));
    expect(host.textContent).toContain('Bulbasaur');
    expect(host.querySelector('.box-tile[aria-pressed="true"]')).not.toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });
  it('mostra a equipe em vagas e, depois do toque, a ficha do Pokémon embaixo da grade', async () => {
    const digital = grantStarter(emptyDigital(), { dexId: 6, name: 'Charizard', cardId: 'det1-1' }, '2026-10-16T10:00:00Z')!;
    mocks.village.mockReturnValue({ digital }); mocks.list.mockResolvedValue([]);
    const ready = vi.fn();
    host = document.createElement('div'); document.body.append(host);
    app = createApp({ render: () => h(TeamPicker, { max: 6, onReady: ready }) }); app.mount(host);
    await vi.waitFor(() => expect(ready).toHaveBeenCalled());
    await nextTick();
    expect(host.querySelectorAll('.box-slot')).toHaveLength(6);
    expect(host.querySelector('.box-stats')).toBeNull();
    host.querySelector<HTMLButtonElement>('.box-tile')!.click();
    await nextTick();
    const info = host.querySelector('.box-info')!;
    expect(info.textContent).toContain('Charizard');
    expect(info.textContent).toContain('Fogo');
    expect(info.textContent).toContain('Secundário');
    expect(host.querySelectorAll('.box-stats li')).toHaveLength(7);
  });
  it('não cria URL de miniatura quando a leitura termina depois de sair da tela', async () => {
    mocks.village.mockReturnValue({ digital: emptyDigital() });
    mocks.list.mockResolvedValue([{ id: 'c', name: 'Carta', sprite: { state: 'ok' }, reference: { state: 'ok' } }]);
    let finish: ((blob: Blob) => void) | undefined;
    mocks.blob.mockImplementation(() => new Promise<Blob>(resolve => { finish = resolve; }));
    const create = vi.spyOn(URL, 'createObjectURL');
    host = document.createElement('div'); document.body.append(host);
    app = createApp(TeamPicker); app.mount(host);
    await vi.waitFor(() => expect(finish).toBeDefined());
    app.unmount(); app = null; finish!(new Blob(['thumb'])); await nextTick(); await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
  });
});
