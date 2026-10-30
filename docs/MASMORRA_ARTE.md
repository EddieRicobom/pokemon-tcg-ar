# Masmorra: diretriz de arte das armas

As armas da Masmorra são desenhadas por código em `src/components/WeaponArt.vue`, em SVG inline, sem arquivo de imagem. Cinco já têm arte própria (Lâminas duplas, Lança de combate, Martelo de impacto, Emissor rápido e Lançador balístico); as outras 15 usam um emblema genérico (um hexágono com a orbe e o nome). Este documento diz como desenhar as que faltam no mesmo estilo.

## Regras fixas

- **Quadro:** `viewBox="0 0 100 100"`. A arma ocupa quase o quadro inteiro, com uns 4 px de folga. A composição é em diagonal ou horizontal, e a silhueta deve ser reconhecível em 22 px (o tamanho do ícone no slot da equipe).
- **Traço:** todas as formas ficam dentro do `<g stroke="#1b1828" stroke-width="1.6" stroke-linejoin="round">` que já existe. Não use preto puro.
- **Luz:** vem de cima e da esquerda. Um filete branco com `stroke-opacity` 0.7 no gume ou na quina iluminada, e partes escuras embaixo e à direita. A sombra projetada já vem do `filter: drop-shadow` do CSS; não desenhe outra.
- **Paleta:** só os gradientes do `<defs>`, sempre com o prefixo `uid` (`url(#${uid}-steel)`), porque vários desenhos dividem a mesma tela:
  - `steel`: lâminas, canos, metal claro;
  - `dark`: corpo, cabo, peças grossas;
  - `gold`: detalhes, guardas, anéis e ponteiras (no máximo 2 ou 3 peças);
  - `wood`: hastes e cabos de madeira.
  Um único acento de cor própria por arma é permitido, como o laranja do lançador e o ciano do emissor, desde que seja um traço fino ou uma luzinha. Nada de azul-claro de vidro, que a Vila reserva para janelas.
- **Orbe:** toda arma tem um encaixe visível onde a orbe com o Pokémon fica. A orbe é HTML por cima do SVG (para o GIF animar), então você só escolhe a posição dela em `ORB`: `{ x, y, r }` em porcentagem do quadro, com `r` entre 9 e 16. Ela deve ficar num lugar que faça sentido: guarda, culatra, centro do escudo, câmara de carga. Não pode cobrir o detalhe que identifica a arma. Se a arma estiver rotacionada no SVG, converta a posição do encaixe para o quadro sem rotação: `rotate(θ)` gira no sentido horário, com `x' = x·cosθ − y·sinθ` e `y' = x·sinθ + y·cosθ`, a partir do centro de rotação.
- **Leitura da categoria:**
  - Corpo a corpo: lâmina ou cabeça em destaque.
  - Defesa: forma larga e fechada (escudo, domo, anel).
  - Distância: cano, tubo ou disco, com a boca bem visível.
  - Controle: ganchos, correntes, cápsulas.
- **Sem animação no SVG.** Brilho e pulsação ficam no CSS e respeitam `prefers-reduced-motion`.
- **Fusões** não ganham arte própria. `FusionArt.vue` sobrepõe as duas armas de origem; uma arma nova funciona ali automaticamente.

## As 15 que faltam (ideia de cada uma)

| Arma | Desenho sugerido | Onde fica a orbe |
|---|---|---|
| Espada longa | Lâmina longa na diagonal (45°), guarda dourada larga e cabo com pomo | Centro da guarda |
| Manoplas | Punho fechado de frente, nós dos dedos dourados, punho grosso embaixo | Dorso da mão |
| Escudo de impacto | Escudo de cavaleiro com borda de aço, miolo escuro e cravos na frente | Centro do escudo |
| Projetor de barreira | Pedestal baixo, coluna e prato emissor, com um arco tracejado de energia acima | Frente do pedestal |
| Guardião orbital | Núcleo escuro com um anel inclinado em volta e 2 satélites dourados | No núcleo |
| Espada e escudo | Escudo menor à esquerda e espada curta cruzando atrás, à direita | Centro do escudo |
| Canhão de dispersão | Cano largo em forma de funil e corpo curto com cabo | No corpo |
| Projetor contínuo | Cilindro longo com bobinas douradas e bico afunilado | Na traseira do cilindro |
| Canhão de carga | Cano grosso e câmara redonda grande atrás, com anel dourado na boca | Na câmara |
| Condutor de arco | Bastão na diagonal com garfo de duas pontas e um zigue-zague de raio | Logo abaixo do garfo |
| Rifle perfurante | Cano bem longo e fino, coronha de madeira e luneta em cima | No corpo, sob a luneta |
| Disco retornável | Disco visto de frente com 4 lâminas na borda e um rastro curvo | Centro do disco |
| Lançador de armadilhas | Morteiro curto inclinado sobre uma base, com uma armadilha de dentes saindo | Na base |
| Lança-correntes | Corpo-lançador à esquerda e corrente de elos em diagonal até um gancho dourado | No corpo |
| Enxameador | Colmeia oval com furos dourados e 3 projéteis triangulares saindo | No centro da colmeia |

## Como entregar

1. Em `WeaponArt.vue`, acrescente um `<template v-else-if="weapon === '…'">` para cada arma, antes do emblema genérico, e a posição dela em `ORB`.
2. Mantenha cada desenho com 6 a 14 formas. Mais do que isso fica ilegível no tamanho pequeno.
3. Confira no navegador nos tamanhos 22, 46, 72 e 110 px: no slot da equipe, na escolha da fusão, na escolha da equipe e na prévia da fusão. Veja também a arma espelhada na arte de fusão (a segunda arma aparece invertida).
4. Rode `npm run typecheck`, `npm test` e `npm run build`. No template, não use arrow functions que indexam objetos importados (o vue-tsc já quebrou o deploy assim).
