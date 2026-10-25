# Histórico de entregas

Registro cronológico do que já foi entregue, **movido sem alterações de texto** de `IMPLEMENTATION_PLAN.md` em 2026-10-23.
O estado atual, as fases, as pendências e os riscos continuam no [plano](../IMPLEMENTATION_PLAN.md); aqui ficam as entregas
datadas (com o que foi e o que não foi validado em cada uma). A regra de validação do plano vale também para estas entradas:
🔶 significa que **nada foi visto num celular real**.

## Interface: grade de cartas, miniaturas na busca manual e atalhos de jogos (25/10/2026)

- Grade de cartas (`CarregarView`): tocar na carta agora só abre os detalhes (a carta se expande com última leitura, situação de imagem, sprite e alvo de AR, Carregar, Ver em AR e Adicionar à Vila). Adicionar ou tirar da Vila é um botão próprio de 44 px embaixo de cada carta ("+ Vila" / "✓ Na Vila"), então um toque descuidado não muda mais a equipe.
- Busca manual (`ScanView`): cada resultado mostra a miniatura da carta, o nome, a coleção, o número e o ano. A miniatura vem do CDN do TCGdex pela série da coleção, que o índice passou a guardar (`serie`, gerado por `scripts/build-catalog-index.ts`). Índice antigo, sem `serie`, mostra "sem imagem"; carta sem arquivo no CDN mostra "Carta indisponível". Nada de endereço inventado.
- Atalhos de jogos: o menu da Vila ganhou o grupo "Jogar" (Survival, BONK, Arena) e o Treinador, na aba Jogos, os mesmos três links. Os endereços `#/vila?torre=1`, `?bonk=1` e `?coliseu=1` abrem a Vila e entram direto no jogo (BONK já selecionado), depois dos avisos de boas-vindas e da abertura do dia. Jogo ainda trancado diz em que nível abre. O atalho sai do endereço ao abrir, para recarregar não reabrir o jogo.
- 🔶 Typecheck, 2245 testes e build passaram. Conferido no navegador do PC com o índice real (220 coleções, 23.736 cartas): miniaturas carregando do CDN (algumas cartas recentes ou promocionais não têm arquivo lá e caem no "Carta indisponível"), grade abrindo detalhes sem mexer na equipe, e os três atalhos entrando na Vila, na Torre (Normal e BONK) e no Coliseu. Não testei o aviso de jogo trancado nem nada em celular real.

## Vila: visual novo de itens, acessórios e móveis, com 300 peças novas (25/10/2026)

- Pincel novo (`src/village/art/pen.ts`): rampas de cor com variação de matiz, contorno no tom escuro da própria cor (`sel`) ou quase preto (`ink`) e sprites escritos como mapa de pixels. Tudo continua desenhado por código, sem imagens.
- Acessórios (estilo dos acessórios da 4ª geração): os 50 antigos redesenhados e 100 novos, no tamanho real (um pixel do desenho = um pixel do tileset da Vila; na Torre, do tileset da Torre). A posição sai de uma âncora genérica sobre a caixa do corpo e o topo da cabeça (`core/village/accessory-fit.ts`: cabeça, cabelo, olhos, boca, pescoço, peito, cintura, costas, mão), igual na Vila, na Torre e na Caixa, sabendo para que lado o corpo olha (capas atrás, o que se segura na frente; de costas o rosto some). Todo acessório serve no treinador e nos Pokémon.
- Itens da mochila (estilo dos ícones da 5ª geração): materiais, colheitas, sementes e pratos redesenhados, e 100 novos com origem real — pedras de evolução, carvão, quartzo, âmbar e fósseis nas rochas; bolota, pinha e seiva nas árvores; trevo, erva e cogumelos no mato; caranguejo, lula e Escama Coração na pesca; sal e concha espiral na areia; leite, ovo, açúcar e manteiga na loja; farinha na bancada; 15 sementes e colheitas (10 frutas Pokémon e 5 legumes) e 41 pratos.
- Móveis (estilo dos tilesets de interior da 3ª geração, perspectiva 3/4): os antigos redesenhados e 100 novos (bonecos de Pokémon, plantas, mesas, eletrônicos, decorações da Base Secreta, jardim e as famílias almofada e banqueta em 8 cores). Animação por quadros sobrepostos e luz noturna por troca de paleta.
- Conquistas: 27 novas. 22 acessórios e 9 móveis só saem de conquista (`prize`).
- 🔶 Typecheck, 2239 testes e build passaram. Conferido no navegador do PC (Vila com acessórios no treinador e nos Pokémon, interior da casa com móveis novos e antigos) e em folhas de contato renderizadas por script. Nada visto em celular real; posição dos acessórios em espécies de formato incomum (serpentes, Pokémon muito largos) não foi revisada uma a uma.

