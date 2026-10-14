# Plano e estado do projeto

Legenda: ✅ feito e coberto por testes automatizados / CI · 🔶 feito, **falta validar em celular real** · ⬜ a fazer

Regra do plano: nada é dado como "funciona" sem verificação. Tudo marcado 🔶 passou nos testes e no Chromium com câmera falsa (GL por software), mas **nenhuma etapa foi vista num celular de verdade**. O roteiro está em [docs/TESTE_NO_CELULAR.md](docs/TESTE_NO_CELULAR.md).

## Estado atual

### Base e infraestrutura ✅
- Vue 3 + TypeScript estrito + Vite 8 + PWA em pt-BR, instalável, com cache offline e base path do GitHub Pages.
- CI (`ci.yml`) com tipos, testes, build e conferência do `dist/`; deploy (`deploy.yml`) na `main` e toda semana; verificação externa (TCGdex e sprites) e e2e em branches `claude/**`.
- Licença MIT (`LICENSE`) e avisos de terceiros (`THIRD_PARTY_NOTICES.md`).

### Catálogo e reconhecimento 🔶
- ✅ Índice estático do catálogo gerado no deploy (220 coleções, 23.736 cartas, medido em 2026-10-11); índice de ilustrações opcional (112 bytes por carta, incremental).
- ✅ Detecção do contorno (bordas, máscara de primeiro plano e retas por Hough), endireitamento 630×880, OCR da faixa inferior e do nome, fusão de evidências com limiares do pokeum, confirmação em vários quadros.
- ✅ Testes com fotos reais (`src/recognition/__fixtures__/photos`) e com imagens sintéticas.
- 🔶 **Taxa de acerto com a câmera de um celular: não medida.** Os testes cobrem fotos de exemplo, não uma amostra estatística.
- 🔶 CORS do TCGdex e dos sprites: medidos no GitHub Actions (2026-10-11), mas não no navegador de um celular.

### AR sobre a carta 🔶
- ✅ Alvo MindAR compilado no aparelho e guardado no cache; rastreador com janela de busca maior, pose suavizada e giroscópio (pose presa ao mundo entre as leituras).
- ✅ Luz difícil: contraste local normalizado (1 quadro a cada 3) e alvo em cinza de luminância (`TARGET_VERSION` 3).
- ✅ Sprite GIF em pé sobre a carta, com 4 modos de suavização dos pixels; painel de status no chão; ajuste com os dedos; busca manual da carta.
- ✅ **Várias** cartas ao mesmo tempo (até 4).
- 🔶 Fluidez, calor e leituras/s em celular real: não medidos. No Chromium sem GPU: ~6–8 leituras/s com a normalização de luz; ~7–11 sem ela.

### Caixa e batalha 🔶
- ✅ Caixa de Pokémon soltos no chão pelo giroscópio, equipe de até 6, formação, tela cheia.
- ✅ Batalha automática de exibição: motor puro e seeded (nível 50, tipos, STAB, críticos, defesa, condições, personalidades), arena pequena à frente do olhar, golpes encenados por tipo, câmera de cinema, **luz dos golpes** (sprites, chão e vídeo) com opção de desligar, **sons sintetizados** (golpes por tipo e fanfarra do vencedor, com opção de desligar), resumo no visor. O áudio em celular real ainda não foi ouvido (🔶).
- ⬜ O **RPG de ação** planejado (escanear cartas para montar equipe e jogar): a batalha é só exibição, sem escolha de golpes pelo jogador, itens, trocas nem progressão.

## Próximos passos (em ordem sugerida)

1. ⬜ **Validar tudo num celular real** seguindo o roteiro; anotar aparelho, navegador, leituras/s e o que falhar. É o maior risco aberto.
2. ⬜ **Medir o reconhecimento** com fotos reais de cartas (conjunto, taxa de acerto, tempo) e publicar em `docs/TESTING.md`.
3. ⬜ **Consertar o e2e** (`e2e.yml`): hoje falha por erros de CORS ao buscar imagens do TCGdex de `localhost` e por falha ao carregar o worker do OCR no runner. Não é obrigatório no CI, mas precisa voltar a ser um sinal confiável antes de virar requisito.
4. ⬜ **Avaliar mais ideias do Momentoos** para rastreio difícil: variantes deformadas do alvo (ângulos fortes), pose flexível (carta torta) e resolução de rastreio adaptativa. Custo: alvos maiores e compilação mais lenta; só vale se a medição no celular mostrar perdas em ângulo.
5. ⬜ **Desempenho**: o chunk do TensorFlow.js (~1,1 MB sem compactar) e o do Three.js (~0,5 MB) só carregam ao usar AR/Caixa, mas o custo no celular não foi medido. `ScanView.vue` (~830 linhas) e `battle-director.ts` (~1150) merecem ser divididos antes de crescerem mais.
6. ⬜ **Direção do RPG**: definir com o dono o que vem primeiro (exploração, escolha de golpes, progressão) e reaproveitar o motor de `src/core/battle.ts`.
7. ⬜ **PWA**: matriz de aparelhos (Chrome/Android e Safari/iOS), orçamento de bateria, comportamento offline completo.

## Decisões em aberto

1. **Sprites**: hoje vêm do repositório PokeAPI/sprites (GIF `other/showdown`) em tempo de execução, com espelho no jsDelivr. Direitos sobre os desenhos pertencem aos titulares; o app não redistribui nada: o celular baixa o arquivo na hora.
2. **Imagens e dados de cartas**: vêm do TCGdex, só das cartas que o usuário escaneia, e ficam no aparelho dele.
3. **Direitos e marca**: projeto de fã, não oficial. Não publicar como produto sem revisar o uso de marcas e imagens.

## Riscos conhecidos

- Tudo que depende de câmera, GPU, sensores e desempenho de celular real continua sem medição.
- O reconhecimento por OCR sofre com foco macro, reflexo e carta torta; a busca pela ilustração é só reserva e impressões com a mesma arte continuam ambíguas.
- O giroscópio acompanha o giro, não a caminhada (sem SLAM no navegador).
- Limites do iOS Safari para câmera, WebGL, sensores e instalação do PWA.
- Dependência de serviços externos de terceiros (TCGdex, PokeAPI, jsDelivr) sem garantia de disponibilidade.
