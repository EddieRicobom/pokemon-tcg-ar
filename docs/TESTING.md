# Testes

Estado em 2026-10-15: 111 arquivos de teste, 1172 testes unitários, todos passando. **Nenhum teste automatizado substitui um celular de verdade** (câmera, GPU, sensores e desempenho reais).

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
| `src/core/village/`, `src/village/` | Vila: mapa, coleta, horta, loja, pesca, cozinha e comida de presente, catálogo (toda peça tem arte; altos com 16×32; luzes e animações), **vida social** (`social.test.ts`: 401 modelos todos possíveis, falas válidas, sorteio determinístico, datas especiais e aniversários só no dia certo, nome do treinador nas falas, resultados e escolhas, casal e briga, Diário de 60 com Álbum permanente de 500, intervalo de 80–170 s, marcos guardados sozinhos, ausência, comentários, mapa de relações, arquivos antigos e lixo no disco) as **perguntas e bordões** (`quiz.test.ts`: limites por Pokémon e por dia, respostas limpas, reação, seguimento, ecos, bordões espalhados), a **cidade** (`town.test.ts`: terrenos e prédios por nível, moradores por casa, sono, enfeites e telhado, correio e café, bater na porta com sono pesado e recusa, o bairro dos jogos por nível, arquivos antigos; `town-art.test.ts`: toda peça da cidade desenha, inclusive Fliperama, Pista de Pins e Arena) e a arte (`player-art.test.ts`: os 40 treinadores têm visual próprio e distinto, desenhável em 4 direções e todos os passos) |
| `src/components/QuizDialog.test.ts` | A conversa de perguntas: responder só com texto, sugestões, opções do seguimento e fala final |
| `src/cache/` | Cache de cartas (IndexedDB falso) e arquivos |
| `src/App.test.ts` | Montagem da interface |

O WebGL real não roda no happy-dom: a lógica é mantida pura e testada; a cola com o navegador (desenho, câmera, sensores) fica fora dos testes unitários. Trechos de shader são conferidos como texto (que o patch injeta o que deve), não compilados.

## Outras verificações (não fazem parte de `npm test`)

- **Teste de ponta a ponta** (`e2e/`, `e2e.yml`, branches `claude/**`): Playwright com Chromium e câmera falsa (vídeo gerado de um escaneamento oficial da carta), reconhece, guarda e mostra em AR. **Não é obrigatório e hoje falha em parte dos casos** (CORS ao buscar imagens do TCGdex de `localhost` e falha ao carregar o worker do OCR no runner). Está no plano para ser consertado.
- **Avaliações com rede** (`scripts/*.eval.ts`, `vitest.eval.config.ts`): reconhecimento com cartas reais e OCR real, só no GitHub Actions.
- **Verificação externa** (`external-verification.yml`): API e CDN do TCGdex (status, CORS, formato) e sprites do PokeAPI. Medido em 2026-10-11: o índice do catálogo tem 220 coleções e 23.736 cartas.
- **Harness do AR** (`e2e/ar-harness.html` e `.mjs`, `ar-harness-multi.*`): ferramenta de desenvolvimento, **não roda no CI**. Compila o alvo, inicia o rastreador com câmera falsa e imprime estado e leituras/s. Uso: `npx vite build -c e2e/vite.harness.config.mjs`, copiar `card.png` e `sprite.gif` para a pasta gerada, servir estaticamente e rodar `node e2e/ar-harness.mjs` com um vídeo `e2e/.tmp/cam.y4m` (feito com `ffmpeg`). Serve para comparar antes e depois de uma mudança (por exemplo, as leituras/s com e sem a normalização de contraste); roda com GL por software, então **os números não valem para celular**.

## O que NÃO é coberto automaticamente

- **Câmera real, GPU e sensores.** Nenhuma medida de fluidez, calor, bateria ou leituras/s num aparelho.
- **Precisão do reconhecimento** com fotos de celular: só há fotos de exemplo. Falta um conjunto de teste medido (ver o plano).
- **Pin Mode, Caixa com 40 e posição do Pokémon sobre a carta** foram vistos só no Chromium (390×780, PokeAPI/TCGdex simulados, câmera falsa e GL por software): a física, o equilíbrio (simulação IA × IA: ~5–7 disparos por partida, 3×3 perto de 50 %) e a aparência/inclinação/sombra no AR **não** foram medidos em celular.
- **Aparência dos efeitos** (luz dos golpes, suavização de pixels, câmera de cinema) em tela e GPU de celular. Foram vistos em capturas do Chromium com GL por software.
- **Instalação do PWA e uso offline.**
- **Disponibilidade e CORS dos serviços externos** a partir do navegador do celular (foram medidos no GitHub Actions).
- **Se a normalização de contraste melhora o reconhecimento em luz difícil:** o teste sintético passava com e sem ela.

## Roteiro manual

O passo a passo em aparelho real está em [TESTE_NO_CELULAR.md](TESTE_NO_CELULAR.md). Registre aparelho, navegador, o que passou e o que falhou (no pull request ou numa issue).
