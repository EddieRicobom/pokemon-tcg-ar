# Conceito de jogo: Pokémon, armas e masmorras

> Documento de concepção. As regras e os números abaixo são propostas para protótipo, não funcionalidades implementadas no projeto atual. O catálogo de armas e fusões aparece ao final.

## Visão geral

Um dungeon crawler tático em turnos, com a energia visual de um hack and slash: golpes rápidos, animações encadeadas, efeitos de impacto e grupos de inimigos. O jogador explora masmorras, administra uma equipe de até seis Pokémon e alterna entre eles para atacar, conservar carga e aproveitar combinações. Um buff raro permite fundir temporariamente dois membros da equipe.

O jogo é pensado para celular, PC e navegador. O combate acontece em uma grade; o jogador escolhe posições e alvos, e as animações tornam as ações dinâmicas sem alterar as regras de turno. O enquadramento exato e a representação visual das armas ainda precisam ser definidos no protótipo.

### Ciclo de exploração

1. Montar uma equipe de até seis Pokémon e preparar suas armas e munições.
2. Entrar em uma masmorra, explorar salas, enfrentar inimigos e encontrar recursos.
3. Alternar os Pokémon para administrar HP e carga, movendo-se e atacando com pontos de ação.
4. Encontrar buffs, itens de recuperação e melhorias; escolher quando usar uma fusão.
5. Enfrentar encontros mais difíceis e um chefe, então sair ou avançar conforme o formato da masmorra.

Progressão, captura, narrativa e geração das masmorras ainda não foram especificadas. As regras abaixo tratam principalmente do combate.

## Equipe e representação no combate

Cada espaço da equipe guarda um Pokémon, seus tipos, stats, HP atual, arma, munição, carga atual e estado. Um Pokémon fica ativo de cada vez; os outros permanecem na reserva. O treinador e o Pokémon ativo compartilham a posição de combate na grade: a troca mantém a posição, salvo se uma habilidade disser o contrário. A aparência dessa representação compartilhada é uma decisão visual em aberto.

As armas determinam o formato do ataque. As munições determinam tipos e efeitos elementais. O Pokémon fornece seus próprios tipos e stats. **A associação de tipos de Pokémon a armas e munições será definida separadamente por outra IA**; os exemplos deste documento não são um catálogo de permissões.

## Layout da tela de combate

```text
┌────────────────────────────────────────────────────────┐
│ HP treinador*        TURNO 4          PA ● ● ● ● ● ●  │
│                                                        │
│                  MAPA EM GRADE                         │
│        Inimigos, alcance e áreas ameaçadas             │
│                                                        │
│ Pokémon ativo: nome                   HP █████░        │
│ Arma: nome     Munição: tipo(s)       Carga 8/12       │
│                                                        │
│ [Mover] [Ataque] [Especial] [Item] [Fusão] [Encerrar] │
│                                                        │
│ [1 ativo] [2 pronto] [3 CD:1] [4 pronto] [5] [6]     │
└────────────────────────────────────────────────────────┘
* HP do treinador é opcional e ainda precisa de uma regra própria.
```

O centro da tela fica reservado à grade e aos efeitos. Selecionar uma ação destaca casas válidas, alcance, área atingida, custo em PA e carga antes da confirmação. Cada espaço da equipe mostra retrato, tipos do Pokémon, HP, carga e estado; o painel do ativo mostra também a arma e os tipos da munição. Tipos do Pokémon e da munição aparecem separados.

No celular, toques selecionam ações e casas; uma prévia pede confirmação antes de gastar recursos. No PC, mouse faz a seleção, teclas 1 a 6 trocam de Pokémon e atalhos configuráveis acionam comandos. Detalhes de acessibilidade, tamanho dos controles e orientação da tela dependem de testes.

## Turnos e pontos de ação

Cada turno do jogador começa com **6 pontos de ação (PA)** como valor inicial de teste. O jogador escolhe ações em qualquer ordem e encerra quando quiser ou quando não puder agir. Em seguida, os inimigos executam seus turnos; termina então a rodada e começa o próximo turno do jogador.

| Ação | Custo inicial |
|---|---:|
| Mover uma casa | 1 PA |
| Ataque rápido | 1 PA |
| Ataque médio | 2 PA |
| Ataque pesado | 3 PA |
| Trocar de Pokémon | 1 PA |
| Usar item | 2 PA |
| Ativar fusão | 1 PA |

Os custos são valores de protótipo, não regras definitivas. Cada arma define ações e custos próprios. Armas rápidas permitem mais ataques e maior flexibilidade de alvo; armas lentas compensam com dano, alcance, área ou controle. O dano por PA, a carga consumida e as limitações de cada arma precisam ser balanceados em conjunto.

Exemplo: atacar duas vezes por 1 PA, trocar por 1 PA e usar um ataque pesado de 3 PA consome os 6 PA. A troca não tem limite fixo por turno além do custo e da disponibilidade dos Pokémon.

## Stats e tipos dos Pokémon

| Stat | Papel inicial |
|---|---|
| HP | Quanto dano o Pokémon suporta antes de ser incapacitado. |
| Attack | Modifica o dano de ataques classificados como físicos. |
| Special Attack | Modifica o dano de ataques classificados como especiais. |
| Defense | Reduz dano físico recebido. |
| Special Defense | Reduz dano especial recebido. |
| Speed | Influencia iniciativa e pode conceder bônus limitado de movimento. |

A arma define o custo em PA, o alcance, a área, o consumo e se cada ataque é físico ou especial. Uma fusão pode ter etapas físicas e especiais calculadas separadamente. Speed não reduz automaticamente o custo em PA: mudanças de 2 para 1 PA podem dobrar o número de usos e exigem balanceamento próprio.

