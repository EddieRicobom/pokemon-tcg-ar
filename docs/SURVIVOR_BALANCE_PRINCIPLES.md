# Base primordial do balanceamento da Torre

> **Leitura obrigatória antes de alterar o Survival.**
>
> Qualquer IA, pessoa ou PR que mexa em dano, vida, surgimento, XP, upgrades,
> artefatos, chefes, regiões ou recompensas deve consultar este documento,
> atualizar as simulações e registrar a hipótese e o efeito observado.

## Objetivo do modo

O Survival deve formar uma corrida legível e divertida de até 20 minutos. Um
Pokémon forte, uma boa sequência de buffs e uma pessoa que se mova bem devem
ter um caminho realista para chegar perto de 18 minutos e, em algumas runs,
passar de 20. Isso não significa que todo Pokémon, toda escolha ou toda pessoa
deva vencer automaticamente. Pokémon fracos precisam de uma rota de recuperação
por evolução, XP e escolhas inteligentes, mas continuam sujeitos a risco.

Toda recompensa, marco e desbloqueio deve nascer de uma corrida realmente
concluída. Não inventar resultados para preencher progresso e não transformar o
modo em um grind obrigatório para a história principal da Vila.

## Modelo de ritmo que deve ser preservado

Use fases com objetivos e pressão diferentes, em vez de uma rampa contínua:

| Janela | Função | Critério de experiência |
| --- | --- | --- |
| 0–5 min | Aprendizado e preparação | Espaço para entender o golpe, coletar XP e chegar ao primeiro especial sem esquiva constante. Dano e densidade iniciais devem ser os mais permissivos. |
| 5–15 min | Escalada com escolhas | Inimigos e treinadores aumentam a pressão gradualmente. O jogador deve tomar decisões de build, mas ainda ter janelas de reposicionamento e recuperação. |
| 15–18 min | Pressão alta e leitura | A arena pode ficar exigente, porém ameaças à distância precisam ser telegráficas e o jogador deve conseguir identificar uma saída. |
| 18–20+ min | Clímax | Eventos, chefe e recompensas dão contexto ao risco. Chegar a 20 deve ser raro e conquistado, não matematicamente impossível. No infinito, a pressão pode continuar subindo. |

Depois de um chefe, treinador, evolução ou upgrade muito forte, preserve uma
pequena janela de alívio. A alternância entre pressão e recuperação mantém a
atenção melhor do que dano constante. Cura, invulnerabilidade curta, coleta de
XP e artefatos são válvulas de recuperação; não devem apagar todas as
consequências de uma decisão ruim.

## XP, densidade e progressão

- Aumentar a quantidade de inimigos só é justo quando a oferta de XP também
  sustenta o crescimento da build. Densidade sem recompensa cria uma parede de
  dano e não um desafio interessante.
- Orbes no chão são parte central do ritmo: devem ser visíveis, coletáveis e
  suficientes para que uma pessoa que se arrisca a coletá-los alcance os
  marcos previstos. Seus valores precisam permanecer pares para não deixar XP
  residual estranho no level up.
- O primeiro upgrade deve chegar cedo; o especial de 3 minutos precisa ser
  alcançável em uma run normal. Evoluções reais, especialmente por volta dos
  níveis 8 e 16, devem ser uma recuperação significativa para espécies fracas,
  sem transformar veteranos em invencíveis.
- Buffs raros podem mudar a estratégia, mas devem ter custos, limites, cooldowns
  ou oportunidades de escolha que preservem contra-jogo. O buff “Especial”
  continua existindo e deve ser medido separadamente.

### Limites para repetir a mesma carta

Não remover o limite de todas as cartas. A política atual é deliberada:

- vida, mobilidade, ímã e alguns bônus de XP podem repetir e formar uma build
  de recuperação, porque cada escolha tem ganho incremental;
- dano explosivo, recarga, alcance extremo, disparos extras, perfuração,
  efeitos lendários e ancestrais têm `maxLevels` ou teto numérico para não
  transformar uma oferta favorável em vitória automática;
