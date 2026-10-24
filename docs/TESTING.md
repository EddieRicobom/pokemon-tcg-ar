# Testes

## Música e revisão da Caixa/Arena (21/10/2026)

`music.test.ts` verifica seleção das 12 faixas por hora/clima, limites de volume, transições com potência constante e os nove estágios regionais. `music-assets.test.ts` confere a presença e assinatura MP3 das 21 faixas. `music-player.test.ts` cobre limite de duas fontes, cancelamento, falhas sem repetição por quadro, pausa, respostas atrasadas e descarte. O teste de backup inclui as duas novas preferências sem mudar o formato dos saves.

`camera.test.ts` cobre cancelamento durante permissão e reprodução sem afetar a câmera de uma sessão nova. `TeamPicker.test.ts` cobre Digital Pokémon e carga tardia de miniatura. `ground.test.ts` verifica UV vertical dos enfeites, sRGB, separação da orientação do piso e restauração das marcações após golpes. Os testes de terreno mantêm o layout clássico dos Pins separado dos novos layouts.

As regras de cache usam expressões serializáveis (`config/runtime-cache.ts`), com testes de base path, nomes exatos e caracteres especiais. Isso corrige uma closure anterior que deixava `base` indefinido no Service Worker publicado; `verify-dist` recusa essa regressão.

Na revisão local, os testes unitários completos, typecheck, build com `BASE_PATH=/pokemon-tcg-ar/` e `verify-dist` passaram. Um diagnóstico de navegador Edge/Chromium com câmera falsa e sprites sintéticos de teste conferiu seleção física/digital, equipe 6/6, Caixa efetivamente colocada, menus, Escape, restauração de foco e retrato/paisagem; as 21 faixas foram decodificadas e o player real iniciou/pausou sem erro. O diagnóstico fixo dos pisos foi comparado antes/depois em WebGL por software. Isso não verifica câmera real, sensores, compatibilidade de autoplay no iPhone, bateria ou aparência/desempenho em GPU móvel. O build inicial não pré-cacheia as músicas (22 entradas de shell); uma faixa ainda não usada exige rede.

Os comandos e arquivos abaixo descrevem a cobertura disponível. O resultado de cada revisão deve ser conferido na execução correspondente do GitHub Actions; a existência de um teste não significa que ele passou na revisão atual. Testes automatizados não medem câmera, GPU, sensores, calor ou bateria de um celular.

## O que roda a cada pull request e a cada deploy

`ci.yml` (pull requests e `main`) e `deploy.yml` (antes de publicar):

| Verificação | Comando | O que cobre |
| --- | --- | --- |
| Tipos | `npm run typecheck` | `vue-tsc` no app e `tsc` nas configurações (TypeScript estrito, `noUncheckedIndexedAccess`) |
| Testes unitários | `npm test` | Vitest com happy-dom (`src/**/*.test.ts` e `config/**/*.test.ts`) |
| Build | `npm run build` | Compilação de produção e Service Worker |
| Conferência do `dist/` | `node scripts/verify-dist.mjs` | `start_url`, `scope` e `index.html` com o base path certo, Service Worker, arquivos do OCR e (no deploy, `REQUIRE_INDEX=1`) o índice do catálogo com tamanho plausível |

O job **"Tipos, testes e build"** é o que vale como porta de entrada para o merge.

## Testes unitários por área

