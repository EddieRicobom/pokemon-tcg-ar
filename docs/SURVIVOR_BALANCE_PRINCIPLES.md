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

## Justiça entre formas de ataque e tipos — 02/11/2026

Hipótese: com a Rajada e o Teleporte separados (PR #367), as oito formas de golpe
(Projétil, Aura, Área, Cone, Órbita, Foco, Rajada e Teleporte) e os 18 tipos
precisam de uma medição própria. Igualar a quantidade de espécies por forma não
mede força, e liderar em abates não basta: **a sobrevivência vem primeiro**.

**Método** (`scripts/survivor-forms.eval.ts`, motor real, fora do `npm test`):
`FORMS_SECONDS=60 FORMS_RUNS=8 FORMS_RUN_MIN=12 npx vitest run -c vitest.eval.config.ts scripts/survivor-forms.eval.ts --silent=false`.
Cenários controlados forçam a forma com stats e tipo iguais (só no harness; não é
reconhecimento nem AR); os naturais usam espécies reais nos quantis 10/30/50/70/90
da soma de stats de cada forma. Medem: dano por segundo em alvo parado e contra uma
multidão reposta (14 inimigos de 300 de vida), e corridas com o spawn real do motor
(8 sementes por espécie, teto de 12 min, política de alcance que mantém a distância
da forma e foge do cerco, política evasiva de referência, cartas escolhidas só entre
as ofertas reais). A sobrevivência é **censurada pelo teto** (chegar a 12 min não é
vitória): por isso o relatório traz p10, mediana, a **média restrita ao teto**
(cada corrida vale no máximo 720 s) e a fração que chega ao teto. Foco e Teleporte
são jogados com hold e soltura de verdade (mira no grupo mais denso).

**Resultado na amostra natural (média restrita de sobrevivência, s, antes → depois)**

| Forma | Antes | Depois |
| --- | ---: | ---: |
| Projétil | 601 | 603 |
| Aura | 513 | 515 |
| Área | 579 | 579 |
| Cone | 526 | 526 |
| Órbita | 526 | 520 |
| Foco | 690 | 561 |
| Rajada | 546 | 605 |
| Teleporte | 508 | 508 |

A diferença entre a melhor e a pior forma caiu de 1,36× para 1,19×. Em stats iguais
(cenário controlado) ela ficou em 1,40× → 1,49×: sem Ataque alto o Foco, que foi
desenhado para espécies de Ataque a partir de 100, agora é o mais fraco (417 s);
com as espécies reais ele fica no grupo. As médias de uma forma entre amostras
variam cerca de ±10% com 8 sementes; diferenças menores que isso não são sinal.

**O que mudou**
- O corte de cadência (`survivorRapidAttackDamageMultiplier`) era degrau: de 510
  para 490 ms o dano por segundo caía para 52%. Agora é contínuo (expoente 0,7
  acima de 2 ataques/s) e há teste de monotonicidade de 240 a 2.000 ms.
- Foco: o feixe cheio fazia 7 a 9× o dano por segundo de um projétil e a forma liderava a
  sobrevivência em 15% a 30%. A escala do feixe vai a 22% (`FOCUS_BEAM_DAMAGE_SCALE`)
  e a carga a 27% por segundo; o atordoamento e a lentidão ficam como estavam.
  Dano por segundo em alvo parado (espécies reais): 106 → 24.
- Aura 1,22 → 1,6 e Rajada 1 → 1,35 (`CATEGORY_DAMAGE_FACTOR`): eram as mais fracas em
  dano (Aura 3 e Rajada 8,5 contra 12 do projétil) e a Aura também em sobrevivência.
  A Rajada passa a render o mesmo dano por segundo do projétil (9,5 contra 10).
- Inseto perde o fator de dano 1,14: o eco de enxame já soma 20% e o tipo liderava
  cinco das oito formas na matriz tipo × forma (1,35× a 2,4× a mediana).
- O Teleporte usa alcance, raio, recarga e disparos do jogador, com piso de recarga
  de 900 ms e teto de alcance de 420; o botão de carga soltava sem disparar por um
  `lostpointercapture` que cancelava a carga (corrigido).

**O que não mudou, e por quê:** Teleporte, Órbita e Cone já estavam em paridade de
sobrevivência; só os abates divergiam (Foco, Teleporte e Órbita ainda fazem de 2 a
10× os abates do Projétil na amostra natural, por bola de neve de XP). Um corte
de dano do Teleporte testado nesta rodada derrubou a sobrevivência para 322 s
(morte aos ~80 s sem nenhum golpe automático) e foi revertido. O Teleporte é
bimodal: espécies fracas morrem cedo (p10 de 81 s), as fortes chegam ao teto.

**Tipos (alvo único e multidão, 18 tipos):** Fogo e Veneno lideram a Área, o Cone e o
Foco em 1,36× a 1,73× a mediana por causa da queimadura (35% do golpe por segundo);
Dragão e Aço levam Projétil e Rajada em multidão (1,7×) pela perfuração; Inseto
cai de 1,35× para 1,2× depois do ajuste acima. A queimadura não foi alterada neste
passo porque o PR #366 acabou de recalibrá-la. Os valores muito baixos (Gelo na
Aura, Dragão no Cone) vêm do sorteio de cartas durante a corrida do cenário de
multidão e não foram tratados como sinal.

