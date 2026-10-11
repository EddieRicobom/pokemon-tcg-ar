# CLAUDE.md

Orientações para sessões do Claude Code neste repositório.

## O projeto

PWA móvel (Vue 3 + TypeScript + Vite) que reconhece cartas físicas de Pokémon TCG pela câmera e mostra o GIF animado do Pokémon Showdown em pé sobre a carta, em AR. Interface sempre em português do Brasil. Estado atual e roteiro: `IMPLEMENTATION_PLAN.md`. Arquitetura: `docs/ARCHITECTURE.md`.

## Regras que não mudam

- **Nunca fingir reconhecimento nem AR.** Nada de carta "reconhecida" por valor fixo, sorteio ou clique do usuário, nem Pokémon posicionado como se estivesse rastreando uma carta sem rastreamento real. Enquanto uma etapa não existir, a interface diz "Ainda não implementado". O teste de renderizador atual é rotulado como fixo na tela e deve continuar assim.
- **Só GitHub gratuito, repositório público.** Deploy exclusivamente por GitHub Pages; build, testes e processamento estático do catálogo por GitHub Actions. Sem backend hospedado, VPS, hospedagem paga, servidor de banco ou serviço Python permanente.
- **Python só em build/CI** (preparação de dados), quando houver necessidade real.
- **Proibido:** Unity, Flutter, React Native, modelos 3D de Pokémon, GLB e glTF. O Pokémon é um GIF 2D transparente.
- **Não copiar a arquitetura de backend do pokeum.** Reaproveitar só as técnicas listadas em `docs/ARCHITECTURE.md`.
- O dono do projeto não instala ferramentas nem roda comandos no PC dele. Tudo precisa funcionar pelo GitHub (Actions e Pages).

## Comandos

```bash
npm ci
npm run typecheck   # vue-tsc (app) + tsc (config)
npm test            # vitest, ambiente happy-dom
npm run build       # vue-tsc + vite build
BASE_PATH=/pokemon-tcg-ar/ npm run build   # como no CI
```

Antes de dizer que algo funciona, rode `typecheck`, `test` e `build` de verdade e confira o resultado.

## Base path do GitHub Pages

O app roda em `https://<usuário>.github.io/pokemon-tcg-ar/`. O `vite.config.ts` lê `BASE_PATH` (padrão `/pokemon-tcg-ar/`) e o usa em `base`, `start_url`, `scope` e `id` do manifest. O CI confere isso depois do build. Não escreva caminhos absolutos em código; use `import.meta.env.BASE_URL` ou caminhos relativos.

## Convenções de código

- TypeScript estrito (`noUncheckedIndexedAccess` ligado). Lógica sem interface fica em `src/core/` e precisa de teste em `*.test.ts` ao lado.
- Three.js só é importado por `src/ar/` e carregado com `import()` dinâmico, para não pesar o carregamento inicial.
- Textos da interface e mensagens de erro em português do Brasil; identificadores de código em inglês.
- WebGL e câmera não rodam no happy-dom: mantenha a lógica pura testável e deixe só a cola com o navegador fora dos testes unitários (veja `docs/TESTING.md`).

## Fluxo de Git

- Preservar a `main`. Trabalhar na branch da tarefa (`claude/...`) e abrir pull request.
- Commits pequenos e com mensagem clara, em português. Seguir a atribuição que o ambiente indicar.
- Só relatar sucesso depois de confirmar o estado real do repositório (`git status`, `git log`, branch no remoto, PR aberto).
- Nunca gerar ZIP no lugar de commitar.

## Limitações conhecidas do ambiente de desenvolvimento

- O sandbox do Claude Code **não alcança `play.pokemonshowdown.com`** (o proxy responde 403). Nomes de arquivo e CORS dos GIFs do Showdown ficaram **não verificados**. Não tente contornar com outro caminho de rede; registre como risco e valide no celular.
- Não há navegador headless nem câmera no sandbox: câmera, WebGL e instalação do PWA só são validados em aparelho real.
- Algumas páginas do repositório de referência (pokeum) bloqueiam leitura automatizada por robots.txt. O que está documentado sobre ele vem do README.