## Vila: amizade com os moradores que se vê evoluir (25/10/2026)

- Diagnóstico: a amizade subia, mas nada mostrava. Nenhuma ação anunciava a troca de nível (só o recorde geral ia para o Treinador), os momentos davam ±1–2 pontos e diziam apenas "+ amizade com você", conversar de novo no mesmo dia dava sempre a mesma frase, o "não gosta" do Livro não tinha efeito no presente e o mural dava +3.
- Marcos (`claimFriendMilestones`, campo `milestone` em cada amizade): qualquer origem de pontos (conversa, presente, momento, carta, mural, reforma) é conferida antes de salvar. Cada nível é comemorado uma vez só: aviso na tela com o que se abriu, coração sobre o Pokémon e uma página no Diário (`recordFriendMilestone`), que entra no resumo do dia; «Melhor amigo» fica guardado no Álbum. Saves antigos contam o nível atual como já comemorado.
- Ganhos: momentos multiplicam `friend`/`friendBy` por 3 quando você decide, por 2 perto de você e por 1 enquanto está fora, com número e nome ("+6 amizade com você (Ana)"). Mural: visitar dá +5 e entregar dá +8.
- Queda com equilíbrio (`FRIEND_LOSS`): pedido do dia sem resposta (−2), saudade depois de uma semana sem conversar (−2 por semana, até −8), presente de que ele não gosta (−2) e as duas recusas secas do quiz (−1). A conversa seguinte ainda soma +6, então um dia de cuidado recupera. Os marcos também regridem: "Amizade abalada" e "Amizade recuperada" no Diário e no aviso; quem cai abaixo de «Grande amigo» para de seguir você; o Livro mostra o humor "Chateado" no dia da mágoa; a fala de volta comenta a saudade no tom do nível.
- Visível: conversa e presente mostram "❤️ +6 amizade (faltam 18 para Grande amigo)" ou "💔 −2 amizade"; a lista de amigos e o Livro mostram o caminho até o próximo marco (e até a amizade máxima, que a evolução pede). A conversa repetida muda de tom com o nível.
- Conversa com morador: a primeira tela ficou com Presentear, Vem comigo (quando cabe), Mais opções e Tchau; Livro, Acessório, Apelido e Passeio foram para "Mais opções". O guia fixo do topo ("aproxime-se de um morador") só aparece com a Vila ainda vazia.
- Revisão de textos: todas as 661 cenas de momento foram geradas por script (604 renderizadas nas condições do scan; o resto depende de datas e horários): nenhuma fala repetida entre modelos, nenhum texto quebrado ou parêntese aberto. Cartas: escritas por quem viveu o momento, com a fala dele, quem estava junto (sem repetir o remetente), o registro do Diário e despedida pelo nível de amizade; marcos viram carta pessoal (queda vira pedido); o jornal deixou de falar em "acontecimento inventado"; responder diz quanto a amizade subiu e não promete amizade ao jornal. Lembranças na conversa: valem por 14 dias (eram 90 e a mesma voltava sempre), revezam entre as três últimas e saem como frase natural, sem os números do Diário. Falas corrigidas: o morador novo não diz mais que foi escaneado (Digital Pokémon não é), nem cita "nossa primeira batalha"; o doce de amizade no nível máximo não mostra mais o id da carta.
- 🔶 Typecheck, 2211 testes (`friendship-progress.test.ts` e `mail.test.ts` cobrem subida, queda, recuperação, cartas e lembranças) e build passaram. Nada visto no navegador nem em celular real: avisos, menus e Diário só foram conferidos pela lógica.

## Torre: direções reais e Ritmo acelerado (24/10/2026)

