import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, onMounted, type App } from 'vue';

vi.mock('../components/TeamPicker.vue', () => ({
  default: defineComponent({
    emits: ['ready', 'change'],
    setup(_props, { emit }) {
      onMounted(() => emit('ready', []));
      return () => h('button', { type: 'button', class: 'team-picker-stub', onClick: () => emit('change', ['a', 'b', 'c', 'd', 'e', 'f']) }, 'Adicionar Pokémon');
    },
  }),
}));

// A equipe vem do cache de cartas (IndexedDB): aqui devolve um membro por id, o que importa é o fluxo do desafio.
vi.mock('../app/arena-members', () => ({
  loadArenaMembers: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({ id, name: id, dexId: 25, shiny: false, bond: 0, digital: false }))),
}));

vi.mock('../components/ArenaFight.vue', () => ({
  default: defineComponent({
    props: { setup: { type: Object, required: true } },
    setup: (props) => () => h('div', { class: 'arena-fight-stub' }, JSON.stringify((props.setup as { challenge?: { leader: string } }).challenge?.leader ?? (props.setup as { kind: string }).kind)),
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

  it('no menu único, a Liga pede líder e 6 Pokémon e abre a luta contra o líder, aqui mesmo', async () => {
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
    // Ainda sem Pokémon na equipe: o plano pede a equipe primeiro e não dá para entrar.
    expect(host.querySelector('#arena-step-4')!.textContent).toContain('exatamente 6 Pokémon');
    expect(go().disabled).toBe(true);

    host.querySelector<HTMLButtonElement>('.team-picker-stub')!.click();
    // Enquanto os 6 são lidos o botão segue travado: entrar agora abriria a luta sem eles.
    await nextTick();
    expect(go().disabled).toBe(true);
    await vi.waitFor(() => expect(go().disabled).toBe(false));
    await nextTick();
    // Com equipe e líder escolhido, o resumo nomeia o líder e o botão libera.
    expect(host.querySelector('#arena-step-4')!.textContent).toContain('Roark');
    expect(go().disabled).toBe(false);
    go().click();
    await nextTick();
    expect(window.location.hash).not.toContain('/caixa');
    expect(host.querySelector('.arena-fight-stub')!.textContent).toContain('Roark');
  });

  it('quem chega com um desafio marcado cai direto na Liga, com o líder escolhido', async () => {
    pendingChallenge.value = 'gym-0';
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(ArenaView);
    app.mount(host);
    await nextTick();
    await nextTick();
    expect(host.querySelector('.league-card-stub')).not.toBeNull();
    expect(host.querySelector('#arena-step-3')!.textContent).toContain('Roark');
  });

  it('as lutas por turnos e o Coliseu saíram do menu', async () => {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(ArenaView);
    app.mount(host);
    await nextTick();
    const titles = [...host.querySelectorAll('.arena-choice strong')].map((el) => el.textContent);
    expect(titles).toEqual(['Luta 6×6', 'Liga e desafios', 'Corridas 6×6', 'PvP com um amigo']);
  });
});
