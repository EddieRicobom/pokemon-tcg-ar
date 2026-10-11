# Arquitetura

## Visão geral

Tudo roda no navegador do usuário. O GitHub Pages só entrega arquivos estáticos; o GitHub Actions prepara os dados em tempo de build.

```
GitHub Actions (build/CI)                 Navegador do usuário (PWA)
──────────────────────────                ───────────────────────────────────────────
Python: catálogo → índice estático ─┐     câmera → detecção da carta → retificação
npm: typecheck, testes, build       ├──►  → hash/embedding → busca no índice
                                    │     → espécie → GIF do Showdown
GitHub Pages (arquivos estáticos) ◄─┘     → pose da carta → Three.js desenha o GIF
```

Hoje (Fase 0) só existem as pontas: câmera, diagnóstico e desenho do GIF com transparência. Detecção, reconhecimento, índice e pose são as fases 2 a 5 de `IMPLEMENTATION_PLAN.md`.

## Módulos atuais

| Caminho | Responsabilidade |
| --- | --- |
| `config/base-path.ts` | Normaliza `BASE_PATH` (barras inicial e final). Usado por `vite.config.ts`. |
| `src/core/capabilities.ts` | Detecta HTTPS, câmera, WebGL2, Service Worker e modo instalado. A leitura do navegador é separada da avaliação para permitir teste. |
| `src/core/camera.ts` | Abre a câmera traseira (`facingMode: environment`, sem áudio) e traduz erros de `getUserMedia` para mensagens em português. |
| `src/core/showdown.ts` | Monta URLs de GIFs do Showdown (identificador no estilo do Showdown, formas e variantes). |
| `src/core/gif.ts` | Decodifica GIF com `gifuct-js`, compõe quadros parciais respeitando o método de descarte, escolhe o quadro pelo tempo e traduz erros. |
| `src/ar/overlay.ts` | Renderizador Three.js transparente: câmera ortográfica, plano com `DataTexture` e `alphaTest` (transparência binária do GIF). Carregado por `import()` dinâmico. |
| `src/components/`, `src/App.vue` | Interface em português: diagnóstico, estado do projeto, câmera e teste do renderizador. |

### Decisões de implementação

- **`DataTexture` em vez de `CanvasTexture`.** Os quadros já são compostos em RGBA na CPU e enviados direto à textura, sem passar por canvas 2D.
- **`alphaTest` em vez de mistura (blending).** GIF tem transparência de 1 bit; `alphaTest: 0.5` evita halos e problemas de ordenação.
- **`NearestFilter`.** Mantém o pixel art nítido.
- **Quadros pré-compostos.** A memória cresce com `quadros × largura × altura × 4`; aceitável para sprites pequenos e a verificar com sprites grandes (Fase 1).
- **Three.js em chunk separado.** O carregamento inicial fica em torno de 84 kB (33 kB com gzip); o chunk do Three.js (cerca de 524 kB, 130 kB com gzip) só é baixado quando o usuário testa o renderizador.

## Decisão: biblioteca de AR/visão

O pedido inicial sugeria "uma biblioteca de AR adequada para navegador". Avaliação:

- **AR.js e MindAR** rastreiam marcadores ou imagens-alvo pré-compiladas. Cada carta seria um alvo para compilar e carregar, o que não escala para cerca de 20 mil cartas e não resolve a identificação, só o rastreamento.
- **O problema real é identificar a carta e depois rastreá-la.** Isso é detecção de quadrilátero + retificação + busca por similaridade, como no pokeum; o rastreamento reaproveita o mesmo quadrilátero.
- **Candidatos para a Fase 3:** OpenCV.js (contornos, homografia, correção de perspectiva; custo: tamanho do binário WASM) ou uma implementação própria enxuta em TypeScript. A escolha será feita com medição de tamanho e taxa de quadros em aparelho real.
- **Three.js continua sendo o renderizador** em qualquer cenário.

Nesta fase, portanto, nenhuma biblioteca de AR foi adicionada. Isso é um desvio consciente do pedido inicial e está registrado como decisão em aberto no plano.

## Análise do projeto de referência: pokeum

Repositório: <https://github.com/TBLgGamin/pokeum> (licença MIT, segundo o README).