Como ponto de partida, uma parcela de dano pode receber bônus de afinidade quando seu tipo coincide com um tipo do Pokémon. O valor sugerido para teste é de 10% a 20%. Vantagem e resistência de tipo também podem usar multiplicadores moderados; 1,25× e 0,8× são hipóteses, ainda não valores validados. Para evitar um impasse, imunidades podem virar forte resistência se o jogo não garantir uma alternativa ao jogador.

## Carga, HP e recuperação

**Carga** é a reserva de uso da arma de cada Pokémon: ataques gastam PA do turno e carga do Pokémon. Armas diferentes podem gastar quantidades diferentes. A capacidade base vem da arma e pode receber bônus ou melhorias; HP, Defense e Special Defense não são usados diretamente como munição.

| Estado | Regra inicial proposta |
|---|---|
| Ativo | Pode executar ações enquanto tiver PA, HP e carga suficientes. |
| Reserva | Se não estiver exausto nem incapacitado, recupera 25% da carga máxima ao fim de cada rodada completa; não recupera HP automaticamente. |
| Exausto | Ao chegar a zero de carga, sai de combate e fica indisponível por 2 rodadas completas; depois volta à reserva com a carga cheia. |
| Incapacitado | Ao chegar a zero de HP, fica indisponível até receber cura ou outra recuperação definida pelo jogo. |

A rodada em que a carga chega a zero não conta para os dois turnos de cooldown: contam-se as duas rodadas completas seguintes. Se o Pokémon voltar à reserva antes de esgotar, segue a recuperação normal. Valores e arredondamento precisam ser definidos no protótipo.

Se o ativo ficar exausto ou incapacitado, o jogador escolhe um Pokémon disponível para assumir a mesma posição sem custo extra de PA; os PA restantes continuam disponíveis. Se não houver nenhum disponível, o jogo precisa oferecer uma resolução explícita, como fim do encontro ou uma ação de emergência. Essa condição ainda precisa ser decidida. Itens e salas seguras podem restaurar HP ou carga, mas não substituem as regras de cooldown sem indicar isso claramente.

O HP do treinador no esboço de interface é apenas uma possibilidade. Até haver uma regra para ele, a proposta funcional usa o HP dos Pokémon; não se deve tratar as duas barras como recursos já definidos.

## Munições e tipos

Os tipos Pokémon são a base elemental das munições. Uma munição também pode definir efeito, capacidade e custo; duas munições do mesmo tipo podem ter propriedades diferentes. Os 18 tipos são Normal, Fogo, Água, Elétrico, Planta, Gelo, Lutador, Venenoso, Terrestre, Voador, Psíquico, Inseto, Pedra, Fantasma, Dragão, Sombrio, Metálico e Fada.

Munições simples têm um tipo. Munições mistas podem ter dois, sem causar o dano integral duas vezes. Proposta inicial: dividir o dano em **70% do tipo principal e 30% do secundário**, calcular a interação de cada parcela com o alvo e aplicar afinidade apenas à parcela correspondente ao tipo do Pokémon. Os efeitos secundários podem ser mais fracos ou a munição mista mais cara que uma simples. Essa proporção e o catálogo de combinações válidas ainda dependem de testes e da definição por outra IA.

Exemplos de efeitos para estudo: Água/Elétrico molha e aplica descarga; Planta/Venenoso pode enraizar e envenenar levemente; Gelo/Pedra pode desacelerar e causar impacto. Esses efeitos são propostas, não permissões universais para qualquer Pokémon.

## Buff e seleção de fusão

Encontrar um buff concede uma **carga de fusão** que pode ser guardada para um momento escolhido. Com seis Pokémon há 15 pares distintos possíveis entre membros da equipe; dois Pokémon podem usar a mesma arma, por isso o catálogo também inclui fusões de armas iguais. A ordem do par não importa.

Ao selecionar Fusão, o jogador escolhe dois membros, consulta a prévia e confirma. Cancelar não consome PA nem o buff. No celular, a seleção acontece durante o turno do jogador, com o combate aguardando a escolha; no PC também pode usar teclas 1 a 6.

