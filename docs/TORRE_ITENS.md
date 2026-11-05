# Torre: baús, chaves e itens segurados

Itens segurados (*held items*) são recompensas que valem só durante a corrida da Torre e se somam, no espírito dos itens de *The Binding of Isaac*: mudam o comportamento e o visual dos golpes. Cada um faz referência a um item real dos jogos de Pokémon que já existia até a 4ª geração, e a interface usa o sprite oficial do item, carregado do repositório PokeAPI/sprites (a mesma fonte dos GIFs dos Pokémon).

## Onde fica o código

| O quê | Arquivo |
|---|---|
| Catálogo, ficha de modificadores, sorteio do baú, sprite | `src/core/survivor-held.ts` |
| Baús, chaves e efeitos a cada acerto (motor) | `src/core/survivor.ts` (bloco «itens segurados, chaves e baús») |
| Tipos (`SurvivorChest`, `SurvivorKeyDrop`, `SurvivorHeldMine`, eventos) | `src/core/survivor-types.ts` |
| Marcas nos disparos (`look.held`) | `src/core/survivor-projectile-power.ts` |
| Desenho: marcas, itens girando, baú, chave, raio, faíscas | `src/village/survivor-held-art.ts` |
| Tela: escolha do baú, HUD, sprites, avisos | `src/components/MinigameSobrevivencia.vue` |
| Minimapa (baús e chaves) | `src/core/survivor-minimap.ts` |
| Testes | `src/core/survivor-held.test.ts`, `src/core/survivor-held-transformers.test.ts` |

## Chaves e baús

- **Baús:** o primeiro aparece aos 2:30 e depois um a cada 2:30, no máximo 2 no mapa ao mesmo tempo. Ficam entre 260 e 420 px do jogador e aparecem no minimapa. No Ritmo acelerado, o intervalo cai pela metade, na mesma fração da corrida, como os outros marcos.
- **Chaves:** cada treinador comum derrotado deixa 1 chave; no Ritmo acelerado, 3, porque cabe 1 treinador antes do chefão contra 3 na corrida normal. Elites soltos, como os das caçadas, têm 35% de chance de deixar uma. Chaves são coletadas como orbes (o ímã ajuda).
- **Abrir:** encostar num baú com chave gasta a chave e abre a escolha entre **2 itens**. Sem chave, aparece «Baú trancado» uma vez por baú. Um baú não abre enquanto outra escolha estiver aberta.
- A escolha do baú não pode ser trocada nem banida, porque trocar viraria upgrades comuns.

## Empilhamento e sorteio

- Cada item pode ser pego até **4 vezes**. Cada cópia soma o efeito; as chances têm teto.
- O sorteio pesa a raridade: normal 10, raro 6, lendário 2.
- **Só são oferecidos itens que mudam o golpe da forma de ataque de quem joga** (`appliesTo`; `heldItemAppliesTo`). Toda forma tem pelo menos 21 dos 24 itens comuns disponíveis, e há um teste que garante pelo menos 18. Os 6 transformadores valem para todas as formas.
- Acertos criados por itens (raio, estilhaço, farpa) não disparam itens de novo, então não há reação em cadeia infinita. Os estilhaços param quando há 220 projéteis em campo, e as farpas param em 16 ao mesmo tempo.

## Os 24 itens

«Todas» quer dizer que vale para as 9 formas: projétil, aura, área, cone, órbita, foco, rajada, teleporte e trilha.

