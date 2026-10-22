# Simulação de balanceamento do Survival

Comando: `npx tsx scripts/simulate-survival.ts`

Foram executadas 400 runs determinísticas: 10 tipos, 20 sementes por tipo e duas estratégias de movimento. O simulador usa a lógica real de `src/core/survivor`, coleta orbes próximos, evita as bordas, escolhe o Bastião quando o especial chega e aplica o primeiro upgrade de maior raridade oferecido.

| Estratégia | Runs | Sobrevivência mediana | Chegou a 3 min | Chegou a 5 min | Kills medianas | Nível mediano |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Evasiva | 200 | 2,00 min | 10 (5%) | 0 | 20 | 4 |
| Agressiva | 200 | 3,05 min | 104 (52%) | 3 (1,5%) | 53 | 8 |

Antes da curva inicial, uma versão equivalente do simulador chegou a 0% no marco de 10 minutos, com medianas entre 1,6 e 1,7 minuto. A comparação serve como sinal de regressão e não substitui partidas humanas em celular.

Os resultados mostram que o especial de 3 minutos já aparece em runs agressivas comuns, enquanto a transição para o treinador de 5 minutos ainda é o próximo ponto de pressão. A validação humana deve observar se o jogador consegue coletar orbes e manter espaço sem conhecer a posição dos inimigos.

## Calibração posterior — 22/10/2026

Depois da rodada acima, a Torre passou a usar vida e dano com escalada mais
suave, proteção inicial até 8 minutos, orbes comuns/elite/chefão de 8/20/36
XP, densidade ligeiramente maior e artefatos um pouco mais frequentes. O mesmo
`scripts/simulate-survival.ts` produziu:

| Estratégia | Runs | Sobrevivência mediana | Chegou a 3 min | Chegou a 5 min | Kills medianas | Nível mediano |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Evasiva | 200 | 3,58 min | 159 (79,5%) | 10 (5%) | 20 | 3 |
| Agressiva | 200 | 5,05 min | 192 (96%) | 101 (50,5%) | 84 | 12 |

Uma matriz separada de 40 sementes, com um Pokémon forte, escolhas de maior
raridade e coleta competente, chegou a 18 e 20 minutos em 13/40 runs. Com uma
espécie fraca, nenhuma das 40 runs chegou a 10 minutos. Essa diferença é
intencional: uma build forte e uma pessoa habilidosa têm uma rota de excelência,
mas uma escolha fraca não vence automaticamente. Os números são diagnóstico do
motor; não substituem testes humanos em celular.

A decisão sobre repetição de buffs está registrada em
[SURVIVOR_BALANCE_PRINCIPLES.md](SURVIVOR_BALANCE_PRINCIPLES.md): bônus
incrementais podem empilhar, enquanto dano explosivo, recarga, perfuração,
disparos extras e efeitos lendários permanecem limitados. Não remover o limite
global sem uma comparação nova.
