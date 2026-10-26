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

## Ampliação de 23/10/2026 — buffs e tipos de inimigo

Novas cartas de buff (cada uma com teto explícito, testado em `src/core/survivor-buffs.test.ts`):

- **Regeneração lenta** (normal, até 2): +1 de vida por segundo.
- **Espinhos** (raro, até 2): quem encosta no jogador sofre 6 de dano por segundo por carta.
- **Segundo fôlego** (lendário, 1 por corrida): ao cair até 25% de vida, recupera 35% do máximo.
- **Golpe certeiro** (raro, até 3): +10% de chance de dano dobrado no golpe principal, com teto de 40%.
- **Faro de artefatos** (normal, até 2): +25% de chance de drop de artefatos por carta.

Novos arquétipos de inimigo, agora na rotação padrão (seis tipos em vez de quatro):

- **Investida**: fica marcado em vermelho por meio segundo e avança 2,5× mais rápido por 450 ms. O aviso é a leitura pedida para ameaças de curta distância.
- **Explosivo**: explode ao cair e fere só o jogador, em um raio de 70, com 80% do dano do inimigo. Não causa fogo amigo.

Simulação (`npx tsx scripts/simulate-survival.ts`, 20 sementes por tipo, mesma matriz):

| Estratégia | Antes: mediana | Depois: mediana | Antes: 5 min | Depois: 5 min |
| --- | ---: | ---: | ---: | ---: |
| Evasiva | 3,56 min | 3,60 min | 7 | 14 |
| Agressiva | 4,76 min | 4,86 min | 75 | 87 |

Hipótese: os novos tipos aumentam a pressão no meio da corrida, e os buffs compensam sem empurrar a mediana para cima. O simulador não escolhe buffs de forma inteligente, então o efeito real das cartas precisa de sessão humana em celular.

## Recarga de atordoamento — 23/10/2026

Um inimigo só pode ser atordoado de novo 5 s depois do último atordoamento (`STUN_COOLDOWN_MS`, em `src/core/survivor.ts`). A regra vale para todas as fontes: golpe Tremor/Pedrada, afinidade de pedra e terra, Planta com semente e congelamento do gelo. Enquanto a recarga corre, um novo atordoamento é ignorado e não estende o atual.

Motivo: uma run com Tremor em área, recarga de 240 ms e raio de 331 mantinha os inimigos parados enquanto estivessem no raio. Feedback SVF1 de Golurk (diversão 5, dificuldade 3): "O stun nos ataques está muito, mas muito forte".

Simulação (mesma matriz, sem alteração de escolha de cartas): evasiva 3,60 min, agressiva 4,85 min, com 12 e 84 runs chegando a 5 min. O simulador usa pouco os golpes de atordoamento, então o efeito real precisa ser medido com novos códigos de feedback.

## Chefes e Pokébolas digitais — 24/10/2026

O chefe periódico individual agora aparece aos 60 s e volta a cada 60 s (antes,
a cada 90 s). A curva dele foi reforçada para exigir uma resposta de build e
movimento: vida base 220 + 70 por onda, dano base 15 + 3 por onda e velocidade
72. O primeiro encontro continua depois da janela de aprendizado inicial. As
Pokébolas digitais continuam limitadas a três por corrida, mas a chance de
drop sobe para 2% em elites e 10% em chefões; inimigos comuns permanecem em
0,5%, para a recompensa continuar ligada a encontros de risco.

Hipótese: os encontros antigos estavam tão espaçados e frágeis que não davam
identidade ao clímax da Torre; aproximá-los e tornar a recompensa de chefão
mais provável cria marcos reconhecíveis sem transformar cada inimigo comum em
uma loteria. A simulação rápida atual (200 corridas por estratégia, sem escolha
humana de builds) deu mediana de 2,82 min para evasiva e 3,57 min para
agressiva, com 1/200 e 19/200 chegando a 5 min, respectivamente. Isso é um
sinal de pressão forte, não uma prova de equilíbrio: a meta de 18–20 minutos
precisa ser revisitada com a matriz completa e uma sessão humana em celular.

## Pokébolas Sombrias — 24/10/2026

Aos 13 minutos, a Torre pode colocar uma **Pokébola Sombria** no mapa. Ela não
inicia nada sozinha: a pessoa decide coletá-la. Cada bola sorteia, com o RNG
determinístico da própria corrida, um lendário real da lista de guardiões. A
coleta pausa brevemente a ação para uma apresentação legível; depois o lendário
entra com sprite maior, chamas de sombra opcionais (desligadas no Modo Rotom) e
vida/dano multiplicados por 4,5/2,2 em relação ao chefe periódico. Há no máximo
três encontros por corrida, espaçados por três minutos depois de cada vitória.