| Área | O que é testado |
| --- | --- |
| `src/core/` | Câmera (permissões, erros em pt-BR), capacidades, GIF (**GIFs reais gerados no teste** por `__fixtures__/encode-gif.ts`: quadros parciais, transparência, descarte), suavização de pixels, espelho do jsDelivr, dados da PokéAPI/TCGdex e o **motor de batalha** (determinístico por `seededRng`: dano, tipos, críticos, condições, defesa, personalidades, resumo) |
| `src/recognition/` | Detecção do contorno (imagens sintéticas e **fotos reais** em `__fixtures__/photos`), OCR e interpretação do texto, índices do catálogo e das ilustrações, fusão e decisão, agregação temporal, cliente do TCGdex |
| `src/app/` | Controlador do escaneamento (sem navegador, por dependências injetadas), etapas do AR, preparo de uma e de várias cartas, equipe, rotas, ajustes visuais e de sensores, modo imersivo da tela cheia (`fullscreen.test.ts`), salvamento da Vila (`village-store.test.ts`: ida e volta de tudo, cópia de segurança, falha de gravação, diário antigo cortado) |
| `src/ar/` | Pose e âncora do sprite, suavização, sessões (uma e várias cartas), motor do rastreador (janela de busca), relé de quadros, **normalização de contraste** (tensores no backend `cpu`), pose fresca × repetida (sessões de uma e de várias cartas), preparo do alvo, painel de status, gestos, fontes do sprite |
| `src/box/` | Cena da Caixa, orientação do giroscópio, chão, formação, passeio, **arena** (posição e escala), **diretor da batalha** (tempos, personalidades, estilos por tipo, luzes, ambiente, HUD), efeitos, **luzes dos golpes** (queda, uniformes, shader, poças, luz do ambiente) |
| `src/core/village/`, `src/village/` | Vila: mapa, coleta, horta, loja, pesca, cozinha, presentes e arte; liquidação comunitária diária com comida do inventário, manutenção, confiança/bem-estar separados de amizade e catch-up limitado; vocações por tipo com seleção de atividades, energia e interesses persistentes; rega/colheita de canteiros existentes, pesca limitada, culinária que consome ingredientes e registro visual no ciclo; memórias sociais recentes influenciam escolhas de convívio, e encontros/ajuda efetivos alimentam o Diário existente com repetição limitada; vida social, perguntas e bordões, apelidos, pedidos e prêmios; Diário e Álbum; casas, terrenos e prédios por nível, café, correio, caminhos e migração de salvamentos. `community.test.ts` e `vocations.test.ts` cobrem a simulação pura; a cola visual da atividade fica em `src/village/village-game.ts`. A Vila em AR usa o canvas completo do mapa como textura de um diorama em `src/ar/start-village.ts`; `ar-diorama.test.ts` cobre os limites de escala e distância segura, e os cálculos de plano estimado e orientação são compartilhados com a Caixa. |
| `src/components/QuizDialog.test.ts` | A conversa de perguntas: responder só com texto, sugestões, opções do seguimento e fala final |
| `src/core/survivor*.test.ts` | Torre: simulação das ondas, combate, upgrades, golpes por tipo e atributos, evoluções, treinadores, chefão final, resumo e modo infinito; objetivos concluídos liberam no máximo uma segunda troca de Pokémon entre corridas. Critérios de ritmo, matriz de espécies e limites de interpretação ficam em [SURVIVOR_BALANCE_PRINCIPLES.md](SURVIVOR_BALANCE_PRINCIPLES.md). |
| `src/core/pins.test.ts`, `pin-ai.test.ts`, `pin-replay.test.ts`, `src/app/pins-setup.test.ts` | Física dos Pins, decisões do computador, gravação/reprodução e normalização das opções guardadas |
| `src/core/league.test.ts`, `src/pvp/*.test.ts` | Progressão da Liga, códigos de convite/resposta, compactação SDP e validação das mensagens dos Pins e da Caixa; não abre uma conexão WebRTC entre aparelhos |
| `src/app/wallet.test.ts`, `pokemon-data-service.test.ts`, `backup.test.ts` | Saldo único de moedas, valores inválidos, recusa de gravação, cache de batalha corrompido, carregamento parcial e exportação/restauração do backup |
| `src/cache/` | Cache de cartas (IndexedDB falso) e arquivos |
| `src/App.test.ts` | Montagem da interface |

O WebGL real não roda no happy-dom: a lógica é mantida pura e testada; a cola com o navegador (desenho, câmera, sensores) fica fora dos testes unitários. Trechos de shader são conferidos como texto (que o patch injeta o que deve), não compilados.

