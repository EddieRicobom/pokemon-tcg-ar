# Avaliação e prompts de melhoria (Torre, Vila, Masmorra, Pins)

Avaliação feita lendo o código, os documentos e o que foi construído nas últimas sessões, não jogando no celular. Cada modo tem um diagnóstico curto e um prompt pronto para outra IA. Os prompts foram escritos para uma IA que erra com facilidade: pedem pouco por vez, mandam conferir antes de mudar, proíbem as armadilhas que já aconteceram neste repositório e exigem prova (CI verde) antes de dar algo por pronto.

## Diagnóstico

### Torre de Sobrevivência
- **Bem resolvido:** o motor é puro e tem muitos testes (`core/survivor*.ts`, cerca de 236 casos). O jogo já tem regiões por geração, golpes por tipo, evolução, Mega, Dojô, marmita, objetivos, pausa ao perder o foco, recordes e um simulador de balanceamento (`scripts/survivor-sim.eval.ts`).
- **Fraco:**
  - `MinigameSobrevivencia.vue` tem cerca de 2.900 linhas, então qualquer mexida ali tem risco alto.
  - O balanceamento foi medido com um robô, mas não com gente jogando.
  - O resumo do fim da corrida não mostra o que fez a corrida dar certo ou errado (golpe, upgrades, quem causou mais dano).
  - O recorde é um só, não por Pokémon.
- **Em espera, por pedido do dono (não fazer sem ordem):** missões, conquistas e fenda de lendário no estilo poke-survivor.

### Vila
- **Bem resolvido:** é o modo mais rico, com vida dos moradores, economia, fazenda, Café, Correio, Museu, lendários, Coliseu e as portas para os outros modos. O desempenho com 30 moradores já foi medido e corrigido.
- **Fraco:**
  - `VillageView.vue` (cerca de 3.900 linhas) e `village-game.ts` (cerca de 2.600) estão grandes demais.
  - O Monte Miragem ainda tem terraços retangulares. Os paredões e o mato já foram melhorados.
  - A Masmorra já guarda cofre, recorde e prêmios na Vila (`VillageState.dungeon`), mas nada disso aparece na Vila: nem no Museu nem no Correio.

### Masmorra
- **Bem resolvido:**
  - regras puras com testes (`core/dungeon*.ts`);
  - 20 armas e 210 fusões;
  - arma tirada de uma tabela por Pokémon;
  - gemas, IA por perfil, andares por geração com cenário e casas especiais;
  - som;
  - ponte com a Vila (cofre, marmita, prêmios).
- **Fraco:**
  - Fechar a tela perde a expedição, porque não há salvamento.
  - Os números nunca foram balanceados (não há simulador, como o da Torre).
  - Efeitos de estado (envenenado, paralisado) não existem.
  - A grade não tem foco de teclado nem leitura para leitor de tela.
  - Nada foi visto num celular de verdade.

### Pins
- **Bem resolvido:** o motor tem testes (`core/pins.ts`, `pin-ai`, `pin-replay`, `pin-opponents`, cerca de 94 casos), além de PvP, replay e terreno.
- **Fraco:**
  - `PinsView.vue` tem cerca de 2.000 linhas.
  - A revisão no celular real (sobreposições, tamanho dos botões ao toque) está pendente desde o item 22 do plano.
  - Não há uma primeira partida guiada.
  - Não está claro para o jogador o que a IA adversária vai fazer.

## Regras comuns (já incluídas em cada prompt)

São as que mais evitam erro neste repositório:
1. Ler `CLAUDE.md` antes de tudo e obedecer.
2. Uma tarefa por PR, numa branch `claude/...` a partir da `main` atualizada.
3. Conferir se a coisa já existe antes de criar.
4. Lógica nova em `src/core/` com teste ao lado.
5. Nada de inventar dado.
6. Textos em português do Brasil.
7. Sem refatoração fora do pedido.
8. Fins de linha preservados.
9. No template Vue, sem arrow function que indexa objeto importado.
10. Só dizer que funciona com `typecheck`, `test` e `build` verdes.

---

## Prompt 1 — Torre de Sobrevivência