- Jogador, apoios, inimigos e chefes agora escolhem a pose `up`/`down`/`left`/`right` da folha local `Walk` pelo deslocamento, também no BONK. O pacote creditado cobre 966 espécies; sem folha direcional na origem, permanece apenas a pose realmente disponível, sem arte inventada.
- Depois da primeira vitória contra o chefão final, o modificador **Ritmo acelerado** fica disponível para Normal e BONK. O relógio do motor avança 2×, a corrida encerra com o chefão aos 10 min mostrados (~5 min reais) e orbes rendem 1,75× XP. Ele não combina com o Infinito.
- O intervalo de nascimentos e de chefes periódicos é compensado pelo mesmo fator do relógio, evitando dobrar a pressão por segundo real.
- 🔶 Typecheck e 82 testes focados passaram. A compilação local foi bloqueada por `dist/sprites` preso pelo Windows; aparência, toque e dificuldade ainda precisam de aparelho real.

## Torre: Pokébolas Sombrias e recompensas visíveis (24/10/2026)

- A partir de 13 min, uma Pokébola Sombria opcional pode aparecer na arena. Cada uma sorteia um lendário real, abre uma curta cena de chegada e o coloca na batalha com sprite ampliado, chamas de sombra e números próprios de risco médio-alto.
- Ao vencer, a Pedra da Confiança fica marcada no HUD e no resumo no mesmo instante; ela só entra no inventário ao encerrar a corrida, evitando recompensa invisível e farm por abandono. O marco de tempo e os demais itens especiais também passaram a dizer claramente que estão assegurados, mas pendentes de encerramento.
- Há no máximo três encontros, espaçados depois de cada vitória. O efeito visual respeita o Modo Rotom e a opção de efeitos leves.
- 🔶 Validado no motor puro e no typecheck; a legibilidade da cutscene, das chamas e da dificuldade ainda exige celular real. O build local precisa ser repetido quando o diretório `dist` não estiver em uso.

## Pins: zoom, rastros, moedas por derrubada e Pokédex (24/10/2026)

- Câmera dos Pins com zoom de 1,5×, 2× (padrão), 2,5× ou 3×, pins desenhados 30% maiores que o corpo físico e arena mais alta na tela (escolha guardada em `tcg-ar-pins-zoom-v1`): uma única transformação do canvas aproxima o mundo e acompanha a ação (enquadra o seu pin e os adversários ao mirar; segue o que corre durante a jogada). Nunca mostra fora da arte; o toque e o arrasto continuam batendo com a física (`toWorld` desfaz a câmera).
- Visual: rastro que some atrás de quem corre (azul seu lado, vermelho adversário), vinheta nas bordas, seletor de zoom no canto e moedas "+3 ✦" subindo onde um adversário cai. "Efeitos" desligados e movimento reduzido removem rastro e suavização.
- Moedas: cada adversário derrubado paga 3 (`PIN_KO_COINS`) no fim da partida contra o computador; derrota paga o mesmo limitado a 9 (`PIN_LOSS_COINS_CAP`); sair da sala ou jogar contra amigo não paga. A tela final mostra as derrubadas e o total.
- Pokédex (aba Treinador): uma casa por espécie nacional (1 a 1025), preenchida só pelo que apareceu de verdade: carta escaneada, Digital Pokémon da Vila, adversário nos Pins e inimigo na Torre (`core/pokedex.ts`, `app/pokedex-store.ts`, chave `tcg-ar-pokedex-v1`, incluída no backup). Espécie nova rende 10 moedas; marcos de 10, 25, 50, 100, 200, 400 e 800 espécies pagam bônus uma vez. Ao abrir, junta as cartas e moradores que já estavam no aparelho (retroativo, com um aviso).
- Teste de rota da Arena (`App.test.ts`) atualizado: o título "Equipe da Arena · 6 Pokémon" tinha virado "Monte seu time de batalha" e a suíte já falhava na main.
- 🔶 Visto só no Chromium de desenvolvimento (retrato, uma partida jogada com arrasto real); nada validado em celular real.

## Torre: golpes elementais, cone, órbita e painéis (24/10/2026)

