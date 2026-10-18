import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import LeagueCard from './LeagueCard.vue';
import { league, pendingChallenge } from '../app/league-store';
import { emptyLeague, LEAGUE_REGIONS, applyLeagueResult } from '../core/league';

let app: App | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  app?.unmount();
  host?.remove();
  league.value = emptyLeague();
  pendingChallenge.value = null;
  window.location.hash = '';
});

function mount(): HTMLDivElement {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(LeagueCard);
  app.mount(host);
  return host;
}

describe('seções regionais da Liga', () => {
  it('troca líderes, insígnias, campeão e maleta sem misturar conquistas', async () => {
    league.value = applyLeagueResult(emptyLeague(), LEAGUE_REGIONS[0]!.gyms[0]!, true).progress;
    const el = mount();
    expect(el.querySelectorAll('.badge-case li.won')).toHaveLength(1);
    for (const r of LEAGUE_REGIONS.slice(1)) {
      [...el.querySelectorAll<HTMLButtonElement>('.league-regions button')].find((b) => b.textContent?.includes(r.name))!.click();
      await nextTick();
      expect(el.textContent).toContain(`${r.name} · Geração ${r.generation}`);
      expect(el.querySelectorAll('.league-list li')).toHaveLength(13);
      expect(el.querySelectorAll('section')).toHaveLength(3);
      expect(el.querySelectorAll('.badge-case li')).toHaveLength(8);
      expect(el.querySelectorAll('.badge-case li.won')).toHaveLength(0);
      expect(el.querySelector('.case-open')?.textContent).toContain(r.name);
      expect(el.textContent).toContain(r.champion.leader);
      expect(el.querySelectorAll('.league-list button')).toHaveLength(1);
      expect(el.querySelector('.league-list li.open strong')?.textContent).toBe(r.gyms[0]!.leader);
    }
    [...el.querySelectorAll<HTMLButtonElement>('.league-regions button')].find((b) => b.textContent?.includes('Sinnoh'))!.click();
    await nextTick();
    expect(el.querySelectorAll('.badge-case li.won')).toHaveLength(1);
  });
  it('encaminha o identificador regional para a batalha na Caixa', async () => {
    league.value = emptyLeague();
    const el = mount();
    [...el.querySelectorAll<HTMLButtonElement>('.league-regions button')].find((b) => b.textContent?.includes('Hoenn'))!.click();
    await nextTick();
    el.querySelector<HTMLButtonElement>('.league-list button')!.click();
    expect(pendingChallenge.value).toBe('hoenn-gym-0');
    expect(window.location.hash).toBe('#/caixa');
  });
});
