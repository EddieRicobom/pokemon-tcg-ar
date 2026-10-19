# Torre: regiões e inspirações

## Implementado nesta rodada

Antes de iniciar uma corrida, a Torre oferece até três instâncias sem duplicação, incluindo Digital Pokémon. O botão “Sortear novamente” pode ser usado uma vez gratuitamente por tentativa; quando há opções suficientes, a nova leva não repete o conjunto anterior. A estrela de favorito usa o `id` da instância (carta ou `dp_*`), fica em `localStorage` sob `tcg-ar-survivor-favorites-v1` e aumenta a probabilidade sem eliminar a variedade. Favoritos removidos da coleção são descartados na leitura. Coleções com zero, uma, duas ou três opções continuam tendo um caminho finito.

O motor também rejeita upgrades comuns que não estejam na oferta pendente, assim como já fazia com evoluções. Isso evita aplicar bônus por chamadas atrasadas ou inválidas e mantém o contrato de que a tela é a fonte da escolha. O bônus diário por zerar a Torre usa `dayKey`, o mesmo calendário local do Treinador, em vez de comparar a data UTC.

A corrida percorre Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar e Paldea. Cada etapa dura 2min15s; seus últimos 40s misturam suavemente a próxima paisagem. Paldea começa aos 18 minutos, antes do chefão dos 20 minutos. No infinito, o ciclo recomeça depois de Paldea. O relógio é o do motor: escolhas de upgrade e pausas da simulação também pausam a viagem.

O chão tem trilha sinuosa, caminho transversal, textura de pequenos ladrilhos e detalhes nas bordas: bosque, costa, pedras, jardins e oliveiras estilizados. É uma interpretação visual das regiões, não a reprodução dos mapas oficiais. A primeira infraestrutura de biomas agora dá efeito real a três regiões: a folhagem de Kanto reduz levemente o passo e a velocidade de projéteis; as poças de Hoenn reduzem o passo e amplificam golpes Elétricos dentro da área; a neve de Sinnoh reduz mais o passo. As zonas têm borda tracejada, ícone e nome no canvas, e o HUD repete o bioma atual para que o efeito seja antecipável. As seis regiões restantes continuam sem efeito mecânico até receberem regras próprias. A área útil, os pontos de nascimento e a visibilidade dos ataques permanecem iguais.

As zonas são retângulos estáveis e não bloqueiam a arena. O efeito usa a região atual do relógio; durante a mistura visual a próxima paisagem ainda não aplica sua regra. Desligar “Cenário regional” remove o piso decorativo, mas mantém as marcações das zonas e os efeitos de gameplay, evitando perigo invisível.

Dois canvases estáticos no máximo ficam em cache; a mistura usa duas imagens, sem partículas ou shaders. “Cenário regional” permite voltar ao piso simples durante a corrida. O desenho não usa o RNG de combate nem modifica o estado do motor. Assim, esta alteração não exige compensações artificiais de HP, XP ou velocidade. Fluidez em celular e equilíbrio por jogadores ainda precisam de avaliação real.

## Minimapa opcional

O botão “Mapa” abre um radar discreto no canto da arena. O ponto azul é o jogador, pontos vermelhos são chefes, pontos amarelos são elites e os inimigos comuns mais próximos aparecem em cinza. Um retângulo branco marca a janela visível da câmera, ajudando a localizar ameaças que ficaram fora da tela sem alterar a visão principal, o campo de visão ou a lógica de combate. O mapa pode ser desligado durante a corrida; ele é atualizado em baixa frequência e não consome o RNG da simulação.

Ao lado dele, a Torre mostra três objetivos opcionais: resistir por um minuto, chegar ao nível 5 e desbloquear o segundo golpe. Eles são apenas um guia de ritmo e ficam completos sem prêmio ou poder permanente; a pessoa pode ignorá-los sem perder moedas, XP ou progresso.

## Espécies acompanhando a região

Os novos inimigos também acompanham a viagem. Cada região tem quatro espécies selvagens e um chefe periódico próprios, todos com animação Walk no pacote local. Os grupos de treinador usam as espécies da região com os mesmos graus elite/chefão de antes. Durante a transição, a proporção de nascimentos da próxima região segue a mesma mistura suave do cenário. Ao completar o ciclo, voltam as espécies de Kanto. Quem já nasceu mantém a espécie até ser derrotado: não se transforma nem desaparece na passagem de região.

