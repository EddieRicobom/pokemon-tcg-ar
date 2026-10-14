# Roteiro de teste no celular

O que o CI e o sandbox **não** conseguem validar: câmera real, GPU do celular e o GIF do Showdown. Faça nesta ordem e anote em qual etapa para.

## 0. Preparação
1. Abra o app, feche e abra de novo (o PWA só atualiza na segunda abertura).
2. Em **Escanear**, ligue "Mostrar o que o app está vendo (diagnóstico)".

## 1. AR pela busca manual (independe do reconhecimento)
1. Abra a câmera. Em "Buscar a carta à mão", digite o nome (em inglês) e, se quiser, o número. Escolha a carta.
2. A lista de etapas deve avançar: dados → alvo compilado (alguns segundos na primeira vez) → motor → procurando.
3. Aponte para **a mesma impressão** da carta, inteira e bem iluminada. Esperado: "Carta rastreada" e, depois, "Pokémon exibido".
4. Anote: em qual etapa parou, quanto tempo levou o alvo, se o GIF apareceu em pé sobre a carta.

### Painel de status no chão
Com a carta rastreada, abaixo da carta aparece um painel deitado no plano dela, que alterna sozinho (6 s) entre três páginas; os botões "Auto / Status / Ataques da carta / Golpes do jogo" escolhem uma fixa.
- **Status** (PokéAPI): tipo e os seis atributos-base em barras que enchem ao aparecer.
- **Ataques da carta** (TCGdex): PS, fraqueza, recuo e os ataques impressos com custo de energia e dano.
- **Golpes do jogo** (PokéAPI): até 4 golpes por nível mais recentes, com tipo, classe, precisão, PP e poder.
Se uma fonte falhar (sem internet, por exemplo) a página mostra a mensagem de erro; as outras continuam. Anote: se as três páginas carregaram, se o texto é legível a uma distância normal e se o painel acompanha a carta sem tremer. "Mostrar o painel de status no chão" nos ajustes liga/desliga.

### Ajuste com os dedos e toque no painel
1. Com o AR ativo, toque em "Ajustar com os dedos". Arraste com um dedo: o Pokémon e o painel seguem o dedo sobre o chão da carta. Faça pinça com dois dedos: o tamanho muda. "Concluir ajuste" sai do modo; o ajuste fica salvo.
2. Fora do modo de ajuste, toque num ataque ou golpe do painel: a linha brilha e aparece a mensagem de que usar golpes ainda não está implementado. Toque nos pontinhos do rodapé do painel para trocar de página.
3. Anote: se o arrasto acompanha o dedo sem "escorregar", se a pinça é suave e se o toque acerta a linha certa com o painel inclinado.

## 1b. Caixa (Pokémon soltos no chão)
Pré-requisito: ao menos uma carta com Pokémon guardada (escaneie ou use "Cartas").
1. Aba "Caixa" → "Abrir câmera e sensores". Aponte o celular para o chão, a uns 1–2 m à frente, e toque na imagem (ou em "Colocar a caixa aqui", que usa a mira do centro).
2. Os Pokémon devem passear dentro do quadrado branco, com sombra. Gire o celular: a caixa deve ficar parada no chão. Toque num Pokémon: ele dá um pulinho e aparecem nome, número e carta.
3. Em "Ajustes da caixa" mude a altura do celular, o tamanho da caixa e o ângulo de visão. Se a caixa "escorrega" ao girar, ajuste a altura e o ângulo; ao **andar**, ela vai deslizar mesmo (limite conhecido: sem rastreamento de posição).
4. Anote: se o celular enviou os sensores (senão aparece o aviso de arrastar), se o ponto no chão fica onde você tocou e se 10+ Pokémon ainda rodam fluido.

### Equipe, tela cheia e filtros (Caixa e Escanear)
1. Em Cartas, toque em "Pôr na equipe" nas cartas desejadas (até 6; a ordem aparece como número na grade). Na Caixa a equipe também pode ser trocada pelo botão "Equipe" sobre a câmera.
2. Com a câmera aberta, use os botões sobre a imagem: "Tela cheia" (os botões continuam visíveis), "Filtros" (câmera, cor e contorno do Pokémon), "Formação" (equipe em fila) e "Passeio".
3. Anote: se a tela cheia entra e sai sem a imagem esticar, se os botões cabem numa linha no seu aparelho e se os filtros mudam o Pokémon sem travar.

### Batalha automática (Caixa)
1. Com a caixa colocada e 2 ou mais Pokémon na equipe, toque em "Batalhar" (sobre a câmera). Eles se reúnem em roda e lutam sozinhos até sobrar um.
2. Confira: o anúncio do golpe (nome, tipo e se veio da carta ou do jogo), as barras de PS descendo, os números de dano, "Super efetivo!"/"Pouco efetivo…" (ex.: Água contra Fogo), o desmaio e a comemoração do vencedor. "De novo" refaz com novos sorteios; "Parar" volta ao passeio.
3. Abaixo da câmera aparece o vencedor e, se algum Pokémon ficou sem dados (PokéAPI ou TCGdex fora do ar), o que foi substituído por valores neutros.
4. Anote: se os efeitos pesam no seu aparelho (queda de fluidez), se os textos ficam legíveis e se a batalha fica longa ou curta demais.

### Giroscópio (Escanear e Caixa)
1. Com o AR ativo, abaixo da câmera aparece "Rastreador: N leituras/s · giroscópio: corrigindo a pose". Se aparecer "sem dados do sensor", o aparelho/navegador não entregou o sensor.
2. Mova o celular em arco, devagar e depressa, com a carta parada: o Pokémon deve acompanhar sem ficar para trás nem se adiantar à carta. Se ele se adianta, aumente "Atraso da câmera para o sensor" em Ajustes; se fica para trás, diminua. Compare com "Usar o giroscópio" desligado.
3. Cubra a carta por um instante com a mão: o Pokémon deve ficar preso ao lugar (acompanhando o giro) por até ~2,5 s.
4. Anote o valor de "leituras/s" e o atraso que ficou melhor.

## 2. Reconhecimento automático
1. Escanear de novo, carta sobre qualquer fundo, sem reflexo na faixa de baixo.
2. No painel de diagnóstico confira: quadrilátero verde sobre a carta, "Carta endireitada" em pé, "Faixa de baixo" com o número legível, tempos por etapa.
3. Anote: tempo total da leitura, texto lido pelo OCR, se identificou a impressão certa.

## 3. Teste com foto
Em "Testar com uma foto do aparelho", escolha uma foto da carta. Nada é enviado: tudo roda no aparelho.

## Se falhar
Envie prints do painel de diagnóstico e da lista de etapas do AR.