```text
┌────────────────── ESCOLHER FUSÃO ──────────────────┐
│ [Pokémon 1 ✓] [Pokémon 2]   [Pokémon 3 ✓]        │
│ [Pokémon 4]   [Pokémon 5]   [Pokémon 6]          │
│                                                    │
│ Arma A + Arma B → nome e comportamento da fusão   │
│ Munição: A / B / mista compatível                 │
│ Duração: 3 turnos     Ativação: 1 PA + 1 buff    │
│ Carga temporária: valor da fusão                  │
│                                                    │
│                [Cancelar] [Ativar]                │
└────────────────────────────────────────────────────┘
``

Regras iniciais para protótipo:

1. Qualquer par de membros diferentes pode ser escolhido quando ambos estão disponíveis. Pokémon incapacitados ou em cooldown aparecem bloqueados, com o motivo. Permitir participantes em cooldown é uma alternativa ainda não decidida.
2. Confirmar custa 1 PA e consome uma carga de fusão. A fusão começa imediatamente e pode agir com os PA restantes.
3. Dura até o final do terceiro turno do jogador contando o turno de ativação, ou até a carga temporária acabar. O contador deve mostrar essa regra claramente.
4. O ataque básico e o especial da arma híbrida têm custos próprios em PA e carga. A munição pode ser a de um dos participantes ou uma mista compatível, se o catálogo permitir.
5. Para ataques físicos ou especiais, usar respectivamente a média de Attack ou Special Attack dos participantes. Etapas de categorias diferentes são calculadas separadamente. A afinidade de cada parcela de munição depende dos tipos dos participantes; a fórmula exata para a dupla ainda precisa ser definida.
6. Enquanto a fusão estiver ativa, usar a média das defesas aplicáveis e dividir o dano resultante igualmente entre os HP dos dois participantes. Se um chegar a zero de HP, a fusão termina e ele fica incapacitado.
7. Ao terminar, a carga temporária desaparece. Os participantes mantêm sua carga anterior à fusão e entram em recuperação curta de 1 rodada completa; quem estiver incapacitado segue a regra de incapacitação. Essa recuperação não altera o HP.

O balanceamento deve definir arredondamento, efeitos de estado e o que ocorre se um participante for incapacitado durante o turno inimigo. A interface deve mostrar duração, carga e HP dos dois membros.

## Exemplo de uma rodada

Com 6 PA, o jogador move duas casas (2 PA), usa duas vezes uma arma rápida (2 PA), troca de Pokémon (1 PA) e ativa um ataque rápido do novo Pokémon (1 PA). Após encerrar, os inimigos agem. Ao fim da rodada, os membros elegíveis na reserva recuperam carga. Em uma rodada posterior, um buff pode ser gasto por 1 PA para ativar uma fusão; os PA que sobrarem podem ser usados pela arma híbrida.

## Pontos para validar no protótipo

- Se 6 PA e os custos propostos produzem decisões interessantes sem turnos longos demais.
- Se armas rápidas, lentas e de área têm oportunidades equivalentes, considerando dano por PA e carga.
- Se a recuperação de carga incentiva trocas sem exigir microgerenciamento excessivo.
- Se as fusões oferecem escolha real, com duração, custo e riscos claros.
- Se a grade, as prévias e os seis espaços da equipe são legíveis em telas pequenas.
- Como resolver ausência de Pokémon disponíveis, iniciativa inimiga, cura, progressão e regras definitivas de tipos.

---

# Catálogo de armas e fusões

Esta versão contém 20 tipos: cinco armas corpo a corpo, quatro defensivas (incluindo a híbrida Espada e escudo), oito de distância e três de controle. As armas definem o formato do ataque; a munição, escolhida separadamente, define tipos e efeitos. São ideias de design, não funcionalidades implementadas.

## Regras do catálogo

- Cada fusão combina exatamente duas armas; a ordem não importa. São 190 pares de armas diferentes e 20 pares de armas iguais, totalizando 210.
- Na partida, a fusão exige dois Pokémon distintos, mesmo quando suas armas são iguais.
- A tabela usa um ataque principal e incorpora o mecanismo da segunda arma como proposta inicial. Custos de PA, alcance, duração, interações e carga precisam de balanceamento. Não se presume que uma fusão executa ambos os efeitos gratuitamente.
- A munição é independente das armas. As associações entre Pokémon, armas e munições serão definidas separadamente.

## 20 armas básicas

| Nº | Arma | Categoria | Funcionamento |
|---:|---|---|---|
| 1 | **Lâminas duplas** | Corpo a corpo | Ataca rapidamente um inimigo adjacente. |
| 2 | **Espada longa** | Corpo a corpo | Executa cortes precisos e uma estocada de alcance curto. |
| 3 | **Martelo de impacto** | Corpo a corpo | Desfere golpes lentos capazes de abalar a defesa. |
| 4 | **Lança de combate** | Corpo a corpo | Ataca em linha a até duas casas de distância. |
| 5 | **Manoplas** | Corpo a corpo | Combina socos rápidos com um golpe carregado. |
| 6 | **Escudo de impacto** | Defesa | Bloqueia em uma direção e pode golpear inimigos adjacentes. |
| 7 | **Projetor de barreira** | Defesa | Cria uma proteção temporária em uma casa ou direção escolhida. |
| 8 | **Guardião orbital** | Defesa | Mantém um dispositivo de proteção ao redor do usuário. |
| 9 | **Espada e escudo** | Defesa | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. |
| 10 | **Emissor rápido** | Distância | Dispara projéteis precisos em sequência. |
| 11 | **Canhão de dispersão** | Distância | Dispara projéteis em cone, eficazes de perto. |
| 12 | **Projetor contínuo** | Distância | Projeta energia em linha por uma ação sustentada. |
| 13 | **Canhão de carga** | Distância | Carrega energia para um disparo potente. |
| 14 | **Lançador balístico** | Distância | Lança um projétil em arco que explode ao atingir a área. |
| 15 | **Condutor de arco** | Distância | Conecta energia a um alvo e a outros próximos. |
| 16 | **Rifle perfurante** | Distância | Dispara um tiro preciso que atravessa alvos alinhados. |
| 17 | **Disco retornável** | Distância | Lança um disco que atravessa alvos e retorna. |
| 18 | **Lançador de armadilhas** | Controle | Instala dispositivos ativados por proximidade. |
| 19 | **Lança-correntes** | Controle | Prende um alvo ou superfície para alterar o posicionamento. |
| 20 | **Enxameador** | Controle | Libera pequenos projéteis que perseguem inimigos. |

### Exemplo de ações: Espada e escudo

Esta arma híbrida ocupa um único espaço de equipamento; não exige buff de fusão. Os custos são pontos de partida para testes.

| Ação | PA | Efeito proposto |
|---|---:|---|
| Corte | 1 | Ataca um inimigo adjacente. |
| Postura defensiva | 1 | Reduz o dano do próximo ataque vindo da direção escolhida. |
| Avanço protegido | 2 | Move uma casa e protege na direção do movimento. |
| Golpe de escudo | 2 | Causa pouco dano e pode empurrar ou interromper o alvo. |
| Contra-ataque | 3 | Assume postura defensiva e responde ao primeiro ataque bloqueado. |

Duração da postura, consumo de carga e regras contra múltiplos ataques precisam de balanceamento.

## 190 fusões entre armas diferentes

Cada par aparece uma única vez. Os nomes compostos identificam seus componentes; nomes próprios podem ser escolhidos depois.

### Lâminas duplas

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 1 | **Lâminas duplas + Espada longa** | Ataca rapidamente um inimigo adjacente. O componente espada longa acrescenta uma estocada curta e precisa. |
| 2 | **Lâminas duplas + Martelo de impacto** | Ataca rapidamente um inimigo adjacente. O componente martelo de impacto acrescenta um golpe pesado que abala a defesa. |
| 3 | **Lâminas duplas + Lança de combate** | Ataca rapidamente um inimigo adjacente. O componente lança de combate estende o ataque em linha por até duas casas. |
| 4 | **Lâminas duplas + Manoplas** | Ataca rapidamente um inimigo adjacente. O componente manoplas acrescenta uma sequência de socos e um golpe carregado. |
| 5 | **Lâminas duplas + Escudo de impacto** | Ataca rapidamente um inimigo adjacente. O componente escudo de impacto permite bloquear em uma direção e revidar de perto. |
| 6 | **Lâminas duplas + Projetor de barreira** | Ataca rapidamente um inimigo adjacente. O componente projetor de barreira cria uma barreira temporária na direção escolhida. |
| 7 | **Lâminas duplas + Guardião orbital** | Ataca rapidamente um inimigo adjacente. O componente guardião orbital adiciona proteção orbital temporária. |
| 8 | **Lâminas duplas + Espada e escudo** | Ataca rapidamente um inimigo adjacente. O componente espada e escudo acrescenta bloqueio direcional e um golpe de escudo. |
| 9 | **Lâminas duplas + Emissor rápido** | Ataca rapidamente um inimigo adjacente. O componente emissor rápido acrescenta uma sequência rápida de projéteis. |
| 10 | **Lâminas duplas + Canhão de dispersão** | Ataca rapidamente um inimigo adjacente. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 11 | **Lâminas duplas + Projetor contínuo** | Ataca rapidamente um inimigo adjacente. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 12 | **Lâminas duplas + Canhão de carga** | Ataca rapidamente um inimigo adjacente. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 13 | **Lâminas duplas + Lançador balístico** | Ataca rapidamente um inimigo adjacente. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 14 | **Lâminas duplas + Condutor de arco** | Ataca rapidamente um inimigo adjacente. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 15 | **Lâminas duplas + Rifle perfurante** | Ataca rapidamente um inimigo adjacente. O componente rifle perfurante permite atravessar alvos alinhados. |
| 16 | **Lâminas duplas + Disco retornável** | Ataca rapidamente um inimigo adjacente. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 17 | **Lâminas duplas + Lançador de armadilhas** | Ataca rapidamente um inimigo adjacente. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 18 | **Lâminas duplas + Lança-correntes** | Ataca rapidamente um inimigo adjacente. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 19 | **Lâminas duplas + Enxameador** | Ataca rapidamente um inimigo adjacente. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Espada longa

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 20 | **Espada longa + Martelo de impacto** | Executa cortes precisos e uma estocada de alcance curto. O componente martelo de impacto acrescenta um golpe pesado que abala a defesa. |
| 21 | **Espada longa + Lança de combate** | Executa cortes precisos e uma estocada de alcance curto. O componente lança de combate estende o ataque em linha por até duas casas. |
| 22 | **Espada longa + Manoplas** | Executa cortes precisos e uma estocada de alcance curto. O componente manoplas acrescenta uma sequência de socos e um golpe carregado. |
| 23 | **Espada longa + Escudo de impacto** | Executa cortes precisos e uma estocada de alcance curto. O componente escudo de impacto permite bloquear em uma direção e revidar de perto. |
| 24 | **Espada longa + Projetor de barreira** | Executa cortes precisos e uma estocada de alcance curto. O componente projetor de barreira cria uma barreira temporária na direção escolhida. |
| 25 | **Espada longa + Guardião orbital** | Executa cortes precisos e uma estocada de alcance curto. O componente guardião orbital adiciona proteção orbital temporária. |
| 26 | **Espada longa + Espada e escudo** | Executa cortes precisos e uma estocada de alcance curto. O componente espada e escudo acrescenta bloqueio direcional e um golpe de escudo. |
| 27 | **Espada longa + Emissor rápido** | Executa cortes precisos e uma estocada de alcance curto. O componente emissor rápido acrescenta uma sequência rápida de projéteis. |
| 28 | **Espada longa + Canhão de dispersão** | Executa cortes precisos e uma estocada de alcance curto. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 29 | **Espada longa + Projetor contínuo** | Executa cortes precisos e uma estocada de alcance curto. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 30 | **Espada longa + Canhão de carga** | Executa cortes precisos e uma estocada de alcance curto. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 31 | **Espada longa + Lançador balístico** | Executa cortes precisos e uma estocada de alcance curto. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 32 | **Espada longa + Condutor de arco** | Executa cortes precisos e uma estocada de alcance curto. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 33 | **Espada longa + Rifle perfurante** | Executa cortes precisos e uma estocada de alcance curto. O componente rifle perfurante permite atravessar alvos alinhados. |
| 34 | **Espada longa + Disco retornável** | Executa cortes precisos e uma estocada de alcance curto. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 35 | **Espada longa + Lançador de armadilhas** | Executa cortes precisos e uma estocada de alcance curto. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 36 | **Espada longa + Lança-correntes** | Executa cortes precisos e uma estocada de alcance curto. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 37 | **Espada longa + Enxameador** | Executa cortes precisos e uma estocada de alcance curto. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Martelo de impacto

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 38 | **Martelo de impacto + Lança de combate** | Desfere golpes lentos capazes de abalar a defesa. O componente lança de combate estende o ataque em linha por até duas casas. |
| 39 | **Martelo de impacto + Manoplas** | Desfere golpes lentos capazes de abalar a defesa. O componente manoplas acrescenta uma sequência de socos e um golpe carregado. |
| 40 | **Martelo de impacto + Escudo de impacto** | Desfere golpes lentos capazes de abalar a defesa. O componente escudo de impacto permite bloquear em uma direção e revidar de perto. |
| 41 | **Martelo de impacto + Projetor de barreira** | Desfere golpes lentos capazes de abalar a defesa. O componente projetor de barreira cria uma barreira temporária na direção escolhida. |
| 42 | **Martelo de impacto + Guardião orbital** | Desfere golpes lentos capazes de abalar a defesa. O componente guardião orbital adiciona proteção orbital temporária. |
| 43 | **Martelo de impacto + Espada e escudo** | Desfere golpes lentos capazes de abalar a defesa. O componente espada e escudo acrescenta bloqueio direcional e um golpe de escudo. |
| 44 | **Martelo de impacto + Emissor rápido** | Desfere golpes lentos capazes de abalar a defesa. O componente emissor rápido acrescenta uma sequência rápida de projéteis. |
| 45 | **Martelo de impacto + Canhão de dispersão** | Desfere golpes lentos capazes de abalar a defesa. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 46 | **Martelo de impacto + Projetor contínuo** | Desfere golpes lentos capazes de abalar a defesa. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 47 | **Martelo de impacto + Canhão de carga** | Desfere golpes lentos capazes de abalar a defesa. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 48 | **Martelo de impacto + Lançador balístico** | Desfere golpes lentos capazes de abalar a defesa. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 49 | **Martelo de impacto + Condutor de arco** | Desfere golpes lentos capazes de abalar a defesa. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 50 | **Martelo de impacto + Rifle perfurante** | Desfere golpes lentos capazes de abalar a defesa. O componente rifle perfurante permite atravessar alvos alinhados. |
| 51 | **Martelo de impacto + Disco retornável** | Desfere golpes lentos capazes de abalar a defesa. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 52 | **Martelo de impacto + Lançador de armadilhas** | Desfere golpes lentos capazes de abalar a defesa. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 53 | **Martelo de impacto + Lança-correntes** | Desfere golpes lentos capazes de abalar a defesa. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 54 | **Martelo de impacto + Enxameador** | Desfere golpes lentos capazes de abalar a defesa. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Lança de combate

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 55 | **Lança de combate + Manoplas** | Ataca em linha a até duas casas de distância. O componente manoplas acrescenta uma sequência de socos e um golpe carregado. |
| 56 | **Lança de combate + Escudo de impacto** | Ataca em linha a até duas casas de distância. O componente escudo de impacto permite bloquear em uma direção e revidar de perto. |
| 57 | **Lança de combate + Projetor de barreira** | Ataca em linha a até duas casas de distância. O componente projetor de barreira cria uma barreira temporária na direção escolhida. |
| 58 | **Lança de combate + Guardião orbital** | Ataca em linha a até duas casas de distância. O componente guardião orbital adiciona proteção orbital temporária. |
| 59 | **Lança de combate + Espada e escudo** | Ataca em linha a até duas casas de distância. O componente espada e escudo acrescenta bloqueio direcional e um golpe de escudo. |
| 60 | **Lança de combate + Emissor rápido** | Ataca em linha a até duas casas de distância. O componente emissor rápido acrescenta uma sequência rápida de projéteis. |
| 61 | **Lança de combate + Canhão de dispersão** | Ataca em linha a até duas casas de distância. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 62 | **Lança de combate + Projetor contínuo** | Ataca em linha a até duas casas de distância. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 63 | **Lança de combate + Canhão de carga** | Ataca em linha a até duas casas de distância. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 64 | **Lança de combate + Lançador balístico** | Ataca em linha a até duas casas de distância. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 65 | **Lança de combate + Condutor de arco** | Ataca em linha a até duas casas de distância. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 66 | **Lança de combate + Rifle perfurante** | Ataca em linha a até duas casas de distância. O componente rifle perfurante permite atravessar alvos alinhados. |
| 67 | **Lança de combate + Disco retornável** | Ataca em linha a até duas casas de distância. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 68 | **Lança de combate + Lançador de armadilhas** | Ataca em linha a até duas casas de distância. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 69 | **Lança de combate + Lança-correntes** | Ataca em linha a até duas casas de distância. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 70 | **Lança de combate + Enxameador** | Ataca em linha a até duas casas de distância. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Manoplas

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 71 | **Manoplas + Escudo de impacto** | Combina socos rápidos com um golpe carregado. O componente escudo de impacto permite bloquear em uma direção e revidar de perto. |
| 72 | **Manoplas + Projetor de barreira** | Combina socos rápidos com um golpe carregado. O componente projetor de barreira cria uma barreira temporária na direção escolhida. |
| 73 | **Manoplas + Guardião orbital** | Combina socos rápidos com um golpe carregado. O componente guardião orbital adiciona proteção orbital temporária. |
| 74 | **Manoplas + Espada e escudo** | Combina socos rápidos com um golpe carregado. O componente espada e escudo acrescenta bloqueio direcional e um golpe de escudo. |
| 75 | **Manoplas + Emissor rápido** | Combina socos rápidos com um golpe carregado. O componente emissor rápido acrescenta uma sequência rápida de projéteis. |
| 76 | **Manoplas + Canhão de dispersão** | Combina socos rápidos com um golpe carregado. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 77 | **Manoplas + Projetor contínuo** | Combina socos rápidos com um golpe carregado. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 78 | **Manoplas + Canhão de carga** | Combina socos rápidos com um golpe carregado. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 79 | **Manoplas + Lançador balístico** | Combina socos rápidos com um golpe carregado. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 80 | **Manoplas + Condutor de arco** | Combina socos rápidos com um golpe carregado. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 81 | **Manoplas + Rifle perfurante** | Combina socos rápidos com um golpe carregado. O componente rifle perfurante permite atravessar alvos alinhados. |
| 82 | **Manoplas + Disco retornável** | Combina socos rápidos com um golpe carregado. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 83 | **Manoplas + Lançador de armadilhas** | Combina socos rápidos com um golpe carregado. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 84 | **Manoplas + Lança-correntes** | Combina socos rápidos com um golpe carregado. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 85 | **Manoplas + Enxameador** | Combina socos rápidos com um golpe carregado. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Escudo de impacto

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 86 | **Escudo de impacto + Projetor de barreira** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente projetor de barreira cria uma barreira temporária na direção escolhida. |
| 87 | **Escudo de impacto + Guardião orbital** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente guardião orbital adiciona proteção orbital temporária. |
| 88 | **Escudo de impacto + Espada e escudo** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente espada e escudo acrescenta bloqueio direcional e um golpe de escudo. |
| 89 | **Escudo de impacto + Emissor rápido** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente emissor rápido acrescenta uma sequência rápida de projéteis. |
| 90 | **Escudo de impacto + Canhão de dispersão** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 91 | **Escudo de impacto + Projetor contínuo** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 92 | **Escudo de impacto + Canhão de carga** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 93 | **Escudo de impacto + Lançador balístico** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 94 | **Escudo de impacto + Condutor de arco** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 95 | **Escudo de impacto + Rifle perfurante** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente rifle perfurante permite atravessar alvos alinhados. |
| 96 | **Escudo de impacto + Disco retornável** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 97 | **Escudo de impacto + Lançador de armadilhas** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 98 | **Escudo de impacto + Lança-correntes** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 99 | **Escudo de impacto + Enxameador** | Bloqueia em uma direção e pode golpear inimigos adjacentes. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Projetor de barreira

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 100 | **Projetor de barreira + Guardião orbital** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente guardião orbital adiciona proteção orbital temporária. |
| 101 | **Projetor de barreira + Espada e escudo** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente espada e escudo acrescenta bloqueio direcional e um golpe de escudo. |
| 102 | **Projetor de barreira + Emissor rápido** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente emissor rápido acrescenta uma sequência rápida de projéteis. |
| 103 | **Projetor de barreira + Canhão de dispersão** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 104 | **Projetor de barreira + Projetor contínuo** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 105 | **Projetor de barreira + Canhão de carga** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 106 | **Projetor de barreira + Lançador balístico** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 107 | **Projetor de barreira + Condutor de arco** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 108 | **Projetor de barreira + Rifle perfurante** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente rifle perfurante permite atravessar alvos alinhados. |
| 109 | **Projetor de barreira + Disco retornável** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 110 | **Projetor de barreira + Lançador de armadilhas** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 111 | **Projetor de barreira + Lança-correntes** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 112 | **Projetor de barreira + Enxameador** | Cria uma proteção temporária em uma casa ou direção escolhida. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Guardião orbital

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 113 | **Guardião orbital + Espada e escudo** | Mantém um dispositivo de proteção ao redor do usuário. O componente espada e escudo acrescenta bloqueio direcional e um golpe de escudo. |
| 114 | **Guardião orbital + Emissor rápido** | Mantém um dispositivo de proteção ao redor do usuário. O componente emissor rápido acrescenta uma sequência rápida de projéteis. |
| 115 | **Guardião orbital + Canhão de dispersão** | Mantém um dispositivo de proteção ao redor do usuário. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 116 | **Guardião orbital + Projetor contínuo** | Mantém um dispositivo de proteção ao redor do usuário. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 117 | **Guardião orbital + Canhão de carga** | Mantém um dispositivo de proteção ao redor do usuário. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 118 | **Guardião orbital + Lançador balístico** | Mantém um dispositivo de proteção ao redor do usuário. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 119 | **Guardião orbital + Condutor de arco** | Mantém um dispositivo de proteção ao redor do usuário. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 120 | **Guardião orbital + Rifle perfurante** | Mantém um dispositivo de proteção ao redor do usuário. O componente rifle perfurante permite atravessar alvos alinhados. |
| 121 | **Guardião orbital + Disco retornável** | Mantém um dispositivo de proteção ao redor do usuário. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 122 | **Guardião orbital + Lançador de armadilhas** | Mantém um dispositivo de proteção ao redor do usuário. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 123 | **Guardião orbital + Lança-correntes** | Mantém um dispositivo de proteção ao redor do usuário. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 124 | **Guardião orbital + Enxameador** | Mantém um dispositivo de proteção ao redor do usuário. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Espada e escudo

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 125 | **Espada e escudo + Emissor rápido** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente emissor rápido acrescenta uma sequência rápida de projéteis. |
| 126 | **Espada e escudo + Canhão de dispersão** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 127 | **Espada e escudo + Projetor contínuo** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 128 | **Espada e escudo + Canhão de carga** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 129 | **Espada e escudo + Lançador balístico** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 130 | **Espada e escudo + Condutor de arco** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 131 | **Espada e escudo + Rifle perfurante** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente rifle perfurante permite atravessar alvos alinhados. |
| 132 | **Espada e escudo + Disco retornável** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 133 | **Espada e escudo + Lançador de armadilhas** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 134 | **Espada e escudo + Lança-correntes** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 135 | **Espada e escudo + Enxameador** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Emissor rápido

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 136 | **Emissor rápido + Canhão de dispersão** | Dispara projéteis precisos em sequência. O componente canhão de dispersão distribui projéteis em um cone de curto alcance. |
| 137 | **Emissor rápido + Projetor contínuo** | Dispara projéteis precisos em sequência. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 138 | **Emissor rápido + Canhão de carga** | Dispara projéteis precisos em sequência. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 139 | **Emissor rápido + Lançador balístico** | Dispara projéteis precisos em sequência. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 140 | **Emissor rápido + Condutor de arco** | Dispara projéteis precisos em sequência. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 141 | **Emissor rápido + Rifle perfurante** | Dispara projéteis precisos em sequência. O componente rifle perfurante permite atravessar alvos alinhados. |
| 142 | **Emissor rápido + Disco retornável** | Dispara projéteis precisos em sequência. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 143 | **Emissor rápido + Lançador de armadilhas** | Dispara projéteis precisos em sequência. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 144 | **Emissor rápido + Lança-correntes** | Dispara projéteis precisos em sequência. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 145 | **Emissor rápido + Enxameador** | Dispara projéteis precisos em sequência. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Canhão de dispersão

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 146 | **Canhão de dispersão + Projetor contínuo** | Dispara projéteis em cone, eficazes de perto. O componente projetor contínuo permite sustentar o efeito durante a ação. |
| 147 | **Canhão de dispersão + Canhão de carga** | Dispara projéteis em cone, eficazes de perto. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 148 | **Canhão de dispersão + Lançador balístico** | Dispara projéteis em cone, eficazes de perto. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 149 | **Canhão de dispersão + Condutor de arco** | Dispara projéteis em cone, eficazes de perto. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 150 | **Canhão de dispersão + Rifle perfurante** | Dispara projéteis em cone, eficazes de perto. O componente rifle perfurante permite atravessar alvos alinhados. |
| 151 | **Canhão de dispersão + Disco retornável** | Dispara projéteis em cone, eficazes de perto. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 152 | **Canhão de dispersão + Lançador de armadilhas** | Dispara projéteis em cone, eficazes de perto. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 153 | **Canhão de dispersão + Lança-correntes** | Dispara projéteis em cone, eficazes de perto. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 154 | **Canhão de dispersão + Enxameador** | Dispara projéteis em cone, eficazes de perto. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Projetor contínuo

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 155 | **Projetor contínuo + Canhão de carga** | Projeta energia em linha por uma ação sustentada. O componente canhão de carga permite carregar o ataque para aumentar sua potência. |
| 156 | **Projetor contínuo + Lançador balístico** | Projeta energia em linha por uma ação sustentada. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 157 | **Projetor contínuo + Condutor de arco** | Projeta energia em linha por uma ação sustentada. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 158 | **Projetor contínuo + Rifle perfurante** | Projeta energia em linha por uma ação sustentada. O componente rifle perfurante permite atravessar alvos alinhados. |
| 159 | **Projetor contínuo + Disco retornável** | Projeta energia em linha por uma ação sustentada. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 160 | **Projetor contínuo + Lançador de armadilhas** | Projeta energia em linha por uma ação sustentada. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 161 | **Projetor contínuo + Lança-correntes** | Projeta energia em linha por uma ação sustentada. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 162 | **Projetor contínuo + Enxameador** | Projeta energia em linha por uma ação sustentada. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Canhão de carga

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 163 | **Canhão de carga + Lançador balístico** | Carrega energia para um disparo potente. O componente lançador balístico faz um projétil seguir um arco e explodir na área. |
| 164 | **Canhão de carga + Condutor de arco** | Carrega energia para um disparo potente. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 165 | **Canhão de carga + Rifle perfurante** | Carrega energia para um disparo potente. O componente rifle perfurante permite atravessar alvos alinhados. |
| 166 | **Canhão de carga + Disco retornável** | Carrega energia para um disparo potente. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 167 | **Canhão de carga + Lançador de armadilhas** | Carrega energia para um disparo potente. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 168 | **Canhão de carga + Lança-correntes** | Carrega energia para um disparo potente. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 169 | **Canhão de carga + Enxameador** | Carrega energia para um disparo potente. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Lançador balístico

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 170 | **Lançador balístico + Condutor de arco** | Lança um projétil em arco que explode ao atingir a área. O componente condutor de arco faz a energia saltar entre alvos próximos. |
| 171 | **Lançador balístico + Rifle perfurante** | Lança um projétil em arco que explode ao atingir a área. O componente rifle perfurante permite atravessar alvos alinhados. |
| 172 | **Lançador balístico + Disco retornável** | Lança um projétil em arco que explode ao atingir a área. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 173 | **Lançador balístico + Lançador de armadilhas** | Lança um projétil em arco que explode ao atingir a área. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 174 | **Lançador balístico + Lança-correntes** | Lança um projétil em arco que explode ao atingir a área. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 175 | **Lançador balístico + Enxameador** | Lança um projétil em arco que explode ao atingir a área. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Condutor de arco

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 176 | **Condutor de arco + Rifle perfurante** | Conecta energia a um alvo e a outros próximos. O componente rifle perfurante permite atravessar alvos alinhados. |
| 177 | **Condutor de arco + Disco retornável** | Conecta energia a um alvo e a outros próximos. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 178 | **Condutor de arco + Lançador de armadilhas** | Conecta energia a um alvo e a outros próximos. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 179 | **Condutor de arco + Lança-correntes** | Conecta energia a um alvo e a outros próximos. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 180 | **Condutor de arco + Enxameador** | Conecta energia a um alvo e a outros próximos. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Rifle perfurante

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 181 | **Rifle perfurante + Disco retornável** | Dispara um tiro preciso que atravessa alvos alinhados. O componente disco retornável faz o componente lançado retornar ao usuário. |
| 182 | **Rifle perfurante + Lançador de armadilhas** | Dispara um tiro preciso que atravessa alvos alinhados. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 183 | **Rifle perfurante + Lança-correntes** | Dispara um tiro preciso que atravessa alvos alinhados. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 184 | **Rifle perfurante + Enxameador** | Dispara um tiro preciso que atravessa alvos alinhados. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Disco retornável

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 185 | **Disco retornável + Lançador de armadilhas** | Lança um disco que atravessa alvos e retorna. O componente lançador de armadilhas permite instalar um dispositivo ativado por proximidade. |
| 186 | **Disco retornável + Lança-correntes** | Lança um disco que atravessa alvos e retorna. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 187 | **Disco retornável + Enxameador** | Lança um disco que atravessa alvos e retorna. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Lançador de armadilhas

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 188 | **Lançador de armadilhas + Lança-correntes** | Instala dispositivos ativados por proximidade. O componente lança-correntes permite prender um alvo ou superfície e alterar o posicionamento. |
| 189 | **Lançador de armadilhas + Enxameador** | Instala dispositivos ativados por proximidade. O componente enxameador acrescenta projéteis que perseguem inimigos. |

### Lança-correntes

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 190 | **Lança-correntes + Enxameador** | Prende um alvo ou superfície para alterar o posicionamento. O componente enxameador acrescenta projéteis que perseguem inimigos. |

## 20 fusões de armas iguais

Duas cópias da mesma arma pertencem a Pokémon distintos. O resultado reforça o mecanismo descrito; seu custo e limites são definidos no balanceamento.

| Nº | Fusão | Funcionamento proposto |
|---:|---|---|
| 191 | **Lâminas duplas + Lâminas duplas** | Ataca rapidamente um inimigo adjacente. A segunda arma acrescenta cortes rápidos adjacentes, ampliando as possibilidades da ação. |
| 192 | **Espada longa + Espada longa** | Executa cortes precisos e uma estocada de alcance curto. A segunda arma acrescenta uma estocada curta e precisa, ampliando as possibilidades da ação. |
| 193 | **Martelo de impacto + Martelo de impacto** | Desfere golpes lentos capazes de abalar a defesa. A segunda arma acrescenta um golpe pesado que abala a defesa, ampliando as possibilidades da ação. |
| 194 | **Lança de combate + Lança de combate** | Ataca em linha a até duas casas de distância. A segunda arma estende o ataque em linha por até duas casas, ampliando as possibilidades da ação. |
| 195 | **Manoplas + Manoplas** | Combina socos rápidos com um golpe carregado. A segunda arma acrescenta uma sequência de socos e um golpe carregado, ampliando as possibilidades da ação. |
| 196 | **Escudo de impacto + Escudo de impacto** | Bloqueia em uma direção e pode golpear inimigos adjacentes. A segunda arma permite bloquear em uma direção e revidar de perto, ampliando as possibilidades da ação. |
| 197 | **Projetor de barreira + Projetor de barreira** | Cria uma proteção temporária em uma casa ou direção escolhida. A segunda arma cria uma barreira temporária na direção escolhida, ampliando as possibilidades da ação. |
| 198 | **Guardião orbital + Guardião orbital** | Mantém um dispositivo de proteção ao redor do usuário. A segunda arma adiciona proteção orbital temporária, ampliando as possibilidades da ação. |
| 199 | **Espada e escudo + Espada e escudo** | Combina cortes adjacentes com bloqueio direcional e golpes de escudo. A segunda arma acrescenta bloqueio direcional e um golpe de escudo, ampliando as possibilidades da ação. |
| 200 | **Emissor rápido + Emissor rápido** | Dispara projéteis precisos em sequência. A segunda arma acrescenta uma sequência rápida de projéteis, ampliando as possibilidades da ação. |
| 201 | **Canhão de dispersão + Canhão de dispersão** | Dispara projéteis em cone, eficazes de perto. A segunda arma distribui projéteis em um cone de curto alcance, ampliando as possibilidades da ação. |
| 202 | **Projetor contínuo + Projetor contínuo** | Projeta energia em linha por uma ação sustentada. A segunda arma permite sustentar o efeito durante a ação, ampliando as possibilidades da ação. |
| 203 | **Canhão de carga + Canhão de carga** | Carrega energia para um disparo potente. A segunda arma permite carregar o ataque para aumentar sua potência, ampliando as possibilidades da ação. |
| 204 | **Lançador balístico + Lançador balístico** | Lança um projétil em arco que explode ao atingir a área. A segunda arma faz um projétil seguir um arco e explodir na área, ampliando as possibilidades da ação. |
| 205 | **Condutor de arco + Condutor de arco** | Conecta energia a um alvo e a outros próximos. A segunda arma faz a energia saltar entre alvos próximos, ampliando as possibilidades da ação. |
| 206 | **Rifle perfurante + Rifle perfurante** | Dispara um tiro preciso que atravessa alvos alinhados. A segunda arma permite atravessar alvos alinhados, ampliando as possibilidades da ação. |
| 207 | **Disco retornável + Disco retornável** | Lança um disco que atravessa alvos e retorna. A segunda arma faz o componente lançado retornar ao usuário, ampliando as possibilidades da ação. |
| 208 | **Lançador de armadilhas + Lançador de armadilhas** | Instala dispositivos ativados por proximidade. A segunda arma permite instalar um dispositivo ativado por proximidade, ampliando as possibilidades da ação. |
| 209 | **Lança-correntes + Lança-correntes** | Prende um alvo ou superfície para alterar o posicionamento. A segunda arma permite prender um alvo ou superfície e alterar o posicionamento, ampliando as possibilidades da ação. |
| 210 | **Enxameador + Enxameador** | Libera pequenos projéteis que perseguem inimigos. A segunda arma acrescenta projéteis que perseguem inimigos, ampliando as possibilidades da ação. |