**Cartas de dano cortadas em 1/3:** todo bônus percentual de dano das cartas
(Golpe mais forte, Ressonância, árvores de forma e de elemento, cartas por tipo,
Abertura precisa, Último esforço, Combate aproximado, Tiro distante e Caçador de
ameaças) passa do triplo para dois terços do triplo, isto é, o dobro do valor
original (por exemplo +60% → +40%). O teto de dano base vai de 180 para 120. As
medições acima são anteriores a este corte e não o incluem.

**Desempenho depois de 7 min:** o motor custa 0,01 a 0,08 ms por passo mesmo com 130
inimigos e 300 orbes aos 16 min (`scripts/survivor-longrun.eval.ts`), então o peso
estava na tela. As regiões de 135 s carregavam os sprites animados do elenco e
nunca liberavam os anteriores (cerca de 140 sprites no total, mais de 100 aos 15 min):
agora só a região atual, a próxima e quem ainda está vivo ficam na memória (cerca de 34,
estável por mais de 50 minutos simulados). A vida dos inimigos para os números de dano
deixou de alocar um Map por quadro, e a interface reativa por cima do canvas atualiza
a ~20 Hz em vez de a cada quadro. Não medi um celular: o crash dos 15 min é atribuído
à memória por leitura do código e deve ser confirmado em aparelho real.

**Limites:** o robô não tem reflexo nem toque de celular; o cenário de multidão usa
inimigos sem dano e a política do Teleporte é simples. Nenhum destes números
substitui sessões humanas.

## Forma de ataque por perfil estatístico — 02/11/2026

A forma não é consequência do tipo nem de uma cascata de cortes. Cada espécie recebe
uma afinidade para as oito formas a partir dos seis stats-base reais; a maior vira o
golpe principal e a segunda maior, o golpe opcional. O tipo continua a escolher
elemento, efeito e identidade visual, nunca a geometria.

### Referência do catálogo e normalização

O catálogo local de **1.025 espécies** foi medido antes de definir a regra. Estes são
os centros usados pelo código, com a distância entre os quartis 25 e 75 como escala:

| Stat | Mediana | P25–P75 | Uso na identidade |
| --- | ---: | ---: | --- |
| HP | 68 | 50–85 | volume defensivo |
| Ataque | 75 | 55–100 | canal físico |
| Defesa | 70 | 50–90 | volume e raio |
| Ataque Especial | 65 | 47–90 | canal especial |
| Defesa Especial | 67 | 50–86 | volume defensivo |
| Velocidade | 65 | 45–88 | cadência e mobilidade |

Cada valor é comparado à mediana e dividido pela largura interquartil. Assim, +20 em
Ataque não vale arbitrariamente o mesmo que +20 em Defesa Especial: vale segundo a
dispersão real daquele stat. O volume é a média normalizada de HP, Defesa e Defesa
Especial; os canais primário e secundário são o maior e o menor entre Ataque e Ataque
Especial normalizados.

### Identidade das oito formas

| Forma | Perfil que sobe sua afinidade | Compensação |
| --- | --- | --- |
| Projétil | especial dominante, físico de apoio e alguma Velocidade | alcance seguro; pouca afinidade com volume |
| Área | físico dominante, especial de apoio | impacto próximo; muita Velocidade favorece formas móveis |
| Aura | volume alto, dois ataques úteis e pouca Velocidade | exposição compensada por pulsos |
| Órbita | volume alto, dois ataques úteis e Velocidade | tanque móvel exige defesa e ritmo juntos |
| Cone | físico, especial de apoio e Velocidade | linha direcional exige posicionamento |
| Foco | maior canal ofensivo alto, segundo canal útil e pouca Velocidade | carga e mira compensam o pico |
| Rajada | especial, físico de apoio e Velocidade acima da mediana | três tiros e pausa, não dano grátis |
| Teleporte | físico, especial de apoio e Velocidade acima da mediana | aproximação e recarga compensam proteção curta |

