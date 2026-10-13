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

## 2. Reconhecimento automático
1. Escanear de novo, carta sobre qualquer fundo, sem reflexo na faixa de baixo.
2. No painel de diagnóstico confira: quadrilátero verde sobre a carta, "Carta endireitada" em pé, "Faixa de baixo" com o número legível, tempos por etapa.
3. Anote: tempo total da leitura, texto lido pelo OCR, se identificou a impressão certa.

## 3. Teste com foto
Em "Testar com uma foto do aparelho", escolha uma foto da carta. Nada é enviado: tudo roda no aparelho.

## Se falhar
Envie prints do painel de diagnóstico e da lista de etapas do AR.
