import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import TeamPicker from './TeamPicker.vue';
import { arenaTeam, arenaTeamSource, reloadArenaTeam, savedTeam } from '../app/team-store';
import { ARENA_TEAM_KEY } from '../core/arena-team';
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
  const cardRow = (id: string, dex: number, name: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({ id, name, setName: 'Base', dexIds: [dex], lastSeenAt: 1, sprite: { state: 'ok' }, reference: { state: 'ok' }, ...over });
  async function mountPicker(cards: Record<string, unknown>[], props: Record<string, unknown> = { max: 6 }): Promise<HTMLElement> {
    mocks.village.mockReturnValue({ digital: emptyDigital() });
    mocks.list.mockResolvedValue(cards);
    mocks.blob.mockReset();
    mocks.blob.mockResolvedValue(null);
    const ready = vi.fn();
    host = document.createElement('div'); document.body.append(host);
    app = createApp({ render: () => h(TeamPicker, { ...props, onReady: ready }) }); app.mount(host);
    await vi.waitFor(() => expect(ready).toHaveBeenCalled());
    await nextTick();
    return host;
  }
  const six = [cardRow('a', 6, 'Charizard'), cardRow('b', 9, 'Blastoise'), cardRow('c', 3, 'Venusaur'), cardRow('d', 25, 'Pikachu'), cardRow('e', 149, 'Dragonite'), cardRow('f', 150, 'Mewtwo')];
  const tile = (el: HTMLElement, name: string): HTMLButtonElement => [...el.querySelectorAll<HTMLButtonElement>('.box-tile')].find((b) => b.querySelector('.box-name')?.textContent === name)!;

  it('mostra na grade os tipos e a forma do golpe, com PNG leve em vez de GIF', async () => {
    const el = await mountPicker(six);
    const charizard = tile(el, 'Charizard');
    expect(charizard.querySelectorAll('.box-glyph')).toHaveLength(2);
    expect(charizard.querySelector('.box-facts em')?.textContent).toBeTruthy();
    expect(charizard.getAttribute('aria-label')).toContain('Fogo');
    expect(charizard.querySelector('img')!.getAttribute('src')).toMatch(/\.png$/);
    expect(mocks.blob).not.toHaveBeenCalled();
  });

  it('filtra pelo tipo e explica a grade vazia, com saída para limpar', async () => {
    const el = await mountPicker(six);
    const fire = [...el.querySelectorAll<HTMLButtonElement>('.element-type-choice')].find((b) => b.title === 'Fogo')!;
    fire.click();
    await nextTick();
    expect([...el.querySelectorAll('.box-tile')].map((b) => b.querySelector('.box-name')?.textContent)).toEqual(['Charizard']);
    const input = el.querySelector<HTMLInputElement>('.team-tools input')!;
    input.value = 'zzz'; input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(el.querySelector('.box-empty')!.textContent).toContain('zzz');
    el.querySelector<HTMLButtonElement>('.box-empty button')!.click();
    await nextTick();
    expect(el.querySelectorAll('.box-tile')).toHaveLength(6);
    // Sem Pokémon do tipo, o filtro não vira um beco sem saída.
    expect([...el.querySelectorAll<HTMLButtonElement>('.element-type-choice')].find((b) => b.title === 'Fada')!.disabled).toBe(true);
  });

  it('o filtro segue a forma atual, não só a primeira espécie da carta', async () => {
    const el = await mountPicker([cardRow('a', 25, 'Pikachu')]);
    const electric = [...el.querySelectorAll<HTMLButtonElement>('.element-type-choice')].find((b) => b.title === 'Elétrico')!;
    expect(electric.disabled).toBe(false);
  });

  it('membro sem sprite carregado aparece na vaga e pode sair da equipe', async () => {
    savedTeam.value = ['x'];
    const el = await mountPicker([cardRow('x', 25, 'Pikachu', { sprite: { state: 'missing' } }), cardRow('a', 6, 'Charizard')]);
    const slot = el.querySelector<HTMLButtonElement>('.box-slot.missing')!;
    expect(slot).not.toBeNull();
    slot.click();
    await nextTick();
    expect(el.querySelector('.box-info')!.textContent).toContain('ainda não foi carregado');
    [...el.querySelectorAll<HTMLButtonElement>('.box-info button')].find((b) => b.textContent?.includes('Tirar'))!.click();
    await nextTick();
    expect(savedTeam.value).not.toContain('x');
  });

  it('com a equipe cheia, oferece trocar pelo de menor total e troca na mesma vaga', async () => {
    savedTeam.value = ['a', 'b', 'c', 'd', 'e', 'f'];
    const el = await mountPicker([...six, cardRow('g', 19, 'Rattata'), cardRow('h', 151, 'Mew')]);
    tile(el, 'Mew').click();
    await nextTick();
    await nextTick();
    expect(savedTeam.value).toHaveLength(6);
    expect(el.textContent).toContain('A equipe já tem 6');
    expect(el.querySelector('.box-diff')).not.toBeNull();
    const swap = el.querySelector<HTMLButtonElement>('.box-info .primary')!;
    expect(swap.textContent).toContain('Pikachu'); // o menor total entre os seis
    swap.click();
    await nextTick();
    expect(savedTeam.value).toEqual(['a', 'b', 'c', 'h', 'e', 'f']);
  });

  it('a sugestão explica cada escolha e pode ser desfeita', async () => {
    savedTeam.value = ['a'];
    const el = await mountPicker([...six, cardRow('g', 19, 'Rattata')]);
    el.querySelector<HTMLButtonElement>('.team-suggest')!.click();
    await nextTick();
    expect(savedTeam.value).toHaveLength(6);
    expect(savedTeam.value).not.toContain('g');
    expect(el.querySelectorAll('.team-reasons li')).toHaveLength(6);
    expect(el.querySelector('.team-cover-title')!.textContent).toContain('de 18');
    el.querySelector<HTMLButtonElement>('.team-undo')!.click();
    await nextTick();
    expect(savedTeam.value).toEqual(['a']);
    expect(el.querySelector('.team-reasons')).toBeNull();
  });

  it('fora da luta (equipe grande) não mostra a sugestão', async () => {
    const el = await mountPicker(six, {});
    expect(el.querySelector('.team-insight')).toBeNull();
  });

  describe('com a equipe da Arena', () => {
    const big = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const seven = [...six, cardRow('g', 19, 'Rattata')];
    const arena = { max: 6, source: arenaTeamSource };
    beforeEach(() => { localStorage.removeItem(ARENA_TEAM_KEY); reloadArenaTeam(); savedTeam.value = [...big]; });
    afterEach(() => { localStorage.removeItem(ARENA_TEAM_KEY); reloadArenaTeam(); });

    it('nasce dos seis primeiros válidos da equipe da Caixa, sem aviso e sem encolher a Caixa', async () => {
      savedTeam.value = ['sumiu', ...big];
      const el = await mountPicker(seven, arena);
      expect(arenaTeam.value).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(JSON.parse(localStorage.getItem(ARENA_TEAM_KEY)!)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(savedTeam.value).toEqual(['sumiu', ...big]);
      expect(el.textContent).not.toContain('equipe da Caixa');
    });

    it('tirar, sugerir e voltar à automática na Arena não tocam a equipe da Caixa', async () => {
      const el = await mountPicker([...seven, cardRow('h', 151, 'Mew')], arena);
      tile(el, 'Charizard').click();
      await nextTick();
      expect(arenaTeam.value).toEqual(['b', 'c', 'd', 'e', 'f']);
      el.querySelector<HTMLButtonElement>('.team-suggest')!.click();
      await nextTick();
      el.querySelector<HTMLButtonElement>('.team-auto')!.click();
      await nextTick();
      expect(arenaTeam.value).toEqual([]);
      expect(savedTeam.value).toEqual(big);
    });

    it('depois de migrar, mexer na Caixa não muda a Arena', async () => {
      await mountPicker(seven, arena);
      savedTeam.value = ['g'];
      app?.unmount(); app = null; host?.remove(); host = null;
      await mountPicker(seven, arena);
      expect(arenaTeam.value).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('JSON corrompido refaz a equipe a partir da Caixa', async () => {
      localStorage.setItem(ARENA_TEAM_KEY, '{quebrado');
      reloadArenaTeam();
      await mountPicker(seven, arena);
      expect(JSON.parse(localStorage.getItem(ARENA_TEAM_KEY)!)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('sem nenhuma carta da Caixa no aparelho, não encerra a migração', async () => {
      savedTeam.value = ['x', 'y'];
      await mountPicker(six, arena);
      expect(localStorage.getItem(ARENA_TEAM_KEY)).toBeNull();
    });
  });

  it('sem a fonte da Arena, a Vila continua lendo e gravando a equipe de até 40', async () => {
    localStorage.removeItem(ARENA_TEAM_KEY);
    reloadArenaTeam();
    savedTeam.value = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const el = await mountPicker([...six, cardRow('g', 19, 'Rattata')], {});
    tile(el, 'Rattata').click();
    await nextTick();
    expect(savedTeam.value).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(localStorage.getItem(ARENA_TEAM_KEY)).toBeNull();
    expect(arenaTeam.value).toEqual([]);
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