O **ataque secundário entra em todas as afinidades**. Não é desempate: ele melhora
perfis híbridos e diferencia um Pokémon com dois canais ofensivos de outro que depende
de apenas um. Ainda assim, não soma dano ao golpe ativo. O golpe opcional é a segunda
maior afinidade, não uma conversão fixa entre formas.

### Calibração e resultado completo

Um viés mínimo, documentado em código, foi calibrado uma vez contra este catálogo. Ele
não consulta a população em jogo nem aplica quota em tempo de execução: apenas evita
que Projétil/Área sejam o destino padrão de qualquer perfil sem um corte especial.

| Forma | Espécies | Participação |
| --- | ---: | ---: |
| Projétil | 155 | 15,1% |
| Área | 154 | 15,0% |
| Aura | 122 | 11,9% |
| Órbita | 122 | 11,9% |
| Cone | 122 | 11,9% |
| Foco | 122 | 11,9% |
| Rajada | 122 | 11,9% |
| Teleporte | 106 | 10,3% |

Projétil e Área ocupam juntos 30,1%, só cerca de três pontos percentuais acima de
uma divisão perfeitamente uniforme. O teste em `src/core/survivor-moves.test.ts`
percorre as 1.025 espécies, fixa esses números, verifica que o tipo não altera o
resultado e confirma que o golpe opcional é o segundo perfil mais alto. Se entrar uma
geração nova ou pesos forem alterados, a distribuição precisa ser medida novamente.

Essas contagens validam variedade e determinismo, não equivalência de poder. Dano,
recarga, alcance, controle e sobrevivência seguem precisando das simulações e de
partidas humanas descritas nas seções anteriores.

### Trilha elemental

**Trilha** é a nona forma: favorece Velocidade, o menor entre Ataque e Ataque Especial
e um pouco de volume defensivo; uma diferença muito grande entre os dois ataques reduz
sua afinidade. Ela ocupa o perfil móvel híbrido, separado de Rajada (especial rápida)
e Teleporte (físico rápido). A carga vem da distância real percorrida: 2.250 px, ou
15 segundos caminhando na velocidade-base 150. Cheia, ela permite quatro segundos de
desenho contínuo; a faixa se apaga suavemente após 3,5 s. Seu dano usa a média dos dois
ataques. Como todas as formas, recebe cinco buffs específicos: quatro degraus da árvore
e **Passos ressonantes**, que reduz a distância necessária para carregar.

## Golpe Supremo — 08/11/2026

Hipótese: faltava um momento de virada escolhido pela pessoa. O Especial tem recarga fixa e o medidor de carga serve só a
Foco, Teleporte e Trilha. O **Golpe Supremo** (`src/core/survivor-supreme.ts`) é um recurso da corrida, não uma carta: um
medidor enche com abates, dano causado e dano recebido, e um toque solta um golpe próprio de cada um dos 18 tipos.

**Limites, para não virar vitória automática:** o medidor leva no mínimo 45 s de jogo para encher (`SUPREME_MIN_FILL_MS`);
a energia guardada tem teto de 40%; abates do próprio Supremo não recarregam; o Meowth ladrão não é atingido. O dano fica
numa faixa por classe, em fração da vida máxima: comum a partir de 55%, elite de 12% a 32%, chefe de 5% a 14% (Lutador tem
teto 1,5× maior, com raio menor). Efeito extra custa dano; um teste confere esse orçamento e que nenhum efeito se repete.
Cura respeita o bloqueio digital. A carga dura 420 ms, com o jogador andando e protegido por mais 420 ms depois da soltura.

**Comparação** (`FORMS_TYPES=0 FORMS_SECONDS=10 FORMS_RUNS=8 FORMS_RUN_MIN=12`, política de alcance, mesmas sementes, com e
sem `FORMS_SUPREME=1`; média restrita de sobrevivência em segundos, teto de 720):

| Forma | Sem Supremo | Com Supremo | p10 sem → com |
| --- | ---: | ---: | ---: |
| Projétil | 548 | 566 | 275 → 338 |
| Aura | 454 | 515 | 265 → 287 |
| Área | 575 | 608 | 356 → 378 |
| Cone | 633 | 678 | 420 → 484 |
| Órbita | 579 | 537 | 326 → 281 |
| Foco | 380 | 375 | 204 → 246 |
| Rajada | 526 | 586 | 327 → 350 |
| Teleporte | 440 | 435 | 74 → 74 |

