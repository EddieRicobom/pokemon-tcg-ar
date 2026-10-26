# Revisão geral: prioridades de manutenção

Esta revisão identifica pontos para dividir o trabalho sem alterar o comportamento de uma vez. Não substitui testes manuais de todos os fluxos nem validação em celular real. O estado e as entregas continuam em [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) e [HISTORICO.md](HISTORICO.md).

## Prioridades

1. **Dados e navegação.** Manter importação de backup transacional, preservar compatibilidade dos formatos antigos e testar entradas inválidas; links malformados e falhas de atualização devem mostrar recuperação em vez de impedir a abertura do app.
2. **Vila, história e Torre.** `VillageView.vue` e `MinigameSobrevivencia.vue` concentram interface, estado e vários fluxos. Extrair aos poucos telas e controladores com limites claros, preservando saves e diálogos; `core/village/social.ts` e os dados de histórias também merecem divisão por responsabilidade. Cada extração deve ter testes de comportamento e verificação visual. No build desta revisão, o pacote da Vila teve cerca de 885 kB antes da compressão; avaliar carregamento sob demanda ao separar os fluxos.
3. **Reconhecimento e AR.** Manter separado o processamento puro da câmera e do WebGL. Validar câmera, desempenho, temperatura, gestos e qualidade do reconhecimento em aparelho real conforme [TESTE_NO_CELULAR.md](TESTE_NO_CELULAR.md); a câmera falsa não demonstra essas condições.
4. **Documentação.** Registrar o que foi realmente testado em cada entrega e manter o plano de funcionalidades alinhado ao código. O histórico não deve ser reescrito como se validações antigas tivessem ocorrido.

As mudanças desta rodada tratam entradas inválidas em rotas e backups e impedem recarregamentos automáticos repetidos quando o armazenamento de sessão está indisponível. A divisão dos componentes grandes requer entregas menores, com verificações próprias, para evitar regressões nos fluxos e no progresso salvo.
