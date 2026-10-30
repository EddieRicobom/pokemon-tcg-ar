# Masmorra

Protótipo de dungeon crawler tático em turnos, a partir do documento de concepção `future project/IDEIAS_DO_JOGO.md`. Entra-se pelo **Portão da Masmorra**, um prédio genérico na Rua dos Jogos da Vila (entre a Pista de Pins e a avenida), aberto desde o nível 1 de Treinador enquanto o modo é um esboço.

Este arquivo reúne três coisas: o que já está pronto, o que ainda falta para o modo deixar de ser protótipo e ideias que podem entrar depois. Os números são de protótipo e ainda não foram balanceados com partidas reais.

## Onde está o código

| Arquivo | O que faz |
|---|---|
| `src/core/dungeon.ts` | Regras puras: grade, PA, armas, dano, carga, troca, fusão, inimigos e IA, andares sem fim, saque, escada, forja. |
| `src/core/dungeon-gems.ts` | Gemas: tipos, graus, bônus, efeitos lendários, sorteio e lapidação. |
| `src/core/dungeon.test.ts` | Testes das regras (vitest). |
| `src/components/DungeonGame.vue` | Tela: escolha da equipe, grade, turno inimigo animado, painéis, fusão, forja, escada e fim. |
| `src/components/WeaponArt.vue` | Desenho em SVG de cada arma base, com a orbe do Pokémon de origem. |
| `src/components/FusionArt.vue` | Arte genérica de fusão: as duas armas de origem sobrepostas, com nome e origens. |
| `src/components/GemChip.vue` | Desenho de uma gema (ou encaixe vazio). |
| `src/core/village/town-layout.ts` | O prédio (`kind: 'masmorra'`). `VillageView.vue` abre o diálogo e a tela cheia. |

## Feito

### Acesso e equipe
- O Portão da Masmorra usa a fachada de casa de tijolos do atlas, tem o emoji 🗝️ e aparece no minimapa. O diálogo dele leva à tela cheia, como a Torre.
- A expedição começa com **um** Pokémon da coleção real: carta escaneada ou Digital Pokémon. Uma espécie sem stats, tipos ou arma no pacote aparece como «sem dados» e não entra, porque nenhum número é inventado. As outras vagas da equipe vêm da Pokébola durante a descida, até o limite de 6.

### Combate
- A sala é uma grade de 7×7 com pilares sorteados. Nenhuma casa fica isolada.
- Cada turno tem 6 PA. Mover custa 1 por casa, trocar custa 1, a poção custa 2 e a fusão custa 1. O custo do ataque depende da arma.
- Há 5 das 20 armas do catálogo, uma de cada ritmo: Lâminas duplas (rápida), Lança de combate (em linha), Martelo de impacto (pesado, abala a defesa), Emissor rápido (tiro reto) e Lançador balístico (área em cruz).
- Cada Pokémon tem a própria carga. A reserva recupera 25% por rodada. Quem esgota fica fora por 2 rodadas completas e volta com a carga cheia.
- A troca é grátis quando o ativo cai ou esgota. Quando não sobra ninguém, a expedição termina com aviso explícito.
- Tipos usam multiplicadores moderados: 1,25× na vantagem, 0,8× na resistência e 0,5× no lugar da imunidade. A munição mista divide o dano em 70%/30%, e só a parcela do tipo do próprio Pokémon ganha afinidade.
- Antes de gastar qualquer coisa, a tela mostra a prévia: casas alcançáveis com o custo, alvos válidos, área atingida e dano por alvo, com marcas de «eficaz», «resiste» e «protegido».
- A fusão custa 1 PA e 1 buff e dura 3 turnos. Ela usa a média dos stats dos dois e divide o dano recebido entre eles. O nome vem do catálogo e a arte mostra as duas armas de origem. As gemas também se somam: a fusão pega a média dos bônus e os efeitos lendários dos dois.
- Teclado no PC: 1–6 troca de Pokémon, M move, A ataca, E encerra o turno, G abre a forja, Enter confirma e Esc cancela.

