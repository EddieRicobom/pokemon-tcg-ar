# POKÉMON TCG AR — PROMPT MESTRE COMPLETO DE EVOLUÇÃO DO PROJETO

> Guardado aqui porque é o documento que define as fases 4, 5 e 7 do roteiro (Digital Pokémon, Fonte/energia,
> evolução, cutscene inicial, presente/questionário e Encontros lendários) — ver o resumo de status em
> `IMPLEMENTATION_PLAN.md`, seção "Fases do prompt mestre". Enviado pelo dono do projeto; reproduzido na
> íntegra, sem edição, pra não se perder de novo numa futura compactação de conversa.

## 1. CONTEXTO E OBJETIVO

**Repositório:** https://github.com/EddieRicobom/pokemon-tcg-ar

Quero transformar o projeto existente em uma experiência Pokémon integrada, combinando cartas físicas, realidade aumentada, coleção, progressão, uma Vila viva, sobrevivência no estilo bullet heaven e acontecimentos lendários memoráveis.

O projeto já possui uma base que precisa ser inspecionada antes de qualquer alteração. Não comece do zero e não presuma que funcionalidades existentes estão quebradas ou funcionando sem verificar.

A stack atual inclui Vue 3, TypeScript, Vite, PWA, MindAR, Three.js, Tesseract.js, gifuct-js e IndexedDB, conforme a implementação existente. Confirme as dependências reais antes de tomar decisões arquiteturais.

O projeto deve continuar sendo executável gratuitamente, com deploy pelo GitHub Pages, sem backend próprio obrigatório, sem servidor pago e sem serviços que exijam assinatura.

Quero um produto funcional, com identidade visual própria, progressão coerente e sistemas realmente integrados — não uma coleção de telas desconectadas.

**Não entregue apenas um plano.** Analise o projeto, implemente as melhorias em etapas, execute os testes possíveis, corrija os problemas encontrados e documente o resultado.

---

# 2. REGRAS DE TRABALHO

Antes de modificar o código:

1. Confirme a raiz do repositório, a branch atual e o estado do Git.
2. Preserve alterações locais que ainda não foram commitadas.
3. Leia `CLAUDE.md`, `README.md`, `IMPLEMENTATION_PLAN.md`, `CHANGELOG.md` e os documentos relevantes em `docs/`.
4. Inspecione a estrutura atual, os modelos de dados, as rotas, os componentes, os serviços, os testes e a persistência.
5. Identifique o que já existe para scanner, AR, Vila, Caixa, coleção, Treinador, missões, conquistas e progressão.
6. Monte uma lista de funcionalidades existentes que podem ser reaproveitadas e dos problemas que precisam ser corrigidos.
7. Registre métricas de referência para os problemas de desempenho do scanner.
8. Implemente as mudanças em fases, sem aguardar nova autorização para cada etapa.

Regras obrigatórias:

- Não reescreva o aplicativo inteiro sem necessidade.
- Não crie sistemas duplicados de coleção, energia, amizade, progressão ou persistência.
- Não remova funcionalidades existentes apenas para simplificar o desenvolvimento.
- Não invente dados de cartas, Pokémon, formas, evoluções, ataques, identificadores ou estatísticas.
- Não use dados simulados para fingir que uma funcionalidade está pronta.
- Não copie código ou recursos de outros jogos sem verificar suas licenças.
- Não adicione bibliotecas pesadas sem justificar sua necessidade.
- Não introduza backend, compras, anúncios obrigatórios ou serviços pagos.
- Preserve compatibilidade com GitHub Pages e PWA.
- Priorize funcionamento offline sempre que tecnicamente possível.
- Otimize para dispositivos móveis, especialmente Android.
- Trate falhas de rede, câmera, armazenamento e recursos externos.
- Não afirme que testou um celular físico, publicou uma versão ou realizou um deploy sem realmente fazê-lo.
- Faça commits pequenos e organizados.
- Nunca descarte alterações do usuário, faça reset destrutivo ou force push.

Se uma fase for grande demais, entregue uma versão funcional e continue evoluindo a partir dela. Não abandone a implementação depois de produzir apenas componentes visuais.

# 3. ARQUITETURA GERAL DO ECOSSISTEMA

O aplicativo deve funcionar como um único mundo Pokémon, com os seguintes sistemas conectados:

- **Scanner:** identifica cartas físicas.
- **Realidade aumentada:** exibe Pokémon animados sobre cartas reconhecidas.
- **Coleção:** organiza as cartas e as instâncias de Pokémon do jogador.
- **Caixa Pokémon:** organiza os companheiros disponíveis.
- **Treinador:** concentra nível, experiência, amizade, missões, conquistas e estatísticas.
- **Vila:** funciona como hub central de exploração e atividades.
- **Zona de Sobrevivência:** oferece combates no estilo bullet heaven.
- **Fonte:** permite invocar Digital Pokémon usando energia.
- **Digital Pokémon:** companheiros digitais que podem ser usados nos modos de jogo, receber amizade e evoluir, mas não ser selecionados para scan físico.
- **Encontros lendários:** eventos extremamente raros que alteram a Vila e deixam consequências memoráveis.

Reutilize os modelos de dados e os sistemas existentes quando apropriado. Defina claramente as responsabilidades de cada módulo para evitar dependências circulares e duplicação de lógica.

A coleção física e a coleção digital devem coexistir, mantendo a origem de cada instância claramente identificada.

---

# 4. PRIORIDADE MÁXIMA — CORRIGIR O SCANNER