| Item | Original (geração) | Referência ao jogo | Efeito na Torre | Formas | Visual próprio |
|---|---|---|---|---|---|
| Orbe da Vida | Life Orb (4) | força em troca de vida | ×1,3 de dano por cópia (multiplica: 2 cópias dão ×1,69); acertar custa 0,7 de vida por cópia, no máximo a cada 0,4 s, nunca abaixo de 25% | todas | anel roxo nos disparos |
| Sino Concha | Shell Bell (3) | cura com o dano | cura 4% do dano por cópia, até 3 de vida por segundo por cópia | todas | — |
| Cinto Expert | Expert Belt (4) | reforça golpes super efetivos | +25% de dano por cópia contra elites, treinadores e chefões | todas | — |
| Faixa Muscular | Muscle Band (4) | golpes mais fortes | +12% de dano por cópia e empurrão em inimigos comuns | todas | empurrão |
| Lente Ampla | Wide Lens (4) | «amplia» | +1 disparo, alvo ou orbital; raio +18%; feixe do Foco +30%; cone +12% | todas | golpe maior |
| Lente Zoom | Zoom Lens (4) | mira de longe | alcance +20% e disparos +10% mais rápidos por cópia | projétil, rajada, área, cone, foco, teleporte | — |
| Lente de Mira | Scope Lens (2) | mais críticos | +8% de crítico por cópia (teto 60%) | todas | brilho de crítico |
| Garra Afiada | Razor Claw (4) | mais críticos | +5% de crítico por cópia; cada crítico salta para mais 1 inimigo por cópia (60% do dano) | todas | risco branco entre alvos |
| Farpa Grudenta | Sticky Barb (4) | gruda em quem encosta | 20% de chance por cópia de grudar uma farpa que explode 1 s depois (120% do dano, raio 48) | todas | espinhos nos disparos e explosão verde |
| Garra Rápida | Quick Claw (2) | às vezes age primeiro | 12% de chance por cópia de atacar de novo na hora (teto 45%) | projétil, rajada, área, aura, cone, foco | — |
| Metrônomo | Metronome (4) | repetir fortalece | +8% por cópia a cada acerto seguido no mesmo inimigo, até 5; zera depois de 1,5 s sem acertá-lo | todas | — |
| Raiz Grande | Big Root (4) | aumenta a drenagem | 18% de chance por cópia de brotar raízes de Planta que pulsam; roubo de vida +30% por cópia | todas | terreno de Planta |
| Bola de Luz | Light Ball (2) | a bola elétrica do Pikachu | 20% de chance por cópia de um raio que pula para 2 inimigos (40% do dano); com golpe Elétrico, chance em dobro | todas | raio amarelo e faíscas nos disparos |
| Pedra Dura | Hard Stone (2) | golpes de Pedra +20% | golpes de Pedra +20% por cópia; disparos 30% maiores, raio +10% e empurrão | todas | casca de pedra nos disparos |
| Pó Prateado | Silver Powder (2) | golpes de Inseto +20% | golpes de Inseto +20% por cópia; cada acerto solta 2 estilhaços por cópia (35% do dano, teto 8) | todas | estrela de pó girando e estilhaços |
| Pó Rápido | Quick Powder (4) | deixa o Ditto mais veloz | disparos +15% mais rápidos por cópia e que perseguem o inimigo mais perto | projétil, rajada, foco | asinhas de vento nos disparos |
| Pedra do Rei | King's Rock (2) | faz recuar | 7% de chance por cópia de atordoar 0,45 s (chefões 0,12 s) | todas | coroa dourada nos disparos e anel dourado no alvo |
| Orbe Chama | Flame Orb (4) | queima quem segura | 15% de chance por cópia de queimar o alvo | todas | anel laranja nos disparos |
| Orbe Tóxico | Toxic Orb (4) | envenena gravemente | 15% de chance por cópia de envenenar; o veneno acumula até 1,5× o acerto | todas | anel roxo nos disparos |
| Placa Chama | Flame Plate (4) | placa de Arceus, Fogo +20% | golpes de Fogo +20% por cópia; todo acerto soma +25% de dano de Fogo com o efeito do Fogo | todas | anel e eco vermelhos |
| Placa Zap | Zap Plate (4) | placa de Arceus, Elétrico +20% | golpes Elétricos +20% por cópia; +25% de dano Elétrico com o efeito Elétrico | todas | anel e eco amarelos |
| Placa Pingente | Icicle Plate (4) | placa de Arceus, Gelo +20% | golpes de Gelo +20% por cópia; +25% de dano de Gelo com o efeito do Gelo | todas | anel e eco azuis |
| Restos | Leftovers (2) | recupera vida aos poucos | +0,6 de vida por segundo por cópia | todas | — |
| Argila Luminosa | Light Clay (4) | barreiras duram mais | queimadura, veneno, atordoamento e raízes dos itens duram 40% mais por cópia | todas | — |