```text
Você vai melhorar a Torre de Sobrevivência do repositório EddieRicobom/pokemon-tcg-ar (PWA Vue 3 + TypeScript + Vite). Trabalhe com cuidado: você pode errar, então siga o roteiro à risca e pare para perguntar quando algo não bater.

ANTES DE COMEÇAR
1. Leia CLAUDE.md inteiro e obedeça. Leia também IMPLEMENTATION_PLAN.md (procure «Torre» e «Survival») e docs/TESTING.md.
2. Atualize a main (git fetch; git checkout -b claude/torre-<assunto> origin/main). Uma tarefa por branch e por PR.
3. Os arquivos da Torre são: src/core/survivor*.ts (regras puras, com testes *.test.ts ao lado), src/components/MinigameSobrevivencia.vue (tela, ~2.900 linhas: mexa o mínimo possível nele), src/village/survivor-*.ts (arte), scripts/survivor-sim.eval.ts (simulador de balanceamento).

O QUE FAZER (escolha UMA tarefa por PR, nesta ordem)
A. Resumo da corrida mais útil. No fim da corrida, mostrar: dano total por fonte (golpe principal, golpe de apoio, especial), os upgrades escolhidos na ordem, a região onde caiu e o inimigo que deu o golpe final. Primeiro procure no estado da corrida (src/core/survivor*.ts) o que já é contado; só acrescente contadores que faltam, dentro do motor puro, com teste. A tela só lê esses números.
B. Recorde por Pokémon. Hoje há um recorde geral (torre.bestMs, bestWave, bestLevel no estado da Vila). Acrescente um recorde por espécie (dexId) no MESMO lugar do estado (procure normalizeTower em src/core/village/tower-state.ts), com normalização (valores inválidos viram vazio, limite de 200 espécies) e teste de normalização. Mostre o recorde do Pokémon na tela de escolha.
C. Balanceamento com números. Rode o simulador (npx tsx scripts/survivor-sim.eval.ts ou conforme docs/TESTING.md) e anote mediana e p10/p90 do tempo de sobrevivência ANTES. Só mude números se a mediana estiver fora de 120–240 s; mude UM parâmetro por vez, rode de novo e registre ANTES/DEPOIS no PR. Nunca chute números sem rodar.

NÃO FAÇA
- Não implemente missões, conquistas nem «fenda de lendário»: o dono pediu explicitamente para esperar.
- Não divida nem reorganize MinigameSobrevivencia.vue. Não renomeie funções, arquivos ou chaves de save existentes.
- Não mude chaves de localStorage nem o formato do save sem normalização e teste (o save do usuário não pode quebrar).
- Não invente dado de Pokémon: stats e tipos vêm de src/core/data/*.json; sem dado, mostre «sem dados».
- No template Vue, não use arrow functions que indexam objetos importados (ex.: `list.map((t) => TYPE_LABELS_PT[t])`): o vue-tsc já quebrou o deploy assim. Faça uma função no <script setup>.
- Não converta fins de linha: se o arquivo tem CRLF, mantenha CRLF (no Python, abra com newline=''). Confira com `git diff --stat` que só as linhas que você mexeu aparecem.

VERIFICAÇÃO (obrigatória antes de dizer que terminou)
- npm run typecheck, npm test, npm run build: os três verdes. Cole no PR a última linha de cada um.
- Se mexeu na tela, descreva no PR exatamente o que olhar e em que largura (375 px e desktop).
- Atualize IMPLEMENTATION_PLAN.md (item da Torre) com o que mudou e o que NÃO foi verificado.
- Abra o PR para main com título em português e uma seção «Não verificado».
```

---

## Prompt 2 — Vila