### Carregamento inicial do scan

O Service Worker pré-cacheia somente o shell e os chunks usados pela tela inicial. Os chunks de Vila, Arena, Pins, Caixa e demais telas entram no cache `app-assets-v1` com CacheFirst quando são visitados. Em um build com `BASE_PATH=/pokemon-tcg-ar/`, a lista gerada tinha 22 entradas (incluindo duplicatas de ícones/manifests geridas pelo Workbox), contra mais de 70 requisições observadas na primeira abertura da versão anterior. A comparação foi feita em navegador limpo; bytes e tempo variam conforme o cache, compressão e rede.

O OCR e o catálogo continuam sob demanda. O OCR do primeiro uso medido na versão publicada baixou aproximadamente 4,5 MB; a otimização evita que esse download concorra com chunks de modos que ainda não foram abertos. `getPipeline()` compartilha a inicialização em andamento, e falhas finais do TCGdex têm cooldown curto antes de nova tentativa; a confirmação visual e a quantidade de candidatas não foram reduzidas.

Os trabalhos ativos têm cobertura em `worksites.test.ts`: concorrência com a fazenda, escolha do píer, trajeto real antes da produção, coleta manual concorrente, estoque cheio e preservação do histórico. `following.test.ts` cobre velocidade do companheiro, restauração ao encerrar e chegada aos oito destinos guiados. `layout.test.ts` e os testes de postos conferem acessos em várias sementes, incluindo o mapa usado pelo app. `atlas-file.test.ts` reconstrói o atlas sem navegador e compara os pixels com o PNG versionado no build. Essas verificações fazem parte do `npm test`; capturas do canvas e navegação no navegador são validações adicionais, sem medir GPU ou toque de celular real.

## Outras verificações (não fazem parte de `npm test`)

- **Lendas da Vila (⚠️ desatualizado em 2026-10-23):** o script ainda usa `.menu-control-btn` (hoje `.village-menu-btn`), não dispensa a tela de boas-vindas (`tcg-ar-onboarding-v1`) e não espera a Vila terminar de abrir com o relógio simulado; precisa de uma revisão antes de servir de regressão. A lógica das 94 investigações continua coberta por `legendary-investigation.test.ts`. Descrição original: `node e2e/village-legends.mjs` com `APP_URL` apontando para o app local e `BROWSER_PATH` opcional. Usa contexto isolado e save identificado no script; percorre duas pistas a pé, recarrega entre etapas, verifica o catálogo de 94 espécies, ações em paisagem e replay sem nova visita/moeda. `SCREENSHOT_DIR` opcional guarda capturas. A lógica das 94 investigações, migração, diário e caminhos está em `legendary-investigation.test.ts`, dentro do `npm test`. Não é uma medição de GPU nem teste de toque no celular.

