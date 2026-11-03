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
    const auto = [...root.querySelectorAll('label')].find(label => label.textContent?.includes('Carga automática'))?.querySelector('input');
    expect(auto?.checked).toBe(true);
    expect(root.textContent).toContain('Ganhar XP para 10 níveis');
    const exit = [...root.querySelectorAll('button')].find(b => b.textContent?.includes('Sair'))!;
    exit.click(); await nextTick(); expect(onExit).toHaveBeenCalledOnce();
    app.unmount();
  });
  it('troca formas de raio e alcance sem gerar valores inválidos no relatório', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const root = document.createElement('div'); document.body.append(root);
    const app = createApp(Debug); app.mount(root);
    const selects = root.querySelectorAll('select');
    const category = selects[1]!;
    category.value = 'aura'; category.dispatchEvent(new Event('change')); await nextTick();
    category.value = 'projetil'; category.dispatchEvent(new Event('change')); await nextTick();
    [...root.querySelectorAll('button')].find(b => b.textContent?.includes('Reportar bug'))!.click(); await nextTick();
    for (const group of root.querySelectorAll('fieldset')) (group.querySelector('button') as HTMLButtonElement).click();
    await nextTick();
    [...root.querySelectorAll('button')].find(b => b.textContent?.includes('Gerar código'))!.click(); await nextTick();
    const code = (root.querySelector('textarea[readonly]') as HTMLTextAreaElement).value;
    const encoded = code.slice('SVDEBUG1.'.length).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
    expect(payload.player.move.category).toBe('projetil');
    expect(Number.isFinite(payload.player.attackRange)).toBe(true);
    expect(payload.player.attackRange).toBeGreaterThan(0);
    app.unmount();
  });

});
