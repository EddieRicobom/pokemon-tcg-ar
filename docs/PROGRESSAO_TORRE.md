# Progressão da Torre pela Vila

> Documento de concepção. Nada aqui está implementado ainda. Os números são o ponto de partida para o protótipo e serão travados por testes de equilíbrio (seção "Testes que travam os tetos").

## Ideia central

A Torre de Sobrevivência paga moedas (`survivorCoins`) e a Vila transforma moedas e materiais em vantagens para a próxima corrida. Não há loja solta num menu: cada vantagem passa por um posto da Vila com um morador responsável, como já acontece com o Carteiro e a Garçonete.

```
Torre (corrida) ──moedas──────────────────────────────▶ Vila
Vila (Dojô, Café, Correio) ──treino, marmita, sorte──▶ próxima corrida
```

| Posto | Morador | O que dá para a Torre | Duração |
|---|---|---|---|
| Dojô | Instrutor (profissão nova) | Treinos e Lições do Instrutor | permanente |
| Café | Garçonete | Marmita feita com uma receita da cozinha | 1 corrida |
| Correio | Carteiro | Carta da sorte: 1 desejo de Jirachi | começo da próxima corrida |

Orçamento geral: uma corrida com **tudo no máximo** deve durar no máximo **15% a mais** que uma corrida pura com o mesmo Pokémon. A dificuldade dos chefes continua sendo o desafio.

## Como a proposta foi decidida

Três subagentes analisaram a proposta em paralelo, lendo o código real: um defendendo a sensação de progresso, um defendendo o desafio e um planejando a implementação. Os números finais ficam entre as duas posições de equilíbrio:

| Ponto | Defensor da diversão | Guardião do desafio | Decisão |
|---|---|---|---|
| Fôlego | +30 HP | +15 HP | **+20 HP** (4 × 5) |
| Postura | +20 Def/DefEsp | +15 | **+15**, em campo próprio |
| Passada | +9% | +4% | **+6%** (3 × 2%) |
| Faro | 46 → 70 px (+52%) | +10% | **+15%** |
| Olhar treinado | 2 primeiras ofertas | só a 1ª | **só a 1ª**, porque já existe a carta "+1 opção nas ofertas" |
| Desejos no início | sem limite próprio | no máximo 2 | **no máximo 2**, e o estoque continua com teto de 3 |
| Prato misto | 60% de cada efeito | 50% | **60%**, sem passar do teto de nenhuma família |
| Cura da marmita | até 1,2 HP/s na corrida toda | até 30% do HP | **até 30% do HP máximo por corrida** |
| Custo total | ≈ 7.000 moedas | sem posição | ≈ 15.000 moedas + peças (pedido do dono: progressão longa) |

Pontos de consenso: o ganho tem que ser visível (resumo da corrida mostra os bônus), a corrida pura com recorde separado é obrigatória, banimento é a peça menos perigosa sozinha e a mais perigosa somada com desejos, e a árvore de compras precisa ter fim.

## 1. Dojô e o Instrutor

- **Profissão nova**, `dojo`, liberada com **7 moradores** (entre o Carteiro, com 6, e o Café, com 8). O jogador escolhe o morador como já faz com o Carteiro. Moradores do tipo Lutador ganham falas próprias, mas não há exigência de tipo.
- O Instrutor anda até o Dojô e treina no boneco, como o Carteiro percorre as portas.
- Ele comenta a última corrida a partir de `recentRuns`, por exemplo: "Você caiu pro chefão de novo. Vamos treinar postura?".
- As **preparações** que já existem (`survivor-preparations.ts`) passam a ser "ensinadas" pelo Instrutor. Quem libera continua sendo o objetivo; só a tela é dele.
- Se a Vila encolher e o posto ficar suspenso, os treinos já comprados continuam valendo. Só a compra de novos depende do Instrutor ativo.

### Reformas

| Reforma | Moedas | Materiais |
|---|---|---|
| Tatame | 400 | 4 tábuas |
| Dojô | 1400 | 6 tijolos, 2 bonecos de treino |
| Dojô de pedra | 2800 | 10 tijolos, 4 vidros, 2 placas de armadura |