- **Teste de ponta a ponta** (`e2e/`, `e2e.yml`, branches `claude/**`, `codex/**` e `Codex/**`, ou execução manual): Playwright com Chromium e câmera falsa (vídeo gerado de um escaneamento oficial da carta), percorre reconhecimento, armazenamento e AR. É um workflow separado do CI; os artefatos `e2e-resultados` e as anotações registram o resultado de cada execução, incluindo falhas de rede, CORS ou OCR.
  - **Estado em 2026-10-23:** o fluxo voltou a passar localmente (5 cartas: reconhece, guarda, rastreia, sobrevive a recarregar e reconhece offline pelo cache). As falhas anteriores vinham de três causas no teste, não do produto: (1) a tela de boas-vindas da primeira abertura cobria o botão da câmera (o teste agora parte de um perfil que já a viu, `tcg-ar-onboarding-v1`); (2) os seletores antigos (`.hud`, `.result`, `#/carregar`) não existem mais depois do modo imersivo e da Box (agora lê os avisos `.stage-head .pill`, o IndexedDB e a Lista em «Cartas»); (3) as referências das outras candidatas eram abortadas, então o app, corretamente, pedia para escolher a impressão. Agora elas vêm do CDN de verdade, só com o cabeçalho de CORS corrigido. A carta do cenário continua vindo dos bytes oficiais baixados no preparo e nunca se injeta um reconhecimento.
  - **Rodar no PC sem ffmpeg (Windows):** `E2E_CARDS=base1-4,base5-53 npx vitest run --config vitest.eval.config.ts scripts/make-e2e-scene.eval.ts`, depois `node e2e/png-to-y4m.mjs e2e/.tmp/<id>.png e2e/.tmp/<id>.y4m` para cada carta, `npx playwright install chromium`, build com `BASE_PATH=/pokemon-tcg-ar/` e `npx playwright test`. **Use o Chromium do Playwright, não o Edge/Chrome instalado**: o Edge não aceita a câmera falsa (`getUserMedia` dá `NotFoundError`).
  - O teste final só exige que **uma** carta feche o fluxo; as demais ficam registradas em `e2e/.tmp/results/*.json`. Em 2026-10-23 a `swsh1-65` não foi identificada nesse cenário (o app leu o número, mas não achou carta com ele no catálogo; ver a avaliação abaixo).
- **Avaliações com rede** (`scripts/*.eval.ts`, `vitest.eval.config.ts`): reconhecimento com cartas reais e OCR real, só no GitHub Actions.
- **Bancada do scanner** (`scripts/scan-bench.eval.ts`, sem rede): roda o `ScanController` e o `RecognitionPipeline` reais com Tesseract de verdade no Node sobre a foto real `meowth-jungle-56.jpg`, em dois roteiros fixos (carta mexendo 3 quadros e depois parada; carta parada desde o 1º quadro). Imprime tempo até confirmar, passadas de OCR, referências carregadas e quadros. Catálogo e referências são de teste: **mede custo, não acerto**, e é um PC, não um celular. Para comparar antes/depois, rode o mesmo arquivo nas duas versões: `npx vitest run -c vitest.eval.config.ts scripts/scan-bench.eval.ts --silent=false`.
- **Tempos por etapa no aparelho**: Escanear → Teste → "Mostrar o que o app está vendo" mostra o tempo de cada etapa da última leitura (e as puladas, com o motivo); Diagnóstico → "Tempo de cada etapa" mostra mediana e p90 da sessão. É o jeito de medir no celular de verdade.
- **Verificação externa** (`external-verification.yml`): API e CDN do TCGdex (status, CORS, formato) e sprites do PokeAPI. Consulte o relatório da execução para disponibilidade e tamanho do catálogo naquele momento.
- **Minimapa atrás do menu** (`e2e/vila-minimapa.mjs`, ferramenta de desenvolvimento, **não roda no CI**): confere, no celular e em paisagem, que nenhum ponto da área comum entre o minimapa e o menu da Vila é do minimapa. `APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ node e2e/vila-minimapa.mjs`.
- **Hub do Coliseu** (`e2e/coliseu-hub.mjs`, ferramenta de desenvolvimento, **não roda no CI**): `APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ node e2e/coliseu-hub.mjs` (`BROWSER_PATH` e `SCREENSHOT_DIR` opcionais). Save de teste no nível 10; pelo menu da Vila (aba «Lugares») abre o Coliseu e confere a barra de baixo (sem a aba Arena nem sub-abas, com a aba da Vila acesa nas lutas), os botões Arena 3D, Caixa em AR, Liga e PvP, entra em cada um e volta pela Caixa com «Voltar à Vila», confere a batalha na Arena 3D do Fliperama e o interruptor «Onde lutar» da Arena Digital. Não abre câmera nem WebGL. A montagem dos endereços está em `route.test.ts`.
- **Fumaça da Caixa com câmera falsa** (`e2e/caixa-batalha.mjs`, ferramenta de desenvolvimento, **não roda no CI**): `APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ node e2e/caixa-batalha.mjs` (`BROWSER_PATH` e `SCREENSHOT_DIR` opcionais). Três cenários em contextos descartáveis: a **Arena 3D** (`#/caixa?virtual=1`: nenhum pedido de câmera, a arena já nasce de frente, arrastar gira a visão, batalha completa, Parar, Fechar e o interruptor de volta para a câmera), a **batalha comum** (3 Digital Pokémon num save de teste: abre a câmera, coloca a caixa, batalha até o fim, resumo, Parar e Fechar) e a **corrida 6×6 da Arena** (`#/caixa?formatacao=1` com 6 moradores: Começar, em cena, Desistir). Exige zero erros de página. A lógica dessas sessões está em `box-battle-session.test.ts` (cena falsa, dentro do `npm test`). Não valida câmera, sensores nem GPU reais; os dados de batalha vêm da rede (sem rede, valores neutros com aviso).
- **Harness do modo BONK** (`e2e/survival-bonk/`, ferramenta de desenvolvimento, **não roda no CI**): com `npx vite` rodando, abrir `/pokemon-tcg-ar/e2e/survival-bonk/index.html?dex=25&god=1`. Monta a Torre de verdade e começa uma corrida BONK direto, sem a tela de escolha (`god=1` deixa o jogador sem morrer, para olhar o cenário). `window.survivalBonk.state()` e `.physics()` expõem o estado para mover o jogador ou a câmera pelo console. A física e a câmera relativa estão em `survivor-bonk.test.ts`; aparência e toque só se avaliam em aparelho real.
- **Harness da Mochila 3D** (`e2e/mochila-3d/`, ferramenta de desenvolvimento, **não roda no CI**): com `npx vite` rodando, abrir `/pokemon-tcg-ar/e2e/mochila-3d/index.html` (`?n=4` muda quantos tipos de item vão dentro). Monta o `BackpackView` real com uma mochila de exemplo, sem passar pela Vila. Serve para conferir materiais, costuras e o chaveiro; brilho, sensores e desempenho só se avaliam em aparelho real.
- **Harness do AR** (`e2e/ar-harness.html` e `.mjs`, `ar-harness-multi.*`): ferramenta de desenvolvimento, **não roda no CI**. Compila o alvo, inicia o rastreador com câmera falsa e imprime estado e leituras/s. Uso: `npx vite build -c e2e/vite.harness.config.mjs`, copiar `card.png` e `sprite.gif` para a pasta gerada, servir estaticamente e rodar `node e2e/ar-harness.mjs` com um vídeo `e2e/.tmp/cam.y4m` (feito com `ffmpeg`). Serve para comparar antes e depois de uma mudança (por exemplo, as leituras/s com e sem a normalização de contraste); roda com GL por software, então **os números não valem para celular**.

