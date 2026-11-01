import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { App as VueApp } from 'vue';
import type { SvMonSpec } from '../core/survivor-pvp';
import { SurvivalGuestLink, SurvivalHostLink } from '../pvp/survival-link';
import { encodeMessage, parseMessage } from '../pvp/wire';
import type { WireMessage } from '../pvp/wire';
import SurvivalPvpArena from './SurvivalPvpArena.vue';

const mon = (id: string, name: string, extra: Partial<SvMonSpec> = {}): SvMonSpec => ({
  id, name, dexId: 25, shiny: false, types: ['electric'], attackType: 'electric', maxHp: 100, power: 20, speed: 100, fireMs: 500, score: 40, estimated: false, ...extra,
});

describe('arena do PvP do Survival: montagem das duas telas', () => {
  const apps: VueApp[] = [];
  afterEach(() => {
    apps.splice(0).forEach((a) => a.unmount());
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  function mount(link: SurvivalHostLink | SurvivalGuestLink, friendLeft = false): HTMLElement {
    const el = document.createElement('div');
    document.body.append(el);
    const app = createApp({ render: () => h(SurvivalPvpArena, { link, friendName: 'Beto', friendLeft }) });
    app.mount(el);
    apps.push(app);
    return el;
  }

  it('mostra as duas equipes, a contagem e os três botões de troca; trocar mexe só no próprio lado', async () => {
    vi.useFakeTimers();
    const hostTeam = [mon('a', 'Pikachu'), mon('b', 'Raichu'), mon('c', 'Pichu')];
    const guestTeam = [mon('x', 'Eevee'), mon('y', 'Vaporeon'), mon('z', 'Jolteon')];
    const toGuest: WireMessage[] = [];
    const host = new SurvivalHostLink({ send: (m) => (toGuest.push(parseMessage(encodeMessage(m))!), true) }, hostTeam, guestTeam);
    const el = mount(host);
    await vi.advanceTimersByTimeAsync(100);
    await nextTick();
    expect(el.querySelector('.svp-arena')).not.toBeNull();
    expect(el.querySelectorAll('.svp-swap')).toHaveLength(3);
    expect(el.querySelectorAll('.svp-pip')).toHaveLength(3);
    expect(el.querySelector('.svp-count')?.textContent).toMatch(/[1-3]/);
    expect(el.querySelector('.svp-hint')?.textContent).toMatch(/Arraste/);
    expect(el.querySelector('.svp-summary')?.textContent).toContain('3/3');
    expect(el.textContent).toContain('Pikachu');
    // Depois da contagem a luta anda e o relógio aparece.
    await vi.advanceTimersByTimeAsync(4000);
    await nextTick();
    expect(host.state.countdownMs).toBe(0);
    expect(el.querySelector('.svp-summary')?.textContent).toMatch(/\d:\d\d/);
    (el.querySelectorAll('.svp-swap')[1] as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(100);
    expect(host.state.sides[0].active).toBe(1);
    expect(host.state.sides[1].active).toBe(0);
    expect(toGuest.some((m) => m.t === 'sv-snap')).toBe(true);
  });

  it('a troca recusada (recarga) vira um aviso curto, não um bloqueio', async () => {
    vi.useFakeTimers();
    const host = new SurvivalHostLink({ send: () => true }, [mon('a', 'Pikachu'), mon('b', 'Raichu')], [mon('x', 'Eevee')]);
    const el = mount(host);
    await vi.advanceTimersByTimeAsync(4000);
    (el.querySelectorAll('.svp-swap')[1] as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(100);
    (el.querySelectorAll('.svp-swap')[0] as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(100);
    await nextTick();
    expect(host.state.sides[0].active).toBe(1);
    expect(el.querySelector('.svp-toasts')?.textContent).toMatch(/Troca em \d s/);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('o convidado desenha o que o anfitrião manda, com o próprio Pokémon embaixo', async () => {
    vi.useFakeTimers();
    const hostTeam = [mon('a', 'Pikachu')];
    const guestTeam = [mon('x', 'Eevee')];
    const toHost: WireMessage[] = [];
    const guest = new SurvivalGuestLink({ send: (m) => (toHost.push(parseMessage(encodeMessage(m))!), true) }, hostTeam, guestTeam);
    const host = new SurvivalHostLink({ send: (m) => (guest.receive(parseMessage(encodeMessage(m))!, performance.now()), true) }, hostTeam, guestTeam);
    const el = mount(guest);
    for (let i = 0; i < 300; i++) {
      host.step(16, { dx: 0, dy: 0, switchTo: -1 });
      await vi.advanceTimersByTimeAsync(16);
    }
    await nextTick();
    const me = el.querySelector('.svp-unit.mine') as HTMLElement;
    const foe = el.querySelector('.svp-unit:not(.mine)') as HTMLElement;
    expect(parseFloat(me.style.top)).toBeGreaterThan(parseFloat(foe.style.top));
    expect(el.querySelector('.svp-swap.active')?.textContent).toContain('Eevee');
    expect(el.querySelector('.svp-summary')?.textContent).toMatch(/\d:\d\d/);
  });

  it('o amigo que sai mostra o aviso final com a saída', async () => {
    vi.useFakeTimers();
    const host = new SurvivalHostLink({ send: () => true }, [mon('a', 'Pikachu')], [mon('x', 'Eevee')]);
    const el = mount(host, true);
    await nextTick();
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('O amigo saiu');
  });
});

describe('PvP do Survival: o fluxo completo carrega', () => {
  it('SurvivalPvp (sala, runs, equipe e arena) compila e exporta o componente', async () => {
    const mod = await import('./SurvivalPvp.vue');
    expect(mod.default).toBeTruthy();
  });
});
