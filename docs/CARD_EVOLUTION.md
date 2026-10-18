# Evolução dos companheiros das cartas

Na Fonte da Vila, **Evoluir Pokémon das cartas** mostra o progresso individual de cada carta reconhecida. A evolução é gratuita e exige simultaneamente:

- Amizade em **100/100** (não basta alcançar o primeiro ponto do nível Melhor amigo).
- Vencer a Torre de Sobrevivência normal, derrotando o chefão final, com esse companheiro escolhido no início. Evoluções temporárias da corrida não mudam essa identidade. Derrotar um inimigo, abandonar ou jogar no infinito não cumpre a prova.
- Terminar uma batalha normal da Caixa como vencedor individual ou participante da equipe vencedora. Liga e PvP não contam nesta primeira versão.
- Vencer uma partida de Pins contra o computador com esse companheiro na sua equipe.

As provas podem vir em qualquer ordem, inclusive antes de chegar à amizade máxima. Cada evolução zera apenas as três provas para a próxima forma; amizade, apelido, relações e demais dados da Vila mantêm o mesmo id. Ramos reais são oferecidos para escolha. Formas sem próxima evolução na tabela local não recebem uma evolução inventada. As regras dos Digital Pokémon continuam as mesmas.

O registro reconhecido no IndexedDB, sua imagem, sprite original e alvo MindAR não são alterados. A forma atual do companheiro é uma projeção usada na Vila, Caixa, Torre, Pins e AR. Os dados de combate usam uma carta real da espécie evoluída, resolvida antes da evolução; sem dados ou sprite, ela não é confirmada. Cartas de uma mesma espécie têm progresso separado por id de catálogo; o aplicativo não distingue duas cópias físicas da mesma edição.

## Chamado do vínculo

Ao rastrear a carta original, o companheiro evoluído chega em uma sequência de 4,4 segundos: selo com anéis giratórios, fitas de luz, fragmentos em espiral, revelação e pouso. O efeito só inicia com pose rastreada e sprite real carregado. É filho do mesmo grupo rastreado, portanto some junto com ele; não cria pose nem muda o reconhecimento. A interface identifica a carta original e o companheiro evoluído. Uma nova sessão de escaneamento reproduz a chegada; perdas breves não ficam reiniciando o efeito.

Mochila → Visual permite desligar a chegada especial. A preferência do sistema por movimento reduzido também a desliga. O Pokémon evoluído continua aparecendo normalmente sem o efeito.

## Persistência e verificação

`tcg-ar-card-journeys-v1` entra no backup completo. Guarda origem, cadeia validada, carta usada no combate e as três provas da forma atual. Saves antigos começam sem vitórias presumidas. Uma gravação recusada avisa o jogador e não confirma a evolução nem troca o estado em memória.

Testes cobrem os quatro requisitos, ramos, identidade por carta, resultados atrasados, vencedor individual/equipes, vitória real da Torre, normalização, backup, falha de armazenamento e animação dependente de rastreamento/sprite. WebGL e aparência/desempenho em celular real ainda exigem validação no aparelho.
