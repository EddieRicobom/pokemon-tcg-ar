import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, onMounted, type App } from 'vue';

vi.mock('../components/TeamPicker.vue', () => ({
  default: defineComponent({
    emits: ['ready', 'change'],
    setup(_props, { emit }) {
      onMounted(() => emit('ready', []));
      return () => h('button', { type: 'button', class: 'team-picker-stub', onClick: () => emit('change', ['capturado-1']) }, 'Adicionar Pokémon');
    },
  }),
}));

// A equipe vem do cache de cartas (IndexedDB): aqui fica vazia, o que importa é o fluxo do desafio.
vi.mock('../app/arena-members', () => ({ loadArenaMembers: vi.fn(async () => []) }));

vi.mock('../components/LeagueCard.vue', async () => {
  const { pendingChallenge } = await import('../app/league-store');
  return {
    default: defineComponent({
      emits: ['challenge'],
      setup(_props, { emit }) {
        return () => h('button', {
          type: 'button', class: 'league-card-stub', onClick: () => {
            pendingChallenge.value = 'gym-0';
            emit('challenge');
          },
        }, 'Desafiar Roark');
      },
    }),
  };
});

import ArenaView from './ArenaView.vue';
import { league, pendingChallenge } from '../app/league-store';
import { emptyLeague } from '../core/league';

describe('ArenaView: desafio da Liga', () => {
  let app: App | null = null;
  let host: HTMLDivElement | null = null;
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    league.value = emptyLeague();
    pendingChallenge.value = null;
    localStorage.clear();
    window.location.hash = '#/arena';
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    scrollIntoView.mockReset();
  });

  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
    pendingChallenge.value = null;
    window.location.hash = '';
  });

  it('no menu único, escolher a Liga e um líder só libera entrar com um Pokémon na equipe', async () => {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(ArenaView);
    app.mount(host);
    await nextTick();

    // Passo 1: sem escolha, nada de Liga e o botão principal está travado.
    expect(host.querySelector('.league-card-stub')).toBeNull();
    const go = () => host!.querySelector<HTMLButtonElement>('.arena-go')!;
    expect(go().disabled).toBe(true);

    const liga = [...host.querySelectorAll<HTMLButtonElement>('.arena-choice')].find((b) => b.textContent?.includes('Liga e desafios'))!;
    liga.click();
    await nextTick();
    await nextTick();

    // Passos 2 e 3: a equipe e o líder aparecem; escolher o líder marca o desafio e leva ao passo de entrar.
    host.querySelector<HTMLButtonElement>('.league-card-stub')!.click();
    await nextTick();
    await nextTick();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(host.querySelector('#arena-step-4')!.textContent).toContain('Roark');
    // Ainda sem Pokémon na equipe: não dá para entrar.
    expect(go().disabled).toBe(true);

    host.querySelector<HTMLButtonElement>('.team-picker-stub')!.click();
    await nextTick();
    expect(go().disabled).toBe(false);
    go().click();
    expect(window.location.hash).toContain('/caixa');
  });
});