O scanner atual apresenta reconhecimento lento e comportamento inconsistente. Em algumas tentativas, os candidatos não são apresentados corretamente, a lista parece parar antes do último resultado e a busca manual funciona melhor do que a identificação automática. A visualização AR também não funciona de maneira confiável.

Corrija as causas reais, não apenas a interface.

## 4.1. Instrumentação do pipeline

Meça separadamente o tempo de:

- Captura e processamento dos frames.
- Detecção dos limites da carta.
- Estabilização da imagem.
- Correção da perspectiva.
- Recorte do número identificador.
- Recorte do nome.
- OCR do número.
- OCR do nome.
- Busca no catálogo.
- Comparação visual com imagens de referência.
- Ordenação dos candidatos.
- Confirmação temporal.
- Exibição dos primeiros candidatos.
- Confirmação da carta.
- Inicialização da realidade aumentada.

Apresente as métricas detalhadas na área de diagnóstico, sem poluir a interface normal.

Registre uma linha de base e compare os resultados após as alterações. Não declare que o scanner ficou mais rápido sem dados que sustentem a conclusão.

## 4.2. Mostrar onde a câmera está procurando

Amplie a funcionalidade existente de diagnóstico, incluindo a opção de mostrar o que o aplicativo está vendo.

O usuário deve conseguir visualizar:

- Contorno da carta.
- Quatro cantos estimados.
- Área exata usada para reconhecer o número.
- Área exata usada para reconhecer o nome.
- Recortes reais enviados ao OCR.
- Texto efetivamente reconhecido.
- Estado de estabilidade da carta.
- Candidatos encontrados.
- Motivos de aceitação ou rejeição de candidatos.

Os recortes exibidos precisam corresponder aos utilizados pelo pipeline real.

Permita ativar e desativar as sobreposições.

## 4.3. Feedback de progresso

Apresente etapas honestas e compreensíveis, adaptadas ao pipeline real:

1. Localizando carta.
2. Estabilizando imagem.
3. Corrigindo perspectiva.
4. Lendo número.
5. Lendo nome.
6. Comparando com o catálogo.
7. Confirmando identificação.
8. Carta identificada.

Se uma etapa for ignorada, não mostre uma falsa atividade.

Informe quando a câmera perder a carta, a iluminação estiver insuficiente, a imagem estiver desfocada ou o reconhecimento falhar.

Quando possível, mostre o tempo decorrido e permita cancelar ou reiniciar a leitura.

## 4.4. Otimização

Investigue e implemente, conforme a arquitetura permitir:

- Detecção leve e frequente.
- OCR pesado somente quando a carta estiver estável.
- Reutilização de recortes e resultados entre frames semelhantes.
- Web Workers para tarefas pesadas, quando apropriado.
- Limitação de tarefas concorrentes.
- Cancelamento de operações obsoletas.
- Prevenção de reconhecimentos duplicados.
- Redução de conversões de imagem desnecessárias.
- Consultas eficientes ao catálogo local.
- Cache sob demanda.
- Fallback para busca manual.

Não execute OCR pesado em todos os frames. Não elimine a confirmação temporal apenas para aparentar maior velocidade.

## 4.5. Candidatos e resultados

Corrija a lógica que possa limitar, truncar ou esconder candidatos válidos.

Investigue índices, arrays, paginação, ordenação, filtros, estado de carregamento e confirmação.

Todos os candidatos válidos devem poder ser visualizados e selecionados, incluindo o último da lista.

A busca manual deve continuar funcionando mesmo quando o reconhecimento automático falhar.

Não carregue milhares de imagens antecipadamente. Utilize o cache existente e carregue os recursos conforme forem necessários.

---

# 5. REALIDADE AUMENTADA E GIFs ANIMADOS

Corrija o fluxo de visualização AR, incluindo a inicialização da câmera, a criação e compilação dos alvos, o rastreamento, os caminhos dos recursos e o encerramento da experiência.

Verifique:

- Correspondência entre carta selecionada e alvo.
- Permissões de câmera.
- Inicialização e liberação de recursos.
- Proporção e orientação da carta.
- Estabilidade e perda de rastreamento.
- Ciclo de vida dos componentes.
- Compatibilidade com o deploy no GitHub Pages.
- Erros de inicialização.
- Recuperação após falhas.

## 5.1. Pokémon animado saindo da carta

A abordagem desejada é um GIF animado que pareça estar em pé sobre a carta, saindo dela pelo eixo Z.

Não priorize modelos 3D de Pokémon. O objetivo é criar uma representação animada ancorada à superfície da carta.

Use, quando aplicável, a convenção de sprites do PokéAPI Showdown:

`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/{ID}.gif`

Substitua `{ID}` pelo identificador numérico correto do Pokémon. Não confunda o identificador de uma carta TCG com o ID da Pokédex.

O GIF deve:

- Manter proporções corretas.
- Permanecer ancorado à carta.
- Ter escala coerente.
- Acompanhar a orientação e a pose do alvo.
- Continuar animado após a identificação.
- Tratar a perda e a recuperação do rastreamento.
- Tratar sprites inexistentes e falhas de rede.
- Liberar recursos quando a experiência terminar.

Se a tecnologia atual não permitir um resultado estável, investigue uma alternativa compatível antes de substituir toda a arquitetura de AR.

Não declare a funcionalidade validada em celulares reais sem realizar esse teste.

---

# 6. VILA COMO HUB PRINCIPAL

A Vila deve ser o centro da experiência de jogo, conectando as funcionalidades existentes e as novas atividades.

