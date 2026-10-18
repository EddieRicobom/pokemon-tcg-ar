import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import StageSheet from './StageSheet.vue';

describe('StageSheet: teclado', () => {
  let app: App | null = null;
  afterEach(() => {
    app?.unmount();
    app = null;
    document.body.replaceChildren();
  });

  async function mount(docked = true) {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const host = document.createElement('div');
    document.body.append(host);
    const state = reactive({ docked, open: true });
    let closed = 0;
    app = createApp({ render: () => h(StageSheet, {
      ...state, host: null, title: 'Equipe', onClose: () => { closed++; state.open = false; },
    }, () => h('input', { 'aria-label': 'Buscar' })) });
    app.mount(host);
    await nextTick();
    return { opener, host, state, closed: () => closed };
  }

  it('foca os controles ao abrir, fecha com Escape e devolve o foco', async () => {
    const { opener, host, closed } = await mount();
    const close = host.querySelector('button')!;
    expect(document.activeElement).toBe(close);
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await nextTick();
    expect(closed()).toBe(1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('não muda o foco para conteúdo que já está na página', async () => {
    const { opener } = await mount(false);
    expect(document.activeElement).toBe(opener);
  });

  it('preserva o foco que a pessoa moveu para fora da folha', async () => {
    const { state } = await mount();
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();
    state.open = false;
    await nextTick();
    expect(document.activeElement).toBe(other);
  });

  it('restaura o foco também quando a folha é desmontada', async () => {
    const { opener } = await mount();
    app!.unmount();
    app = null;
    expect(document.activeElement).toBe(opener);
  });
});