- Cone de verdade: leque de ~38° (`core/survivor-shapes.ts`) apontado para a frente do Pokémon, que segue o último passo em qualquer direção. No BONK a frente é a câmera (`SurvivorInput.aimAngle`), então o golpe sai sempre adiante na tela, nunca de lado. Alcance base 140 → 185 para compensar o leque mais estreito.
- Órbita deixa de ser um pulso igual ao da aura: 3 orbitais giram em volta do jogador e acertam por contato, com intervalo por inimigo; "Disparo múltiplo" acrescenta orbitais (até 6) e a recarga define a velocidade do giro. Um orbital que encosta num projétil inimigo o desfaz, no máximo um por recarga.
- Arte elemental dos golpes (`village/survivor-attack-art.ts`), na Torre e no BONK: chama que sobe, gotas que espirram, raio que cai do céu, espinhos de gelo, rachaduras e pedras, bolhas de veneno, anéis psíquicos, folhas, insetos etc., em projéteis, aura, área, cone e orbitais. "Efeitos: leves" e o Modo Rotom reduzem partículas, gradientes e rastros.
- BONK usa a pose de costas (linha "up" da folha de andar local) para o jogador; sem essa pose no pacote, fica a de frente.
- Painéis da Torre (escolha, nível, especial, pausa, fim) com o mesmo visual escuro e o destaque na cor do elemento; em paisagem, as cartas de nível e de especial ficam lado a lado e os 6 sorteados cabem numa fileira.
- 🔶 Visto só no Chromium de desenvolvimento (galeria dos 18 tipos e corridas pelo harness, retrato e paisagem). Simulação de 170 s: órbita e cone no mesmo patamar dos demais golpes, sem provar equilíbrio. Aparência, legibilidade e custo de GPU no celular ainda precisam de aparelho real.

## Bairros, casas e renda dos moradores (22/10/2026)

- Expansão real para 120 × 96 blocos, com praia, jardim, praça, bosque e mirante conectados; 16 destinos de passeios e guias legíveis no minimapa.
- 32 móveis com arte própria, interiores organizados por função, oito estilos de fachada e duas reformas extras, preservando a codificação dos saves antigos.
- Salários por conclusão real de trabalho, carteiras individuais e compras autônomas de móveis/reformas. Profissões dependem da população; dinheiro pessoal também paga o Café.
- Terraço com seis mesas, clientes e atendente caminhando, preparo/entrega, pagamento e momentos entre quem está comendo junto. Carteiro e atendente continuam moradores sociais.
- Regras, testes, comandos de validação e limites em [VILLAGE_NEIGHBORHOODS.md](docs/VILLAGE_NEIGHBORHOODS.md).

## Música regional, ambientação e revisão da Caixa (21/10/2026)

- 12 faixas pacíficas da Vila por hora/clima; crossfade de 12 s e pares alternados a cada seis minutos. Sons de ações e trabalhos próximos, com ambientação noturna/chuva e volumes independentes.
- 9 temas regionais do Survival; cinco arranjos GBA da Meeow’s Music e quatro gravações regionais com tratamento retrô reproduzível. Créditos e fontes fixadas em `public/audio/CREDITS.md`; troca usa a curva de 40 s do cenário.
- Player compartilhado com até duas faixas comprimidas, carga sob demanda, cancelamento, pausa de página, URLs revogadas e contexto fechado. Músicas fora do pré-cache; respostas completas podem entrar no cache de execução. Preferências preservadas pelo backup existente.
- Corrigida a serialização das regras de cache de músicas, chunks, OCR, catálogos e sprites: os callbacks anteriores capturavam `base`, ausente no worker gerado. Regras agora são expressões com o caminho incorporado; teste de configuração e `verify-dist` cobrem a regressão.
- Caixa: cancelamento durante permissão/abertura, proteção contra população e cenas atrasadas, limpeza de temporizadores, terreno e áudio, pausa do relógio ao esconder a página. Painéis com Escape, foco restaurado, cabeçalhos acessíveis e melhor espaço em paisagem.
- Arena: preparação em três passos, indicação de 6/6 e Digital Pokémon no seletor compartilhado. Pisos distintos de jardim/campo, curvas contínuas, paleta sRGB e correção da orientação vertical dos enfeites. O layout clássico dos Pins permanece separado.
- Câmera real, sensores, desempenho e consumo em aparelho físico continuam exigindo validação no celular. O tratamento retrô das quatro gravações não é uma troca de instrumentação por arranjo GBA.

## Encontros e cenas lendárias (21/10/2026)