**Limite desta análise:** o que segue vem do README. Os arquivos de código e a documentação interna (`openwiki/`, `app/`, `frontend/`) não puderam ser lidos: algumas páginas bloqueiam leitura automatizada por robots.txt e uma teve erro de servidor. Parâmetros concretos (limiares, pesos de fusão, formato dos arquivos de índice) **não foram verificados** e precisam ser definidos por medição neste projeto.

### Como o pokeum reconhece cartas (segundo o README)

1. Detecta o contorno da carta (OpenCV).
2. Corrige a perspectiva para uma imagem plana de 630×880.
3. Roda quatro sinais: hashes perceptuais, embeddings de um codificador (DINOv2-small ajustado, exportado para ONNX), OCR da faixa inferior (número e código do set) e comparação do símbolo do set.
4. Funde os sinais em uma lista ranqueada ponderada; o OCR reforça cartas com o número impresso, mas não é filtro rígido.
5. Decide: se confiante, confere a variante; se houver dúvida, devolve o melhor palpite e as alternativas.

O reconhecimento é busca pelo vizinho mais próximo em um índice, não um classificador treinado por set. Set novo exige apenas sincronizar e reindexar.

### O que vale reaproveitar

| Técnica | Por que vale | Adaptação aqui |
| --- | --- | --- |
| Retificar a carta para uma imagem canônica 630×880 | Dá entrada estável a todos os sinais e define a proporção da carta (63×88 mm) para a pose | Fase 3, no navegador |
| Hash perceptual como primeiro sinal | Barato, roda no navegador, índice minúsculo | Fase 4. Estimativa: 20 mil cartas × 8 bytes ≈ 160 kB por hash de 64 bits |
| Busca por vizinho mais próximo em índice pré-computado | Sem treino por set; atualizar o catálogo é reindexar | Índice gerado no CI e publicado no Pages |
| Embeddings de codificador congelado, para reflexo e ângulo | Robusto onde o hash falha | Fase 4, só se o hash não bastar. Estimativa: 384 dimensões em int8 ≈ 7,7 MB para 20 mil cartas; modelo do porte do DINOv2-small tem dezenas de MB (a medir, com quantização) |
| OCR do número como reforço, nunca filtro | Desempata cartas parecidas sem derrubar acertos quando o OCR erra | Opcional na Fase 4; avaliar custo de um OCR no navegador |
| Fusão ponderada + palpite com alternativas | Honestidade sobre a confiança, alinhada à regra de não fingir reconhecimento | Interface mostra confiança e alternativas |
| Índice gerado a partir de uma fonte pública de catálogo (TCGdex) | Mesmo fluxo de "sincronizar e indexar" | Python no GitHub Actions |
| Guia de enquadramento na câmera | Facilita a captura | Interface |
| Dados no aparelho e cache de arte para uso offline | Combina com PWA | Fase 6 |

### O que não copiar

- O servidor FastAPI, o SQLite, o ONNX Runtime em CPU no servidor e o RapidOCR no servidor. Este projeto não tem backend.
- Os cerca de 165 MB de artefatos de produção do pokeum (banco, índice, símbolos e modelo) servidos por uma API. Aqui o índice precisa ser pequeno e estático.
- O fluxo de autoimplantação do pokeum.
- O treino do codificador com distorções sintéticas: só reconsiderar se o codificador congelado não bastar, e fora do CI gratuito se for pesado.

### Riscos de adaptar ao navegador

- Os números de tamanho acima são estimativas aritméticas e não medições.
- OCR e embeddings no celular podem ser lentos ou pesados; precisam de medição de latência e bateria.
- Rastrear a carta em tempo real exige detecção barata a cada quadro; a identificação pode rodar com menos frequência e ser reaproveitada enquanto o rastreamento mantiver a carta.

## Infraestrutura

- GitHub Pages serve `dist/` (artefato enviado por `actions/upload-pages-artifact` e publicado por `actions/deploy-pages`).
- `ci.yml` roda em pull requests e na `main`: `npm ci`, `typecheck`, `test`, `build` e conferência do base path no manifest.
- `deploy.yml` roda na `main`: repete tipos, testes e build, e publica.
- Passo manual único: **Settings → Pages → Source: GitHub Actions**.
- Versões das actions verificadas na data da entrega: `checkout` v7, `setup-node` v7, `configure-pages` v6, `upload-pages-artifact` v5, `deploy-pages` v5.
