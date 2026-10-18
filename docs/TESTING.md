# Testes

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
| `src/core/village/`, `src/village/` | Vila: mapa, coleta, horta, loja, pesca, cozinha, presentes e arte; vida social, perguntas e bordões, apelidos, pedidos e prêmios; Diário e Álbum; casas, terrenos e prédios por nível, café, correio, caminhos e migração de salvamentos. A Vila em AR usa o canvas completo do mapa como textura de um diorama em `src/ar/start-village.ts`; os cálculos de plano estimado e orientação são compartilhados com a Caixa. Consulte os arquivos `*.test.ts` dessas pastas para os casos concretos. |
| `src/components/QuizDialog.test.ts` | A conversa de perguntas: responder só com texto, sugestões, opções do seguimento e fala final |
| `src/core/survivor*.test.ts` | Torre: simulação das ondas, combate, upgrades, golpes por tipo e atributos, evoluções, treinadores, chefão final, resumo e modo infinito |
| `src/core/pins.test.ts`, `pin-ai.test.ts`, `pin-replay.test.ts`, `src/app/pins-setup.test.ts` | Física dos Pins, decisões do computador, gravação/reprodução e normalização das opções guardadas |
| `src/core/league.test.ts`, `src/pvp/*.test.ts` | Progressão da Liga, códigos de convite/resposta, compactação SDP e validação das mensagens dos Pins e da Caixa; não abre uma conexão WebRTC entre aparelhos |
| `src/app/wallet.test.ts`, `pokemon-data-service.test.ts`, `backup.test.ts` | Saldo único de moedas, valores inválidos, recusa de gravação, cache de batalha corrompido, carregamento parcial e exportação/restauração do backup |
| `src/cache/` | Cache de cartas (IndexedDB falso) e arquivos |
| `src/App.test.ts` | Montagem da interface |

O WebGL real não roda no happy-dom: a lógica é mantida pura e testada; a cola com o navegador (desenho, câmera, sensores) fica fora dos testes unitários. Trechos de shader são conferidos como texto (que o patch injeta o que deve), não compilados.

## Outras verificações (não fazem parte de `npm test`)

- **Teste de ponta a ponta** (`e2e/`, `e2e.yml`, branches `claude/**`, `codex/**` e `Codex/**`, ou execução manual): Playwright com Chromium e câmera falsa (vídeo gerado de um escaneamento oficial da carta), percorre reconhecimento, armazenamento e AR. É um workflow separado do CI; os artefatos `e2e-resultados` e as anotações registram o resultado de cada execução, incluindo falhas de rede, CORS ou OCR.
- **Avaliações com rede** (`scripts/*.eval.ts`, `vitest.eval.config.ts`): reconhecimento com cartas reais e OCR real, só no GitHub Actions.
- **Bancada do scanner** (`scripts/scan-bench.eval.ts`, sem rede): roda o `ScanController` e o `RecognitionPipeline` reais com Tesseract de verdade no Node sobre a foto real `meowth-jungle-56.jpg`, em dois roteiros fixos (carta mexendo 3 quadros e depois parada; carta parada desde o 1º quadro). Imprime tempo até confirmar, passadas de OCR, referências carregadas e quadros. Catálogo e referências são de teste: **mede custo, não acerto**, e é um PC, não um celular. Para comparar antes/depois, rode o mesmo arquivo nas duas versões: `npx vitest run -c vitest.eval.config.ts scripts/scan-bench.eval.ts --silent=false`.
- **Tempos por etapa no aparelho**: Escanear → Teste → "Mostrar o que o app está vendo" mostra o tempo de cada etapa da última leitura (e as puladas, com o motivo); Diagnóstico → "Tempo de cada etapa" mostra mediana e p90 da sessão. É o jeito de medir no celular de verdade.
- **Verificação externa** (`external-verification.yml`): API e CDN do TCGdex (status, CORS, formato) e sprites do PokeAPI. Consulte o relatório da execução para disponibilidade e tamanho do catálogo naquele momento.
- **Harness do AR** (`e2e/ar-harness.html` e `.mjs`, `ar-harness-multi.*`): ferramenta de desenvolvimento, **não roda no CI**. Compila o alvo, inicia o rastreador com câmera falsa e imprime estado e leituras/s. Uso: `npx vite build -c e2e/vite.harness.config.mjs`, copiar `card.png` e `sprite.gif` para a pasta gerada, servir estaticamente e rodar `node e2e/ar-harness.mjs` com um vídeo `e2e/.tmp/cam.y4m` (feito com `ffmpeg`). Serve para comparar antes e depois de uma mudança (por exemplo, as leituras/s com e sem a normalização de contraste); roda com GL por software, então **os números não valem para celular**.

## O que NÃO é coberto automaticamente

- **Câmera real, GPU e sensores.** Os testes automatizados não produzem medidas de fluidez, calor, bateria ou leituras/s de aparelhos físicos.
- **Precisão do reconhecimento** com fotos de celular: só há fotos de exemplo. Falta um conjunto de teste medido (ver o plano).
- **Pins, Caixa com muitos Pokémon e posição do Pokémon sobre a carta.** Simulações e capturas no Chromium, com serviços simulados, câmera falsa e GL por software, ajudam a conferir regras e integração, mas não estabelecem equilíbrio, precisão ou desempenho no hardware de um celular.
- **Aparência dos efeitos** (luz dos golpes, suavização de pixels, câmera de cinema) em tela e GPU de celular. Capturas do Chromium com GL por software têm esse limite.
- **Vila em AR.** O diorama é validado junto dos cálculos puros de plano e orientação da Caixa (`src/box/floor.test.ts`, `src/box/orientation*.test.ts`). Ele usa a câmera traseira, orientação e uma altura estimada; não detecta uma mesa ou chão. Câmera e sensores reais continuam dependendo de aparelho.
- **PvP em redes reais.** Testes dos códigos e mensagens não garantem que o pareamento WebRTC atravessa NAT/CGNAT de uma operadora nem medem latência e quedas entre dois aparelhos.
- **Instalação do PWA e uso offline.**
- **Disponibilidade e CORS dos serviços externos** a partir do navegador do celular (foram medidos no GitHub Actions).
- **Se a normalização de contraste melhora o reconhecimento em luz difícil:** o teste sintético passava com e sem ela.

## Roteiro manual

O procedimento de referência está em [TESTE_NO_CELULAR.md](TESTE_NO_CELULAR.md). Relatos em aparelho físico e resultados automatizados são evidências complementares; nenhum deles deve ser apresentado como medição do outro.