## Reconhecimento: medição sintética (2026-10-23)

`scripts/eval-recognition.eval.ts` (OCR e rede de verdade, em Node) mede o reconhecimento sobre **escaneamentos oficiais do TCGdex distorcidos por software** (três níveis: fácil, médio, difícil). **Não são fotos de câmera**, a amostra é pequena e a latência é de um PC, não de um celular. Rodar: `CATALOG_INDEX=public/data/catalog-index.json EVAL_SETS=14 EVAL_OUT=eval-results.json npx vitest run --config vitest.eval.config.ts scripts/eval-recognition.eval.ts` (gera também `eval-results.summary.json`; ~2 min).

| Medição | Nível | Cartas | Acertou | Errou com confiança | Não achou | Número lido pelo OCR |
| --- | --- | --- | --- | --- | --- | --- |
| Actions, 2026-10-18 | fácil | 33 | 39,4 % | 0 % | 54,5 % | 36,4 % |
| PC local, 2026-10-23 | fácil | 16 | 37,5 % | 0 % | 62,5 % | 37,5 % |
| PC local, 2026-10-23 | médio | 16 | 18,8 % | 0 % | 81,3 % | 31,3 % |
| PC local, 2026-10-23 | difícil | 16 | 12,5 % | 0 % | 87,5 % | 25,0 % |

