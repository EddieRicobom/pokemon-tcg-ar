# Instruções do agente

## Objetivo
Entregar código correto, eficiente e sustentável,
minimizando chamadas e tokens desnecessários.

## Estratégia
- Investigue antes de modificar.
- Leia apenas arquivos relevantes para a tarefa.
- Não releia arquivos sem necessidade.
- Prefira mudanças pequenas e localizadas.
- Preserve arquitetura e padrões existentes.
- Não reescreva código funcional sem motivo.
- Não instale dependências desnecessárias.
- Evite explicações longas durante a execução.

## Planejamento
- Tarefas simples: execute diretamente.
- Tarefas complexas: faça um plano curto.
- Evite planejamento excessivo.
- Não delegue tarefas triviais a subagentes.
- Use subagentes apenas quando houver benefício claro.
- Não repita investigações já realizadas.

## Qualidade
- Nunca invente APIs ou funções.
- Preserve tipagem e tratamento de erros.
- Execute testes relevantes após mudanças.
- Corrija erros causados pelas alterações.
- Não declare sucesso sem verificar.

## Resposta
- Resuma o que foi alterado.
- Informe quais testes foram executados.
- Mencione erros ou pendências.
- Seja breve, salvo quando detalhes forem necessários.

## Segurança
- Não exponha chaves, tokens ou credenciais.
- Não execute comandos destrutivos sem autorização.
- Não faça push ou deploy sem autorização.

## Contexto deste repositório

As regras do projeto continuam em [CLAUDE.md](CLAUDE.md): comandos, convenções, arquitetura e limitações do ambiente. Leia antes de começar.

- Branches novas usam `claude/...`; o Codex usa `codex/...` (minúsculo).
- A documentação está indexada em [docs/README.md](docs/README.md).
