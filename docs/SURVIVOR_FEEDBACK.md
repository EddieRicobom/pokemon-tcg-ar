# Código de feedback do Survival

Ao concluir uma corrida, o jogador pode responder cinco perguntas rápidas e copiar um código `SVF1...`. O código é um relatório anônimo de uma única corrida: ele não substitui backup, não altera o save e não contém cartas, câmera ou dados de conta.

## O que o código contém

- resumo factual: tempo, nível, onda, derrotas, treinadores, chefes, estágio, modo infinito e Pokébolas digitais;
- Pokémon escolhido, número da espécie e golpe (tipo, forma e efeito);
- preparação, especial e ramificação escolhidos, afinidade do segundo tipo e apoios recrutados;
- IDs dos upgrades e artefatos que ainda estavam ativos no fim, além dos números finais do jogador;
- semente da corrida para comparar execuções reproduzíveis;
- opinião de 1 a 5 sobre diversão, dificuldade, clareza, justiça e vontade de jogar novamente;
- comentário opcional limitado a 240 caracteres.

## Como interpretar

O prefixo `SVF1.` identifica a versão. O restante é Base64URL de um JSON compacto. Para uma análise local, use `decodeSurvivorFeedback` em `src/core/survivor-feedback.ts`; nunca trate o código como HTML ou execute o conteúdo colado.

As respostas seguem esta ordem em `q`: `[diversão, dificuldade, clareza, justiça, repetição]`. A escala vai de 1 (muito baixo) a 5 (muito alto). A dificuldade é a percepção do jogador, enquanto tempo, onda e inimigos são medidas reais da run.

Ao receber um código em uma conversa, compare primeiro a percepção com as métricas objetivas e com o tipo/categoria do golpe. Não ajuste o balanceamento por uma única resposta: agrupe códigos por Pokémon, forma de ataque e faixa de tempo antes de mudar números.

