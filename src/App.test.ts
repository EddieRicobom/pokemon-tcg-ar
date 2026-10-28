import { afterEach, describe, expect, it, vi } from 'vitest';
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
    await vi.waitFor(() => expect(host?.querySelector('[data-route-pending]')).toBeNull(), { timeout: 5000 });
    return host.textContent ?? '';
  }

  it('abre em "Escanear" com a câmera desligada e a navegação em português', async () => {
    const text = await mount();
    expect(text).toContain('Pokémon TCG AR');
    expect(text).toContain('Escanear carta');
    const tabs = [...(host?.querySelectorAll('nav.tabs a') ?? [])].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(tabs).toEqual([['Escanear', '#/'], ['Vila', '#/vila'], ['Cartas', '#/cartas'], ['Pins', '#/pins'], ['Treinador', '#/treinador']]);
    expect(host?.querySelectorAll('nav.modes a')).toHaveLength(2);
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

  it('a tela Arena abre desligada e explica como usar', async () => {
    const text = await mount('#/caixa');
    expect(text).toContain('Arena 3D');
    expect(text).toContain('Arena desligada');
    expect(host?.querySelector('button.primary')?.textContent?.trim()).toBe('🏟️ Entrar na Arena 3D');
    // A Vila tem aba própria: a Caixa não esconde mais um "Modo vida" dentro dela.
    expect(text).not.toContain('Modo vida');
    // A escolha da turma mora em Minhas cartas; a Caixa só aponta para lá.
    expect(text).not.toContain('Escolher a equipe');
    expect([...(host?.querySelectorAll('a') ?? [])].some((a) => a.getAttribute('href') === '#/cartas')).toBe(true);
  });

  it('vindo da batalha do Fliperama, a Arena oferece entrada direta para batalhar', async () => {
    await mount('#/caixa?batalha=1');
    expect(host?.querySelector('button.primary')?.textContent?.trim()).toBe('⚔️ Entrar na arena e batalhar');
    expect([...(host?.querySelectorAll('a') ?? [])].some((a) => a.getAttribute('href') === '#/vila')).toBe(true);
  });

  it('a tela Várias cartas abre com a câmera desligada e explica o limite de cartas', async () => {
    const text = await mount('#/varias');
    expect(text).toContain('Várias cartas');
    expect(text).toContain('Câmera desligada');
    expect(text).toContain('nada é lido do texto');
  });

  it('a Arena separa a equipe de seis, os modos contínuos e a caixa que exibe a luta', async () => {
    const text = await mount('#/arena');
    expect(text).toContain('Arena Digital');
    expect(text).toContain('Monte seu time de batalha');
    expect(text).toContain('Formatação digital');
    expect(text).toContain('Restauração digital');
    // A Arena é sempre 3D e todos os atalhos apontam para o palco virtual.
    const hrefs = () => [...(host?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'));
    expect(hrefs()).toContain('#/caixa?arena=1&virtual=1');
    expect(hrefs()).not.toContain('#/caixa');
  });

  it('a tela Treinador mostra nível, missões e conquistas, sem inventar progresso', async () => {
    localStorage.removeItem('tcg-ar-trainer-v1');
    const text = await mount('#/treinador');
    expect(text).toContain('Missões de hoje');
    expect(text).toContain('Novato');
    expect(text).toContain('Sem sequência');
    expect(text).toContain('0 XP');
    // Uma seção por vez: as conquistas ficam em "Coleção".
    const sections = [...(host?.querySelectorAll('.trainer-sections button') ?? [])].map((b) => b.textContent?.trim());
    expect(sections).toEqual(['Resumo', 'Liga', 'Jogos', 'Pokédex', 'Coleção', 'Dados']);
    expect(host?.textContent).not.toContain('Conquistas');
    [...host!.querySelectorAll<HTMLButtonElement>('.trainer-sections button')].find((b) => b.textContent?.includes('Coleção'))!.click();
    await nextTick();
    expect(host?.textContent).toContain('Conquistas');
  });

  it('a Pokédex começa vazia e só mostra o que foi encontrado', async () => {
    localStorage.removeItem('tcg-ar-pokedex-v1');
    await mount('#/treinador');
    [...host!.querySelectorAll<HTMLButtonElement>('.trainer-sections button')].find((b) => b.textContent?.includes('Pokédex'))!.click();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await nextTick();
    expect(host?.textContent).toContain('0 de 1025');
    expect(host?.textContent).toContain('Nenhuma espécie ainda');
    expect(host?.querySelectorAll('.dex-grid button.seen').length).toBe(0);
  });

  it('o Treinador abre direto nos minigames com ?jogos=1', async () => {
    const text = await mount('#/treinador?jogos=1');
    expect(text).toContain('Como ganhar XP');
    expect(text).not.toContain('Missões de hoje');
  });

  it('a tela Pins explica o jogo, a energia e pede cartas guardadas', async () => {
    localStorage.removeItem('tcg-ar-trainer-v1');
    const text = await mount('#/pins');
    expect(text).toContain('Pins');
    expect(text).toContain('sem câmera');
    expect(text).toContain('energia');
    expect(text).toContain('Escolha os pins');
    expect(text).toContain('Como funciona o chão');
  });

  it('Várias é modo do Escanear; Cartas não tem sub-abas; a Arena e a Caixa acendem a aba da Vila; o Diagnóstico vai para a engrenagem', async () => {
    await mount('#/varias');
    expect(host?.querySelector('nav.tabs a.active')?.textContent).toContain('Escanear');
    expect(host?.querySelector('nav.modes a.active')?.textContent).toContain('Várias');
    expect([...(host?.querySelectorAll('nav.modes a') ?? [])].map((a) => a.textContent?.trim())).toEqual(['Uma carta', 'Várias']);
    app?.unmount();
    host?.remove();
    await mount('#/cartas');
    expect(host?.querySelector('nav.tabs a.active')?.textContent).toContain('Cartas');
    expect(host?.querySelector('nav.modes')).toBeNull();
    app?.unmount();
    host?.remove();
    for (const route of ['#/caixa', '#/caixa?virtual=1', '#/arena']) {
      await mount(route);
      // As lutas moram no Coliseu da Vila: a aba da Vila fica acesa e não há aba nem sub-aba delas.
      expect([...(host?.querySelectorAll('nav.tabs a.active') ?? [])].map((a) => a.textContent?.trim())).toEqual(['Vila']);
      expect(host?.querySelector('nav.modes')).toBeNull();
      expect(host?.textContent).not.toContain('Minhas cartasArena 3D');
      app?.unmount();
      host?.remove();
    }
    await mount('#/diagnostico');
    expect(host?.querySelector('nav.modes')).toBeNull();
    expect(host?.querySelector('nav.tabs a.active')).toBeNull();
    expect(host?.querySelector('a.header-gear')?.getAttribute('aria-current')).toBe('page');
  });

  it('o endereço antigo #/carregar abre Minhas cartas e troca o endereço para #/cartas', async () => {
    const text = await mount('#/carregar');
    expect(window.location.hash).toBe('#/cartas');
    expect(text).toContain('As cartas que o app já reconheceu');
    expect(host?.querySelector('nav.tabs a.active')?.textContent).toContain('Cartas');
  });

  it('a tela Cartas não deixa "apagar tudo" entre os botões do dia a dia', async () => {
    const text = await mount('#/cartas');
    expect(text).toContain('As cartas que o app já reconheceu');
    // Sem cartas, não aparece botão de carregar.
    expect(text).not.toContain('Completar as cartas que faltam');
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
