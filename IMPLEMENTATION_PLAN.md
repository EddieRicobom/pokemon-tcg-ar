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
  - ✅ "Quem é esse Pokémon?" ganhou dificuldade (Normal/Difícil). Corrigido o bug de a silhueta aparecer visível por um instante ao trocar de pergunta (era a transição de CSS tocando ao escurecer, não só ao revelar — agora só anima a revelação). No Difícil, em vez de só escurecer, a silhueta ganha um contorno distorcido (filtro SVG de deslocamento) e um aviso "🌀 Difícil: contorno distorcido de propósito", pra deixar claro que é um filtro de dificuldade, não um bug.
- ✅ **Pin Mode** (aba Pins, sem câmera): pins redondos numa arena vista de cima, física com peso/atributos/velocidade/tipos, chão em blocos igual ao da Caixa (marcas dos golpes elementais, reações e atrito por tipo, com opção de desligar), resposta do adversário a cada disparo, golpes da carta como efeitos com recarga e energia igual ao XP. Validado só no Chromium com dados simulados.
- ✅ **Pokémon sobre a carta**: GIF no centro da ilustração, inclinado 30° para trás, com sombra suave e brilho no chão (desligáveis). Validado só no Chromium com câmera falsa.
- ✅ **Treinador**: nível e XP, sequência diária, missões do dia, coleção por set e conquistas, com avisos de recompensa; só no aparelho.
- ⬜ O **RPG de ação** planejado (escanear cartas para montar equipe e jogar): a batalha é só exibição, sem escolha de golpes pelo jogador, itens, trocas nem progressão.