- **O que isso diz:** a detecção do contorno acerta em 100 % dos casos e o app **nunca confirmou uma carta errada** (0 % em todos os níveis), que é a regra mais importante. O gargalo é o **OCR do número da carta**: lê o número certo em ~1/3 dos casos sintéticos, e sem o número o app prefere dizer «não achei» a chutar. Não houve regressão entre 18 e 23/10 (as amostras diferem em tamanho, então a diferença de ~2 pontos não é significativa).
- **O que isso não diz:** a taxa com a câmera de um celular continua **não medida**. No teste de ponta a ponta (navegador, nível fácil) 3 das 4 cartas foram identificadas, o que mostra que os dois ambientes não são equivalentes; nenhum dos dois substitui fotos reais.
- **Para medir de verdade:** reunir fotos de cartas físicas tiradas pelo celular (com a carta, a coleção e o número conferidos à mão), colocá-las em uma pasta de fixtures e rodar o mesmo pipeline sobre elas. Isso depende do dono fotografar as cartas.

## Vila com muitos moradores: engasgos de caminho (2026-10-23)

Relato: com 30 moradores a Vila ficava injogável. Causa medida **só na lógica**, num PC (não num celular, e sem o desenho): cada morador que anda até um destino a mais de 7 blocos refazia uma busca de caminho em largura a cada bloco, e a função de bloqueio (`occupied`) varria móveis, plantas, moradores e reservas, alocando arrays, a cada bloco visitado. Os moradores andam na mesma velocidade, então as buscas caíam no **mesmo quadro**: um engasgo periódico a cada ~0,4 s.

Correção: grade de blocos fixos refeita por quadro (`core/village/occupancy.ts`), reservas sem alocação (`BenchVisits.reserved`), buffers da busca reaproveitados e limite de 3 buscas de moradores por quadro (`PathBudget` em `core/village/pathing.ts`; quem joga nunca espera). O `update` começa por um morador diferente a cada quadro para ninguém ficar sempre no fim da fila.

`npx tsx scripts/village-path-bench.ts <moradores> <antigo|novo>` simula 60 s a 60 quadros/s (só caminhos). Resultado no PC de desenvolvimento:

| Moradores | Modo | p99 do `update` | Máximo | Quadros acima de 16,7 ms |
| ---: | --- | ---: | ---: | ---: |
| 30 | antigo | 60 ms | 96 ms | 150 de 3600 |
| 30 | novo | 7 ms | 21 ms | 1 de 3600 |
| 50 | antigo | 144 ms | 218 ms | 150 de 3600 |
| 50 | novo | 11 ms | 24 ms | 1 de 3600 |

O modo «antigo» já usa os buffers reaproveitados, então subestima um pouco o custo anterior. `occupancy.test.ts` compara a regra nova com a antiga em todos os blocos de um mapa com 30 moradores, e `pathing.test.ts` cobre o limite de buscas. **Não medido:** o tempo de quadro real no navegador/celular (inclui o desenho) e se o Café, os bancos e a fazenda continuam fluidos com muita gente; o desenho também pode pesar com 30 moradores.

## Desempenho da Vila e da Torre em CPU lenta (2026-10-23)

Medido com harnesses reais no Chromium (`e2e/village-perf.mjs` monta o `VillageGame`; `e2e/survival-perf.mjs` monta a Torre de verdade e injeta inimigos e orbes). `PERF_THROTTLE=6` limita a CPU a 1/6 para aproximar um celular de faixa média; sem isso, este PC não reproduz o engasgo. **Não é medição de celular**: a câmera, a GPU e o toque não entram.