Inspecione a Vila já implementada. Preserve sua identidade e seus recursos úteis. Não crie uma segunda Vila nem substitua uma implementação funcional por um protótipo genérico.

A Vila deve oferecer acesso coerente a:

- Caixa Pokémon.
- Coleção.
- Treinador.
- Zona de Sobrevivência.
- Fonte.
- Missões e conquistas.
- Histórico narrativo.
- Encontros lendários.
- Outras atividades existentes.

A interface pode utilizar locais, edifícios, áreas interativas ou uma composição visual equivalente, conforme a arquitetura atual.

Não é necessário criar um mapa enorme. O importante é que a Vila pareça um lugar com identidade, atmosfera e acontecimentos próprios, em vez de um simples menu de botões.

Seus elementos visuais devem mudar conforme eventos, progressão e consequências das aparições lendárias.

---

# 7. CUTSCENE OBRIGATÓRIA DA PRIMEIRA ENTRADA

Na primeira vez que qualquer jogador entrar na Vila, deve acontecer uma cutscene que explique por que ele consegue compreender os Pokémon.

**A cutscene é obrigatória para todos, independentemente da idade. Mesmo jogadores mais velhos precisam recebê-la.**

Não pule a cena com base na idade, experiência anterior ou qualquer outro critério desse tipo.

## 7.1. História

Crie uma história original e envolvente.

Uma direção narrativa possível é que o jogador tenha passado por um acontecimento inexplicável relacionado à conexão entre humanos e Pokémon, despertando a capacidade de compreender suas intenções, emoções e formas de comunicação.

O evento pode estar ligado a um fenômeno raro ou a uma presença misteriosa. Não revele todos os segredos imediatamente: a história inicial pode preparar o terreno para os encontros lendários futuros.

Evite uma tela seca de explicação. Conte a história com imagens, animações, diálogos e ritmo narrativo.

## 7.2. Estrutura da cena

A cutscene deve:

1. Introduzir a situação do jogador.
2. Apresentar um acontecimento extraordinário.
3. Mostrar um primeiro contato significativo com um Pokémon.
4. Demonstrar que o jogador consegue compreendê-lo.
5. Explicar narrativamente essa capacidade.
6. Conectar a descoberta à exploração da Vila.
7. Terminar com uma transição natural para a interface jogável.

Todo diálogo importante deve estar disponível em texto. Não dependa exclusivamente de áudio ou de vídeos externos.

Permita pular a animação, mas preserve a possibilidade de rever a história em um diário ou registro narrativo.

## 7.3. Persistência

Persista explicitamente o estado de conclusão.

- A cutscene ocorre na primeira entrada real.
- O salto deliberado ou a conclusão registra o estado.
- Recarregar a página não deve corromper a introdução.
- Retornar à Vila não deve reproduzir a cena indefinidamente.
- A idade nunca pode suprimir a introdução.
- Se houver perfis, o estado deve pertencer ao perfil correto.
- Sem perfis remotos, use a persistência local existente.

---

# 8. PRESENTE INICIAL — DIGITAL POKÉMON

Durante a primeira experiência na Vila, o jogador deve receber um Pokémon inicial especial por meio de um questionário narrativo.

Esse presente existe para que jogadores sem cartas físicas possam começar a jornada, acessar os modos de jogo e compreender a proposta do aplicativo.

O jogador recebe **exatamente um Digital Pokémon de presente, selecionado entre os iniciais das nove gerações existentes, da Geração I à Geração IX**.

Não entregue todos os iniciais ao mesmo jogador.

## 8.1. Questionário detalhado e divertido

Integre o questionário à experiência inicial sem criar cutscenes concorrentes ou introduções redundantes.

Crie perguntas envolventes baseadas em situações e escolhas, explorando, por exemplo:

- Reação a desafios.
- Curiosidade e exploração.
- Proteção de outras pessoas.
- Resolução de problemas.
- Lealdade e confiança.
- Coragem, paciência e criatividade.
- Forma de lidar com acontecimentos inesperados.
- Tipo de parceiro que o jogador gostaria de ter.

As perguntas devem ter personalidade e fazer o jogador sentir que está descobrindo algo sobre si mesmo.

As respostas precisam influenciar o resultado. Não use apenas uma resposta nem faça todas as opções apontarem para o mesmo Pokémon.

Implemente um sistema de pontuação configurável, com regras explícitas, distribuição razoavelmente equilibrada e desempate determinístico e testável.

Permita voltar às perguntas anteriores antes de confirmar o resultado.

O presente só pode ser concedido uma vez por perfil. Reabrir o questionário, atualizar a página ou retornar à Vila não pode gerar um segundo presente.

## 8.2. Iniciais de todas as gerações

Inclua os iniciais tradicionais de Planta, Fogo e Água das gerações I a IX.

O resultado pode ser qualquer um desses iniciais, de acordo com as respostas e o sistema de pontuação.

Não invente espécies, formas, atributos, cartas ou informações de catálogo.

## 8.3. Reutilizar uma carta real

O Digital Pokémon recebido precisa ser baseado em uma carta real existente no catálogo do projeto.

Para cada inicial elegível:

1. Localize uma carta real correspondente.
2. Verifique a espécie, a forma e os dados.
3. Reutilize o identificador original da carta.
4. Utilize a imagem e os dados reais disponíveis.
5. Preserve a origem da carta.
6. Acrescente os metadados necessários para identificar a instância digital.

