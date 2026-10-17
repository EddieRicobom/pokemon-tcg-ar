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
    const tabs = [...(host?.querySelectorAll('nav.tabs a') ?? [])].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(tabs).toEqual([['Escanear', '#/'], ['Vila', '#/vila'], ['Caixa', '#/caixa'], ['Pins', '#/pins'], ['Treinador', '#/treinador']]);
    expect(host?.querySelectorAll('nav.modes a')).toHaveLength(3);
    expect(host?.querySelector('a.header-gear')?.getAttribute('href')).toBe('#/diagnostico');
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
    // A Vila tem aba própria: a Caixa não esconde mais um "Modo vida" dentro dela.
    expect(text).not.toContain('Modo vida');
  });

  it('vindo da batalha do Fliperama, a Caixa oferece um toque para abrir a câmera e batalhar', async () => {
    await mount('#/caixa?batalha=1');
    expect(host?.querySelector('button.primary')?.textContent?.trim()).toBe('⚔️ Abrir câmera e batalhar');
    expect([...(host?.querySelectorAll('a') ?? [])].some((a) => a.getAttribute('href') === '#/vila')).toBe(true);
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

  it('a tela Pins explica o jogo, a energia e pede cartas guardadas', async () => {
    localStorage.removeItem('tcg-ar-trainer-v1');
    const text = await mount('#/pins');
    expect(text).toContain('Pin Mode');
    expect(text).toContain('sem câmera');
    expect(text).toContain('energia');
    expect(text).toContain('Escolha os pins');
    expect(text).toContain('Como funciona o chão');
  });

  it('Várias e Minhas cartas são modos do Escanear: a aba "Escanear" fica ativa e o Diagnóstico vai para a engrenagem', async () => {
    await mount('#/varias');
    expect(host?.querySelector('nav.tabs a.active')?.textContent).toContain('Escanear');
    expect(host?.querySelector('nav.modes a.active')?.textContent).toContain('Várias');
    app?.unmount();
    host?.remove();
    await mount('#/carregar');
    expect(host?.querySelector('nav.tabs a.active')?.textContent).toContain('Escanear');
    expect(host?.querySelector('nav.modes a.active')?.textContent).toContain('Minhas cartas');
    app?.unmount();
    host?.remove();
    await mount('#/diagnostico');
    expect(host?.querySelector('nav.modes')).toBeNull();
    expect(host?.querySelector('nav.tabs a.active')).toBeNull();
    expect(host?.querySelector('a.header-gear')?.getAttribute('aria-current')).toBe('page');
  });

  it('a tela Cartas não deixa "apagar tudo" entre os botões do dia a dia', async () => {
    const text = await mount('#/carregar');
    expect(text).toContain('Cartas guardadas');
    expect(text).toContain('Carregar todas as vistas');
    // Apagar todas as cartas mora numa zona de perigo (só aparece com cartas, e só apaga com APAGAR digitado).
    expect(text).not.toContain('Limpar cache');
    expect(host?.querySelector('.danger-zone')).toBeNull();
  });

  it('a tela Diagnóstico não esconde o que ainda falta validar', async () => {
    const text = await mount('#/diagnostico');
    expect(text).toContain('Estado do projeto');
    expect(text).toContain('AR físico ainda não foi validado em aparelho');
    expect(text).toContain('Teste do renderizador (GIF fixo na tela)');
  });
});