### Peças de treino (fabricadas no menu de fabricar)

| Peça | Receita | Valor aproximado |
|---|---|---|
| Boneco de treino | tábua 2 + tecido 1 + lã 1 | ≈ 40 |
| Faixa de treino | tecido 2 + lã 1 | ≈ 32 |
| Placa de armadura | ferro 2 + tijolo 1 | ≈ 42 |
| Sino do desejo | ferro 1 + estrela-do-mar 1 + vidro 1 | ≈ 64 |
| Lente de foco | vidro 2 + peixe-dourado 1 | ≈ 95 |

A Lente usa peixe-dourado em vez de pérola: com pérola ela custava cerca de 160 e travava quem não pesca muito.

### Treinos

Cada nível custa moedas e 1 peça. Os níveis 1 e 2 pedem o Tatame, o 3 pede o Dojô e o 4 pede o Dojô de pedra.

| Treino | Por nível | Máx. | Total | Moedas por nível | Peça |
|---|---|---|---|---|---|
| Fôlego | +5 HP máx. | 4 | +20 HP | 180 / 300 / 480 / 700 | Boneco |
| Postura | +5 Def e DefEsp | 3 | +15 | 260 / 480 / 720 | Placa |
| Passada | +2% de velocidade | 3 | +6% | 260 / 440 / 660 | Faixa |
| Faro | +5% de raio de coleta | 3 | +15% | 220 / 360 / 540 | Faixa |

- A Postura entra num campo próprio (`trainingDefenseBonus`), não em `defenseBonus`. Assim não fura o limite de "até 2 cartas" de Casca firme e Manto especial e continua passando pelo retorno decrescente `def/(200+def)`.
- O raio de coleta continua com o teto `MAGNET_PICKUP_RADIUS_CAP` (90).

### Lições do Instrutor

A trilha só mexe nas escolhas de upgrade, nunca nos números do Pokémon.

| # | Lição | Efeito | Requer | Custo |
|---|---|---|---|---|
| 1 | Olhar treinado | A **primeira** oferta da corrida mostra 1 carta a mais, sem passar do teto de 5 | Tatame | 500 + 1 Faixa |
| 2 | Desejo de Jirachi | Começa a corrida com 1 desejo | Tatame | 900 + 1 Sino |
| 3 | Recusa | 1 banimento por corrida | Dojô | 1400 + 2 Placas |
| 4 | Recusa firme | +2 banimentos (3 no total) | Dojô de pedra | 2200 + 2 Lentes |

### Banimento

- Na tela de upgrade aparece o botão **"🚫 Banir (n)"** ao lado do Desejo de Jirachi. Ao tocá-lo, o próximo toque numa carta bane em vez de escolher.
- A carta banida sai da oferta e do sorteio **até o fim da corrida**, e a vaga é reposta com outra carta (`excludeIds` com a oferta atual e os banidos). Sem reposição, banir só faria perder opção.
- **Não podem ser banidas** (o botão aparece desligado, com o motivo escrito):
  - a última carta possível, quando a oferta ficaria vazia;
  - cartas que já têm nível na corrida, porque banir não pode servir para "resetar";
  - ofertas sintéticas: segundo golpe, evolução, afinidade de tipo e apoio.
- Banimentos não usados somem no fim da corrida.

### Desejos de Jirachi

- `upgradeRerolls` continua com teto de 3. Desejo da lição e sorte do Carteiro somam **no máximo 2 no início**.
- A carta `jirachi-reroll` sai do sorteio quando o estoque está cheio, para não virar carta morta.
- Não confundir com `survivorRerollLimit` (`survivor-objectives.ts`): ele controla a troca do sorteio de Pokémon na seleção e não muda.

## 2. Carteiro: a sorte do dia