- Catálogo de 94 espécies (71 lendárias e 23 míticas), conferido no `pokemon_species.csv` da PokéAPI, com quatro capítulos e pistas escritas individualmente em `legendary-stories.ts`.
- Caderno de Lendas em Histórias: filtros por região/visitas, investigação por duas ações próximas a locais reais do mapa e replay só de encontros vividos. Não exige grind em outros modos nem dá capturas automáticas.
- Encenação 2D com sprite real sob demanda, cenários de cidade/água/bosque/pedra e 12 temas visuais. Partículas, movimento e animação do sprite desligam pelas opções visuais/Rotom ou movimento reduzido. Falta de sprite permanece explícita.
- Registro permanente de visitas separado do histórico recente de efeitos; normalização recupera os registros antigos disponíveis. Retomada de pista/cena, backup no formato existente e replay sem recompensa duplicada.
- Testes percorrem as 94 investigações, ida/volta do save, proteção contra repetição, expiração e caminhos em cinco sementes. `e2e/village-legends.mjs` percorre o fluxo de UI com save isolado, sem câmera nem AR simulados.
- A cena única do desejo ao Ho-Oh foi preservada e recebeu ajustes de paisagem/rolagem e economia visual. Aparelho físico continua exigindo validação própria.

## Arte, postos de trabalho e passeio guiado (21/10/2026)

- Fachadas completas para casas, Correio e Pins; recortes corrigidos da Torre, Mercado, Café e murais. A grama usa uma base uniforme e as flores são sobrepostas sem o retângulo verde da folha de origem.
- O atlas é gerado em `src/village/vila-atlas.png`, recebe hash no build e é conferido pixel a pixel pelos testes, evitando misturar imagens antigas em cache com novos recortes.
- Mina ao sul, madeireira no noroeste e píer no lago têm corredores, placas e acesso pelo menu Trabalhos da Vila. A escolha entre os quatro postos considera aptidão, interesse, energia e recursos disponíveis; a fazenda não monopoliza a escolha.
- Os moradores caminham até o recurso e trabalham antes de entregar loot, seguindo as mesmas tabelas e limites da coleta/pesca manual. Ferramentas, linha de pesca e progresso aparecem no canvas; efeitos respeitam opções visuais e movimento reduzido.
- Passeio guiado usa a velocidade atual do treinador e só termina quando o companheiro também chega. Testes percorrem todos os destinos guiados, portas e postos, além de caminhadas completas até os recursos em mapas gerados.
- Saves mantêm formato e backup existentes; itens e cultivos que colidam com os novos postos são reposicionados, preservando quantidade e estágio. Aparência e toque em celular físico continuam sem validação neste ambiente.

## Impactos elementais em Pins e na Arena (19/10/2026)

- Os golpes elementais agora espalham anéis e partículas com silhuetas por elemento; a opção persistente “Efeitos elementais intensos” permite desligá-los. Movimento reduzido congela a animação.
- A Arena AR amplifica partículas e ondas de choque nos impactos, com opção persistente própria; a preferência de movimento reduzido desliga essa amplificação.
- Saves antigos mantêm os efeitos ligados por padrão; perfil de efeitos e progresso da animação têm cobertura de teste.
- A validação visual final em celular ainda precisa de confirmação.

## Alinhamento dos prédios e tilesets da Torre (19/10/2026)

- Fachadas, casa, fonte e mercado da Vila agora apoiam na borda inferior da calçada; o mapa mantém livre o bloco de interação da porta. Teste verifica o ponto de apoio e o piso sob ele.
- Câmera da Torre aproximada em 1,5× (metade da área anterior no lado curto) sem passar dos limites da arena.
- As nove regiões do Survival usam recortes próprios de chão, trilha e detalhes do atlas; a transição visual acompanha a mesma mudança temporal da região, sem depender do RNG da corrida. Fallback desenhado permanece disponível se o atlas não carregar.
- Typecheck, testes, build com `BASE_PATH` e `verify-dist` concluídos. A leitura visual final em celular real ainda precisa de confirmação.

## Survival e interface compartilhada (19/10/2026)

- O Survival desacelera a chegada e a escalada de inimigos, tem uma janela maior de recuperação após acertos e aumenta o dano de aura, órbita e cone para compensar o combate próximo. Ajustes centralizados em `BALANCE` e `CATEGORY_DAMAGE_FACTOR`; teste compara DPS teórico com stats idênticos, sem alegar equilíbrio comprovado.
- Tokens compartilhados de cor, foco, espaçamento e toque; cartões da equipe usam mais colunas; a Box permite selecionar caixas diretamente e organiza seus 30 espaços em até 8/10 colunas em telas largas, mantendo 6 no celular.
- ✅ Typecheck, testes, build com `BASE_PATH` e `verify-dist` são os critérios antes do merge. 🔶 Dificuldade, legibilidade e toque ainda precisam de partidas e avaliação em celular real.

