import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, type App } from 'vue';
import VillageSheetHeader from './VillageSheetHeader.vue';

describe('cabeçalho das janelas da Vila', () => {
  let app: App | undefined;
  afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); });

  it('anuncia o título e emite fechar, mantendo as ações e o voltar', () => {
    const host = document.createElement('div');
    document.body.append(host);
    let closed = 0;
    let back = 0;
    app = createApp({ render: () => h(VillageSheetHeader, {
      title: 'Loja', titleId: 'shop-title', icon: '🏠', closeLabel: 'Sair',
      back: { label: 'Menu', run: () => back++ }, onClose: () => closed++,
    }, { actions: () => h('span', 'Moedas') }) });
    app.mount(host);
    expect(host.querySelector('#shop-title')?.textContent).toContain('Loja');
    expect(host.textContent).toContain('Moedas');
    host.querySelector<HTMLButtonElement>('[aria-label="Sair Loja"]')!.click();
    host.querySelector<HTMLButtonElement>('.village-sheet-back')!.click();
    expect(closed).toBe(1);
    expect(back).toBe(1);
  });
});