- Uma vez por dia, ao falar com o Carteiro, aparece a opção de ler a carta: **"✉️ A sorte está do seu lado."**
- Ela dá **1 desejo de Jirachi extra apenas no começo da próxima corrida**. Não acumula: no máximo 1 pendente, e ler de novo no mesmo dia não dá outro.
- É gasta ao começar a corrida, usando ou não. A primeira oferta mostra o aviso "⭐ Sorte do carteiro: +1 desejo".
- Segue o mesmo ritmo diário do correio que já existe (`mailDay` em `town.ts`), mas no diálogo do Carteiro.

## 3. Marmita na cozinha do Café

- Com o Café ativo (8 moradores), a Garçonete libera **"Preparar marmita"**. A marmita é qualquer comida que o jogador já cozinhou pelo menu cozinhar, e cada receita tem um efeito na Torre.
- A seleção da corrida tem **1 vaga de marmita**: só uma por corrida. Ela sai da mochila ao começar e é gasta se a corrida contar (≥ 20 s, `SURVIVOR_MIN_MS`). Abaixo disso, volta para a mochila.
- O efeito vem do **ingrediente principal** da receita (família) e a força vem da **complexidade** (tier):
  - **T1**: 1 ingrediente, dura 3 min.
  - **T2**: 2 ingredientes, dura 6 min.
  - **T3**: 3 ingredientes ou mais, ou uma receita que leva outro prato (Lanche Pokébola), dura até 20 min. No modo infinito ela também acaba nos 20 min.
- Um prato de duas famílias aplica **60%** de cada efeito, e nenhuma família passa do próprio teto.
- Quando o efeito acaba, aparece um aviso na tela ("🍱 A marmita acabou").

| Família | Ingrediente | T1 | T2 | T3 | Teto |
|---|---|---|---|---|---|
| Doce | mel, açúcar, leite, manteiga, ovo | 0,2 HP/s | 0,3 HP/s | 0,4 HP/s | cura total de 30% do HP máx. |
| Peixe | peixe, peixe-dourado | XP ×1,10 | ×1,15 | ×1,20 | usa o maior valor com `xpMultiplier`, não multiplica |
| Fruta | oran, pecha, uva e outras frutas e ervas | +15% de proteção depois de levar um golpe | +20% | +25% | +25% |
| Raiz | batata, cenoura, abóbora | +4 Def/DefEsp | +7 | +10 | +20 somando com a Postura |
| Grão | milho, trigo | +5% raio de coleta | +8% | +10% | teto de 90 px |
| Fresco | melancia, tomate | +2% velocidade | +3% | +4% | +8% somando com a Passada |

Exemplos: Pão de mel (mel 2 + milho 1) é Doce + Grão T2. Lanche Pokébola é T3 com Doce, Peixe e Fresco a 60%. `lunchEffectFor(foodId)` deriva tudo isso da receita em `RECIPES`, e um teste cobre todas as comidas (`kind: 'food'`).

## 4. Regras de proteção

- **Corrida pura**: um interruptor na seleção desliga Dojô, sorte e marmita. A sorte fica guardada e a marmita fica na mochila. Cada treino e lição também tem seu interruptor.
- **Recordes**: `SurvivorRunRecord` ganha `trained: boolean` e a Torre ganha `bestPureMs` ao lado de `bestMs`. A tela mostra os dois.
- **Objetivos, conquistas e bônus diário** continuam valendo com treino. O histórico mostra o selo "treinada". O bônus de zerar continua uma vez por dia.
- **Modo infinito** aceita os treinos permanentes. Marmita e sorte se limitam ao começo da corrida, como descrito acima.
- **Resumo da corrida** mostra o que estava ativo ("Treinos: +20 HP, +15 Def · Marmita: Pão de mel"). Sem isso o progresso fica invisível.

## Custo e ritmo

Tudo comprado custa cerca de **15.200 moedas** mais as peças: 4.600 nas reformas, 5.600 nos treinos e 5.000 nas lições. É uma meta de longo prazo, por decisão do dono do projeto.

- **Jogador casual** (corridas de 4 a 8 min, 50 a 90 moedas): cerca de 180 corridas para completar. Na prática ele também ganha moedas na Vila, então o prazo real é menor.
- **Jogador que zera** (≈ 250 por corrida e +500 por dia): 5 a 6 semanas.
- **Primeira compra** (Tatame + Fôlego 1 = 580 moedas): 2 corridas para quem zera, 6 a 8 para o casual. É o momento que faz o jogador sentir que valeu, então este é o preço que não deve subir mais.