- **Efeitos da Vila (2026-10-18):** ondas no lago e ondulações com chuva, gotas em arco e anéis na fonte e raios suaves de sol modulados por clima/horário. Opções permite desligar; movimento reduzido também desativa os novos efeitos. Tipos, build e dist conferidos; validação visual em celular pendente.

## Vila: abertura e eventos (18/10/2026)

- Abertura diária em capítulos, com falas e resultados reais do Diário e a última visita lendária; pode ser pulada e não se repete na mesma data local. Sem registros novos, informa isso explicitamente.
- Momentos ambientes deixam de gerar avisos constantes; acessos rápidos para Menu, Mochila e Novidades. Avisos de ações ficam embaixo e podem ser dispensados.
- Dez eventos novos: Articuno, Moltres, Raikou, Entei, Lugia, Ho-Oh, Regirock, Regice, Registeel e Rayquaza. Cenas próprias, bônus e consequências aplicados até o fim do dia; chance diária total preservada.
- Verificação local: tipos, testes, build e conferência do dist; navegador com viewport móvel confirma abertura única por dia e acesso à mochila. Aparência em celular real ainda precisa ser avaliada.

## Scanner: Fase A (2026-10-16)

O que mudou e por quê (causas reais, não só interface):

- ✅ **Candidatas escondidas** (o "a lista parece parar antes do último resultado"): três cortes reais, corrigidos e cobertos por testes.
  1. `rankCandidates` cortava o ranking em 5: com 6 candidatas do índice + até 6 da rodada de números parecidos + até 5 da ilustração, as de baixo sumiam mesmo depois de baixadas e comparadas. Agora devolve todas.
  2. A escolha "Qual impressão é esta?" cortava em 4 (`slice(0, 4)`) e casava as porcentagens por posição depois de um filtro — podia mostrar a porcentagem de uma carta na outra. Agora `choicesOf` lista todas, cada uma com a própria confiança.
  3. O índice e a busca manual cortavam em silêncio (6 candidatas baixadas; 30 resultados na busca). Agora dizem o total: a busca manual mostra "N de M" e "Mostrar mais" até a última; quando o número lido bate em mais cartas do que as comparadas, o diagnóstico diz quantas e abre a busca manual já com o número.
- ✅ **Confirmação temporal com voto falso**: quando a carta sumia por um quadro, o controlador repetia a leitura anterior **e contava de novo como voto** — dava pra "confirmar" com uma única leitura real. Agora a repetição só segura a mensagem na tela; só leitura de verdade vota.
- ✅ **OCR só com a carta parada**: antes, todo quadro com carta rodava o OCR inteiro (duas orientações, metades, nome — segundos no celular), inclusive com a carta mexendo. Agora a detecção (leve) roda em todo quadro e o OCR só depois de um par de quadros com a carta parada (movimento ≤ 2% da diagonal; `recognition/stability.ts`). A confirmação temporal continua exigindo leituras de OCR repetidas.
- ✅ **Reaproveitamento entre quadros**: imagens de referência ficam na memória (24, LRU) — o quadro seguinte não baixa nem decodifica de novo; a orientação (carta de cabeça para baixo) achada num quadro é tentada primeiro no seguinte.
- ✅ **Cancelamento de verdade**: cancelar/recomeçar descarta a leitura em andamento entre as etapas (`ScanCancelled`); antes o resultado de uma leitura velha ainda chegava depois.
- ✅ **Instrumentação** (`recognition/stage-clock.ts`): tempo de captura, detecção, estabilização, perspectiva, recorte do número, recorte do nome, OCR do número, OCR do nome, catálogo, comparação visual, ordenação, confirmação temporal, até as primeiras candidatas, confirmação (guardar a carta) e início do AR. Etapa pulada guarda o motivo, nunca um tempo inventado. Na tela: tabela da última leitura (Escanear → Teste) e mediana/p90 da sessão (Diagnóstico).
- ✅ **"Mostrar o que o app está vendo" ampliado**: contorno e os 4 cantos numerados, a faixa exata do número (e das metades, se lidas) e a do nome desenhadas sobre a câmera pela mesma homografia dos recortes (opção para desligar as sobreposições), os recortes reais enviados ao OCR (faixa, metades, nome), texto lido, estabilidade (movimento medido), luz e nitidez, e **todas** as candidatas com veredito (aceita / em dúvida / rejeitada) e o motivo — inclusive por que uma candidata ficou sem imagem de referência.
- ✅ **Etapas honestas** (`app/scan-steps.ts`): "Etapa n de 8" (Localizando carta → … → Carta identificada) seguindo a etapa que o pipeline avisou que começou; pulada aparece tracejada com o motivo; tempo decorrido; **Cancelar** e **Reiniciar**. Avisos de carta mexendo, pouca luz e possível desfoque (os dois últimos são heurísticos e não bloqueiam a leitura).

