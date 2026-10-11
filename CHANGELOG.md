# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

### Adicionado

- Fundação do projeto: Vue 3, TypeScript, Vite 8, `vite-plugin-pwa` e Three.js.
- PWA em português do Brasil, instalável, com cache offline, ícones e base path do GitHub Pages (`/pokemon-tcg-ar/`).
- Diagnóstico do aparelho (HTTPS, câmera, WebGL2, Service Worker, instalação) e aviso explícito de que reconhecimento e AR ainda não existem.
- Câmera traseira com tratamento de erros em português.
- Decodificação de GIF animado (composição de quadros e métodos de descarte) e desenho com transparência em Three.js, carregado sob demanda.
- Teste do renderizador com GIF do Pokémon Showdown ou de arquivo local, com o Pokémon fixo na tela.
- Testes automatizados (Vitest) para base path, capacidades, câmera, URLs do Showdown, GIF e montagem do app.
- Workflows de GitHub Actions: `ci.yml` (tipos, testes, build e conferência do base path) e `deploy.yml` (GitHub Pages).
- Documentação: `README.md`, `CLAUDE.md`, `IMPLEMENTATION_PLAN.md`, `docs/ARCHITECTURE.md` e `docs/TESTING.md`, incluindo a análise do projeto de referência pokeum.

### Não verificado

- Nomes de arquivo e cabeçalhos CORS dos GIFs do Pokémon Showdown (o ambiente de desenvolvimento não alcança o servidor). Ver Fase 1 do plano.
- Câmera, WebGL e instalação do PWA em aparelho real.