Os degraus finais (Dojô de pedra 2.800, Recusa firme 2.200) são o "grande objetivo" e pesam de propósito. As moedas competem com casas e móveis da Vila, o que dá peso às escolhas.

## Implementação

### Estado persistido

Na Vila (`VillageState`, `src/core/village/life.ts`), um bloco único normalizado por `normalizeTower(raw)`:

```ts
tower: {
  dojoLevel: 0 | 1 | 2 | 3;                         // 0 sem Dojô; 1 Tatame; 2 Dojô; 3 Dojô de pedra
  training: Partial<Record<TrainingId, number>>;    // folego, postura, passada, faro
  lessons: LessonId[];                              // olhar-treinado, desejo, recusa, recusa-firme
  disabled: (TrainingId | LessonId)[];              // interruptores
  luckDay: string;                                  // último dia em que leu a carta da sorte
  luckPending: boolean;                             // 1 desejo para a próxima corrida
  lunchbox: ItemId | null;                          // comida reservada como marmita
}
instructorId: string | null;                        // ao lado de mailCarrierId e cafeWaiterId
```

- Saves antigos recebem tudo zerado, sem mudar a versão `v`. Ids desconhecidos são descartados e os níveis são limitados aos tetos.
- A marmita não é item novo: é uma comida existente reservada em `lunchbox`.
- O backup já cobre a chave da Vila. Falta um caso em `village-economy-backup.test.ts`.
- As peças de treino entram em `catalog.ts` como materiais fabricados (como tábua e tijolo), **não** em `item-collection.ts`, cujo teste conta exatamente 100 itens. Elas precisam de arte, porque `life2.test.ts` exige sprite para todo material.

### Da Vila para a corrida: `TowerLoadout`

Módulo puro novo, `src/core/survivor-loadout.ts`:

```ts
export interface TowerLoadout {
  maxHpBonus: number;
  trainingDefenseBonus: number;
  trainingSpDefenseBonus: number;
  speedMultiplier: number;
  pickupRadiusMultiplier: number;
  firstOfferExtraChoices: 0 | 1;
  startingRerolls: number;          // lição + sorte, no máximo 2
  bans: number;                     // 0 a 3
  lunch: LunchEffect | null;
  trained: boolean;                 // false = corrida pura
}
export function towerLoadout(tower: VillageState['tower'], opts: { pure: boolean }): TowerLoadout;
export const PURE_LOADOUT: TowerLoadout;
```

- `CreateSurvivorOptions` ganha `loadout?: TowerLoadout`, aplicado em `createSurvivorState` junto com a preparação. Sem loadout, o estado é idêntico ao de hoje.
- `beginRun` em `MinigameSobrevivencia.vue` calcula o loadout e, na mesma escrita da Vila (`withVillage`), consome `luckPending` e reserva a marmita. No fim, `settleTowerRun(v, survivedMs)` gasta ou devolve a marmita.
- Se o app fechar no meio da corrida, a marmita fica gasta. É a mesma regra de quem desiste depois dos 20 s.
- Efeitos da marmita ficam em `src/core/survivor-lunch.ts` e chegam ao `stepSurvivor` por um campo opcional (`lunch?: { family, intensity, untilMs }`).

### Banimento no core

- `SurvivorState` ganha `bansLeft` e `bannedUpgradeIds`.
- `banSurvivorUpgrade(state, id): boolean` recusa sem oferta aberta, sem banimento restante, id fora da oferta, id sintético, carta com nível ou oferta que ficaria vazia. Se passar, repõe **a mesma vaga** com `rollUpgrades(..., 1, ..., { excludeIds })`.
- `offerOwedUpgrade` e `rerollSurvivorUpgradeOffer` passam a incluir `bannedUpgradeIds` em `excludeIds`.
- "Olhar treinado" é um `firstOfferBonus` consumido no primeiro `offerOwedUpgrade`.