### Vila (modo vida) 🔶
- ✅ Vida solta no chão (gira pelo giroscópio, igual à Caixa): andar, coletar, plantar, cozinhar, mobília, roupa, amizade e momentos entre os Pokémon, Fliperama, Arena (liga e PvP), loja, construção da cidade. Visual majoritariamente em pixel art desenhado por código (`village/*-art.ts`); a grama já usa um recorte real de tileset (ver abaixo), o resto (trilha, água, areia, canteiro, árvores, pedras, casas, lojas) ainda não. Só no Chromium com câmera falsa; 🔶 nunca visto em celular real.
- ✅ Pose "Idle" da Vila usa o pacote de sprites local (`public/sprites/`, PMD SpriteCollab via poke-survivor, créditos no `THIRD_PARTY_NOTICES.md`) quando a espécie está nele; senão cai pro GIF já baixado pela Caixa.
- ✅ Pokémon da Vila ancorados pela caixa real de pixels do sprite (`contentBounds` em `village/local-sprite.ts`), não pelo quadro inteiro da folha: tamanho e pé no chão consistentes entre espécies, sem fator de ajuste por olho. Conferido visualmente (fora do repositório, não commitado) com Pikachu, Snorlax, Diglett, Charizard e Onix lado a lado numa linha de chão — pés alinhados nos cinco.
- ✅ **Zona de Sobrevivência** (prédio próprio, a Torre — não é um minigame do Fliperama, é um modo igual à Arena/Pins): espelha o LAÇO do [poke-survivor](https://github.com/JayElDragon/poke-survivor) — analógico/WASD para andar, autoataque sozinho no inimigo mais perto, orbes de XP, upgrade a cada nível, ondas que ficam mais difíceis com o tempo, chefe periódico, resumo ao morrer. Motor puro e testado em `core/survivor.ts`. Usa o mesmo pacote de sprites locais (animação "Walk") para o seu Pokémon e para os inimigos, e um recorte real de um dos tilesets enviados (`public/tilesets/`, créditos no `THIRD_PARTY_NOTICES.md`) como chão — um ladrilho só, repetido; ainda não é um mapa com vários tipos de terreno. **Não é** um port do poke-survivor: nenhum sistema de gacha, missão, conquista ou fenda de lendário foi trazido, e os upgrades/números são originais, sem balanceamento por jogo real ainda (só testes automatizados do motor).
  - ✅ Antes de cada corrida, sorteia 3 Pokémon distintos da caixa (cartas já guardadas) e deixa escolher quem joga dessa vez; caixa vazia cai pro Pikachu de reserva sem tela de escolha, como antes. "Jogar de novo" sorteia outros 3.
  - ✅ UI revisada (estava "caótica", por pedido do dono): HUD em cápsulas com contorno (hora/mortes/onda), barra de HP pulsando quando baixa, vinheta sutil nas bordas da arena pra separar o HUD da cena, upgrades com ícone, resumo final em grade de 4 números em vez de uma frase só.
  - 🔶 Nunca jogado em celular real (só verificado no Chromium com câmera falsa).
- ✅ **Presente inicial na hora**: ao terminar o questionário, o Digital Pokémon entra na cena imediatamente, num bloco livre ao lado do jogador (`VillageGame.addMon`), sem reembaralhar os outros moradores; o aviso só diz que ele "já está do seu lado" depois que ele de fato está. Se a cena ainda estiver abrindo, ele entra assim que ela subir; se o sprite não baixar (sem rede e fora do pacote local), o aviso diz isso em vez de fingir. Conferido no Chromium (perfil limpo: cutscene → questionário → Bulbasaur ao lado do jogador).
- ✅ **Digital Pokémon com acabamento metálico leve**: tinta de aço frio (25% de mistura, calculada uma vez por quadro do GIF, `core/metallic.ts`) e um brilho diagonal que atravessa o sprite de tempos em tempos, recortado pelos pixels do próprio sprite. Opção para desligar na mochila → Visual ("Brilho metálico nos Digital Pokémon"). 🔶 Custo no celular não medido.
- ✅ **Joystick na Vila** no lugar do direcional: arrastar a partir do centro; na diagonal o personagem alterna os dois eixos a cada passo e, se um estiver bloqueado, tenta o outro (desliza pela parede em vez de travar) — `core/village/joystick.ts`. No teclado, duas setas/WASD juntas também andam na diagonal. Conferido no Chromium com eventos de ponteiro e teclado; 🔶 toque real não testado.
- ✅ **Câmera da Vila no desktop** mais afastada: o bloco para de crescer em 56 px CSS (~20 blocos na largura em 1280 px, antes ~11); no celular em pé continua igual (teste garante a mesma escala de antes) — `core/village/camera.ts`.
- ⬜ O resto da Vila (cidade, construção, momentos, livro, etc.) não está detalhado aqui ainda — ver o código em `src/core/village/`, `src/village/` e `src/components/VillageView.vue`.
- 🔶 Visual da Vila com tilesets (GBA/NDS) no lugar do pixel art desenhado por código: começado pelo chão (pedido explícito do dono — "comece pelo chão"). A grama (bloco `grass`/`building`/`lamp`/`tree`/`rock`/`bush` em `village/village-art.ts`) já usa o mesmo recorte real de `Daisy Route.png` (Idilio/Heroalistar/Ekat e outros, ver `THIRD_PARTY_NOTICES.md`) que a Sobrevivência, com 4 variações de 16×16 por posição do bloco; sem a imagem (falha de rede), cai no ladrilho desenhado por código de sempre. Falta: trilha, água, areia e canteiro (ainda desenhados por código, com a borda que "invade" a grama — por enquanto ainda na cor lisa antiga, pode destoar um pouco da grama nova na emenda) e depois as construções (casas, lojas, fonte) com um tileset de cidade escolhido à parte (a arte de rota do Daisy Route não tem prédio).
- ⬜ Vídeo game comprável na Vila, desbloqueando minigames extras (ex.: um "atirar nas pokébolas" estilo Duck Hunt): pedido, em espera por enquanto.
- ⬜ **Torre mais parecida com o poke-survivor original** (missões, conquistas e um evento especial tipo "fenda de lendário", com números e arte originais, nunca um port literal) **e** fazer coisas de fora da Torre influenciarem a corrida (ex.: nível de amizade do Pokémon escolhido dando algum bônus): pedido, explicitamente para depois — não entra nesta rodada de melhorias.

## Fases do prompt mestre

O dono do projeto enviou um prompt mestre completo (guardado na íntegra em [docs/PROMPT_MESTRE.md](docs/PROMPT_MESTRE.md), pra não se perder de novo numa compactação de conversa) com 8 fases. Status de cada uma:

- ✅ **Fase 1 — Auditoria**: feita nas sessões anteriores.
- ✅ **Fase 2 — Scanner**: instrumentação (tempos por etapa, candidatos, origem) e o painel "Mostrar o que o app está vendo" (contorno, carta endireitada, faixa do OCR, texto lido) já existem em `ScanView.vue`/`DiagnosticoView.vue`.
- ✅ **Fase 3 — AR**: GIF ancorado à carta, tratamento de sprite ausente e de falha de rede, liberação de recursos — ver seção "AR sobre a carta" acima.
- ✅ **Fase 4 — Introdução e presente**: cutscene da primeira entrada (4 falas, uma vez por perfil, `state.digital.introSeen`), seguida do questionário de 6 perguntas (5 de personalidade + 1 de "era" — escolhe, de forma determinística e testada, um dos 27 iniciais reais; ver `core/village/starter-quiz.ts`) e o presente. Depois de recebido, um mini tutorial de 3 falas explica a Fonte, a energia e a evolução (`state.digital.tutorialSeen`), também uma vez só.
- ✅ **Fase 5 — Digital Pokémon e energia**: instâncias digitais existem (`core/village/digital.ts`), com a etiqueta `isDigitalPokemon: true` e nunca passam pelo cache de cartas/alvo de AR. Economia de energia (`DigitalState.energy`, histórico de transações) é um pool próprio, separado da energia do Pin Mode (evita colisão de saldo/semântica entre os dois sistemas). A Fonte da praça (prédio que já existia como enfeite decorativo) ganhou a mecânica de verdade: invoca por 500 energias (`summon`, espécie real sorteada entre os 27 iniciais via TCGdex) e evolui por 1.000 energias + amizade nível 3+ ("Grande amigo", reaproveitando o sistema de amizade que já existia) + uma próxima forma real (`nextForm`, cadeia de evolução real dos 3 estágios de cada inicial). A amizade com um Digital Pokémon reaproveita `friendOf`/`friendLevel` de sempre, chaveada pelo `instanceId` — nenhum sistema de amizade novo. Energia é ganha jogando de verdade: conversar, responder quiz, momento novo no Álbum, lanchar no Café, correio e vencer um minigame ou uma corrida na Torre.
- ✅ **Fase 6 — Vila e Survivor**: Vila e Torre de Sobrevivência já existem e funcionam (ver seção "Vila" acima); Digital Pokémon moram na Vila como qualquer residente (mesmo pacote de sprites locais, com fallback pro GIF da Showdown) e agora entram no mesmo sorteio de "quem joga" da Torre de Sobrevivência, junto com as cartas já escaneadas (`MinigameSobrevivencia.vue`, prop `digital`) — sem precisar de carta nenhuma pra isso.
- ✅ **Fase 7 — Encontros lendários**: sorteio raro (`core/village/legendary.ts`), chance-base de 0,1% numa "oportunidade de sorteio" por dia do calendário do aparelho (nunca mais de uma, nunca re-sorteia abrindo/fechando a Vila nem com uma cutscene ainda pendente). Arquitetura extensível por dados: cada lendário (hoje Suicune, Zapdos, Celebi) é uma entrada em `LEGENDARIES` com falas, bônus e consequência próprios — adicionar um novo é só mais uma entrada, sem mexer no motor. Histórico guardado, cutscene com falas em sequência na Vila.
- 🔶 **Fase 8 — Integração e acabamento**: contínua; cada PR já atualiza este documento e roda os testes. Falta um pente-fino de balanceamento (custos, chance do lendário, quanto cada atividade rende de energia) com o dono jogando de verdade — e otimizar a Torre pra celular mais fraco não foi medido ainda (só testado no software renderer do CI).

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
