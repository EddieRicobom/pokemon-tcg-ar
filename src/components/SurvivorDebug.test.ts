import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import Debug from './SurvivorDebug.vue';

describe('painel do laboratório', () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });
  it('oferece controles e saída sem gravar uma corrida', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const root = document.createElement('div'); document.body.append(root);
    const onExit = vi.fn(); const app = createApp(Debug, { onExit }); app.mount(root);
    expect(root.textContent).toContain('Laboratório do Ditto');
    expect(root.textContent).toContain('Vida infinita dos alvos');
    expect(root.textContent).toContain('Ganhar XP para 10 níveis');
    const exit = [...root.querySelectorAll('button')].find(b => b.textContent?.includes('Sair'))!;
    exit.click(); await nextTick(); expect(onExit).toHaveBeenCalledOnce();
    app.unmount();
  });
});