### Fatias de entrega (um PR cada)

1. **Core do loadout e do banimento, sem UI**: `survivor-loadout.ts`, `survivor.ts`, `survivor-types.ts`, testes de banimento e de equilíbrio.
2. **Estado da Vila e Instrutor**: bloco `tower`, `instructorId`, profissão `dojo` e `chooseServiceResidents` com 3 papéis. Fixar antes a ordem da Garçonete (`candidates[1]`), que muda com um papel novo.
3. **Peças de treino e regras do Dojô**: materiais em `catalog.ts` com arte e `src/core/village/dojo.ts` (`upgradeDojo`, `buyTraining`, `buyLesson`), com teste.
4. **UI do Dojô**: componente próprio `VillageDojo.vue` (o `VillageView.vue` já tem mais de 3.600 linhas), a ação do Instrutor e a caminhada em `village-game.ts`.
5. **Ligação com a Torre**: interruptores e corrida pura na seleção, botão de banir, avisos, `trained` e `bestPureMs` em `trainer.ts`.
6. **Sorte do Carteiro**: `readLuckLetter` em `town.ts`, diálogo e teste do limite diário.
7. **Marmita**: `survivor-lunch.ts`, vaga na cozinha do Café e efeitos no `stepSurvivor`.

## Testes que travam os tetos

1. **Orçamento**: em `survivor-balance.test.ts`, a mesma simulação com o loadout no máximo dura no máximo 1,15× a média pura. As faixas atuais da corrida pura não mudam.
2. **Estado inicial no máximo**:
   - `upgradeRerolls` fica em no máximo 2 no início e 3 no total;
   - a redução de defesa fica em no máximo 0,45 para a maior defesa base do teste;
   - Dojô e cartas `guard-*` somados respeitam o teto, e `maxLevels` continua valendo.
3. **Olhar treinado**: a primeira oferta tem `upgradeChoices + 1` cartas (teto 5) e as seguintes voltam ao normal, mesmo com a carta "+1 opção".
4. **Banimento**: a carta não volta no sorteio nem no desejo, a vaga é reposta, os casos proibidos são recusados e o limite é 3.
5. **Marmita**:
   - a cura total fica em no máximo 30% do HP máx.;
   - cada tier acaba no tempo certo;
   - o XP usa o maior valor;
   - um prato misto nunca passa do teto de cada família;
   - toda comida do catálogo tem efeito definido.
6. **Corrida pura**: com `PURE_LOADOUT`, o estado criado é igual ao de hoje, `trained` é registrado certo e uma corrida treinada não atualiza `bestPureMs`.
7. **Sorte**: uma carta por dia, no máximo 1 pendente, gasta ao começar a corrida.

## Em aberto

- Arte das cinco peças de treino e do Dojô nas três reformas.
- Falas do Instrutor por tipo e por resultado da última corrida.
- Se o Instrutor deve ter preferência por moradores do tipo Lutador na escolha automática.

## Como ficou implementado

- **Fruta** virou proteção maior depois de um golpe (`hitInvulnerabilityMs`), porque o jogador não tem status negativos no motor e o efeito não seria inventado.
- **Instrutor** é escolhido por `chooseInstructor` (nunca o carteiro nem a garçonete). Ele só aparece com a população mínima, mas o que foi comprado continua valendo.
- **Marmita** devolve-se à mochila se a corrida durar menos de 20 s. Se o app fechar no meio da corrida, ela continua reservada e só é gasta quando uma corrida terminar.
- **BONK**: usa o mesmo `createSurvivorState`; Dojô, sorte, marmita e banimento valem nos dois modos.
- **Recordes**: `torre.bestPureMs` guarda o melhor tempo sem nada da Vila; saves antigos herdam o `bestMs`, porque tudo era puro antes.
- **Ainda não feito**: o Dojô ainda não é um prédio desenhado (o Instrutor treina na porta da Torre de Sobrevivência: 20 s de treino a cada 75 s de rotina comum), a arte das peças e do Dojô não foi vista em aparelho real, e o teste de orçamento de 15% por simulação não foi escrito.