### Arsenal completo (20 armas, 210 fusões)
- `src/core/dungeon-weapons.ts` traz as 20 armas do catálogo, cada uma com formato de ataque (adjacente, em linha, tiro reto, área em cruz, leque, em volta, teleguiado, armadilha) e um mecanismo próprio (cortes rápidos, estocada precisa, abalo, alcance em linha, sequência, bloqueio com revide, barreira, proteção orbital, golpe de escudo, rajada, estilhaços, ação sustentada/queimadura, carga, explosão, arco elétrico, perfuração, retorno, armadilha, corrente que puxa, enxame).
- **Como obter armas no loop da Masmorra:** ao limpar o **1º andar**, a Pokébola oferece 3 Pokémon ainda não usados da coleção real do jogador. Escolher um põe aquele Pokémon na equipe e na orbe da arma correspondente; a animação mostra o Pokémon entrando nela. A oferta volta ao limpar o 3º andar e depois a cada 3 andares (6, 9…), enquanto ainda houver Pokémon disponíveis e vaga na equipe de 6. Em vez de uma das três armas, o jogador pode evoluir um membro elegível para uma próxima forma real da Pokédex; evolução e arma escolhida valem só para a expedição atual, sem alterar a carta ou o Digital Pokémon guardado. Não há compra, saque aleatório de arma ou atribuição pelos atributos. A tabela fixa `core/data/pokemon-weapons.ts` determina a arma da espécie; formas regionais e Mega usam a espécie-base.
- As 210 fusões seguem a regra do catálogo: formato e mecanismo da primeira arma (ordem do catálogo) mais o mecanismo da segunda; armas iguais aplicam o mecanismo duas vezes. Nome, número (1–190 diferentes, 191–210 iguais) e texto saem idênticos aos do documento de concepção.
- No combate: armadilhas disparam em quem passa pela casa, barreiras duram 2 rodadas e contam como parede, bloqueio amortece o próximo golpe e revida de perto, queimadura tira HP no fim da rodada; inimigos podem morrer no turno deles. Inimigos usam só o formato da arma, sem mecanismos.
- Pokémon de dois tipos escolhe a munição no painel do ativo (sem custo de PA): só o 1º tipo, só o 2º, ou mista 70/30 em qualquer ordem.
- As 15 armas novas ainda usam um emblema genérico (hexágono com a orbe e o nome); a arte própria fica para depois.

### Descida sem fim
- Não existe último andar. A expedição só termina quando a equipe cai ou quando você escolhe **Sair com o espólio** na escada.
- Com a sala limpa, a escada 🪜 aparece e dá para andar à vontade sem gastar PA para pegar o saque. Na escada, você escolhe uma recompensa para descer (buff de fusão, poção ou sala segura), abre a forja ou sai.
- Os inimigos crescem a cada andar, sem teto: HP +20%, ataque +7% e defesas +4% por andar. O número de inimigos sobe até 6 e a chance de elite chega a 55%.
- Há um chefe a cada 5 andares, com 2,6× de HP e afixos que se acumulam a cada 10 andares.
- As espécies mudam com a profundidade: Pokémon de caverna no começo, as evoluções a partir do andar 5, formas finais no 10 e pseudolendários no 15. Os chefes mudam a cada degrau: Onix, Rhydon, Steelix, Tyranitar, Aggron, Metagross e Garchomp.
- A região muda a cada 5 andares (Caverna Úmida, Cripta Esquecida, Fornalha Profunda, Jardim Cristalino, Abismo Estelar), cada uma com a sua paleta, e depois dá a volta com «+N».
- O recorde de andar fica guardado no aparelho (`localStorage`). O fim da expedição mostra um resumo: andar mais fundo, inimigos, elites, chefes, gemas e lendárias.

### Gemas
- Cada arma tem 2 encaixes comuns e 1 lendário. Só dá para encaixar e lapidar com a sala limpa ou na escada; em combate, a mochila fica só para olhar.
- Gemas comuns:

  | Gema | Bônus por grau |
  |---|---|
  | Rubi | +8% de poder |
  | Safira | +2 de carga máxima |
  | Esmeralda | +10% de HP máximo |
  | Ametista | +7% de defesas |
  | Topázio | +5% de chance de crítico (×1,5), até 60% |

- Os graus são Lascada, Polida, Perfeita, Radiante e Estelar, e depois Estelar +N, sem teto. O grau das gemas achadas sobe a cada 6 andares.
- Lapidação: 3 gemas iguais do mesmo grau viram 1 do grau seguinte.
- Gemas lendárias, que mudam o ataque:

  | Gema | Efeito |
  |---|---|
  | Eco | 30% de chance de cada alvo levar mais 50% do dano |
  | Vampírica | Cura em 20% do dano causado |
  | Corrente | O acerto salta para um vizinho do alvo com 50% do dano |
  | Fênix | Uma vez por andar, quem a carrega volta com 30% do HP em vez de cair |
  | Ampulheta | +1 PA por turno |
  | Prismática | A munição vira mista com o 2º tipo do Pokémon; sem 2º tipo, +15% de poder |
  | Vendaval | Empurra cada alvo uma casa |

- De onde vêm:
  - Baús 🧰 aparecem em metade das salas. Neles, a chance de lendária sobe com o andar, até 20%.
  - Inimigos comuns deixam gema em 30% das vezes; elites, em 75%.
  - Todo chefe deixa uma lendária e uma comum.

