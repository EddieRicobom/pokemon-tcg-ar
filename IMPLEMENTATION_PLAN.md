# Plano de implementação

Legenda: ✅ feito e verificado · 🔶 feito, mas falta validar em aparelho real · ⬜ a fazer

Regra do plano: nenhuma fase é marcada como concluída sem um critério de pronto verificável. Reconhecimento e AR só entram quando forem reais.

## Fase 0: Fundação ✅ (esta entrega)

- ✅ Vue 3 + TypeScript + Vite 8 + `vite-plugin-pwa` + Three.js, em português do Brasil
- ✅ Base path do GitHub Pages (`/pokemon-tcg-ar/`) em `base`, manifest, `start_url` e `scope`
- ✅ Workflows `ci.yml` (tipos, testes, build, conferência do base path) e `deploy.yml` (Pages)
- ✅ Núcleo testado: capacidades do navegador, câmera, URLs do Showdown, decodificação de GIF
- ✅ Documentação e análise do pokeum
- 🔶 Câmera, WebGL e instalação do PWA em aparelho real (checklist em `docs/TESTING.md`)
- 🔶 Deploy no GitHub Pages: depende de ativar **Settings → Pages → Source: GitHub Actions** e do merge na `main`

**Pronto quando:** CI verde no pull request; após o merge, o app abre em `https://eddiericobom.github.io/pokemon-tcg-ar/` e instala no celular.

## Fase 1: Viabilidade dos sprites do Showdown ⬜

Risco: não sabemos se o servidor do Showdown libera CORS nem se os nomes de arquivo seguem a convenção assumida em `src/core/showdown.ts`. O sandbox de desenvolvimento não alcança o servidor.

- ⬜ Pelo botão "Carregar GIF do Showdown" em um celular, testar espécies comuns, formas (Mega, Alola, Galar) e nomes com símbolos (Mr. Mime, Nidoran, Farfetch'd, Ho-Oh).
- ⬜ Se houver CORS: avaliar cache em runtime pelo Service Worker (`CacheFirst`, só respostas 200).
- ⬜ Se não houver CORS: baixar os GIFs necessários no GitHub Actions e publicá-los junto do site.
- ⬜ Decidir a questão de direitos de uso antes de redistribuir qualquer sprite (ver "Decisões em aberto").

**Pronto quando:** existe uma decisão registrada (runtime x build) com evidência de um aparelho real.

## Fase 2: Pipeline de catálogo no CI ⬜

Python só como ferramenta de build, rodando no GitHub Actions.

- ⬜ Baixar metadados do catálogo (fonte candidata: TCGdex, a mesma do pokeum) começando por **um único set**, para validar o formato antes de escalar.
- ⬜ Tabela carta → espécie do Pokémon → arquivo de GIF do Showdown. Cartas de Treinador e Energia não têm Pokémon e ficam de fora. Verificar nos dados da fonte se há número da Pokédex por carta.
- ⬜ Gerar o índice estático (hashes perceptuais primeiro; embeddings na Fase 4) como arquivos binários publicados no artefato do Pages, não commitados.
- ⬜ Workflow agendado/manual que regera o índice quando sair set novo.

**Pronto quando:** o CI gera o índice de um set, o app o baixa e há teste que confere o formato.

## Fase 3: Detecção e retificação da carta no navegador ⬜

- ⬜ Decidir a biblioteca de visão (ver `docs/ARCHITECTURE.md`, decisão sobre a biblioteca de AR): OpenCV.js x implementação própria enxuta.
- ⬜ Detectar o contorno quadrilátero da carta em cada quadro (em Web Worker, para não travar a interface).
- ⬜ Corrigir a perspectiva para uma imagem plana de 630×880, a proporção da carta.
- ⬜ Mostrar o contorno detectado sobre a câmera (visualização honesta do que o detector vê).

**Pronto quando:** em aparelho real, o contorno acompanha uma carta real sobre a mesa com iluminação normal, com taxa de quadros medida e registrada.

## Fase 4: Reconhecimento ⬜

- ⬜ Hash perceptual da carta retificada contra o índice (busca pelo vizinho mais próximo).
- ⬜ Avaliar embeddings por rede neural no navegador (onnxruntime-web) para tolerar reflexo e ângulo; medir tamanho do modelo e latência antes de adotar.
- ⬜ Opcional: OCR do número da carta como reforço de pontuação, nunca como filtro rígido.
- ⬜ Fusão dos sinais, com nível de confiança. Se for dúvida, mostrar o melhor palpite e as alternativas, nunca um palpite disfarçado de certeza.
- ⬜ Conjunto de fotos reais de teste, com taxa de acerto medida e registrada.

**Pronto quando:** acerto medido em fotos reais, publicado em `docs/TESTING.md`, e a interface mostra a confiança.

## Fase 5: AR sobre a carta ⬜

- ⬜ Pose a partir dos 4 cantos (homografia → pose, com suposição de lente), câmera em perspectiva no Three.js.
- ⬜ GIF em pé sobre o plano da carta (cartaz que gira só em torno do eixo vertical), com suavização para reduzir tremor.
- ⬜ Comportamento ao perder a carta: some com transição, nunca congela na tela.

**Pronto quando:** em aparelho real, o Pokémon acompanha a carta ao movê-la e some ao tirá-la do quadro.

## Fase 6: Robustez do PWA ⬜

- ⬜ Cache offline do índice e dos GIFs já vistos.
- ⬜ Orçamento de desempenho e consumo de bateria; limite de taxa de processamento.
- ⬜ Testes de ponta a ponta em navegador (Playwright no GitHub Actions) para o que der para automatizar.
- ⬜ Matriz de aparelhos: Chrome no Android e Safari no iOS.

## Decisões em aberto

1. **Biblioteca de AR/visão.** Não adotamos AR.js nem MindAR agora: eles rastreiam marcadores ou imagens pré-compiladas e não escalam para um catálogo de cerca de 20 mil cartas. A escolha é na Fase 3. Isso foi um desvio consciente de "usar uma biblioteca de AR" na Fase 0 e precisa da sua concordância.
2. **Origem dos GIFs:** runtime ou publicados pelo CI (Fase 1).
3. **Licença do repositório.** O `package.json` declara MIT, mas não existe arquivo `LICENSE`. Definir antes de aceitar contribuições.
4. **Direitos sobre imagens e sprites.** Cartas e sprites são material protegido. O plano é o índice guardar apenas dados derivados (hashes e embeddings), não as imagens das cartas. Para os sprites, a decisão está na Fase 1.

## Riscos conhecidos

- CORS e nomes de arquivo do Showdown não verificados.
- Desempenho de detecção e reconhecimento em celulares modestos: só se sabe medindo.
- Limites do iOS Safari para câmera, WebGL e instalação do PWA.
- Tamanho do índice e do modelo no tráfego do usuário (estimativas na arquitetura, ainda sem medição).