Seis formas melhoram o p10 e nenhuma dispara: a diferença da melhor para a pior forma fica em 1,67× sem e 1,81× com. Quase
tudo está dentro da variação de cerca de ±10% com 8 sementes, inclusive as quedas de Órbita, Foco e Teleporte, em que
a mudança das sementes pesa mais que o golpe. O robô só usa o Supremo com três inimigos a até 300 de distância e não
escolhe o momento como uma pessoa; a política evasiva quase não abate e mal enche o medidor. Falta sessão humana em celular.

**Custo:** a queda dos comuns adianta XP e abre espaço, o que pode favorecer quem já vai bem. **Quem pode ser prejudicado:**
formas que abatem pouco enchem mais devagar. Por isso o dano recebido também enche o medidor.

**Correções de justiça na mesma rodada:** tiros e golpes não gastam mais acerto em quem já caiu no mesmo passo, os tiros
inimigos ficam suspensos no Relógio parado, a Inversão polar não empurra inimigos para fora da arena e quadros longos viram
passos de até 34 ms, para um tiro rápido não atravessar um alvo em celular lento ou no Ritmo acelerado.

## Órbita e Foco depois do Supremo — 12/11/2026

Hipótese: com o Golpe Supremo, a distância entre a forma que mais vive e a que menos vive subiu de 1,67× para 1,81×, com o
Foco no fundo e a Órbita perdendo p10. Nas corridas do Foco, a causa de morte era carregar quase parado: segurar o botão
deixava o Pokémon a 45% da velocidade, perto de quem chega. A Órbita vive bem na média, mas as espécies frágeis morrem cedo
cercadas, porque os orbitais acertam e não afastam ninguém.

**O que mudou**
- Foco: velocidade enquanto carrega de 45% para **60%** (`FOCUS_SLOW_MULTIPLIER`) e carga de 27% para **31%** por segundo
  (`FOCUS_CHARGE_PER_SEC`). O dano do feixe não mudou.
- Órbita: cada toque de orbital em inimigo **comum** empurra 16 px (`ORBIT_COMMON_PUSH_PX`), com a mesma recarga de 5 s de
  todo empurrão. Elites, treinadores e chefes não são afastados; o dano não mudou.
- O harness passou a medir a **Trilha** (6,5 s desenhando, faixa por 5 s): o robô mantém o botão como o automático e passa
  rente à multidão.

**Medição** (`FORMS_SUPREME=1 FORMS_TYPES=0 FORMS_SECONDS=10 FORMS_RUNS=12 FORMS_RUN_MIN=12`, um processo por forma com
`FORMS_ONLY`, **12 sementes** por espécie, amostra natural, política de alcance; média restrita ao teto de 720 s e p10):

| Forma | Antes | Depois | p10 antes → depois |
| --- | ---: | ---: | ---: |
| Projétil | 572 | 572 | 341 |
| Aura | 532 | 532 | 294 |
| Área | 609 | 609 | 385 |
| Cone | 677 | 677 | 484 |
| Órbita | 573 | 611 | 285 → 330 |
| Foco | 391 | 522 | 264 → 359 |
| Rajada | 598 | 598 | 366 |
| Teleporte | 430 | 430 | 72 |
| Trilha | 445 | 445 | 240 |

Só Órbita e Foco foram medidos de novo: as outras formas não usam nenhum dos valores alterados. A distância entre a melhor
e a pior forma cai de **1,73×** (Cone 677 / Foco 391) para **1,57×** (Cone 677 / Teleporte 430). Na política evasiva ela
fica em 1,52× antes e 1,42× depois (Foco 455 → 544, Órbita 475 → 511). O Foco não passa a liderar: fica no meio do grupo.

No cenário controlado (stats e tipo iguais, uma espécie só), o Foco sobe de 395 para 486 e a Órbita vai de 527 para 477;
com uma espécie e 12 sementes a variação é de cerca de ±10%, então a queda da Órbita ali não é sinal firme, mas fica anotada
para a próxima rodada. O Teleporte segue bimodal (p10 de 72 s): espécies fracas morrem antes do primeiro salto bom. É o
próximo alvo, e não foi mexido aqui porque o pedido era Órbita e Foco.

**Custo:** o Foco fica menos punido por carregar; quem já jogava bem com ele ganha folga. **Quem pode ser prejudicado:**
a Órbita afasta os comuns do anel e pode acertar um pouco menos em multidão fechada (os abates subiram na amostra, 993 → 1.032).
Falta sessão humana em celular.

