# Kart: corrida, itens e recuperação

Corrida 3D low-poly da Vila (prédio **Pista de Kart**). O motor é puro (`src/core/kart-race.ts`, `src/core/kart-items.ts`), a cena fica em `src/box/start-kart-race.ts` e a tela em `src/components/KartRacer.vue`. O kart usa os tipos e os seis atributos-base reais do Pokémon para escolher carroceria, rodas, desempenho e habilidade.

## Modos

- **Corrida rápida**: três voltas contra três rivais. Paga moedas por posição e registra o evento de minigame.
- **Copa de Treinadores**: três etapas com pontos (10/6/3/1), rivais que trocam a cada etapa e Blue no duelo final. O progresso é salvo entre etapas, e o melhor tempo de volta/corrida de cada etapa fica no aparelho.
- **Revanche**: o resultado da corrida rápida oferece «Correr de novo» sem voltar ao menu.
- **Records**: melhor volta e melhor corrida por etapa (`app/kart-records.ts`), com aviso no resultado.

## Controles

| Ação | Toque | Teclado | Controle |
| --- | --- | --- | --- |
| Acelerar | botão Acelerar (ou aceleração automática no menu) | ↑ / W | direcional/acelerador |
| Frear / derrapar | botão Freio | Espaço | botão de freio |
| Virar | ◀ / ▶ | ← → / A D | direcional/analógico |
| Habilidade | botão da habilidade | E | A |
| Item | botão do item | Q | (toque) |

Aceleração automática e som do motor ficam salvos no aparelho.

## Itens

As caixas coloridas ficam na pista e voltam nove segundos depois de alguém pegar. Cada kart carrega **um item por vez**; o jogador usa quando quiser, o NPC usa depois de um atraso curto. O escudo bloqueia qualquer ataque; casca, óleo, concha e raio contam acerto para quem lançou.

| Item | Tier | Efeito |
| --- | --- | --- |
| 🔥 Turbo | comum | +2,2 s de impulso |
| 🍌 Casca | comum | deixa uma armadilha atrás; quem encosta roda e perde velocidade |
| 🛡️ Escudo | raro | 3,4 s protegendo de casca, óleo, concha e raio |
| 🛢️ Óleo | raro | poça atrás; quem passa perde aderência e velocidade |
| 🐚 Concha | raro | persegue o rival imediatamente à frente e o faz rodar |
| ⚡ Raio | épico | atinge todos os rivais à frente |
| ☄️ Cometa | épico | impulso forte por 3,6 s com escudo curto; o item de quem está atrás |

### Corrida de recuperação

O sorteio usa a posição no momento da coleta (`kartItemOdds`). Quanto pior a posição, maior a chance de item forte e menor a de item de líder. Com 4 karts:

| Posição | Comuns | Raros | Épicos |
| --- | ---: | ---: | ---: |
| 1º (líder) | 63% | 33% | 4% |
| 2º | 58% | 35% | 7% |
| 3º | 51% | 35% | 15% |
| 4º (último) | 43% | 33% | 24% |

A curva é monotônica para concha + raio + cometa e está coberta por `src/core/kart-items.test.ts`. O menu mostra a chance de item épico do líder e do último; não é um número escondido.

## Derrapagem

Frear e virar junto acima de 12 unidades/s carrega a derrapagem. Soltar o freio vira um mini-turbo proporcional à carga. O anel do kart fica laranja enquanto carrega e o HUD mostra a porcentagem. É a principal ferramenta de habilidade para compensar um kart mais lento e para defender a liderança.

## Apresentação

- Largada com contagem de 3 s, semáforo no arco e carros parados até o zero.
- Pista com acostamento, zebras, arquibancadas com torcida, nuvens, montanhas, árvores e arco de largada.
- Caixas de item flutuantes em três cores, cascas, poças e conchas desenhadas no mundo, giro ao ser atingido, tremor de câmera no impacto, FOV que abre no impulso e linhas de velocidade.
- HUD com volta, posição, tempo, ritmo, derrapagem, item, habilidade, minimapa com caixas e projéteis e classificação completa no fim.
- Vibração de item/impacto não é usada aqui; o feedback é visual e sonoro (o som do motor pode ser desligado; bipes de item respeitam a opção).

## Análise de equilíbrio

`scripts/kart-sim.eval.ts` roda o motor real com um robô que segue a pista, usa itens e pode derrapar. Com 80 corridas por cenário (habilidade 0,9):

| Cenário | Vitórias | Pódio | Posição mediana |
| --- | ---: | ---: | ---: |
| Sem itens, largada na frente | 100% | 100% | 1 |
| Com itens, largada na frente | 59% | 95% | 1 |
| Sem itens, largada no fundo | 0% | 100% | 3 |
| Com itens, largada no fundo | 1% | 74% | 3 |
| Com itens e derrapagem, na frente | 88% | 98% | 1 |
| Com itens e derrapagem, no fundo | 5% | 76% | 2 |

Leitura: os itens tiram a invencibilidade do líder e dão recuperação a quem está atrás; a derrapagem recompensa habilidade e sobe a recuperação do fundo de 1% para 5%. É um robô, não gente: não prova dificuldade justa, toque em celular nem desempenho de GPU. A calibragem de 24% de épico no último é o primeiro número; sessões humanas podem pedir ajuste.

## Ferramentas

- Harness visual: `npx vite` e abrir `/pokemon-tcg-ar/e2e/kart/index.html?dex=25` (`auto=0` mostra o menu, `cup=1` abre a Copa). `window.kart.setup()` expõe o estado no console.
- Simulador: `KART_SIM_RUNS=80 npx vitest run -c vitest.eval.config.ts scripts/kart-sim.eval.ts --silent=false`. `KART_SIM_SKILL` muda a habilidade do robô e `KART_SIM_DT` o passo.
- Testes: `src/core/kart-items.test.ts`, `src/core/kart-race.test.ts`, `src/core/kart-race-items.test.ts`, `src/core/kart-map.test.ts`, `src/app/kart-cup.test.ts` e `src/app/kart-records.test.ts`.