Se houver várias cartas válidas, escolha uma por regra estável e documentada, priorizando cartas básicas da linha evolutiva com dados completos e imagem disponível.

Não invente números de coleção, IDs, ataques, artistas ou outros campos.

Se uma carta não estiver disponível localmente, tente utilizar os mecanismos de dados existentes, respeitando o cache. Se não for possível confirmar a existência de uma carta válida, não fabrique uma substituta.

## 8.4. Persistência do presente

Registre pelo menos:

- ID da instância.
- ID real da carta de origem.
- Espécie e forma.
- Data da concessão.
- Estado do questionário.
- Origem da instância.
- Marcador de que o presente inicial já foi concedido.

Use uma operação idempotente para impedir duplicações por cliques repetidos, recarregamento ou interrupção da interface.

Trate falhas parciais para evitar tanto duplicação quanto perda do presente.

Se o aplicativo não tiver contas remotas, utilize o armazenamento local existente. Não prometa sincronização entre dispositivos que não está implementada.

---

# 9. DIGITAL POKÉMON — IDENTIDADE E REGRAS

O presente inicial e os Pokémon recebidos pela Fonte devem ser identificados com a etiqueta visível **Digital Pokémon**.

O Digital Pokémon utiliza uma carta real como origem, mas sua instância representa um companheiro digital, não uma carta física que o jogador possui ou escaneou.

Separe conceitualmente:

- Os dados globais da carta original.
- A instância de Pokémon pertencente ao jogador.
- A origem da instância.
- A progressão digital, como amizade e evolução.
- A elegibilidade para scan físico.

Adapte os nomes dos campos ao padrão real do projeto. Uma estrutura conceitual possível é:

- `instanceId`
- `originCardId`
- `isDigitalPokemon`
- `source`
- Dados de amizade.
- Dados de evolução.
- Dados de progressão.

Não duplique o registro global da carta para representar cada instância.

## 9.1. Sem anchor selecionável para scan

O Digital Pokémon pode ser utilizado em todos os modos de jogo compatíveis, mas não pode ser selecionado como alvo de scan físico.

A carta original continua existindo no catálogo e pode continuar sendo elegível para reconhecimento físico em seu fluxo normal.

A instância digital, porém, não pode:

- Ser selecionada como carta para scan.
- Iniciar uma sessão de AR que exija a carta física.
- Ser confundida com uma carta fisicamente escaneada.
- Ser tratada como posse física da carta.

Não apague nem altere o anchor original do catálogo. Implemente uma distinção explícita entre a carta do catálogo e a instância digital.

A restrição deve ser aplicada também aos serviços, seletores e fluxos internos, não apenas escondendo botões da interface.

## 9.2. Presença nos modos

Os Digital Pokémon devem aparecer nos locais pertinentes:

- Vila.
- Caixa Pokémon.
- Survivor.
- Treinador.
- Coleção.
- Missões e conquistas.
- Seletores de equipe.
- Amizade e evolução.
- Histórico e estatísticas.
- Outros modos que utilizem Pokémon.

Revise filtros e regras de elegibilidade para garantir que estejam realmente disponíveis nos modos corretos.

Mantenha a etiqueta Digital Pokémon visível e baseada nos dados persistidos da instância.

---

# 10. PRIORIDADE — FONTE E ECONOMIA DE ENERGIA

Implemente uma economia de energia virtual integrada à Vila, ao Treinador e às atividades de jogo.

Energia não é criptomoeda, não é uma compra com dinheiro real e não depende de backend.

## 10.1. Fontes de energia

O jogador deve poder ganhar energia por meio de atividades reais do aplicativo, como:

- Partidas do Survivor.
- Missões e desafios.
- Atividades de exploração da Vila.
- Eventos especiais.
- Recompensas de encontros lendários, quando apropriado.
- Progressão do Treinador.

Reutilize missões e recompensas existentes quando possível.

Defina valores equilibrados, com limites que impeçam a exploração trivial de recompensas ilimitadas.

Não exija cartas físicas para ganhar energia.

Não utilize anúncios obrigatórios, compras, serviços pagos ou login remoto.

Crie uma interface que explique onde conseguir energia, mostre o saldo e permita consultar o histórico de transações.

## 10.2. A Fonte

Crie na Vila um local chamado **Fonte**, responsável pela invocação de Digital Pokémon.

A Fonte deve ter identidade visual própria, com animação de energia e materialização digital.

Sua interface precisa mostrar:

- Saldo atual.
- Custo da invocação.
- Confirmação do gasto.
- Resultado da invocação.
- Saldo atualizado.
- Histórico pertinente.

Não permita operações simultâneas ou cliques repetidos que dupliquem o resultado.

## 10.3. Summon por 500 energias

O jogador pode gastar exatamente **500 energias** para invocar um Digital Pokémon baseado em uma carta real existente no catálogo.

O fluxo deve:

1. Verificar o saldo.
2. Validar se há um resultado elegível.
3. Selecionar um Pokémon elegível.
4. Encontrar uma carta real correspondente.
5. Registrar o gasto e a instância de forma consistente.
6. Reproduzir uma cutscene de invocação.
7. Mostrar o Pokémon e sua carta de origem.
8. Atualizar a coleção e o histórico.

A cutscene deve ter identidade visual própria e transmitir a materialização de um companheiro digital. Não use apenas uma mensagem genérica de sucesso.

A operação deve ser consistente: uma falha não pode deixar o jogador sem energia e sem Pokémon, nem conceder o Pokémon sem registrar o gasto.

Use transações do armazenamento existente ou uma estratégia equivalente de recuperação.

