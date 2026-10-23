# Bairros, casas e economia dos moradores

## Mapa e passeios

A Vila mede 120 × 96 blocos. O núcleo anterior, de 96 × 72, conserva casas, portas, loja, recursos e posição dos saves. Os anexos acrescentam Jardim das Estações, Praça dos Encontros, Bosque do Piquenique, Mirante das Nuvens e Praia das Conchas. As conexões são percorridas pelo pathfinding normal, sem teletransporte de moradores que passeiam sozinhos.

Há 16 destinos de passeio guiado, incluindo os postos de trabalho, o terraço do Café e os novos bairros. O acompanhante sincroniza a velocidade com o jogador; o resgate ao lado do treinador continua reservado ao acompanhante preso. Moradores livres alternam regiões a cada 2–3 minutos, respeitando sono, conversas, acompanhamento, trabalho e descanso. O mapa ampliado oferece guias em HTML para leitura nítida e navegação por botão; o canvas acompanha a densidade da tela, limitada a 2.

Atividades dos novos lugares são limitadas por dia: flores no jardim, concha na praia e convivência nos demais. O piquenique exige companhia próxima e consome uma fruta Oran/Pecha real. Novos enfeites usam a mesma arte da mochila. Grama, areia e píer são preparados uma vez no chão estático, sem filtros por quadro ou animação extra.

## Casas

- 32 peças novas com desenhos próprios em pixels: móveis de quarto, cozinha, convivência, jardim e lazer. Receitas e preços ficam no catálogo.
- O interior continua um mapa separado de 7 × 5 células, com parede, janelas, piso e saída. Examinar e organizar são ações distintas; moradores não perdem móveis quando o jogador os examina.
- Novas compras dos moradores respeitam zonas: descanso à esquerda, cozinha à direita, convivência no miolo e organização nas laterais. A circulação central e a entrada ficam livres. Saves antigos não são reorganizados silenciosamente, inclusive móveis que já ocupavam a célula de entrada.
- Oito fachadas do mesmo conjunto visual: rústica, jardim, festiva, moderna, praiana, serrana, tradicional e noturna. As duas reformas extras são varanda e solar. O último estágio compõe um pavimento adicional com pixels da própria fachada.
- Níveis antigos de casas, telhado e enfeites continuam nos mesmos bits. O bit 9 estende os níveis para 4 e 5. A casa do jogador tem estágios correspondentes até 6, incluindo a construção inicial.

Os moradores recebem apenas um pequeno kit inicial de mudança. Compras posteriores exigem dinheiro pessoal. Cada casa considera no máximo uma iniciativa por dia, com 65% de disposição determinística, e pode preferir guardar dinheiro. Reformas custam 100/220/380/620/950 moedas pessoais. Trocas de estilo têm intervalo mínimo de sete dias; móveis seguem a personalidade e são posicionados com função. Bem-estar comunitário abaixo de 35 adia compras. Ausência prolongada não concede reformas em lote nem dinheiro gratuito.

## Profissões e dinheiro

| Posto | Moradores necessários | Salário por conclusão |
| --- | ---: | --- |
| Fazenda | 3 | 5 ao plantar/regar; 8 ao colher |
| Pescaria | 4 | 8 por pesca concluída com sucesso |
| Pedreira e madeireira | 5 | 8 por coleta concluída |
| Correio | 6 | 6 por casa alcançada na entrega, uma vez por destinatário/dia |
| Café | 8 e Café aberto no nível 3 de Treinador | 4 por pedido efetivamente servido |

O teto é 80 moedas de salário por morador/dia e 5.000 na carteira. Comprovantes impedem pagar duas vezes a mesma conclusão. Os postos de recursos mantêm animação e trabalho de 30 segundos, até cinco trabalhadores simultâneos, com limites de recurso, mochila e pesca compartilhados com o jogador. A escolha combina disponibilidade, energia, aptidão, interesses e rotação de trabalhadores.

Carteiro e atendente são distintos. Priorizam entregas, mas podem conversar, acompanhar o jogador e participar de momentos. Conversar dá uma pausa de 20 segundos no serviço. O atendente também tem uma pausa de 18 segundos entre pedidos. Preferências de profissão permanecem salvas quando a população cai e o posto fica suspenso.

O terraço tem seis mesas e doze assentos reservados individualmente. Clientes caminham, sentam e fazem pedidos; o atendente vai ao balcão, prepara por seis segundos e entrega na mesa. O cliente precisa ter 12 moedas e paga somente ao receber; o restante do preço, descontado o salário do atendente, sai da economia. Esperar, cancelar ou fechar o app não cobra nem serve automaticamente. As refeições duram 45 segundos; companhia na mesma mesa abre oportunidades extras de momentos, incluindo quatro modelos específicos que exigem convidados realmente comendo juntos.

Carteiras, comprovantes, móveis, fachadas, reformas, projetos e profissionais entram no save e no backup existentes. Pedidos, reservas e deslocamentos são efêmeros: não retomam com cobrança ou salário depois de reabrir a página.

## Evidência e limites da validação

- 2.003 testes em 216 arquivos, typecheck, build com `BASE_PATH=/pokemon-tcg-ar/` e `verify-dist` passaram localmente.
- Caminhos de ida e volta dos 16 destinos em três sementes, com acompanhante sem saltos de posição e velocidade sincronizada.
- Simulação determinística de 12 minutos: produção nos quatro setores e salário para pelo menos quatro moradores. Isso verifica integração; não mede a distribuição de uma população real em várias horas.
- Dois clientes chegam à mesma mesa, recebem pedidos e pagam; atendente recebe dois salários. Sem saldo, não há visita. Profissões abaixo do limite não produzem nem pagam.
- 250 dias de iniciativas com renda explicitamente gerada por trabalho no teste, comprovando progressão das reformas sem usar recursos do jogador. Teste separado exige ausência de renda por espera/relógio retrocedido.
- Backup compactado é exportado e importado em armazenamento vazio com novos campos preservados, sem repetir salário.
- `e2e/village-neighborhoods.mjs` verifica interface em 390 × 844 e 844 × 390, móveis examináveis, saída da casa, guias e caminhada até a praia. Capturas são de Chromium desktop; não comprovam GPU, sensores ou conforto de toque em celular físico.
- Build local sem rede não publica catálogo/pack de sprites; CI prepara esses recursos. O teste da Vila não simula reconhecimento de cartas ou AR.