```text
Você vai melhorar a Vila do repositório EddieRicobom/pokemon-tcg-ar (PWA Vue 3 + TypeScript + Vite). Você pode errar: siga o roteiro e pare para perguntar quando algo não bater.

ANTES DE COMEÇAR
1. Leia CLAUDE.md inteiro e obedeça. Leia IMPLEMENTATION_PLAN.md (seção «Vila») e docs/MASMORRA.md (seção «Masmorra e Vila»).
2. git fetch; git checkout -b claude/vila-<assunto> origin/main. Uma tarefa por branch e por PR.
3. Mapa: estado e regras em src/core/village/*.ts (puro, com testes); mapa fixo em src/core/village/town-layout.ts e src/core/village/mountain.ts; desenho em src/village/*.ts; tela em src/components/VillageView.vue (~3.900 linhas — mexa o mínimo) e motor de desenho em src/village/village-game.ts (~2.600 linhas).

O QUE FAZER (UMA tarefa por PR, nesta ordem)
A. Vitrine da Masmorra no Museu. O estado da Vila já tem `dungeon` (src/core/village/dungeon-vault.ts: gems, bestFloor, rewardsToday). No diálogo do Museu (procure `openBuilding` e o texto «Vitrines de tudo o que você já juntou» em VillageView.vue), acrescente uma linha com o andar mais fundo e quantas gemas há no cofre, e um botão que abre uma lista das gemas do cofre (use o componente src/components/GemChip.vue). Só leitura: nada de gastar ou mover gemas aqui.
B. Terraços do Monte Miragem com contorno irregular. Hoje TERRACES em src/core/village/mountain.ts são retângulos. Torne a borda irregular (cantos chanfrados e trechos que entram/saem 1 bloco), SEM mudar: a posição das escadas (stairsX), a estátua do Mew (MEW_STATUE), MOUNTAIN_SPOTS e a trilha. Os testes em src/core/village/mountain.test.ts e layout.test.ts (alcance a pé, portas livres) têm de continuar passando sem afrouxar nenhuma asserção. Acrescente um teste: toda escada continua alcançável a partir do spawn.
C. Carta do Correio depois de uma expedição. Veja como o Correio cria cartas (src/core/village/mail.ts). Quando o jogador sai da Masmorra com o espólio (settleExpedition em src/core/dungeon-village.ts), gere uma carta de um morador comentando o andar alcançado. A lógica fica em src/core/ com teste; a ligação com a tela é uma linha.

NÃO FAÇA
- Não divida nem reorganize VillageView.vue ou village-game.ts. Não renomeie nada existente.
- Não mude o formato do save sem normalização (normalizeVillage em src/core/village/life.ts) e teste de ida e volta (JSON.stringify → normalizeVillage).
- Não mude MAP_LAYOUT nem coordenadas de prédios, casas e decoração fixa: saves antigos dependem delas.
- No template Vue, sem arrow functions que indexam objetos importados; use função no <script setup>.
- Preserve fins de linha (VillageView.vue tem CRLF na cópia de trabalho; no Python use newline=''). Confira com `git diff --stat` que o diff é pequeno.
- Efeito visual novo que pese na GPU precisa de opção para desligar (regra do CLAUDE.md).

VERIFICAÇÃO
- npm run typecheck, npm test, npm run build verdes; cole a última linha de cada no PR.
- Descreva no PR o que olhar e onde (prédio, coordenada, largura 375 px).
- Atualize IMPLEMENTATION_PLAN.md (Vila) e, se tocar a Masmorra, docs/MASMORRA.md. Seção «Não verificado» no PR.
```

---

## Prompt 3 — Masmorra

```text
Você vai melhorar a Masmorra do repositório EddieRicobom/pokemon-tcg-ar (PWA Vue 3 + TypeScript + Vite). Você pode errar: siga o roteiro e pare para perguntar quando algo não bater.

ANTES DE COMEÇAR
1. Leia CLAUDE.md e docs/MASMORRA.md inteiros (o «Feito», o «Falta» e o «Pode ser feito» estão lá). Leia future project/IDEIAS_DO_JOGO.md só se precisar entender uma regra de combate.
2. git fetch; git checkout -b claude/masmorra-<assunto> origin/main. Uma tarefa por branch e por PR.
3. Mapa: regras puras em src/core/dungeon.ts, dungeon-weapons.ts, dungeon-gems.ts, dungeon-biomes.ts, dungeon-village.ts, data/pokemon-weapons.ts (todas com testes em *.test.ts); tela em src/components/DungeonGame.vue e componentes Dungeon*.vue, WeaponArt.vue, FusionArt.vue, GemChip.vue.

O QUE FAZER (UMA tarefa por PR, nesta ordem)
A. Salvar e continuar a expedição. O DungeonState é um objeto simples (serializável). Crie em src/core/dungeon-save.ts: `serializeDungeon(state): string` e `restoreDungeon(raw: unknown): DungeonState | null` que VALIDA tudo (fase, andar inteiro ≥ 1, equipe 1–6 com HP/carga coerentes, grade dentro de GRID_W×GRID_H, gemas com kind válido) e devolve null se algo estiver estranho. Teste ida e volta e 5 casos de save corrompido. Na tela: salvar no localStorage (com try/catch) depois de cada ação concluída e no fim de cada turno inimigo; na tela de escolha, botão «Continuar expedição (andar N)»; apagar o save ao perder, sair ou começar outra. Nunca restaure no meio do turno inimigo: se a fase salva for 'enemy', restaure como 'player' depois de chamar finishEnemyTurn.
B. Simulador de balanceamento. Crie scripts/dungeon-sim.eval.ts no mesmo estilo de scripts/survivor-sim.eval.ts: um robô simples (ataca o alvo ao alcance com mais dano previsto; se não houver, anda em direção ao inimigo mais próximo; usa poção abaixo de 30% de HP; desce sempre que pode) joga 200 expedições com sementes fixas e imprime mediana/p10/p90 do andar alcançado. NÃO mude números neste PR: só o simulador e o relatório no PR.
C. Efeitos de estado da munição mista. Acrescente envenenado (perde 6% do HP máximo por rodada, 3 rodadas) e paralisado (o inimigo perde o próximo turno, 25% de chance) aplicados por munições cujo tipo secundário seja Venenoso ou Elétrico. Tudo em src/core/dungeon.ts, com teste para cada um; ícones na grade (☠️ e ⚡) como já existe 🔥 para queimadura.

NÃO FAÇA
- Não troque a tabela Pokémon → arma (src/core/data/pokemon-weapons.ts): ela foi escolhida à mão pelo dono.
- Não mude números de balanceamento sem o simulador (tarefa B) mostrar o motivo, e nunca no mesmo PR de outra tarefa.
- Não mude chaves de localStorage existentes (recorde, som, cenário). Use chaves novas com sufixo -v1.
- Não mude o formato de VillageState.dungeon sem normalização e teste.
- No template Vue, sem arrow functions que indexam objetos importados; use função no <script setup>.
- Preserve fins de linha; confira com `git diff --stat`.

VERIFICAÇÃO
- npm run typecheck, npm test, npm run build verdes; cole a última linha de cada no PR.
- Atualize docs/MASMORRA.md (mova o item de «Falta» para «Feito» só se estiver completo e verificado). Seção «Não verificado» no PR.
```