O chefe periódico muda de espécie, mas continua com os números e o raio de colisão do chefe periódico. O mesmo vale para os selvagens e Pokémon de treinadores: espécie não introduz atributos, resistência por tipo, golpes ou XP extras. A escolha visual não consome o RNG do combate. Testes com sementes iguais comparam estado, eventos, upgrades e RNG antes/depois em ondas, treinadores, chefe final e infinito. Desligar o cenário regional simplifica o piso; o elenco continua seguindo o relógio da corrida.

## Arquétipos de inimigos

O motor separa aparência, números e comportamento. Os quatro tipos comuns alternam entre Perseguidor, Flanqueador, Atirador e Suporte por `kind`; chefes e grupos de chefão usam Protetor. O callback `enemyArchetypeFor` permite uma composição específica por região sem duplicar a movimentação.

- **Perseguidor** mantém a aproximação direta.
- **Flanqueador** escolhe um alvo lateral estável e continua limitado pela velocidade e pela arena.
- **Atirador** mantém uma distância preferencial e dispara projéteis visíveis com alcance, recarga e limite global.
- **Protetor** reduz temporariamente o dano recebido por aliados próximos, com quantidade máxima de alvos.
- **Suporte** recupera uma fração limitada do HP de poucos aliados, com recarga longa e sem curar inimigos derrotados.

Os limites de projéteis, alvos de cura e proteção ficam em `ENEMY_BEHAVIOR_LIMITS`. O desenho mostra a recarga por diferença de distância, projéteis hostis e os anéis de proteção/suporte. Esses perfis são mecânicas internas e não são apresentados como atributos oficiais dos Pokémon.

## Dois golpes automáticos

A partir do nível 6, uma escolha especial pode desbloquear um segundo golpe. Ele tem identidade visual própria, recarga e dano separados e continua automático; a pessoa só controla o movimento. Pokémon de dois tipos usam o segundo tipo real como base. Pokémon de um tipo recebem uma técnica secundária interna da Torre, explicitamente marcada como mecânica do app. O limite é de dois golpes e o estado da corrida é limpo ao terminar.

As 45 espécies são carregadas antes da corrida. Sprites que falharem usam uma forma neutra, com aviso explícito no HUD, e são tentados novamente na próxima corrida. Não são substituídos por outro Pokémon. O teste do catálogo confere a região de origem, os metadados Walk e a existência dos 45 arquivos locais.

## Referência e próximos passos de equilíbrio

Fonte consultada: [README do poke-survivor de JayElDragon](https://github.com/JayElDragon/poke-survivor/blob/main/README.md). Ele descreve autoataques, evolução de golpes, fendas de lendários, minimapa, opções de acessibilidade, melhorias permanentes, missões e conquistas. Nenhum código ou recurso visual novo foi copiado.

Ideias para rodadas futuras, por ordem sugerida:

| Inspiração | Adaptação sugerida | Limite de dificuldade |
| --- | --- | --- |
| Minimapa | Mostrar bordas e chefes fora da câmera, com opção de desligar | Não reduzir o campo de visão atual; evitar esconder o joystick ou os orbes |
| Missões | Objetivos opcionais de corrida, como usar categorias diferentes de golpe | Recompensas cosméticas ou moedas limitadas; sem exigir permanecer parado nem sacrificar upgrades |
| Conquistas | Incentivar espécies e estilos diferentes | Sem acumular bônus permanentes de dano que trivializem o começo |
| Fenda de lendário | Encontro opcional com aviso, arena limpa e possibilidade de recusar | Suspender ondas e relógio principal; não sobrepor treinador ou chefe; recompensa limitada por corrida |
| Evoluções de golpes | Escolhas laterais com custo claro: área maior em troca de cadência | Evitar multiplicar simultaneamente dano, alcance e número de projéteis |
| Melhorias permanentes | Primeiro variedade de escolhas e aparência | Se houver poder permanente, limitar e medir separadamente perfis novos e veteranos |

Antes de incorporar poder novo, comparar sementes iguais com `scripts/survivor-sim.eval.ts`: sobrevivência, nível, derrotas e chefes, por categoria de ataque. A avaliação de balanceamento agora tem teto de 25 minutos e um caso determinístico cobre 1, 5, 10, 15 e 20 minutos, além de 21 minutos no infinito. Robô e testes não substituem sessões humanas no celular. Não há alegação de que o modo inteiro esteja balanceado por essas verificações.
