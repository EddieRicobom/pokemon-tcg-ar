# CLAUDE.md

Orientações para sessões do Claude Code neste repositório.

## O projeto

PWA móvel (Vue 3 + TypeScript + Vite + Three.js + MindAR) que reconhece cartas físicas de Pokémon TCG pela câmera e mostra o GIF animado do Pokémon (PokeAPI/sprites) em pé sobre a carta, em AR. Também tem o Coliseu (`#/caixa`, a equipe passeando) e rastreio de várias cartas. Interface sempre em português do Brasil. As lutas entram por um menu único, a «Arena» (`#/arena`, `src/core/arena-menu.ts`): treino, Liga, corridas e PvP usam a mesma luta 6x6 em tempo real (`components/ArenaFight.vue`), a arena do fim do PvP do Survivor. Estado atual e roteiro: `IMPLEMENTATION_PLAN.md`. Arquitetura: `docs/ARCHITECTURE.md`. Testes: `docs/TESTING.md`. Índice de toda a documentação: `docs/README.md`. Histórico de entregas já concluídas: `docs/HISTORICO.md`. Modo Masmorra (feito, falta e ideias): `docs/MASMORRA.md`. Baús, chaves e itens segurados da Torre: `docs/TORRE_ITENS.md`.

## Regras que não mudam

- **Nunca fingir reconhecimento nem AR.** Nada de carta "reconhecida" por valor fixo, sorteio ou clique do usuário, nem Pokémon posicionado como se estivesse rastreando uma carta sem rastreamento real. Dado que falta (PokéAPI ou TCGdex fora do ar, sprite inexistente) aparece como falta, nunca como valor inventado em silêncio. O teste do renderizador em Diagnóstico é rotulado como fixo na tela e deve continuar assim.
- **Só GitHub gratuito, repositório público.** Deploy exclusivamente por GitHub Pages; build, testes e processamento estático do catálogo por GitHub Actions. Sem backend hospedado, VPS, hospedagem paga, servidor de banco ou serviço Python permanente. Os scripts de dados são TypeScript ou JavaScript (`scripts/`, rodados com `node` ou `tsx` no Actions).
- **Proibido:** Unity, Flutter, React Native, modelos 3D de Pokémon, GLB e glTF. O Pokémon é um GIF 2D transparente.
- **Não copiar a arquitetura de backend do pokeum.** Reaproveitar só as técnicas listadas em `docs/ARCHITECTURE.md` ("Origem das técnicas"). Ideias do Momentoos (outro repositório do dono, também em cima do MindAR) podem ser reaproveitadas; o que foi e o que não foi portado está lá.
- O dono do projeto não instala ferramentas nem roda comandos no PC dele. Tudo precisa funcionar pelo GitHub (Actions e Pages).

## Comandos

```bash
npm ci
npm run typecheck   # vue-tsc (app) + tsc (config)
npm test            # vitest, ambiente happy-dom
npm run build       # vue-tsc + vite build
BASE_PATH=/pokemon-tcg-ar/ npm run build   # como no deploy
node scripts/verify-dist.mjs               # confere o dist/ (base path, Service Worker, OCR)
```

Ferramentas de desenvolvimento fora do `npm test` (e2e com câmera falsa, harness do AR, avaliações com rede) estão descritas em `docs/TESTING.md`.

Antes de dizer que algo funciona, rode `typecheck`, `test` e `build` de verdade e confira o resultado.

## Base path do GitHub Pages

O app roda em `https://<usuário>.github.io/pokemon-tcg-ar/`. O `vite.config.ts` lê `BASE_PATH` (padrão `/pokemon-tcg-ar/`) e o usa em `base`, `start_url`, `scope` e `id` do manifest. O deploy confere isso depois do build. Não escreva caminhos absolutos em código; use `import.meta.env.BASE_URL` ou caminhos relativos.

## Convenções de código

- TypeScript estrito (`noUncheckedIndexedAccess` ligado). Lógica sem interface fica em `src/core/` e precisa de teste em `*.test.ts` ao lado.
- Three.js, MindAR e TensorFlow.js só entram por `src/ar/` e `src/box/` (esta última por `start-box.ts`, ou `badge-case.ts` na maleta de insígnias), sempre com `import()` dinâmico, para não pesar o carregamento inicial.
- Mudou o formato do alvo de rastreamento ou a imagem usada para compilá-lo? Aumente `TARGET_VERSION` (`src/ar/target.ts`): alvos guardados com outra versão são recompilados.
- Textos da interface e mensagens de erro em português do Brasil; identificadores de código em inglês.
- WebGL e câmera não rodam no happy-dom: mantenha a lógica pura testável e deixe só a cola com o navegador fora dos testes unitários (veja `docs/TESTING.md`).
- Efeitos visuais novos ganham uma opção para desligar quando pesam na GPU (como "Luz dos golpes").

## Fluxo de Git

- Preservar a `main`. Trabalhar na branch da tarefa (`claude/...`) e abrir pull request.
- Commits pequenos e com mensagem clara, em português. Seguir a atribuição que o ambiente indicar.
- Só relatar sucesso depois de confirmar o estado real do repositório (`git status`, `git log`, branch no remoto, PR aberto).
- Nunca gerar ZIP no lugar de commitar.

## Limitações conhecidas do ambiente de desenvolvimento

- O sandbox usa um proxy com lista de permissões: sites fora dela (por exemplo `play.pokemonshowdown.com`) respondem 403, e `curl` não contorna. Não tente outro caminho; o que depende de rede externa é medido pelos workflows do GitHub (`external-verification.yml`, `e2e.yml`).
- Há Chromium com Playwright e `ffmpeg`: dá para validar o AR e a Caixa com **câmera falsa** (`e2e/ar-harness.mjs`, vídeo `.y4m`) e tirar capturas. O GL é por software, então desempenho e aparência **não** valem para celular. Câmera real, sensores e GPU só se validam em aparelho real; relate isso com honestidade.
- Os workflows CI, E2E, Verificação externa e Deploy rápido estão desativados no GitHub: pull request não roda nada. Só o deploy (push na `main` e semanal) confere tipos, testes e build; se ele falhar, o site segue na versão anterior até um deploy passar. Depois de mesclar, confira esse deploy.
- O GitHub GraphQL não está disponível nas sessões do Claude Code: use a API REST (`gh api repos/...`) para abrir e mesclar pull requests.
- No PC do dono (Windows, app desktop) **não há `gh`** e ele não vai instalar. O `git` local faz fetch/push normalmente; para PR (abrir, ler, mesclar) use o conector do GitHub do claude.ai (ferramentas `mcp__…__create_pull_request`, `merge_pull_request` etc., carregadas pelo ToolSearch). O plugin `plugin:github:github` pode falhar com "Authorization header is badly formatted": é outro servidor, ignore e use o conector.
- O remoto tem branches `Codex/...` e `codex/...`. No Windows o disco não diferencia maiúsculas, então refs soltos podem aparecer com o caso errado (ex.: `origin/Codex/x` para `codex/x`). Se `git branch -a` mostrar nomes trocados, rode `git pack-refs --all` no repositório principal e `git fetch --prune` de novo. Use sempre `claude/...` (minúsculo) nas branches novas.
- Algumas páginas do repositório de referência (pokeum) bloqueiam leitura automatizada por robots.txt. O que está documentado sobre ele vem do README.
