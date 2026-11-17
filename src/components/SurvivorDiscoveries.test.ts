import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import SurvivorDiscoveries from './SurvivorDiscoveries.vue';

describe('descobertas raras no resultado Survivor', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => { app?.unmount(); document.body.innerHTML = ''; });

  it('omite o bloco quando a corrida não teve descobertas raras', () => {
    const root = document.createElement('div'); document.body.append(root);
    app = createApp(SurvivorDiscoveries, { alphas: {}, terastal: {} }); app.mount(root);
    expect(root.querySelector('details')).toBeNull();
  });

  it('mantém detalhes recolhidos e distingue surgimentos, derrotas e cristais coletados', () => {
    const root = document.createElement('div'); document.body.append(root);
    app = createApp(SurvivorDiscoveries, {
      alphas: { 25: { found: 2, defeated: 1 }, 0: { found: 1, defeated: 0 } },
      terastal: { fire: 2, water: 1 },
    }); app.mount(root);
    expect(root.querySelector('details')?.open).toBe(false);
    expect(root.querySelector('summary')?.textContent).toContain('Descobertas raras · 6');
    expect(root.textContent).toContain('2 surgidos · 1 derrotado');
    expect(root.textContent).toContain('Pokémon desconhecido Alfa');
    expect(root.textContent).toContain('Terastalização · Fogo');
    expect(root.textContent).toContain('2 cristais coletados');
    expect(root.textContent).toContain('1 cristal coletado');
  });
});
