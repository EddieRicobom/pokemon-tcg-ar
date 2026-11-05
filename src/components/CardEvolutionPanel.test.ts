import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import { cardJourneys, cardJourneyError, recordCardVictories } from '../app/card-evolution-store';
import type { CachedCard } from '../cache/types';
import type { Friendship } from '../core/village/life';

const mocks = vi.hoisted(() => ({ list: vi.fn(), sprite: vi.fn(), species: vi.fn() }));
vi.mock('../app/services', () => ({ getCache: async () => ({ list: mocks.list }), getDigitalSprite: mocks.sprite, resolveSpeciesByDexId: mocks.species }));
import CardEvolutionPanel from './CardEvolutionPanel.vue';

const card = { id: 'base1-46', name: 'Charmander', dexIds: [4], setName: 'Base', localId: '46', shiny: false } as CachedCard;
const mon = { id: card.id, dexId: 4, name: card.name };
let app: App | null = null;
let host: HTMLDivElement;
const friends = reactive<Record<string, Friendship>>({});
const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };
beforeEach(() => {
  localStorage.clear(); cardJourneys.value = {}; cardJourneyError.value = '';
  friends[card.id] = { points: 100, lastTalk: '', lastGift: '', request: null };
  mocks.list.mockResolvedValue([card]);
  mocks.sprite.mockResolvedValue({ gif: {} });
  mocks.species.mockResolvedValue({ dexId: 5, name: 'Charmeleon', cardId: 'charmeleon-real' });
  for (const trial of ['battle', 'survival', 'pins'] as const) recordCardVictories([mon], trial);
  host = document.createElement('div'); document.body.append(host);
});
afterEach(() => { app?.unmount(); app = null; host.remove(); vi.clearAllMocks(); });
async function mount(): Promise<HTMLButtonElement> {
  app = createApp({ render: () => h(CardEvolutionPanel, { friends }) });
  app.mount(host); await flush();
  return host.querySelector('button')!;
}
describe('Fonte: evolução das cartas', () => {
  it('mostra as provas e só libera o botão com amizade exatamente máxima', async () => {
    friends[card.id]!.points = 99;
    const button = await mount();
    expect(button.disabled).toBe(true);
    expect(host.textContent).toContain('99/100');
    friends[card.id]!.points = 100; await nextTick();
    expect(button.disabled).toBe(false);
    button.click(); await flush();
    expect(cardJourneys.value[card.id]!.dexId).toBe(5);
    expect(host.textContent).toContain('Charmander evoluiu para Charmeleon');
    expect(friends[card.id]!.points).toBe(100);
  });
  it('no Altar, só lista quem ainda pode evoluir', async () => {
    const mewtwo = { id: 'base1-10', name: 'Mewtwo', dexIds: [150], setName: 'Base', localId: '10', shiny: false } as CachedCard;
    mocks.list.mockResolvedValue([mewtwo, card]);
    app = createApp({ render: () => h(CardEvolutionPanel, { friends, altar: true, trustStones: 5 }) });
    app.mount(host); await flush();
    const names = [...host.querySelectorAll('option')].map((option) => option.textContent ?? '');
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('Charmander');
    expect(host.querySelector('h3')?.textContent).toBe('Charmander');
  });

  it('no Altar, sem ninguém para evoluir, diz isso em vez de mostrar uma lista vazia', async () => {
    mocks.list.mockResolvedValue([{ id: 'base1-10', name: 'Mewtwo', dexIds: [150], setName: 'Base', localId: '10', shiny: false } as CachedCard]);
    app = createApp({ render: () => h(CardEvolutionPanel, { friends, altar: true }) });
    app.mount(host); await flush();
    expect(host.querySelector('select')).toBeNull();
    expect(host.textContent).toContain('Nenhuma das suas cartas tem uma próxima evolução');
  });

  it('sem sprite não confirma evolução nem apaga as vitórias', async () => {
    mocks.sprite.mockResolvedValue(null);
    const button = await mount(); button.click(); await flush();
    expect(cardJourneys.value[card.id]!.dexId).toBe(4);
    expect(cardJourneys.value[card.id]!.wins.pins).toBe(true);
    expect(host.textContent).toContain('Não consegui carregar os dados ou o sprite');
  });
});