## 10.4. Seleção dos resultados

A Fonte deve selecionar Pokémon elegíveis entre dados reais do catálogo.

Não invente espécies, cartas, formas ou estatísticas.

Evite duplicatas digitais inúteis. Se o resultado já existir, aplique uma regra alternativa ou informe o jogador antes do gasto. Nunca consuma energia e descarte silenciosamente o resultado.

Não prometa probabilidades, sistema de pity ou distribuição específica que não esteja implementada e documentada.

A Fonte e os encontros lendários são sistemas distintos. Lendários não devem aparecer como resultados comuns da Fonte, salvo quando uma regra explícita de evento permitir.

## 10.5. Histórico e saldo

O saldo deve possuir uma única fonte de verdade.

Registre as transações com:

- Tipo de transação.
- Quantidade positiva ou negativa.
- Motivo.
- Data.
- ID da instância ou evento, quando aplicável.
- Saldo resultante, quando compatível com o modelo.

Evite valores negativos, recompensas duplicadas e gastos repetidos.

---

# 11. EVOLUÇÃO DOS DIGITAL POKÉMON

Um Digital Pokémon pode evoluir quando cumprir simultaneamente:

- **1.000 energias disponíveis para gastar.**
- **Amizade de nível 3 ou superior.**
- Existência de uma próxima forma evolutiva válida nos dados reais.

Todas as condições são obrigatórias.

## 11.1. Sistema de amizade

Reutilize o sistema existente, se houver. Caso não exista, implemente uma mecânica simples e persistente.

A amizade deve ter níveis explícitos e progresso compreensível.

Ela pode aumentar por atividades reais, como participar de partidas, interagir com o Pokémon ou concluir ações apropriadas.

Evite que recarregar a página ou repetir uma operação aumente amizade ilimitadamente.

Mostre:

- Nível atual.
- Progresso para o próximo nível.
- Formas de aumentar a amizade.
- Requisitos de evolução pendentes.

O nível 3 precisa ser alcançável por atividades normais, sem exigir uma aparição lendária raríssima.

## 11.2. Processo de evolução

Antes da confirmação, mostre:

- Pokémon atual.
- Próxima forma evolutiva.
- Custo de 1.000 energias.
- Nível de amizade.
- Requisitos pendentes.
- O que será preservado.

A evolução deve ser atômica do ponto de vista do jogador, evitando gastos sem evolução, evoluções duplicadas e estados inconsistentes.

Preserve a identidade da instância, a origem digital, a amizade e a progressão aplicável.

Utilize dados reais de evolução, respeitando cadeias e formas existentes.

Não invente evoluções. Se não houver próxima forma válida, desabilite a ação e explique o motivo.

Se existir uma carta real correspondente à forma evoluída, utilize-a como referência. Não finja que o jogador escaneou uma nova carta física.

A instância continua sendo Digital Pokémon e permanece inelegível para scan físico após evoluir.

---

# 12. MINI TUTORIAL DOS DIGITAL POKÉMON

Após o presente inicial, apresente um mini tutorial narrativo que explique as mecânicas digitais.

Integre-o à história da Vila. Não crie uma sequência de introduções redundantes.

O tutorial deve explicar visualmente:

1. O que é um Digital Pokémon.
2. Por que ele existe mesmo sem carta física.
3. Por que não pode ser escaneado como uma carta física.
4. Onde pode ser utilizado.
5. O que é a Fonte.
6. Como invocar um Pokémon por 500 energias.
7. Como conseguir energia nas atividades reais do aplicativo.
8. Como aumentar a amizade.
9. Como evoluir com 1.000 energias e amizade de nível 3.

A narrativa pode apresentar a Fonte como uma descoberta especial na Vila e mostrar a materialização de um companheiro digital.

Use cenas curtas, exemplos visuais e instruções objetivas. Não entregue uma parede de texto.

Não explique funcionalidades inexistentes. O tutorial precisa refletir o comportamento real do aplicativo.

Permita pular a animação, mas mantenha as instruções disponíveis em uma seção de ajuda, diário ou registro da Vila.

Persista o estado de conclusão para que o tutorial não se repita indefinidamente. Se houver perfis, o estado deve ser associado ao perfil correto.

---

# 13. PRIORIDADE — SURVIVOR DENTRO DA VILA

Implemente um modo de sobrevivência no estilo bullet heaven, inspirado no gênero de Vampire Survivors, Survivor.io e Megabonk, mas com implementação própria e identidade Pokémon.

O Survivor deve ser acessado pela Vila, por meio de uma área temática como Zona de Sobrevivência, Arena ou Expedições.

Não o implemente como iframe, site separado ou aplicação independente.

## 13.1. Loop de jogo

Implemente uma experiência realmente jogável com:

- Seleção de Pokémon.
- Movimento em tempo real.
- Ataques automáticos.
- Inimigos com comportamentos diferentes.
- Projéteis, ataques em área e efeitos visuais.
- Vida, dano e invulnerabilidade temporária quando apropriado.
- Coleta de experiência.
- Subida de nível.
- Escolhas de melhorias durante a partida.
- Sinergias entre ataques e melhorias.
- Dificuldade progressiva.
- Chefes e encontros especiais.
- Pausa e retomada.
- Vitória e derrota.
- Estatísticas finais.

Não entregue apenas uma arena estática com animações.

## 13.2. Integração com a coleção

Reutilize a Caixa Pokémon e os dados existentes.