| Cena (CPU 6x) | Versão | Resultado |
| --- | --- | --- |
| Vila, 30 moradores | e56b1a6f (antes da correção) | 14 quadros/s; `update` com picos de 500 ms |
| Vila, 30 moradores | 5f06aec0 (main) | `update` mediano 31 ms, quadro de 67 ms |
| Vila, 30 moradores | atual | `update` mediano 4 ms (+ `draw` 3 ms) |
| Vila, 50 moradores | e56b1a6f | 5 quadros/s; `update` com picos de 1.500 ms |
| Vila, 50 moradores | atual | `update` mediano 8 ms |
| Torre, 154 inimigos e 200 orbes | antes | 33 ms por quadro; 205 de 391 quadros acima de 33 ms |
| Torre, 154 inimigos e 200 orbes | atual | 16,7 ms por quadro; 1 de 602 acima de 33 ms |
| Torre, 301 inimigos e 399 orbes | antes | 50 ms por quadro (~20 fps) |
| Torre, 301 inimigos e 399 orbes | atual | 16,7 ms por quadro (60 fps) |

**Vila:** 30% do tempo estava em `blockedForResident`, que varria todos os moradores a cada bloco da busca de caminho. A grade de moradores (`core/village/occupancy.ts`, `MoverGrid`) corrige isso. O limite de buscas por quadro sozinho ajudava pouco.

**Torre:** três custos. (1) O estado era um `ref` profundo, então cada campo lido ou escrito pelo motor passava por um proxy do Vue (cerca de 35% do tempo); agora o laço e o desenho trabalham no objeto cru, com um `triggerRef` por quadro. (2) `save`/`restore`/`translate` por inimigo no desenho (cerca de 14%); sem espelho, o sprite é desenhado direto na posição. (3) Inimigos e orbes fora da câmera eram desenhados; agora só o que cai na câmera (com margem de 120 unidades) é pintado. Os orbes comuns viram um único caminho. Capturas antes e depois com o mesmo estresse mostram os mesmos orbes, as mesmas barras de vida e a mesma HUD.

**Paisagem da Torre:** com a câmera cheia de inimigos a paisagem ainda custava metade do quadro com CPU 12x (medido desligando-a com `?scenery=0`). Duas mudanças: o bioma passa a ser assado na camada da região (uma blitagem por região, em vez de duas) e cada blitagem cobre só o retângulo visível da câmera. Com 301 inimigos e 399 orbes a 12x: mediana de 33 ms por quadro para 16,7 ms; quadros acima de 33 ms: 210 de 420 para 62 de 537.

**Não medido:** o tempo no celular de verdade; a partida normal (sem injeção, a Torre tem dezenas de inimigos, não centenas); o custo de GPU da luz dos golpes.

Reproduzir: `PERF_THROTTLE=6 PERF_BASE=http://127.0.0.1:<porta> node e2e/village-perf.mjs 30 12` e `node e2e/survival-perf.mjs 150 200 10`, com um `npx vite` já rodando (a porta é a do servidor; o caminho do repositório precisa ser o do worktree que você mede).

## O que NÃO é coberto automaticamente

O registro de corridas concluídas da Torre, sua idempotência/migração, marcos de Pins e origem dos cosméticos também têm cobertura unitária em `src/core/trainer.test.ts` e `src/core/village/rewards.test.ts`. Esses testes validam somente o estado e os eventos puros; não medem desempenho em celular.

