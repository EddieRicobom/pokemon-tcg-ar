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
- ✅ Caixa de Pokémon soltos no chão pelo giroscópio, equipe de até 40 com escalação por lado, formação, tela cheia.
- ✅ Telas com câmera em modo imersivo (a imagem cobre a janela; avisos no topo e folhas sobre a imagem, sem rolar). 🔶 Falta ver em celular real.
- ✅ Rastreio: pose repetida pelo MindAR não segura mais o Pokémon (some em poucos segundos); foco/exposição contínuos e 720p. 🔶 Efeito do foco e do 720p só em celular real.
- ✅ Batalha automática de exibição: motor puro e seeded (nível 50, tipos, STAB, críticos, defesa, condições, personalidades), arena pequena à frente do olhar, golpes encenados por tipo, câmera de cinema, **luz dos golpes** (sprites, chão e vídeo) com opção de desligar, **sons sintetizados** (golpes por tipo e fanfarra do vencedor, com opção de desligar), resumo no visor. O áudio em celular real ainda não foi ouvido (🔶).
- ✅ **Modos de batalha**: todos contra todos (padrão, com todos da caixa), equipes e 3 contra 3 em revezamento, com placar, cores das equipes e faixa de vitória por equipe. Validado só no Chromium com câmera falsa.
- ✅ **Chão em pixel art e terreno**: arena e caixa com chão de blocos (grama, flores, mato, trilha) e enfeites de pé; golpes elementais marcam o chão e certas combinações reagem; opção para desligar. Validado só no Chromium com câmera falsa.
- ✅ **Minigames**: Quem é esse Pokémon? (das cartas, por geração ou aleatório), Duelo de tipos e Memória, com XP.
  - ⬜ Pendente (não é bug novo desta sessão, só anotado): no "Quem é esse Pokémon?" a silhueta aparece 100% visível por alguns quadros antes de escurecer. Quando for corrigido, o modo difícil ganha algum indicador visual do filtro aplicado (ex.: mostrar só metade da imagem, ou um leve giro/"swirl") em vez de só escurecer, só no difícil.
- ✅ **Pin Mode** (aba Pins, sem câmera): pins redondos numa arena vista de cima, física com peso/atributos/velocidade/tipos, chão em blocos igual ao da Caixa (marcas dos golpes elementais, reações e atrito por tipo, com opção de desligar), resposta do adversário a cada disparo, golpes da carta como efeitos com recarga e energia igual ao XP. Validado só no Chromium com dados simulados.
- ✅ **Pokémon sobre a carta**: GIF no centro da ilustração, inclinado 30° para trás, com sombra suave e brilho no chão (desligáveis). Validado só no Chromium com câmera falsa.
- ✅ **Treinador**: nível e XP, sequência diária, missões do dia, coleção por set e conquistas, com avisos de recompensa; só no aparelho.
- ⬜ O **RPG de ação** planejado (escanear cartas para montar equipe e jogar): a batalha é só exibição, sem escolha de golpes pelo jogador, itens, trocas nem progressão.

### Vila (modo vida) 🔶
- ✅ Vida solta no chão (gira pelo giroscópio, igual à Caixa): andar, coletar, plantar, cozinhar, mobília, roupa, amizade e momentos entre os Pokémon, Fliperama, Arena (liga e PvP), loja, construção da cidade. Visual em pixel art desenhado por código (`village/*-art.ts`), não sprites prontos de tileset. Só no Chromium com câmera falsa; 🔶 nunca visto em celular real.
- ✅ Pose "Idle" da Vila usa o pacote de sprites local (`public/sprites/`, PMD SpriteCollab via poke-survivor, créditos no `THIRD_PARTY_NOTICES.md`) quando a espécie está nele; senão cai pro GIF já baixado pela Caixa.
- ✅ **Zona de Sobrevivência** (prédio próprio, a Torre — não é um minigame do Fliperama, é um modo igual à Arena/Pins): espelha o LAÇO do [poke-survivor](https://github.com/JayElDragon/poke-survivor) — analógico/WASD para andar, autoataque sozinho no inimigo mais perto, orbes de XP, upgrade a cada nível, ondas que ficam mais difíceis com o tempo, chefe periódico, resumo ao morrer. Motor puro e testado em `core/survivor.ts`. Usa o mesmo pacote de sprites locais (animação "Walk") para o seu Pokémon e para os inimigos, e um recorte real de um dos tilesets enviados (`public/tilesets/`, créditos no `THIRD_PARTY_NOTICES.md`) como chão — um ladrilho só, repetido; ainda não é um mapa com vários tipos de terreno. **Não é** um port do poke-survivor: nenhum sistema de gacha, missão, conquista ou fenda de lendário foi trazido, e os upgrades/números são originais, sem balanceamento por jogo real ainda (só testes automatizados do motor). 🔶 Nunca jogado em celular real.
- ⬜ O resto da Vila (cidade, construção, momentos, livro, etc.) não está detalhado aqui ainda — ver o código em `src/core/village/`, `src/village/` e `src/components/VillageView.vue`.
- ⬜ Visual da Vila com tilesets (GBA/NDS) no lugar do pixel art desenhado por código: planejado, ainda não feito (só a Sobrevivência usa um tileset até agora).
- ⬜ Vídeo game comprável na Vila, desbloqueando minigames extras (ex.: um "atirar nas pokébolas" estilo Duck Hunt): pedido, em espera por enquanto.

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