Vencer assegura uma Pedra da Confiança imediatamente no HUD e no resumo, mas a
pedra só é persistida no inventário quando a corrida é encerrada normalmente.
Isso mantém a recompensa visível em vez de escondida até o fim e evita que
abandonar a run vire uma forma de farmá-la. A simulação determinística de 200
corridas permanece em 2,82 min de mediana no perfil evasivo e 3,57 no perfil
agressivo (1 e 19 chegadas a 5 min); ela não alcança o minuto 13 nessa matriz,
portanto mede apenas a ausência de regressão antes do encontro. A dificuldade
real do lendário ainda requer sessão humana em celular.

## Defesas e cartas de proteção — 25/10/2026

Hipótese: os chefes podem encerrar uma corrida com um acerto forte antes que a
pessoa entenda a causa. A tela de derrota agora mostra o último golpe; a
mitigação usa os atributos reais da espécie e oferece escolhas para fortalecê-los.

Referências de design: o [motor original do PokéSurvivor](https://github.com/JPTER78/pokesurvivor/blob/main/js/systems/stats.js)
distingue Defesa de Defesa Especial e suaviza o efeito dos atributos extremos;
suas [melhorias permanentes](https://github.com/JPTER78/pokesurvivor/blob/main/js/data/upgrades.js)
concedem 2 pontos percentuais de proteção por nível, até oito níveis. O
[item Armor de Vampire Survivors](https://vampire.survivors.wiki/w/Armor_%28item%29)
também tem limite de cinco níveis. São referências para limitar o acúmulo, não
números transplantados para a Torre.

No catálogo local de 1.025 espécies, a mediana da Defesa base é 70 e a da
Defesa Especial é 67; o percentil 90 fica em 110 e 105. A Torre usa
`defesa / (200 + defesa)` para a redução percentual, com contato e explosão
tratados como físicos e projéteis como especiais. Assim, a defesa mediana
reduz aproximadamente 26% ou 25%, e cada ponto adicional rende menos redução
percentual. Sem dado real da espécie, não se presume uma defesa média nem se
oferece uma carta que não teria efeito.

**Cartas da corrida:** Casca firme (+25 Defesa, normal, até duas), Manto especial
(+25 Defesa Especial, normal, até duas) e Postura defensiva (+20 em ambas, rara,
uma vez). Em Pikachu, duas Casca firme aumentam a proteção contra contato de
17% para 31%; com Postura defensiva, chega a 35%. A escolha compete com HP,
ataque e movimento, e os bônus seguem a espécie após a evolução. A mesma
regra vale para o BONK, pois as variantes usam o mesmo motor de combate.

Esses percentuais não significam sobrevivência garantida a um golpe de chefe:
o HP base de espécies frágeis permanece baixo. A hipótese precisa de partidas
humanas, especialmente no minuto 13 contra lendários sombrios e no clímax.

A taxa de dano dos chefes periódicos foi reduzida de **+3 para +1,5 por onda**;
o multiplicador do lendário sombrio permanece 2,2. No primeiro encontro sombrio
possível (onda 27), o dano bruto cai de aproximadamente 211 para 122. Um
Pokémon com 100 HP e Defesa 78 recebe 88 no contato e pode reagir; espécies
mais frágeis ou encontros tardios ainda exigem preparo e movimento. A vida dos
chefes e o dano dos inimigos comuns não foram alterados nesta revisão.

Diagnóstico comparável: `SURVIVOR_SIM_RUNS=40`, `SURVIVOR_SIM_DT=32`,
`SURVIVOR_SIM_CAP_MIN=20`, com as mesmas 40 sementes e espécies reais nos
cenários comparados. O robô foi corrigido para escolher o especial e sua
ramificação, evitando travar o relógio aos 3 ou 7 minutos. Os valores de
p10/mediana/p90, em segundos, foram:

| Escolha de cartas | Antes da redução por onda | Depois da redução por onda |
| --- | --- | --- |
| Aleatória | 173 / 309 / 602 | 191 / 315 / 615 |
| Prioriza defesa | 188 / 317 / 514 | 199 / 321 / 631 |
| Aleatória, sem chefes | 296 / 373 / 646 | 296 / 373 / 646 |

Depois da redução, 63% das mortes na escolha aleatória e 57% na defensiva
tiveram um golpe final de chefe. A mediana escolheu zero carta nova de defesa
no primeiro grupo e uma no segundo. A pequena melhora mediana mostra que as
cartas são úteis por golpe, mas competem com ataque e não eliminam sozinhas
a pressão de vários chefes. O cenário sem chefes aponta para essa pressão,
sem isolar contato, acúmulo de chefes e a dificuldade do robô em abatê-los.
O robô não chegou ao encontro sombrio opcional nem reproduziu uma morte de
vida cheia por golpe único. Portanto esses números não justificam concluir
que o relato do jogador foi resolvido. A tela de derrota agora fornece o
dano e a origem necessários para uma sessão humana investigar esse caso.
