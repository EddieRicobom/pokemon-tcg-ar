import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import { emptyVillage } from '../core/village/life';
import FarmSeedBox from './FarmSeedBox.vue';

let app: App | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { app?.unmount(); host?.remove(); });

function mount() {
  const state = reactive(emptyVillage(9, { x: 45, y: 41 }));
  const changed = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(FarmSeedBox, { state, nameOf: () => 'Bulbasaur', onChange: changed }) });
  app.mount(host);
  const button = (label: string) => [...host!.querySelectorAll('button')].find((entry) => entry.textContent === label)!;
  return { state, changed, button };
}

describe('caixa de sementes na interface', () => {
  it('deposita e retira estoque real, atualiza contadores e desabilita ações vazias', async () => {
    const { state, changed, button } = mount();
    expect(host!.textContent).toContain('Não há sementes');
    state.inventory['sem-tomate'] = 4;
    await nextTick();
    expect(button('Retirar 1').disabled).toBe(true);
    button('Depositar 1').click();
    await nextTick();
    expect(host!.textContent).toContain('Mochila: 3 · Caixa: 1');
    button('Depositar todas').click();
    await nextTick();
    expect(state.farm.seeds['sem-tomate']).toBe(4);
    expect(button('Depositar 1').disabled).toBe(true);
    button('Retirar todas').click();
    await nextTick();
    expect(state.inventory['sem-tomate']).toBe(4);
    expect(button('Retirar todas').disabled).toBe(true);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('identifica o morador e mostra somente trabalhos registrados', async () => {
    const { state } = mount();
    expect(host!.querySelector('details')).toBeNull();
    state.farm.history.push({ residentId: 'bulbasaur', at: 1000, message: 'Regou um canteiro da fazenda.' });
    await nextTick();
    expect(host!.querySelector('details')!.textContent).toContain('Bulbasaur');
    expect(host!.querySelector('details')!.textContent).toContain('Regou um canteiro da fazenda.');
  });
});