- uma mesma carta não aparece duas vezes na mesma oferta. Se um tipo estiver
  fraco, ajuste seu valor, raridade ou uma carta especializada; não elimine o
  limite global sem comparar a sobrevivência com e sem o empilhamento.

Qualquer nova carta deve declarar explicitamente em qual desses grupos entra e
ter um teste que cubra sua repetição ou seu teto.

## Justiça entre estilos e tipos

Ataques de curto alcance pagam pela exposição com dano, frequência, área,
empurrão, roubo de vida ou proteção suficiente para permanecerem viáveis. Não
igualar todos os alcances: cada estilo deve pedir uma decisão diferente. Ataques
à distância não podem dominar apenas porque permitem ficar parado fora do risco.

Inseto, Lutador e Gelo merecem atenção especial nos testes. Follow-ups, efeitos
visuais e secundários podem reforçá-los, mas o dano efetivo, a cadência e a
sobrevivência devem ser comparados nas mesmas condições dos demais tipos. Para
Pokémon de dois tipos, uma sinergia alternativa é uma escolha rara, não uma
garantia de poder.

## Instrumento de validação

Antes e depois de cada mudança relevante:

1. Rode o motor puro com sementes iguais e a matriz de espécies forte, média e
   fraca.
2. Compare pelo menos um movimento evasivo, um agressivo e um comportamento de
   boa coleta de XP.
3. Registre mediana de sobrevivência, p10/p90, nível, kills, chegada a 3, 5,
   10, 15, 18 e 20 minutos, treinadores derrotados e causa da derrota.
4. Separe runs sem escolhas boas de runs com uma sequência de buffs plausível.
   O objetivo de 18–20 se aplica ao segundo caso; o primeiro não deve ser uma
   vitória automática.
5. Faça uma sessão humana em celular depois da simulação. Robôs medem regressão
   do motor, mas não medem legibilidade, fadiga, mira de movimento ou diversão.

Não declare “balanceado” por uma média isolada. Toda mudança deve explicar qual
problema pretende resolver, qual custo introduz e quais grupos podem ser
prejudicados. Se a simulação ficar muito diferente da sessão humana, preserve o
relato e investigue a causa antes de ajustar números novamente.

## Calibração registrada em 22/10/2026

A rodada atual suavizou os primeiros minutos, reduziu a escalada de dano e vida
dos inimigos, aumentou moderadamente a densidade, elevou os valores dos orbes e
deu mais oportunidades de artefatos. Na simulação determinística de 40 sementes
com uma build forte e coleta competente, **13/40** runs chegaram a 18 e 20
minutos; com uma espécie fraca, **0/40** chegou a 10 minutos. O resultado é um
sinal de que existe uma rota de excelência sem vitória automática, não uma prova
de equilíbrio final. O celular real e sessões humanas continuam obrigatórios.

Os parâmetros dessa rodada estão centralizados em `src/core/survivor.ts` e os
testes ficam em `src/core/survivor*.test.ts`. Ao alterar esses valores, atualize
esta seção ou crie uma nova seção datada, sem apagar a comparação anterior.

## Pesquisa que fundamenta a adaptação

- O guia aberto de [PokéSurvivor](https://github.com/Poke-Survivor/pokesurvivor)
  reforça o ciclo de movimento com autoataque, coleta de XP, escolha entre
  ofertas, evolução e progresso persistente. Usamos os princípios, não código,
  arte ou um port literal.
- A análise de [pacing e tensão de Vampire
  Survivors](https://teemo.dev/game-design/vampire-survivors/systems/difficulty-pacing-and-tension-management/)
  descreve fases de pressão, eventos roteirizados, janelas de alívio, upgrades
  que criam recuperação e persistência após a derrota. Adaptamos essas ideias à
  Torre, aos seus horários e às suas regras de salvamento.

Essas fontes são referências de design, não garantias de que os números deste
projeto estejam corretos. O contrato local desta base primordial e os dados das
simulações do repositório têm precedência para decisões futuras.
