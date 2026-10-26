# Revisão geral: prioridades de manutenção

Esta revisão identifica pontos para dividir o trabalho sem alterar o comportamento de uma vez. Não substitui testes manuais de todos os fluxos nem validação em celular real. O estado e as entregas continuam em [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) e [HISTORICO.md](HISTORICO.md).

## Prioridades

1. **Dados e navegação.** Manter importação de backup transacional, preservar compatibilidade dos formatos antigos e testar entradas inválidas; links malformados e falhas de atualização devem mostrar recuperação em vez de impedir a abertura do app.
2. **Vila, história e Torre.** `VillageView.vue` e `MinigameSobrevivencia.vue` concentram interface, estado e vários fluxos. Extrair aos poucos telas e controladores com limites claros, preservando saves e diálogos; `core/village/social.ts` e os dados de histórias também merecem divisão por responsabilidade. Cada extração deve ter testes de comportamento e verificação visual. No build desta revisão, o pacote da Vila teve cerca de 885 kB antes da compressão; avaliar carregamento sob demanda ao separar os fluxos.
3. **Reconhecimento e AR.** Manter separado o processamento puro da câmera e do WebGL. Validar câmera, desempenho, temperatura, gestos e qualidade do reconhecimento em aparelho real conforme [TESTE_NO_CELULAR.md](TESTE_NO_CELULAR.md); a câmera falsa não demonstra essas condições.
4. **Documentação.** Registrar o que foi realmente testado em cada entrega e manter o plano de funcionalidades alinhado ao código. O histórico não deve ser reescrito como se validações antigas tivessem ocorrido.

As mudanças desta rodada tratam entradas inválidas em rotas e backups e impedem recarregamentos automáticos repetidos quando o armazenamento de sessão está indisponível. A divisão dos componentes grandes requer entregas menores, com verificações próprias, para evitar regressões nos fluxos e no progresso salvo.


## Resumo do app e do que deve ser preservado

| Área | Onde procurar | O que existe e não deve se perder na limpeza |
| --- | --- | --- |
| Navegação e carregamento | `src/App.vue`, `src/app/route.ts`, `src/views/` | Rotas por hash para o Pages, atalhos antigos, sinalizadores de origem e carregamento sob demanda das telas. |
| Cartas e reconhecimento | `src/recognition/`, `src/app/scan-controller.ts`, `src/views/ScanView.vue` | Detecção, OCR, comparação e confirmação entre quadros; coleção e busca dependem de dados reais. Reconhecimento não pode ser simulado. |
| AR e câmera | `src/ar/`, `src/sensors/`, `src/views/VariasView.vue` | Alvos compilados e versionados, rastreamento real, giroscópio e sprites; falhas e ausência de dados precisam continuar visíveis. |
| Caixa, batalhas e Pins | `src/box/`, `src/core/battle.ts`, `src/core/pins.ts`, `src/views/CaixaView.vue`, `src/views/PinsView.vue` | Caixa em AR, batalha de exibição, Arena e Pins têm regras, efeitos e controles próprios. A batalha da Caixa não deve ser apresentada como RPG jogável. |
| Treinador e progresso | `src/core/trainer.ts`, `src/app/trainer-store.ts`, `src/views/TreinadorView.vue` | XP, missões, conquistas, Liga e opções locais têm relações com outras atividades. |
| Vila | `src/core/village/`, `src/village/`, `src/components/VillageView.vue`, `src/app/village-store.ts` | Mapa, moradores, construção, agricultura, amizades, narrativas e jogos; o save tem normalização, migração e cópia de recuperação. |
| Torre e Bonk | `src/core/survivor*.ts`, `src/village/survivor*.ts`, `src/components/MinigameSobrevivencia.vue` | Corridas, chefes, melhorias, suporte, evolução, defesa, arte e modo Bonk; motor puro e apresentação têm responsabilidades diferentes. |
| Dados e backup | `src/cache/`, `src/app/backup.ts`, stores em `src/app/` | Estado local, cartas, arquivos e formatos antigos; a restauração completa substitui as chaves atuais, enquanto backups antigos sem coleção preservam a coleção local. Validar falhas e compatibilidade antes de alterar esse contrato. |
| Publicação | `vite.config.ts`, `config/`, `scripts/`, `.github/workflows/` | Base do Pages, PWA, dados estáticos, verificações e deploy pelo GitHub. |

### História e encontros lendários

- `legendary-stories.ts` reúne os roteiros e seus capítulos, títulos, pistas, espécies e regiões. Os identificadores são usados pelo progresso e pelo diário; não devem ser renomeados sem migração.
- `legendary-places.ts` guarda os pontos do mapa e a distribuição da primeira pista; `legendary-stories.ts` continua reexportando a API anterior para não quebrar quem a utiliza. A separação não altera os textos nem os pontos.
- `legendary-unlock.ts` determina as regiões liberadas pela Liga; `legendary-investigation.ts` trata as duas pistas, encontros compartilhados e páginas do diário; `legendary.ts` mantém estado, histórico e efeitos.
- `VillageView.vue` coordena a interface e as cenas. Os testes de investigação cobrem as 94 histórias, incluindo as duas pistas e a persistência da etapa. Isso não equivale a assistir a todas as cenas ou validá-las em celular.

### Cuidados para próximas extrações

Mover uma responsabilidade com seus tipos e manter as exportações usadas por outros módulos; comparar dados e textos antes e depois; preservar chaves de armazenamento, caminhos de assets, créditos e compatibilidade dos saves. Arquivo grande, roteiro antigo ou código de migração não são evidência de que algo pode ser apagado. Antes de retirar qualquer trecho, confirmar usos, testes e necessidade de compatibilidade.
