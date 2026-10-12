# Orientações e TO-DO para Continuidade da IA

Documento de transição e orientações técnicas para o desenvolvimento contínuo do projeto **Pokémon TCG AR**.

---

## 1. Contexto do Projeto e Regras Fundamentais (Ver também `CLAUDE.md`)
- **Objetivo:** PWA em Vue 3 + TypeScript + Three.js + MindAR no GitHub Pages (`https://eddiericobom.github.io/pokemon-tcg-ar/`) que reconhece cartas de Pokémon TCG e renderiza o GIF 2D transparente em Realidade Aumentada sobre a carta física.
- **Regras Imutáveis:**
  - Sem backend ou servidores pagos: somente GitHub Pages e GitHub Actions.
  - O proprietário do projeto **não instala ferramentas nem roda comandos locais** no PC dele (tudo roda no CI do GitHub via workflows `ci.yml` e `deploy.yml`).
  - Trabalhar em branch de tarefa (`claude/...`) e preservar a `main`.

---

## 2. Diagnósticos e Correções Realizadas Nesta Sessão

### A. Erro do WebGL no AR Móvel: `Cannot read properties of null (reading 'precision')`
- **Causa Raiz:** Ocorria no Three.js (`gl.getShaderPrecisionFormat(...)`) em aparelhos Android (ex.: Xiaomi/Redmi com GPU Mali/Adreno). Quando o compilador de alvos do MindAR (`mind-ar/src/image-target/compiler.js`) usava o TensorFlow.js WebGL, os buffers da GPU ficavam retidos. Em seguida, ao instanciar o `WebGLRenderer` do Three.js, o contexto WebGL sofria perda (*context lost*). Adicionalmente, `renderer.forceContextLoss()` em `webgl-backend.ts` invalidava permanentemente o canvas reutilizado no DOM.
- **Correções Aplicadas:**
  - Em `src/ar/webgl-backend.ts`: Removido `forceContextLoss()`. WebGLRenderer configurado com opções seguras para mobile (`precision: 'mediump'`, `antialias: false`, `powerPreference: 'default'`).
  - Em `src/views/ScanView.vue`: Canvas com `:key="arCanvasKey"` (garante recriação de elemento DOM limpo para o WebGL) e pausa de 150ms após a compilação do MindAR para que a GPU e o garbage collector liberem memória antes do Three.js subir.

### B. "Repetindo que não achou apesar de ter lido o número"
- **Causa Raiz:** No arquivo `src/recognition/catalog-index.ts`, o método `candidates()` continha um filtro rígido:
  ```ts
  if (number?.total && number.total.prefix === '') {
    if (set.official !== number.total.value) continue;
  }
  ```
  Se o OCR lesse o número da carta (ex.: `50`), mas o total da coleção sofresse qualquer ruído de leitura (ex.: `50/116` em vez de `114`, ou `14` em vez de `114`), o `continue` descartava a coleção inteira! O app terminava com 0 candidatos e exibia: *"Li o número da carta, mas não achei nenhuma carta com ele no catálogo"*.
- **Correções Aplicadas:**
  - O filtro rígido foi substituído por pontuação de prioridade (`setPrior += 0.4` para match exato com `official` ou `total`; `+0.2` para diferença <= 2 dígitos). A carta com o número lido **nunca mais é descartada**.
  - Em `src/recognition/parse-ocr.ts`, o regex agora aceita variações comuns de OCR como barra invertida (`\`) e pipe (`|`) como separadores numéricos.

### C. Remoção do "Molde Engessado" no Visor
- O usuário pontuou que o reconhecimento não deve ficar travado em um molde rígido onde ele seja obrigado a enquadrar a carta dentro de uma caixa na tela.
- A moldura fixa de guia foi removida do visor em `ScanView.vue`, deixando a câmera livre e fluida.

---

## 3. Próximos Passos (Backlog Prioritário)

### [ ] 1. Reconhecimento de Múltiplas Cartas / Fluxo Contínuo
- **Necessidade do Usuário:** O usuário quer poder passar a câmera por várias cartas na mesa e o sistema ir identificando conforme encontra, ou identificar mais de uma carta.
- **Implementação Sugerida:**
  - Atualmente o `ScanController` interrompe o loop assim que confirma 1 carta e vai para o modo de foco AR.
  - Estudar modo contínuo de escaneamento: listar em tempo real na tela badges/cards flutuantes das cartas detectadas no quadro da câmera.
  - O `detectCard` pode ser expandido para retornar múltiplos quadriláteros plausíveis no mesmo quadro (filtrando componentes conexos distintos).

### [ ] 2. Usar a Ilustração como Gancho Principal (Visual Feature Matching)
- **Necessidade:** O número de coleção no rodapé tem apenas 1 a 2 milímetros de altura e sofre muito com foco macro e reflexos. A ilustração do Pokémon ocupa 45% da carta e é idêntica no mundo todo (PT-BR, EN, JP).
- **Implementação Sugerida:**
  - Já existem `computeFeatures()` com `artHash` (dHash 16x16) e `colorGrid` (4x4 RGB) em `src/recognition/hash.ts`.
  - Criar um índice leve de hashes das ilustrações no build do CI (`build-catalog-index.ts`) ou um índice por conjunto/Pokémon.
  - Ao detectar o contorno da carta, comparar diretamente o `artHash` e a paleta de cor da janela da arte (`ARTWORK_BOX: [0.06, 0.1, 0.94, 0.56]`), permitindo identificar a carta **mesmo se o OCR não conseguir ler o rodapé**.

### [ ] 3. Modo de Cadastro / Pré-load de Cartas
- Permitir que o usuário adicione cartas pelo nome/número na tela "Carregar" sem precisar da câmera, baixando e compilando os alvos com antecedência no aparelho, para que no momento do escaneamento o reconhecimento seja instantâneo via cache local.