---

## Prompt 4 — Pins

```text
Você vai melhorar a Pista de Pins do repositório EddieRicobom/pokemon-tcg-ar (PWA Vue 3 + TypeScript + Vite). Você pode errar: siga o roteiro e pare para perguntar quando algo não bater.

ANTES DE COMEÇAR
1. Leia CLAUDE.md, IMPLEMENTATION_PLAN.md (procure «Pins», em especial o item 22) e docs/TESTING.md (ferramentas de e2e com Playwright).
2. git fetch; git checkout -b claude/pins-<assunto> origin/main. Uma tarefa por branch e por PR.
3. Mapa: regras puras em src/core/pins.ts, pin-ai.ts, pin-replay.ts, pin-opponents.ts, pin-card-info.ts, pin-visual-effects.ts, pin-terrain.ts (com testes); arte em src/pins/*.ts; tela em src/views/PinsView.vue (~2.000 linhas — mexa o mínimo).

O QUE FAZER (UMA tarefa por PR, nesta ordem)
A. Auditoria de toque a 375 px. Com o Playwright (veja docs/TESTING.md e e2e/), abra a tela de Pins em 375×812 e em desktop, tire capturas das etapas principais (escolha, mira, disparo, resultado, PvP) e liste no PR todo botão com área de toque menor que 44×44 px e todo texto ou botão sobreposto. Corrija só CSS (tamanho, espaçamento, quebra de linha) e tire as capturas de novo. Anexe ANTES e DEPOIS no PR.
B. Primeira partida guiada. Se o jogador nunca jogou (veja se já existe algum contador de partidas no estado; se não existir, use localStorage com chave nova `tcg-ar-pins-tutorial-v1`), mostre 3 a 4 dicas curtas em sequência (mirar, força, efeito do tipo, objetivo), cada uma com «Entendi», e um botão «Pular». Textos em português do Brasil, curtos. Nada de mudar regra de jogo.
C. Intenção da IA adversária visível. Em src/core/pin-ai.ts, exponha uma função pura que descreve o que a IA vai tentar no próximo disparo (alvo e força aproximada) sem mudar a decisão dela, com teste garantindo que a descrição bate com a decisão real para várias sementes. Na tela, mostre essa intenção em uma linha durante o turno do adversário.

NÃO FAÇA
- Não mude a física, o placar nem a IA (só exponha a intenção, na tarefa C).
- Não divida nem reorganize PinsView.vue. Não renomeie nada existente.
- Não mude o formato do replay (pin-replay.ts): replays salvos têm de continuar abrindo.
- Preço por disparo e moedas vêm de src/app/wallet.ts: não mude valores.
- No template Vue, sem arrow functions que indexam objetos importados; use função no <script setup>.
- Preserve fins de linha; confira com `git diff --stat`.
- Câmera real, sensores e GPU só se validam em celular: diga isso no PR, não finja que testou.

VERIFICAÇÃO
- npm run typecheck, npm test, npm run build verdes; cole a última linha de cada no PR.
- Atualize IMPLEMENTATION_PLAN.md (item dos Pins). Seção «Não verificado» no PR.
```