### Medição antes/depois

Bancada `scripts/scan-bench.eval.ts` (Node num PC, Tesseract de verdade, foto real de câmera, mesmo roteiro nas duas versões, 3 amostras cada). **Não é celular**: no celular cada passada de OCR custa bem mais, mas isso não foi medido.

| Roteiro | `main` (antes) | Fase A (depois) |
|---|---|---|
| Carta mexendo 3 quadros, depois parada | 2,36–2,59 s até confirmar · **14** passadas de OCR | 1,34–1,40 s · **2** passadas de OCR |
| Carta parada desde o 1º quadro | 0,53 s · 1 quadro · 2 passadas | 0,69–0,70 s · 2 quadros · 2 passadas (**~0,17 s mais lento**: espera o par de quadros parados) |

No Chromium (câmera falsa com a mesma foto), a tabela da sessão mostrou: até as primeiras candidatas ~1,9 s; guardar a carta (referência + sprite + compilar o alvo do MindAR) 19,9 s; início do AR 1,5 s. ⚠️ **Correção (Fase B):** esses tempos foram tirados com o painel do navegador **oculto**, quando o Chromium trata a página como aba em segundo plano e desacelera timers e GPU — não valem como medida. A indicação (guardar a carta pesa mais que reconhecer) continua plausível, mas precisa ser medida em celular: a tabela do Diagnóstico agora mostra cada parte de "guardar a carta" (ver Fase B).

Numa das tentativas no Chromium as 3 imagens de referência falharam (a decisão caiu para "em dúvida" só pelo número); a causa não ficou registrada porque o erro era engolido. Agora o motivo aparece no veredito de cada candidata; na tentativa seguinte elas carregaram e a carta foi aceita com 91%.

🔶 Nada disso foi visto num celular real.

## AR: Fase B (2026-10-16)

Revisão do fluxo Escanear → AR (câmera, alvo, rastreamento, liberação, ciclo de vida):

- ✅ **Contexto WebGL vazando a cada carta**: o Escanear recria o `<canvas>` do AR a cada carta (para ter um contexto limpo), mas `renderer.dispose()` não devolve o contexto ao navegador — ele ficava vivo até o coletor de lixo. Depois de umas 16 leituras, o Chrome começa a derrubar o contexto mais antigo, às vezes o do TensorFlow.js do rastreador. Agora o contexto é liberado quando o canvas sai da página (`ar/context-release.ts`) e, explicitamente, antes de recriá-lo (inclusive depois de fechar e abrir a câmera). Canvas reaproveitado (Várias, Caixa) não perde o contexto. Conferido no Chromium: ao pedir outra carta, o canvas antigo disparou `webglcontextlost` e o AR novo rastreou normalmente.
- ✅ **"Guardar a carta" medido por partes** (`PrepareResult.timings`): referência, características, sprite, imagem em alta e compilação do alvo aparecem no Diagnóstico como subetapas — é a medida que faltava para atacar o tempo no celular.
- ✅ **Imagem em alta baixa em paralelo**: era o último download da fila (referência → sprite → imagem em alta → compilar). Agora começa junto com a referência e o sprite (teste que travaria com a fila antiga).
- ✅ Relógio da etapa "Confirmando identificação" congelava enquanto guardava a carta; agora anda.
- Revisado, sem mudança: falha ao iniciar libera motor, WebGL, sensores e observador; uma execução superada (outra carta, câmera fechada, sair da tela) é parada; sprite ausente e falha de rede aparecem na tela com "Tentar baixar o GIF de novo"; perda de rastreamento vira "lost" e volta a "tracking" sozinha; alvo de versão antiga é recompilado; "Recompilar o alvo da carta" e "Escolher outra carta" no erro.
- 🔶 Não medido: tempos de câmera/alvo/rastreio em celular (o painel do navegador desta sessão estava oculto, o que invalida tempos). Nada visto em celular real.