Permita selecionar Pokémon que o jogador possui. Se a coleção estiver vazia, ofereça uma seleção inicial para que ele possa jogar imediatamente.

O acesso ao Survivor não deve depender de cartas físicas.

Os Digital Pokémon devem ser elegíveis para o Survivor, respeitando suas características e regras de jogo.

As partidas podem contribuir para experiência, missões, conquistas e energia. Evite duplicar sistemas de progressão ou permitir farming ilimitado.

## 13.3. Tecnologia e desempenho

Avalie Canvas 2D ou outra solução leve compatível com a stack atual.

Não utilize Unity.

Otimize para dispositivos móveis:

- Controles por toque.
- Joystick virtual ou alternativa ergonômica.
- Interface que não cubra a ação.
- Pausa apropriada ao sair da tela.
- Limite adaptativo de inimigos e partículas.
- Carregamento sob demanda de sprites.
- Limpeza de timers, listeners e recursos.
- Controle de memória.

Não carregue antecipadamente todas as imagens ou a Pokédex inteira.

Verifique a licença de qualquer recurso externo. Use referências de gênero como inspiração, não como autorização para copiar código, sprites, músicas ou mapas.

---

# 14. PRIORIDADE — ENCONTROS LENDÁRIOS

Implemente um sistema de aparições lendárias raríssimas e inesperadas na Vila.

Esses encontros devem ser acontecimentos narrativos importantes, não apenas um Pokémon aparecendo com uma recompensa genérica.

## 14.1. Sorteio raro e controlado

Utilize um sistema de eventos ponderados e configuráveis.

Como referência inicial, considere uma chance-base de 0,1% por oportunidade válida de sorteio, ajustável após testes de balanceamento.

Documente exatamente o que constitui uma oportunidade de sorteio. Não execute sorteios ilimitados em segundo plano nem sorteie novamente sempre que o jogador abrir e fechar a Vila.

Requisitos:

- Chances configuráveis.
- Pesos específicos por lendário.
- Condições de elegibilidade.
- Registro de tentativas e ocorrências.
- Persistência local.
- Proteção contra manipulação por reinicialização.
- Controle de recorrência.
- Recuperação após interrupções.
- Testes reproduzíveis em ambiente de desenvolvimento.

Não aumente a chance silenciosamente após longos períodos sem aparição. Se existir uma mecânica de compensação, ela deve ser explícita, documentada e testável.

## 14.2. Eventos individuais

Cada lendário deve ter uma definição de evento própria, incluindo, conforme aplicável:

- Identificador e nome.
- Sprite e recursos visuais.
- Peso e condições de elegibilidade.
- Cutscene exclusiva.
- Música e efeitos sonoros.
- Efeitos visuais.
- Alterações na Vila.
- Consequências positivas ou negativas.
- Duração.
- Condições de encerramento.
- Recompensas.
- Registro histórico.
- Comportamento em futuras aparições.

Crie uma arquitetura extensível para adicionar lendários sem reescrever o motor de eventos.

Não utilize apenas uma imagem e um texto diferentes para fingir que cada lendário possui um evento próprio.

## 14.3. Cutscenes memoráveis

Uma aparição deve interromper ou desacelerar a rotina da Vila.

A sequência pode incluir:

1. Mudança perceptível de iluminação.
2. Alteração do som ambiente ou música.
3. Fenômeno visual que sinalize algo extraordinário.
4. Cutscene com enquadramento e ritmo próprios.
5. Revelação do lendário.
6. Reação da Vila.
7. Consequência visível.
8. Registro do encontro.

Cada lendário precisa ter linguagem visual e narrativa própria.

Use animações, composição de cena, sprites e efeitos leves, sem depender de vídeos externos pesados.

Permita pular a animação sem eliminar suas consequências.

Respeite preferências de áudio e acessibilidade. Evite flashes agressivos e permita reduzir movimento, tremores e flashes.

## 14.4. Consequências positivas e negativas

Cada lendário pode causar efeitos temporários ou persistentes, positivos, negativos ou mistos.

Exemplos de direção criativa:

- Um lendário ligado ao clima altera o céu, a iluminação e a ambientação.
- Um lendário ligado ao tempo modifica temporariamente o ritmo de animações.
- Um lendário ligado ao espaço cria distorções visuais e transforma áreas da Vila.
- Um lendário ligado a sonhos ou pesadelos cria um fenômeno onírico.
- Um lendário ligado à eletricidade provoca uma tempestade e efeitos elétricos.

Escolha os lendários e suas habilidades com coerência com suas características conhecidas. Os exemplos são sugestões de design, não atribuições obrigatórias.

Os efeitos negativos devem gerar tensão, curiosidade ou desafios, nunca destruir o progresso do jogador.

Não apague cartas, Pokémon, conquistas ou dados como punição aleatória.

Os efeitos podem:

- Durar um período definido.
- Persistir até uma condição ser cumprida.
- Conceder bônus.
- Alterar temporariamente a Vila.
- Desbloquear uma nova interação.
- Criar desafios posteriores.
- Terminar em uma oportunidade positiva.

## 14.5. Impacto persistente

Cada aparição deve deixar uma marca reconhecível.

Implemente, conforme o evento:

- Alterações visuais.
- Registro no diário.
- Conquistas específicas.
- Memórias do encontro.
- Efeitos temporários ou persistentes.
- Novas interações.
- Consequências para atividades posteriores.

O jogador deve poder reconhecer que algo aconteceu, mesmo depois de retornar em outra sessão.

