# Simulação de balanceamento do Survival

Comando: `npx tsx scripts/simulate-survival.ts`

Foram executadas 400 runs determinísticas: 10 tipos, 20 sementes por tipo e duas estratégias de movimento. O simulador usa a lógica real de `src/core/survivor`, coleta orbes próximos, evita as bordas, escolhe o Bastião quando o especial chega e aplica o primeiro upgrade de maior raridade oferecido.

| Estratégia | Runs | Sobrevivência mediana | Chegou a 3 min | Chegou a 5 min | Kills medianas | Nível mediano |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Evasiva | 200 | 2,00 min | 10 (5%) | 0 | 20 | 4 |
| Agressiva | 200 | 3,05 min | 104 (52%) | 3 (1,5%) | 53 | 8 |

Antes da curva inicial, uma versão equivalente do simulador chegou a 0% no marco de 10 minutos, com medianas entre 1,6 e 1,7 minuto. A comparação serve como sinal de regressão e não substitui partidas humanas em celular.

Os resultados mostram que o especial de 3 minutos já aparece em runs agressivas comuns, enquanto a transição para o treinador de 5 minutos ainda é o próximo ponto de pressão. A validação humana deve observar se o jogador consegue coletar orbes e manter espaço sem conhecer a posição dos inimigos.
