# Regras do duelo por turnos da Arena

> **Menu da Arena** (`#/arena`): a entrada da Arena é um menu em quatro passos (o que fazer, equipe, opções, entrar), descrito em `docs/ARCHITECTURE.md` («O menu único da Arena»). O duelo por turnos abaixo fica em «Mais opções» do menu; a batalha livre, a Liga, as corridas 6×6 e o PvP abrem o palco depois das escolhas.

Resumo das regras dos jogos (Gen VI em diante) que o duelo por turnos (`src/core/turn-battle.ts`) segue, do que ainda falta
e de onde vêm os dados. Fontes: Bulbapedia (Damage, Critical hit, Stat), Smogon (prioridade, condições, armadilhas),
Dragonfly Cave (mecânicas) e a documentação da PokéAPI (`Move`, `MoveMeta`).

## Dados

Tudo vem da PokéAPI e fica guardado no aparelho; nada é inventado.

- `GET /pokemon/{id}` → `moves`: o learnset. Vale o grupo de versão mais novo em que a espécie aprende golpes (nível, MT,
  ovo e tutor).
- `GET /move/{id}`: `type`, `power`, `accuracy` (null = nunca erra), `pp`, `priority`, `damage_class`, `stat_changes`,
  `target` e `meta` (`ailment`, `ailment_chance`, `category`, `crit_rate`, `drain`, `flinch_chance`, `healing`,
  `min_hits`/`max_hits`, `min_turns`/`max_turns`, `stat_chance`).
- Golpe de status sem nenhum efeito simulado (Proteger, clima, armadilhas...) aparece bloqueado com «Efeito não simulado
  na Arena». Golpe de dano sem poder fixo (Seismic Toss, Counter) também fica bloqueado. Golpe de dano com parte do efeito
  fora da simulação (vários turnos, efeito especial) pode ser escolhido, com o aviso «Não simulado: ...».
- Em quem caem as mudanças de atributo (`meta.category`): `damage+lower` → alvo; `damage+raise` e `damage` → quem usa
  (Close Combat, Overheat); `net-good-stats` → quem usa se sobe (ou se o alvo é `user`), alvo se desce.

## Dano

`dano = ((2·50/5 + 2) · Poder · A/D / 50 + 2) · STAB 1,5 · tipo · crítico 1,5 · aleatório 0,85–1 · queimadura 0,5`,
arredondado para baixo e no mínimo 1 (0 se o tipo não afeta). Físico usa Atq./Def.; especial usa Atq. Esp./Def. Esp.
Nível 50 para todos. Struggle não tem tipo (sempre dano normal, sem STAB).

## Ordem do turno

1. Trocas acontecem antes dos golpes.
2. Prioridade maior age primeiro (Ataque Rápido +1).
3. Na mesma prioridade, a Velocidade decide: com estágio de Velocidade e ×0,5 com paralisia. Empate exato = 50/50.

O menu de golpes mostra «Age primeiro», «Age depois» ou «Empate de Velocidade» supondo que o oponente use um golpe de
prioridade 0.

## Estágios (−6 a +6)

- Atq., Def., Atq. Esp., Def. Esp., Vel.: +n = (2+n)/2, −n = 2/(2+n).
- Precisão e evasão: (3+n)/3 e 3/(3+n); a chance de acerto usa precisão de quem ataca − evasão do alvo.
- Crítico por estágio: 0 = 1/24, +1 = 1/8, +2 = 1/2, +3 = sempre. `crit_rate` do golpe soma estágios; intimidade 3+ da
  Vila soma mais 1. O crítico ignora a queda de Atq. de quem ataca e a alta de Def. do alvo.
- Os estágios (e a confusão) zeram quando o Pokémon sai de campo.

## Condições

Uma condição não volátil por Pokémon, até o fim do duelo:

| Condição | Efeito | Imune |
| --- | --- | --- |
| Queimadura | perde 1/16 dos PS no fim do turno; dano físico ×0,5 | Fogo |
| Veneno | perde 1/8 dos PS no fim do turno | Veneno, Aço |
| Paralisia | Velocidade ×0,5; 25% de perder a vez | Elétrico |
| Sono | 1 a 3 turnos sem agir, depois acorda | — |
| Congelamento | não age; 20% de descongelar a cada tentativa; golpe de Fogo descongela | Gelo |

Voláteis: **confusão** (2 a 5 turnos; 1/3 de chance de se atingir com poder 40 físico, sem tipo) e **hesitar** (só se
quem causa agir antes do alvo no turno). Golpes de status ignoram a tabela de tipos, com a exceção da paralisia elétrica
(Onda Trovão não afeta Terra). O dano de fim de turno pode derrubar.

## Outros efeitos

- **Dreno** (`drain` > 0): cura essa % do dano causado. **Recuo** (`drain` < 0): perde essa % do dano.
- **Cura** (`healing`, categoria `heal`): recupera essa % dos PS máximos; com PS cheios, «Mas não funcionou!».
- **Vários golpes** (`min_hits`/`max_hits`): sorteia quantos acertos (distribuição uniforme, simplificada).
- **PP**: cada golpe tem o PP real; sem PP em todos, só Struggle (poder 50, nunca erra, recuo de 1/4 dos PS máximos).
- **Aguentou firme** (intimidade 4 da Vila): uma vez por duelo, fica com 1 PS em vez de desmaiar.

## O oponente

Usa atributos reais e 4 golpes reais que a espécie aprende por nível até o 50 (a mesma sugestão do editor: dano esperado,
STAB, classe mais forte e variedade de tipos). A cada turno, sorteia com peso entre golpes com PP: dano esperado; condição
num alvo que ainda pode recebê-la; alta de atributo com PS acima de 60%; queda no alvo; cura abaixo de 50%. Não troca.

## Simplificações e o que falta

- Tóxico conta como veneno comum (a PokéAPI marca o ailment como `poison`); o veneno crescente ainda não existe.
- Sem habilidades, itens, clima, campos, armadilhas de entrada, Proteger, golpes de vários turnos, carga ou recarga.
- Ninguém troca de Pokémon automaticamente no lado do oponente, só quando um desmaia.
- A batalha automática da Arena (`core/battle.ts`, escolhida no menu da Arena) usa só os golpes de dano do conjunto e continua com as
  regras dela (condições por tipo do golpe, crítico 1/16).

Próximos passos sugeridos pela pesquisa, em ordem: Proteger (chance que cai se repetido), clima (Sol/Chuva ×1,5 em
Fogo/Água), Stealth Rock (1/8 ajustado pelo tipo), veneno crescente, e só depois habilidades e itens.