## Transformadores

Os transformadores são itens lendários que trocam a mecânica do golpe em vez de somar números, como os itens grandes do Isaac. São 6, todos referenciando itens até a 4ª geração:

- **Raridade no baú:** a segunda carta tem 30% de chance de ser um transformador (`HELD_TRANSFORMER_SLOT_CHANCE`). A primeira carta é sempre um item comum.
- **Peso:** dentro dessa vaga, Bola de Ferro e Erva Poderosa têm peso 2; os Orbes e o Laço, peso 1.
- **Teto:** 2 cópias de cada. A segunda amplia o efeito: bolha maior que repete mais uma vez, golpe do portal e do espelho mais forte, mais elos e mais dano espalhado, buraco maior e mais puxão, mais carga.
- **Combinação:** valem juntos. Golpes criados por um transformador não disparam itens de novo (`heldGuard`).
- **Visual:** original e abstrato, sem desenhar os lendários: bolha de relógio, portal rosa, anel distorcido roxo, correntes rosa, buraco negro e orbes de energia verdes.

| Forma | Orbe Adamante (adamant-orb) | Orbe Lustroso (lustrous-orb) | Orbe Grísea (griseous-orb) | Laço do Destino (destiny-knot) | Bola de Ferro (iron-ball) | Erva Poderosa (power-herb) |
|---|---|---|---|---|---|---|
| Tema | tempo | espaço | distorção | correntes | gravidade | carga |
| Projétil | bolha pequena no impacto | gêmeo sai de um portal atrás do alvo | disparo espelhado para trás | liga o alvo a 4; 40% se espalha | mini buraco negro no impacto | disparos flutuam e saem juntos num leque |
| Rajada | bolhas nos alvos | cada tiro também sai de um portal | rajada para os dois lados | 40% se espalha | mini buracos que juntam o grupo | 6 tiros flutuando, soltos como metralhadora |
| Área | bolha do tamanho da área | a explosão se repete num portal atrás do grupo | explosão no ponto espelhado | liga 2 vizinhos; 25% se espalha | buraco negro com o triplo da área, puxa e implode | 3 bombas pairam e chovem |
| Aura | a cada 1,2 s congela tudo em volta | segunda aura no grupo mais denso | anel distorcido fora da aura | 25% se espalha | suga inimigos até o dobro do raio | a cada 3 pulsos, um estouro quase 2× maior |
| Cone | congela o fim do leque | leque invertido de um portal à frente | leque para trás também | liga a 4; 40% se espalha | vácuo que arrasta para a sua frente | segundo leque mais longo |
| Órbita | orbitais deixam bolhas | um orbital atravessa um portal até um inimigo longe | segundo anel girando ao contrário | 25% se espalha | orbitais viram poços que prendem | orbitais se soltam em disparo |
| Foco | congela cada inimigo da linha | gêmeo do disparo; o feixe vira uma cruz | disparo e feixe também para trás | 40% se espalha | mini buracos e buraco negro no fim do feixe | o feixe sai mais 2 vezes |
| Teleporte | congela o pouso e repete o golpe | segundo impacto num portal além do pouso | impacto espelhado do outro lado da partida | liga a 4; 40% se espalha | implosão que puxa para o pouso | salta em cadeia para mais 2 inimigos |
| Trilha | trechos viram poças de tempo parado | portais deixam terreno pulsante sob inimigos longe | faixa sombra ao lado | 25% se espalha | puxa inimigos para cima da faixa | a faixa explode inteira ao terminar |

Números principais, ajustáveis em `src/core/survivor.ts`, `timeBubbleRule` e `destinyLinkRule`:

- **Bolha de tempo:** dura 1,4 s e repete 60% do acerto ao estourar. No máximo 10 bolhas ao mesmo tempo. Chefões não congelam, só ficam lentos.
- **Portal:** o golpe copiado tem 50% do dano (+25% com a 2ª cópia). **Espelho:** 60% (+20%).
- **Laço do Destino:** a corrente dura 3 s e alcança 170 px. A parte espalhada tem teto de 80%.
- **Buraco negro:** no máximo 8 ao mesmo tempo. Implode com o dano do golpe na metade do raio. Chefões resistem a 80% do puxão; treinadores, a 50%.
- **Golpes enfileirados da Erva:** no máximo 24 ao mesmo tempo.

Testes: `src/core/survivor-held-transformers.test.ts`. Cada transformador roda em cada uma das 9 formas e precisa deixar sua marca sem números quebrados. Os seis juntos, com 2 cópias cada, também são testados em todas as formas.

## Visual em todas as formas de ataque

Toda forma de ataque mostra os itens, mesmo as que não disparam projéteis:

1. **Itens girando em volta do Pokémon:** o sprite oficial de cada item, um por cópia. Se o sprite não carregar, aparece uma gema da cor do item.
2. **Faísca de item em cada acerto** (`held-hit`): losangos da cor de um dos itens pegos saltam do alvo, e mais itens dão mais faíscas. Vale para aura, área, cone, órbita, trilha, feixe e teleporte.
3. **Efeitos próprios ao acertar:** raio em cadeia, risco do crítico, explosão da farpa, raízes, estilhaços, eco das placas e anel da coroa.
4. **Marcas nos disparos** (projétil, rajada, disparo do foco, estilhaços): anéis de cor das placas e orbes, espinhos, coroa, asas, estrela, faíscas e casca de pedra. As marcas se somam no mesmo disparo.

Brilhos e faíscas seguem a opção «efeitos detalhados». O Modo Rotom esconde os enfeites, mas baús e chaves continuam visíveis.

## Sprites

- URL: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/<slug>.png`, com o espelho `cdn.jsdelivr.net/gh/PokeAPI/sprites@master/...` se a primeira falhar (`heldItemSpriteUrl`).
- Em novembro de 2026, os 24 slugs foram conferidos e todos respondem 200 na pasta padrão. A pasta `items/gen3` não tem nenhum deles.
- Sem sprite, a interface mostra o ícone de reserva do item, e o desenho usa a gema da cor dele. Nenhum sprite é inventado.

## Como adicionar um item

1. Acrescente o id em `HeldItemId` e a entrada em `HELD_ITEMS`, com o item real, a geração (até 4), o slug do PokeAPI e `appliesTo` se não valer para todas as formas.
2. Se for número do jogador, use `applyStats`. Se for efeito ao acertar, acrescente um campo em `HeldMods` e trate em `applyHeldOnHit` (`survivor.ts`). Acertos extras devem ficar dentro do `heldGuard`.
3. Se o disparo deve mudar de cara, acrescente o traço em `HeldProjectileLook` e desenhe em `drawHeldProjectileOverlay`.
4. Cubra no `survivor-held.test.ts` e atualize esta tabela.

## Limites conhecidos

- O equilíbrio não foi medido em corrida real. Orbe da Vida e Pó Prateado empilhados são os candidatos a ficar fortes demais; os números estão em `HELD_ITEMS` e `heldMods`.
- Os apoios (aliados) não usam os itens: os itens valem só para o golpe de quem joga.
- A luz cinematográfica (`core/survivor-cinema.ts`, `village/survivor-cinema-art.ts`) cresce até os 20 minutos, com escuridão, sombras, brilhos, raios, fagulhas e crateras. Tem teto por quadro, não usa `shadowBlur`, corta os limites se o aparelho sofrer e desliga no botão Luz do menu. Só existe na visão de cima; as crateras são só desenho.
- No modo BONK, baús, chaves, marcas nos disparos, buracos negros, bolhas de tempo, correntes, farpas, orbes da Erva Poderosa e os efeitos de acerto aparecem, projetados na câmera. Ainda só na vista de cima: os itens girando em volta do Pokémon, o rastro espelhado da Trilha e a aura de carga do Foco e do Teleporte.