Persista o estado necessário para que sair do aplicativo durante uma aparição não gere inconsistências, repita recompensas ou permita manipular o sorteio.

Mantenha um histórico dos encontros descobertos, sem revelar antecipadamente todos os mistérios e condições.

Não torne os lendários um requisito para avançar nas mecânicas normais de progressão.

---

# 15. PROGRESSÃO COMPARTILHADA

Integre os sistemas existentes para evitar duplicação.

O Treinador deve registrar, conforme os modelos atuais permitirem:

- Experiência e nível.
- Missões.
- Conquistas.
- Recordes do Survivor.
- Vitórias e derrotas.
- Chefes derrotados.
- Pokémon utilizados.
- Cartas identificadas.
- Encontros lendários.
- Eventos da Vila.
- Amizade.
- Evoluções digitais.
- Energia obtida e gasta.

A coleção e a Caixa devem disponibilizar Pokémon aos modos pertinentes.

Digital Pokémon devem participar normalmente dos sistemas de jogo, exceto scan físico.

O Survivor pode contribuir para missões e recompensas, mas não deve ser a única forma de progredir.

Os encontros lendários podem desbloquear memórias e conquistas, mas não podem bloquear a progressão essencial por serem raríssimos.

---

# 16. PERSISTÊNCIA, CACHE E COMPATIBILIDADE

Audite IndexedDB, armazenamento local, cache e service worker.

Persista os dados necessários:

- Coleção e instâncias de Pokémon.
- Estado do Treinador.
- Presente inicial.
- Conclusão do questionário.
- Conclusão da introdução.
- Conclusão do tutorial digital.
- Saldo e histórico de energia.
- Amizade e evolução.
- Progresso do Survivor.
- Eventos lendários.
- Efeitos ativos na Vila.
- Histórico narrativo.
- Configurações de áudio e acessibilidade.

Evite salvar imagens enormes continuamente.

Não baixe toda a Pokédex antecipadamente.

Carregue recursos sob demanda, reutilize o cache existente e ofereça alternativas quando os recursos externos não estiverem disponíveis.

Se alterar o esquema de armazenamento, implemente migrações compatíveis com os dados existentes.

Trate erros de armazenamento sem apagar silenciosamente o progresso.

Como não existe necessariamente um backend, documente que os dados locais podem ser perdidos se o armazenamento do navegador for apagado. Não prometa sincronização entre dispositivos sem implementá-la.

---

# 17. INTERFACE, ATMOSFERA E ACESSIBILIDADE

Todas as funcionalidades devem parecer partes do mesmo jogo.

A Vila, o Survivor, as cutscenes, a Fonte e os encontros lendários devem compartilhar identidade visual, tipografia, transições e linguagem de interface.

Priorize:

- Hierarquia visual clara.
- Animações com propósito.
- Feedback imediato.
- Tipografia legível.
- Controles móveis confortáveis.
- Estados vazios bem resolvidos.
- Mensagens de erro úteis.
- Redução de movimento e flashes.
- Opções de áudio.
- Boa performance em dispositivos modestos.

Não transforme as cutscenes em textos longos. Use cenas curtas, ritmo, diálogo e elementos visuais.

Os eventos lendários devem ser extraordinários, mas a navegação cotidiana precisa continuar rápida.

---

# 18. TESTES OBRIGATÓRIOS

Crie ou atualize testes unitários e de integração para as áreas modificadas.

## 18.1. Scanner e AR

- Métricas válidas.
- Recortes reais do OCR exibidos corretamente.
- Candidatos sem truncamento.
- Busca manual funcional.
- Cancelamento de operações obsoletas.
- Tratamento de falhas de câmera e OCR.
- Correspondência correta entre carta e alvo AR.
- Tratamento de perda de rastreamento.
- Recursos liberados ao sair.

## 18.2. Introdução e presente

- Cutscene inicial obrigatória para todas as idades.
- Questionário com os iniciais das gerações I a IX.
- Resultado influenciado pelas respostas.
- Seleção equilibrada e testável.
- Carta de origem real.
- Exatamente um presente por perfil.
- Nenhuma duplicação por recarregamento.
- Estado persistente da introdução.
- Tutorial digital persistente.
- Reabertura do diário narrativo.

## 18.3. Digital Pokémon

- Presença em todos os modos pertinentes.
- Etiqueta baseada nos dados da instância.
- Bloqueio de seleção para scan físico.
- Ausência de falsos registros de posse física.
- Persistência de origem, amizade e evolução.

## 18.4. Energia e Fonte

- Saldo consistente.
- Fontes de energia reais.
- Custo de summon exatamente 500.
- Ausência de saldo negativo.
- Prevenção de cliques duplicados.
- Tratamento de falhas sem perda de energia ou de resultado.
- Histórico correto.
- Prevenção de duplicatas inúteis.

## 18.5. Evolução

- Custo de 1.000 energias.
- Amizade mínima de nível 3.
- Ambas as condições obrigatórias.
- Cadeia evolutiva real.
- Nenhuma evolução inventada.
- Identidade Digital Pokémon preservada.
- Nenhum gasto ou evolução duplicada.

## 18.6. Survivor

- Movimento.
- Dano e colisão.
- Experiência e melhorias.
- Pausa, vitória e derrota.
- Progressão persistente.
- Integração com Caixa e Treinador.
- Recompensas de energia consistentes.
- Limpeza de timers, listeners e recursos.

## 18.7. Lendários