### Inimigos e IA
- Cada inimigo escolhe a próxima casa por pontuação (`planEnemy`), segundo o perfil, que sai da arma e dos stats:
  - ⚔️ **Bruto**: chega ao alcance e cerca, evitando ficar colado nos aliados.
  - 🏹 **Atirador**: procura a distância ideal da arma e recua quando você encosta.
  - ✚ **Suporte**: cura o aliado mais ferido (20% do HP) e fica longe de você.
  - 🛡️ **Guardião**: segura a posição até você chegar a 3 casas. Também corre para o lado de um aliado ferido, e os vizinhos dele levam 25% menos dano.
  - 👑 **Chefe**: a cada 2 rodadas anuncia um golpe 3×3 e solta na rodada seguinte, se você não sair das casas marcadas. Com metade do HP, chama 2 reforços uma vez.
- Um inimigo ferido (abaixo de 25%) foge para se recuperar quando há um suporte por perto ou quando ele se regenera.
- Elites têm afixos: Blindado (+35% de defesas), Veloz (3 passos), Furioso (+30% de dano), Regenerante (8% de HP por rodada) e Vampírico (cura 30% do dano causado).
- A tela mostra o que cada inimigo pretende fazer (atacar, aproximar, recuar, curar, proteger, fugir, anunciar, soltar o golpe, chamar reforços) e a área ameaçada, que dá para desligar. Tocar num inimigo abre a ficha dele.
- O turno inimigo anda um inimigo por vez (`beginEnemyTurn` / `enemyStep` / `finishEnemyTurn`). Quem age pisca, e dano e cura sobem em números.

### Visual
- Cada arma base tem um desenho próprio em SVG, com uma orbe que mostra o GIF do Pokémon de origem. O anel da orbe tem a cor do tipo da munição, e um sprite que falta aparece como «?».
- Sprites balançam parados, escada e saque brilham, as casas do golpe do chefe pulsam, e há paleta por região e números de dano. Todas as animações respeitam `prefers-reduced-motion`.

## Falta (para deixar de ser protótipo)

- **Validar no navegador e em celular.** Nada disso foi visto rodando: as sessões no PC do dono não têm Node, e a verificação depende do CI do PR. Falta abrir a tela, jogar alguns andares e conferir o layout em 375 px.
- **Revisão da curadoria Pokémon → arma.** A tabela fixa cobre as 1025 espécies e não usa fórmula de stats; ainda falta o dono revisar, por linhagem, as associações menos emblemáticas do catálogo compactado.
- **Arte própria das 15 armas novas** (hoje emblema genérico).
- **Balanceamento.** Ver se 6 PA e os custos dão boas decisões, se a curva de dificuldade sem teto acompanha a das gemas (a dificuldade cresce em linha e as gemas também, mas a lapidação é exponencial no custo) e se o chefe e as elites ficam justos.
- **Salvar a expedição.** Fechar a tela perde a descida atual, então falta guardar o estado (ele é serializável) e oferecer «continuar».
- **Recompensa fora da masmorra.** Gemas e andares ainda não valem nada na Vila: falta decidir o que volta (moedas, XP de Treinador, um item, a Pokédex) sem quebrar a economia da Vila.
- **Efeitos de estado** (queimado, envenenado, paralisado), que o documento cita como estudo para as munições mistas.
- **Opção para desligar as animações mais pesadas** (regra do projeto para efeitos que pesam na GPU), se o teste em celular mostrar custo.
- **Acessibilidade:** foco do teclado na grade, leitura das intenções por leitor de tela e tamanho dos alvos de toque no celular.
- **Testes de componente** (happy-dom) para a tela, além dos testes das regras.

## Pode ser feito (ideias)

- Salas com formatos diferentes, maiores que 7×7, e uma escolha de caminho entre duas portas: uma mais difícil, com saque melhor.
- Eventos de sala: altar que troca HP por gema, mercador que troca gemas por poções, armadilhas e sala do tesouro.
- Mais gemas lendárias: perfurar alvos alinhados, dar um turno extra ao derrotar, refletir dano, gelo que deixa o alvo lento, imã que puxa o saque.
- Um engaste sinérgico: duas lendárias específicas na mesma fusão destravam um efeito combinado.
- Captura: derrotar uma elite pela primeira vez a registra na Pokédex (só como vista, sem fingir que foi capturada).
- Modificadores escolhidos ao entrar (mais difícil, com saque melhor), placar diário com semente fixa e desafio semanal.
- O HP do treinador e as ações de emergência que o documento deixa em aberto.
- Arte própria para algumas fusões populares, mantendo a arte genérica para as outras.
- Usar os sprites locais de caminhada (PMD) para animar os movimentos casa a casa.
- Som: passos, golpes, gemas e chefe, com o volume da Vila.