## Feito desde a Fase B (2026-10-16)

- ✅ **Fliperama → batalha na câmera**: botão que fecha a Vila e abre câmera e sensores da Caixa no mesmo toque, com "Batalhar" em destaque; cada batalha comum da Caixa terminada rende **100 moedas** na Vila, até **3 por dia** (`claimBattleReward`, com teste). PvP e Liga têm recompensa própria. 🔶 Não visto na tela.
- ✅ **Quem é esse Pokémon? (difícil)**: distorção bem mais forte (redemoinho largo + ondulação, deslocamento 70 + 26). 🔶 Não visto na tela.
- ✅ Diagnóstico não anuncia mais o atalho do 666 (o atalho de depuração continua funcionando).
- ✅ **Digital Pokémon em "Minhas cartas"**: seção própria com o selo 🔒 Digital (origem, data, carta de origem), sem botões de scan/AR. Conferido no Chromium.
- ✅ **Carta de origem da espécie certa**: a busca `?dexId=1` da TCGdex casa por TRECHO do número (devolvia Unown 201 antes do Bulbasaur); agora usa `dexId=eq:` e prefere uma carta com imagem.
- ✅ **Fonte diz quanto de energia falta** ("faltam 392 de energia") em vez de só ficar cinza — a invocação depois do primeiro funcionava (conferido: duas invocações seguidas com 1.100 de energia), mas parecia travada sem saldo.
- ✅ **Invocação "qualquer um na sorte" por 700 moedas**: código pronto e testado (`summonWithCoins`, `pickAnySpecies`, 1–1025), **desligado** (`COIN_SUMMON_ENABLED = false`) até o dono pedir.

## Insígnias até a Geração VI (24/10/2026)

- Unova (V) e Kalos (VI) entram na Liga: Cilan, Lenora, Burgh, Elesa, Clay, Skyla, Brycen e Drayden, Elite de Unova e o Campeão Alder; Viola, Grant, Korrina, Ramos, Clemont, Valerie, Olympia e Wulfric, Elite de Kalos e a Campeã Diantha. Insígnias 32–47; nada salvo antes muda.
- Todo treinador da Liga (Ginásios, Elite 4 e Campeões das seis regiões) agora leva 6 Pokémon.
- As 48 insígnias foram redesenhadas no formato e nas cores das insígnias dos jogos (a de Maylene passou a se chamar Pedregulho, como a dos jogos), com filetes entre as cores, verniz e relevo de verdade na maleta 3D; com "Reflexos e faíscas" ligado o esmalte não desbota mais.
- Conferido no preview local: as 48 em SVG, as maletas 3D de Kanto e Unova e os sprites dos líderes de Unova e Kalos. GPU e toque em celular real continuam pendentes.

## Ligas regionais (18/10/2026)

- Kanto (I), Johto (II) e Hoenn (III) acrescentadas à Sinnoh (IV): cada região tem oito Ginásios, quatro membros da Elite e um Campeão (Blue, Lance, Steven e Cynthia). Equipes de exibição inspiradas nos jogos, com dificuldade própria do app.
- Treinador → Liga e Arena da Vila compartilham a seleção por região, as seções Ginásios / Elite 4 / Campeão e as quatro maletas 3D, cada uma com oito insígnias. Reflexos, polimento e balanço continuam disponíveis; Three.js permanece sob demanda.
- O salvamento `tcg-ar-liga-v1` preserva IDs e índices de Sinnoh (0–7), reserva 8–15 para Kanto, 16–23 para Johto e 24–31 para Hoenn e guarda corridas/títulos regionais separadamente. O backup usa as mesmas chaves; o polimento aceita as 32 insígnias sem misturar encaixes.
- Testes cobrem bloqueios, derrota/recomeço da Elite, primeira vitória/revanche, gravação e migração, títulos e seleção da interface. Conferência no Edge a 375 px: troca das quatro regiões e abertura das quatro maletas, sem erro de página nem rolagem horizontal. GPU, toque, sensores e fluidez em celular real continuam pendentes.

