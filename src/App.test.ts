import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import App from './App.vue';

describe('App', () => {
  let host: HTMLElement | null = null;
  let app: VueApp | null = null;

  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
    window.location.hash = '';
  });

  async function mount(hash = ''): Promise<string> {
    window.location.hash = hash;
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(App);
    app.mount(host);
    await nextTick();
    return host.textContent ?? '';
  }

  it('abre em "Escanear" com a câmera desligada e a navegação em português', async () => {
    const text = await mount();
    expect(text).toContain('Pokémon TCG AR');
    expect(text).toContain('Escanear carta');
    expect(host?.querySelectorAll('nav a')).toHaveLength(6);
    expect(host?.querySelector('video')).not.toBeNull();
    expect(host?.querySelector('canvas')).not.toBeNull();
    expect(host?.querySelector('button.primary')?.textContent?.trim()).toBe('Abrir câmera');
  });

  it('não promete reconhecimento sem câmera: nenhuma carta aparece como reconhecida ao abrir', async () => {
    const text = await mount();
    expect(text).not.toContain('Reconhecida automaticamente');
    expect(text).not.toContain('Escolhida por você');
  });

  it('a tela Caixa abre com a câmera desligada e explica como usar', async () => {
    const text = await mount('#/caixa');
    expect(text).toContain('Caixa');
    expect(text).toContain('Câmera desligada');
    expect(host?.querySelector('button.primary')?.textContent?.trim()).toBe('Abrir câmera e sensores');
  });

  it('a tela Várias cartas abre com a câmera desligada e explica o limite de cartas', async () => {
    const text = await mount('#/varias');
    expect(text).toContain('Várias cartas');
    expect(text).toContain('Câmera desligada');
    expect(text).toContain('nada é lido do texto');
  });

  it('a tela Treinador mostra nível, missões e conquistas, sem inventar progresso', async () => {
    localStorage.removeItem('tcg-ar-trainer-v1');
    const text = await mount('#/treinador');
    expect(text).toContain('Missões de hoje');
    expect(text).toContain('Conquistas');
    expect(text).toContain('Novato');
    expect(text).toContain('Sem sequência');
    expect(text).toContain('0 XP');
  });

  it('a tela Cartas mostra a ação de limpar o cache', async () => {
    const text = await mount('#/carregar');
    expect(text).toContain('Cartas guardadas');
    expect(text).toContain('Carregar todas as vistas');
    expect(text).toContain('Limpar cache');
  });

  it('a tela Diagnóstico não esconde o que ainda falta validar', async () => {
    const text = await mount('#/diagnostico');
    expect(text).toContain('Estado do projeto');
    expect(text).toContain('AR físico ainda não foi validado em aparelho');
    expect(text).toContain('Teste do renderizador (GIF fixo na tela)');
  });
});
