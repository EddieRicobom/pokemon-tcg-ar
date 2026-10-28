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

  it('leva o desafio à montagem da equipe e só libera começar com um Pokémon', async () => {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(ArenaView);
    app.mount(host);
    await nextTick();

    host.querySelector<HTMLButtonElement>('.league-card-stub')!.click();
    await nextTick();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    const team = host.querySelector<HTMLElement>('#arena-team')!;
    expect(team.textContent).toContain('Desafio contra Roark pronto');
    const start = [...team.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Começar desafio'))!;
    expect(start.disabled).toBe(true);

    host.querySelector<HTMLButtonElement>('.team-picker-stub')!.click();
    await nextTick();
    expect(start.disabled).toBe(false);
    start.click();
    expect(window.location.hash).toContain('/caixa');
  });
});