- **Câmera real, GPU e sensores.** Os testes automatizados não produzem medidas de fluidez, calor, bateria ou leituras/s de aparelhos físicos.
- **Precisão do reconhecimento** com fotos de celular: só há fotos de exemplo. Falta um conjunto de teste medido (ver o plano).
- **Pins, Caixa com muitos Pokémon e posição do Pokémon sobre a carta.** Simulações e capturas no Chromium, com serviços simulados, câmera falsa e GL por software, ajudam a conferir regras e integração, mas não estabelecem equilíbrio, precisão ou desempenho no hardware de um celular.
- **Conselho comunitário.** `src/core/village/community.test.ts` cobre proposta de reforço de cozinha apenas após escassez registrada, desbloqueio do Café e receita com insumos reais; reserva dos ingredientes contra cozinha, presentes, venda e gastos manuais; decisões sem consumo imediato; conclusão por atividade real, histórico/idempotência, expiração sem gasto e default de saves antigos. Isso valida somente a lógica pura, não o balanceamento em uma comunidade jogada por semanas.
- **Aparência dos efeitos** (luz dos golpes, suavização de pixels, câmera de cinema) em tela e GPU de celular. Capturas do Chromium com GL por software têm esse limite.
- **Vila em AR.** O diorama é validado junto dos cálculos puros de escala/folga (`src/core/village/ar-diorama.test.ts`) e de plano e orientação da Caixa (`src/box/floor.test.ts`, `src/box/orientation*.test.ts`). Ele usa a câmera traseira, orientação e uma altura estimada; não detecta mesa, chão ou deslocamento espacial. Câmera e sensores reais continuam dependendo de aparelho.
- **PvP em redes reais.** Testes dos códigos e mensagens não garantem que o pareamento WebRTC atravessa NAT/CGNAT de uma operadora nem medem latência e quedas entre dois aparelhos.
- **Instalação do PWA e uso offline.**
- **Disponibilidade e CORS dos serviços externos** a partir do navegador do celular (foram medidos no GitHub Actions).
- **Se a normalização de contraste melhora o reconhecimento em luz difícil:** o teste sintético passava com e sem ela.

## Roteiro manual

### Casas, bairros e economia da Vila

`home-improvements.test.ts`, `village-expansion.test.ts` e `village-economy-backup.test.ts` cobrem móveis, reformas compatíveis, rotas de ida/volta, trabalho por 12 minutos, população mínima, salários, pedidos do Café e backup. Regras e limites em [VILLAGE_NEIGHBORHOODS.md](VILLAGE_NEIGHBORHOODS.md).

Com Vite aberto, rode `APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ node e2e/village-neighborhoods.mjs`. `BROWSER_PATH` seleciona o executável do Chromium; `SCREENSHOT_DIR` guarda capturas. O script usa armazenamento descartável, valida retrato/paisagem, exame dos móveis, porta, guias do minimapa e caminhada até a praia. Não representa teste de AR, reconhecimento ou desempenho móvel.

O procedimento de referência está em [TESTE_NO_CELULAR.md](TESTE_NO_CELULAR.md). Relatos em aparelho físico e resultados automatizados são evidências complementares; nenhum deles deve ser apresentado como medição do outro.

## Backup e nuvem

`backup-safety.test.ts` verifica exportação completa com IndexedDB e Cache Storage, exportação repetida, round-trip em um perfil novo (incluindo chaves dinâmicas, Unicode, valor vazio, carta, metadados, arquivos de 1 MB e compressão), ZIP truncado, conteúdo alterado/ausente/omitido do manifesto e recuperação após falhas de cache ou localStorage. A interface mostra progresso durante leitura, validação, compactação e restauração; o importador identifica o backup pelo conteúdo, então `.dat`, `.zip` e JSON antigo continuam aceitos. `drive-backup.test.ts`, `drive-login.test.ts` e `CloudBackup.test.ts` usam respostas simuladas para verificar escopo privado, autorização/cancelamento, erros de rede, cópias independentes, tamanho confirmado, token fora do armazenamento e confirmação antes de restaurar. Não validam uma conta Google real. Configuração e limites em [BACKUP_NUVEM.md](BACKUP_NUVEM.md).

A regressão da interface é coberta por `TreinadorBackup.test.ts`: o arquivo validado usa `shallowRef`, pois proxies reativos não podem ser clonados pelo IndexedDB. `e2e/backup-roundtrip.mjs` faz exportação e importação pela interface em um perfil descartável, em retrato e paisagem, preservando um arquivo de 1 MB e exigindo confirmação. Rode com Vite dev server em `http://127.0.0.1:4192/pokemon-tcg-ar/` e `node e2e/backup-roundtrip.mjs`; `BACKUP_TEST_URL` e `BROWSER_EXECUTABLE` permitem ajustar o ambiente. O script não usa contas Google reais.