## Eventos-relâmpago — 12/11/2026

Hipótese: entre um chefe e um treinador, a corrida vira uma rotina de andar em círculo. Momentos curtos e legíveis, com
escolha e recompensa dos sistemas que já existem, dão picos de atenção sem empilhar ameaça. Lógica em
`src/core/survivor-surges.ts` (testes em `survivor-surges.test.ts`); o primeiro evento chega aos 2:30 jogados e os
seguintes a cada 105 s. Cada volta de quatro passa por todos os tipos, embaralhados por um hash da semente (não consome o
RNG de combate). O evento espera 15 s se houver time de treinador ou lendário sombrio em campo, ou o chefão final a menos
de 30 s. Desligado no PvP, no BONK e no laboratório.

| Evento | Regra | Prêmio e teto |
| --- | --- | --- |
| Chuva de orbes | 20 orbes caem em 9 s, a 50–230 px de você; a sombra avisa 0,7 s antes | orbes de 6 a 14 de XP (pares, +2 a cada 4 min); no máximo 280 de XP por chuva |
| Revoada | só depois de 4 min; faixa vermelha avisada por 1,8 s; 10 Pokémon com 40% da vida e 45% do dano de um comum cruzam 1.120 px em linha reta | cada um dá o orbe normal; quem não cai sai sem deixar nada; derrubar todos deixa 1 artefato |
| Amigo selvagem | um Pokémon do elenco da região espera 12 s; encostar faz ele ajudar por 24 s, um golpe a cada 0,7 s em quem estiver a até 260 px | 55% do dano do golpe principal por golpe; sem vida nem hitbox, não ocupa vaga de apoio |
| Desafio relâmpago | baliza opcional por 15 s; encostar aceita "derrote N em 20 s", com N = abates do último minuto levados a 20 s com folga de 30%, entre 8 e 40 | 1 chave de baú e 4 orbes de 10; falhar não tira nada |

**Medição** (mesmo comando da seção anterior, 12 sementes, com os eventos ligados; o robô vai até o amigo e a baliza
quando não há dois inimigos a menos de 120 px; média restrita e p10 na política de alcance, comparados com a tabela
"Depois" da seção anterior):

| Forma | Sem eventos | Com eventos | p10 sem → com |
| --- | ---: | ---: | ---: |
| Projétil | 572 | 546 | 341 → 343 |
| Aura | 532 | 464 | 294 → 237 |
| Área | 609 | 589 | 385 → 333 |
| Cone | 677 | 703 | 484 → 720 |
| Órbita | 611 | 617 | 330 → 364 |
| Foco | 522 | 562 | 359 → 347 |
| Rajada | 598 | 586 | 366 → 364 |
| Teleporte | 430 | 446 | 72 → 72 |
| Trilha | 445 | 428 | 240 → 186 |

A distância entre a melhor e a pior forma fica em **1,64×** (Cone 703 / Trilha 428), dentro do teto de 1,67×; na
política evasiva, 1,46×. Os eventos mudam a ordem do RNG a partir de 2:30, então cada corrida passa a ser outra e parte da
diferença é sorteio (±10% com 12 sementes). A queda da Aura (−13%) e do p10 da Trilha passa disso e fica como sinal a
olhar: são as duas formas que não se afastam da multidão, e o robô sai do lugar para buscar o amigo e a baliza. Baixar o
dano da revoada de 60% para 45% não mudou nenhum número da Aura e da Trilha nessas sementes (as mortes delas não vêm da
revoada). Se a sessão humana confirmar, o próximo passo é dar à Aura e à Trilha um retorno próprio nos eventos (por
exemplo, a chuva caindo mais perto de quem está cercado), não cortar o evento.

**Desenho:** sombra e orbe caindo, faixa com setas na direção do voo, anel verde com o sprite real e um coração para o
amigo, baliza dourada com contorno escuro (some na areia sem ele). Sem `shadowBlur` nem gradiente por quadro; no Modo Rotom
a chuva vira só sombras e nada pulsa com movimento reduzido. Sons já existentes (`survivor-level`, `survivor-boss`,
`survivor-pickup`, `success`) e o letreiro de sempre; o chip do HUD mostra tempo, direção e o placar do desafio.

**Custo e quem pode ser prejudicado:** mais XP e itens para quem já vai bem (o Cone chega ao teto em 93% das corridas do
robô). Formas lentas e de contato pagam o desvio. Falta sessão humana em celular, principalmente para ver se a faixa da
revoada se lê a tempo no tamanho de tela real.