- Sorteio respeitando pesos e condições.
- Oportunidades controladas.
- Nenhum abuso por reinicialização.
- Cutscene correspondente ao lendário.
- Efeitos positivos e negativos corretos.
- Persistência de eventos ativos.
- Recuperação após interrupção.
- Histórico correto.
- Ausência de recompensas duplicadas.
- Ferramentas de teste inacessíveis na versão publicada.

Diferencie claramente testes unitários, integração, navegador e dispositivo físico.

A aprovação dos testes automatizados não comprova que a câmera ou o AR funcionam em um celular real.

---

# 19. ORDEM DE IMPLEMENTAÇÃO

Trabalhe nas seguintes fases, corrigindo problemas estruturais antes de avançar.

## Fase 1 — Auditoria
- Inspecionar o repositório.
- Ler a documentação.
- Identificar funcionalidades existentes.
- Registrar problemas e métricas de referência.
- Planejar alterações incrementais.

## Fase 2 — Scanner
- Instrumentar o pipeline.
- Mostrar contorno, cantos, recortes e OCR.
- Corrigir a seleção de candidatos.
- Reduzir a latência.
- Comparar métricas antes e depois.

## Fase 3 — AR
- Corrigir inicialização e rastreamento.
- Corrigir o fluxo de visualização AR.
- Implementar GIF ancorado à carta.
- Tratar recursos ausentes e falhas.

## Fase 4 — Introdução e presente
- Implementar a cutscene inicial.
- Criar o questionário narrativo.
- Conceder um único inicial digital.
- Persistir a concessão.
- Implementar o mini tutorial dos Digital Pokémon.

## Fase 5 — Digital Pokémon e energia
- Integrar instâncias digitais à coleção e aos modos.
- Impedir seleção de anchor físico.
- Implementar a economia de energia.
- Criar a Fonte.
- Implementar summon por 500 energias.
- Implementar amizade e evolução por 1.000 energias e nível 3.

## Fase 6 — Vila e Survivor
- Auditar a Vila existente.
- Integrar a Zona de Sobrevivência.
- Implementar uma partida completa.
- Integrar coleção, Caixa, Treinador e recompensas.
- Otimizar para dispositivos móveis.

## Fase 7 — Encontros lendários
- Implementar o motor de sorteio.
- Criar definições de eventos.
- Desenvolver cutscenes individuais.
- Implementar consequências positivas e negativas.
- Persistir efeitos e histórico.
- Testar os fluxos de recuperação.

## Fase 8 — Integração e acabamento
- Revisar navegação.
- Testar os fluxos completos.
- Corrigir problemas de desempenho.
- Revisar persistência e migrações.
- Atualizar documentação.
- Executar testes.
- Organizar commits.

Se alguma fase revelar uma falha estrutural, corrija-a antes de adicionar complexidade.

Não sacrifique a confiabilidade do scanner para acelerar as funcionalidades de jogo.

---

# 20. GIT, DOCUMENTAÇÃO E ENTREGA

Faça commits pequenos, organizados e com mensagens claras.

Antes de cada commit, revise as alterações e evite incluir arquivos temporários, credenciais ou artefatos desnecessários.

Não faça push forçado e não sobrescreva alterações do usuário.

Se o acesso ao remoto não estiver disponível, mantenha as alterações locais organizadas e explique o bloqueio.

Atualize `README.md`, `CHANGELOG.md`, `IMPLEMENTATION_PLAN.md` e a documentação técnica pertinente.

No relatório final, apresente:

1. Funcionalidades implementadas.
2. Problemas corrigidos.
3. Componentes existentes reaproveitados.
4. Arquivos importantes modificados.
5. Testes executados e resultados reais.
6. Métricas do scanner antes e depois.
7. Estado real da validação de AR em dispositivos físicos.
8. Estado real do repositório, commits e deploy.
9. Problemas ainda pendentes.
10. Próximos passos prioritários.

Não declare uma fase concluída apenas porque os componentes foram criados. Use os critérios de aceitação para determinar o que realmente funciona.

---

# VISÃO FINAL DO PRODUTO

O resultado desejado é um aplicativo Pokémon TCG AR em que:

- O scanner reconhece cartas com mais velocidade, transparência e confiabilidade.
- A câmera mostra claramente onde está procurando o número e o nome.
- A realidade aumentada exibe um Pokémon animado que parece sair da carta.
- Todo jogador recebe uma introdução narrativa, independentemente da idade.
- Um questionário divertido concede uma única vez um inicial digital baseado em uma carta real.
- Os Digital Pokémon podem participar de todos os modos de jogo, mas não podem ser selecionados para scan físico.
- A Vila conecta a coleção, o Treinador, a Fonte, o Survivor e os eventos.
- O Survivor é uma experiência jogável de combate e progressão.
- A Fonte permite invocar Digital Pokémon por 500 energias.
- A amizade de nível 3 e o custo de 1.000 energias permitem evoluir Digital Pokémon, respeitando dados reais.
- Um tutorial narrativo explica as mecânicas digitais e onde obter energia.
- Lendários podem aparecer de surpresa com probabilidade extremamente baixa.
- Cada encontro lendário tem uma cutscene própria, identidade visual e consequências positivas ou negativas.
- Os acontecimentos lendários deixam marcas reconhecíveis na Vila e na história do jogador.
- Todos esses sistemas compartilham a mesma coleção, progressão e persistência.
- O projeto continua gratuito, compatível com GitHub Pages e otimizado para dispositivos móveis.

**Comece auditando o repositório real. Depois implemente, teste, documente e faça commits incrementais. Não se limite a produzir um plano ou uma demonstração visual.**
