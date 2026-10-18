# Torre: regiões e inspirações

## Implementado nesta rodada

A corrida percorre Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar e Paldea. Cada etapa dura 2min15s; seus últimos 40s misturam suavemente a próxima paisagem. Paldea começa aos 18 minutos, antes do chefão dos 20 minutos. No infinito, o ciclo recomeça depois de Paldea. O relógio é o do motor: escolhas de upgrade e pausas da simulação também pausam a viagem.

O chão tem trilha sinuosa, caminho transversal, textura de pequenos ladrilhos e detalhes nas bordas: bosque, costa, pedras, jardins e oliveiras estilizados. É uma interpretação visual das regiões, não a reprodução dos mapas oficiais. Árvores, pedras e lagoas são decorativas, sem colisão, dano ou lentidão. A área útil, os pontos de nascimento e a visibilidade dos ataques permanecem iguais. As posições dos detalhes são estáveis entre regiões. O HUD mostra a região e o destino durante a transição.

Dois canvases estáticos no máximo ficam em cache; a mistura usa duas imagens, sem partículas ou shaders. “Cenário regional” permite voltar ao piso simples durante a corrida. O desenho não usa o RNG de combate nem modifica o estado do motor. Assim, esta alteração não exige compensações artificiais de HP, XP ou velocidade. Fluidez em celular e equilíbrio por jogadores ainda precisam de avaliação real.

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

Antes de incorporar poder novo, comparar sementes iguais com `scripts/survivor-sim.eval.ts`: sobrevivência, nível, derrotas e chefes, por categoria de ataque. A avaliação atual tem teto de 15 minutos: precisa ser ampliada para avaliar o chefe dos 20 minutos e o infinito. Robô e testes não substituem sessões humanas no celular. Não há alegação de que o modo inteiro esteja balanceado por essas verificações.
