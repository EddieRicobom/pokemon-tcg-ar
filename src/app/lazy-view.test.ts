import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { lazyView } from './lazy-view';

describe('telas carregadas sob demanda', () => {
  let app: App | undefined;
  let host: HTMLElement | undefined;
  afterEach(() => { app?.unmount(); host?.remove(); vi.restoreAllMocks(); });

  function mount(view: ReturnType<typeof lazyView>) {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(view) });
    app.mount(host);
  }

  it('só pede o código quando a tela abre e informa que está carregando', async () => {
    const loader = vi.fn(() => new Promise<{ default: { render: () => ReturnType<typeof h> } }>(() => undefined));
    const view = lazyView(loader);
    expect(loader).not.toHaveBeenCalled();
    mount(view);
    await nextTick();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(host?.querySelector('[role="status"]')?.textContent).toBe('Abrindo a tela…');
  });

  it('troca o aviso pelo conteúdo da tela depois de baixar o código', async () => {
    mount(lazyView(async () => ({ default: { render: () => h('p', 'Tela pronta') } })));
    await vi.waitFor(() => expect(host?.textContent).toBe('Tela pronta'));
    expect(host?.querySelector('[role="status"]')).toBeNull();
  });

  it('oferece recuperação em português quando a rede falha', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mount(lazyView(async () => { throw new Error('offline'); }));
    await vi.waitFor(() => expect(host?.querySelector('[role="alert"]')?.textContent).toContain('Confira a conexão'));
    expect(host?.querySelector('button')?.textContent).toBe('Tentar novamente');
    expect(host?.querySelector('[role="status"]')).toBeNull();
  });
});
