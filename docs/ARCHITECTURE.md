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


## Busca pela ilustração (reserva automática)

Um índice estático (`public/data/art-index.json` + `art-index.bin`, 112 bytes por carta) é gerado no deploy por
`scripts/build-art-index.ts`: baixa a imagem `low.webp` de cada carta no TCGdex, calcula as mesmas características do app
(`computeFeatures`: dHash da carta e da arte, grade de cor) e grava o resultado. O celular só baixa esse índice (alguns MB, só
quando a opção está ligada); nunca as imagens. Com a opção ligada, o pipeline soma as 5 cartas de aparência mais parecida às
candidatas do OCR e confirma comparando com a imagem de referência real. Impressões com a mesma arte continuam ambíguas.
A geração é incremental (`actions/cache`) e limitada por tempo (`ART_BUDGET_MIN`); o app usa o que estiver no índice.
Precisão **não medida** com fotos reais.


> Atualização (out/2026): a busca pela ilustração agora está **ligada por padrão** e só é consultada quando o texto não bastou
> (número com total não lido ou nenhuma candidata). Pode ser desligada na tela Escanear.

## Detecção da carta (`src/recognition/detect-card.ts`, `quad-lines.ts`)

Três estratégias dão candidatas a quadrilátero, todas avaliadas pela mesma pontuação (`candidateScore`: área × apoio de borda nos 4 lados × proporção de carta 0,716):

1. contornos de bordas (Sobel);
2. máscara de primeiro plano em vários limiares (Otsu e frações), com fechamento e preenchimento de buracos;
3. **retas**: gradiente de cor + transformada de Hough + pares de retas quase paralelas/perpendiculares, com ajuste por mínimos quadrados.

Motivo: com a foto real de um celular (carta amarela num protetor sobre parede cinza), só a ilustração era achada (24% do quadro, proporção 0,86); a carta saía girada e o OCR lia o topo. Fixture e testes: `src/recognition/real-photos.test.ts`.

## OCR e velocidade

Ordem: faixa de baixo na orientação detectada → mesma faixa girada 180° → metades esquerda/direita (só se nada achou número e total) → nome. Cada passada do Tesseract custa segundos no celular, por isso nenhuma é repetida.

## AR

`ScanView` → `prepareArAssets` (`src/app/ar-prepare.ts`) → `startAr`. Etapas visíveis (`src/app/ar-stages.ts`): carta selecionada → dados/referência → alvo compilado → motor iniciado → procurando → rastreada → Pokémon exibido; qualquer erro termina em estado `error` com ações de recuperação.

- Alvo `.mind`: compilado no aparelho a partir da imagem `high` do TCGdex (600 px). `TARGET_VERSION` (em `src/ar/target.ts`) entra na chave do alvo no cache; versão diferente = descartado e recompilado. Compilação tem limite de 120 s.
- Rastreador (`mindar-engine.ts`): lê um canvas reduzido (`frame-relay.ts`, máx. 640 px), não o `<video>` direto.
- Sprite (`card-sprite.ts`): em pé (90° da carta) e girado em torno da normal da carta para ficar de frente para a câmera (`faceCamera`).
- Suavização dos pixels do GIF (`src/core/pixel-upscale.ts`, `SmoothingMode`, escolhida em "Suavizar" e compartilhada por Escanear, Várias e Caixa): os GIFs do Showdown são pequenos (~50–150 px) e, com filtro "vizinho mais próximo", aparecem em degraus grandes. Quatro modos: **Nítido** (pixels originais, sem ampliar, filtro de vizinho mais próximo), **Bordas suaves** (padrão: Scale2x ×4/×2, que alisa as diagonais sem borrar, mais filtro bilinear na GPU), **Suave** (bordas suaves + um passo de desfoque bilateral 3×3, que alisa degraus sem misturar cores muito diferentes, + um passo de desfoque do alfa, que arredonda a silhueta) e **Macio** (dois passos de cada, desfoque mais forte). As bordas transparentes recebem a cor do vizinho opaco antes do desfoque (sem contorno escuro) e a transparência continua por `alphaTest` (corte em 50 %). Tudo roda na CPU, uma vez por quadro, e os quadros prontos ficam em cache (até 32 MB por carta no AR, 6 MB por Pokémon na Caixa). Layouts antigos com `smooth: false` viram "Nítido".
- Pose: a pose do rastreador é suavizada a cada quadro de tela (`POSE_SMOOTHING_MS`); a última pose é mantida por 1 s quando a carta some.
- Painel de status no chão (`src/ar/stats-panel.ts`, `stats-draw.ts`, `panel-state.ts`): plano deitado no plano da carta, logo abaixo da borda inferior, filho do grupo da carta (segue a pose e some junto). A textura é um canvas 2D (512×384) redesenhado a ~20 quadros/s só enquanto a carta está visível. Três páginas que alternam sozinhas ou por botão: Status (tipo + 6 atributos-base em barras animadas), Ataques da carta, Golpes do jogo.
- Dados do painel (`src/core/pokemon-data.ts`, `src/app/pokemon-data-service.ts`): três fontes carregadas **em paralelo** e independentes: PokéAPI `/pokemon/{dexId}` (tipos e atributos), PokéAPI `/move/{id}` dos golpes escolhidos e TCGdex `/cards/{id}` (PS, ataques, fraqueza, recuo). Cada parte vira `loading`, `ok` ou `error`; uma falha não derruba as outras. Os resultados ficam em `localStorage` (`tcg-ar-profile-v1`, `tcg-ar-moves-v1`, `tcg-ar-card-battle-v1`), então a segunda vez funciona sem rede. Nada é inventado: sem dado, o painel diz que não há.
- Golpes do jogo: a PokéAPI não tem "conjunto padrão"; usamos uma heurística documentada em `pickLevelUpMoves` (os 4 golpes por nível mais altos, até o nível 50, da geração mais nova em que o Pokémon aprende golpes por nível; Legends: Arceus fica de fora). Nomes em pt-BR quando a PokéAPI tem, senão em inglês. Os nomes dos ataques da carta vêm do TCGdex em inglês (idioma do catálogo).
- Escala das barras: valor-base 200 enche a barra (`STAT_BAR_MAX`); o máximo real do jogo é 255.
- Ideia de longo prazo do projeto (escanear várias cartas para montar uma equipe e batalhar em um action RPG): estes dados (tipos, atributos-base, golpes com poder/precisão/PP) são a base natural para esse sistema; ele ainda não existe.
- Posição do painel: `panelPlacement` (`src/ar/anchor.ts`) coloca o painel deitado no chão da carta, à frente dos pés do Pokémon (no lado para onde ele olha), girado junto com ele; a largura é proporcional à altura do sprite (painel e Pokémon crescem juntos). A origem do ajuste é o centro da ilustração, no chão sob ela (`SpriteLayout.offsetX/offsetY`).
- Ajuste com os dedos (`src/ar/gestures.ts`, `ScanView`): botão "Ajustar com os dedos"; um dedo arrasta (o ponto do chão da carta sob o dedo continua sob o dedo, via `ArSession.pointOnCardPlane`, que lança um raio da câmera virtual até o plano da carta), pinça muda o tamanho (`heightRatio`). Salvo em `localStorage` (`tcg-ar-layout-v2`).
- Toque no painel (`ArSession.pickPanel` + `hitTestPanel`): raio da câmera → UV do plano → pixel do canvas → linha de ataque/golpe ou ponto de página. Tocar num ataque/golpe mostra o brilho na linha e a mensagem de que usar golpes ainda não está implementado (nada é simulado); os pontos do rodapé trocam de página.

## Caixa (`src/box/`, `src/views/CaixaView.vue`)

Tela "Caixa": todos os Pokémon das cartas já guardadas no aparelho (até 30, as mais recentes primeiro) passeiam soltos num quadrado do chão, vistos pela câmera traseira. **Não é AR com rastreamento do ambiente**: não há SLAM no navegador, então a Caixa usa só 3 graus de liberdade.

- Orientação (`orientation.ts`, `orientation-source.ts`): `deviceorientation` (alpha/beta/gamma + giro da tela) vira o quaternion da câmera virtual, com a conta padrão do Three.js. No Android/Chrome o evento já é entregue sem pedir permissão; no iOS `requestPermission` é chamado dentro do clique do botão. Se nenhum evento chegar em 1,5 s (computador, sensor bloqueado), entra o modo manual: arrastar a imagem gira a visão (arrastar para cima olha para baixo, como "agarrar o mundo").
- Chão "semi-automático" (`floor.ts`): os sensores dizem onde é "para baixo"; o usuário aponta e toca (ou usa a mira central). O raio da câmera encontra um plano horizontal `altura do celular` abaixo dela (padrão 1,3 m, ajustável de 0,7 a 2,2 m). Raios acima do horizonte ou quase horizontais são recusados com mensagem em português.
- Cena (`box-scene.ts`, `creature.ts`, `wander.ts`): a câmera fica na origem e só gira; o centro da caixa é o ponto do chão escolhido. Cada Pokémon é um plano em pé (billboard em torno do eixo vertical, inclinado parcialmente para a câmera quando ela está acima), com sombra e pulinho ao andar; o GIF anima quadro a quadro com o mesmo filtro Scale2x (limitado a ×2). O passeio (`wander.ts`) é puro e testado: anda até um destino sorteado, para, sorteia outro, nunca sai da caixa e se afasta dos vizinhos.
- Campo de visão: o vídeo é exibido em "cover"; `visibleVerticalFov` desconta o corte para a caixa casar com a imagem. O campo vertical do vídeo é estimado (63°) e tem controle na tela.
- Dados (`load-creatures.ts`): lê o cache de cartas, decodifica o GIF (ou PNG de reserva) de cada carta com sprite. Uma carta com defeito entra na lista de falhas e não impede as outras.
- Limitações honestas: a caixa acompanha o **giro** do celular, mas não a **caminhada** (sem paralaxe: ao andar, ela parece deslizar); a altura do celular e o campo de visão são estimativas; nada disso foi validado em aparelho real. Golpes e batalha continuam não implementados.

### Equipe, tela cheia e suavização

- **Equipe da Caixa** (`src/app/team.ts`, `team-store.ts`, `components/TeamPicker.vue`): até 6 cartas escolhidas entre as guardadas (Cartas → "Pôr na equipe", ou o seletor dentro da Caixa). Fica em `localStorage` (`tcg-ar-team-v1`). Sem escolha, vale a equipe **automática**: as 6 cartas mais recentes que têm sprite; a interface avisa quando é automática. Cartas removidas do cache saem da equipe sozinhas (`sanitizeTeam`).
- **Tela cheia** (`src/app/fullscreen.ts`): Fullscreen API no visor da câmera; onde não existe (iPhone) cai numa tela cheia por CSS (`.pseudo-full`). Os botões ficam **sobre a câmera** (`StageButton`, barra `.stage-bar`), então funcionam em tela cheia. Os redimensionamentos já eram tratados por `ResizeObserver`.
- **Suavização** (`src/app/visual-settings.ts`, `components/SmoothingSheet.vue`): a escolha do modo é salva em `tcg-ar-visual-v2`. Os antigos filtros de imagem da câmera, cor e contorno do Pokémon foram removidos. Na tela Cartas há busca, filtro por situação, "só a equipe", ordem e modo lista/grade.
- **Formação** (`src/box/formation.ts`): na Caixa, o botão "Formação" põe a equipe em fila de frente para a câmera (para ver todos de uma vez); "Passeio" volta ao vagar livre.

### Várias cartas ao mesmo tempo (aba "Várias")

- **Rastreamento** (`src/ar/multi-session.ts`, `start-multi.ts`, `mindar-engine.ts`, `target.ts`): o `Controller` do MindAR aceita um único arquivo `.mind`, mas ele pode ter vários alvos. `mergeTargets` junta os alvos já compilados e guardados de cada carta (`CompilerBase.importData/exportData`; o índice do alvo é a posição da carta na lista) e `maxTrack` (4) deixa o rastreador acompanhar várias ao mesmo tempo. Cada atualização traz `targetIndex`, e cada carta tem o seu `CardSprite`, o seu tamanho de marcador (`TrackingInfo.markers`) e a sua pose presa ao mundo pelo giroscópio, como na sessão de uma carta. Sem painel de status.
- **Quais cartas**: a equipe (a mesma da Caixa, até 6; o rastreador acompanha até 4 por vez). As cartas são reconhecidas pela **imagem guardada** da carta (rastreamento por pontos de imagem), não por leitura de texto. `prepareMultiAssets` prepara uma de cada vez (compilar alvo é pesado) e uma que falha vira aviso sem impedir as outras.
- **Perda de carta** (também corrigido na sessão de uma carta): o MindAR repete a última pose enquanto não vê a carta e manda **uma única** pose nula quando desiste (`missTolerance`). O tempo de segurar o Pokémon conta a partir desse aviso e é conferido a cada quadro de tela; antes, o Pokémon podia ficar parado na última posição depois de a carta sair.
- **Memória**: cada Pokémon guarda no máximo 10 MB de quadros ampliados nesta aba (32 MB na aba de uma carta).
- **Limites**: o custo cresce com o número de alvos (a busca compara contra todos os alvos ainda não rastreados); no navegador de teste (GL por software) duas cartas deram ~20–25 leituras/s, mas em celular de entrada o desempenho não foi medido. Cartas que se sobrepõem ou ficam muito inclinadas perdem o rastreamento como no caso de uma só.

### Batalha automática na Caixa

- **Motor** (`src/core/battle.ts`, puro e determinístico com `seededRng`): nível 50; PS = ⌊(2·base+31)·50/100⌋+60 e demais atributos = ⌊(2·base+31)·50/100⌋+5, com os atributos-base da PokéAPI. Dano = `((2·50/5+2)·poder·A/D/50+2)` × STAB (1,5) × efetividade da tabela de tipos de 18 tipos (multiplica os dois tipos do defensor; 0, ¼, ½, 1, 2, 4) × crítico (1/16, ×1,5) × sorteio 0,85–1. Golpe físico usa Ataque/Defesa; especial usa Atq. Esp./Def. Esp. Precisão sorteada. Todos contra todos: a cada rodada, maior Velocidade age primeiro; cada um sorteia um alvo vivo e um golpe; no máximo 60 rodadas (se estourar, vence o maior PS proporcional). Com 2 Pokémon vira um duelo.
- **Golpes sorteados**: ataques impressos na carta (TCGdex; o poder é derivado do dano impresso: `25 + 0,9·dano`, entre 30 e 150; o tipo vem da primeira energia colorida do custo, senão do tipo da carta) **mais** os golpes do jogo com poder (PokéAPI, os mesmos do painel de AR). Golpe de status e ataque da carta sem dano numérico ficam de fora. Sem nenhum golpe usa "Investida" (normal, poder 40).
- **Dados que faltam** (`src/app/battle-setup.ts`): os dados de cada Pokémon carregam em paralelo e independentes, com tempo limite de 9 s. O que não chegar vira valor neutro (base 70, tipo da carta ou Normal) e a tela de resultado lista, por Pokémon, o que foi substituído. Nada é inventado em silêncio.
- **Personalidade** (`personalityOf`): derivada dos atributos, sem sorteio. `agressivo` (ataque bem acima da resistência), `defensivo` (o inverso), `veloz` (Velocidade ≥ 1,15× o ataque e a resistência) ou `equilibrado`. Muda a decisão (alvo e golpe) e o ritmo/pose na encenação: o agressivo prefere o alvo que pode derrubar e o golpe de maior dano esperado, e cobra vingança de quem acabou de bater nele; o defensivo se protege mais; o veloz ataca com menos preparo.
- **Defesa e condições**: com menos de 45 % de PS o Pokémon pode se defender (o próximo golpe causa metade; nunca duas vezes seguidas). Golpes de certos tipos causam queimadura (fogo 15 %), veneno (25 %), paralisia (elétrico 20 %; 25 % de perder o turno e Velocidade ×0,5) ou congelamento (gelo 12 %; 30 % de descongelar por turno), respeitando imunidades de tipo. Queimadura corta o dano físico pela metade; queimadura (1/16) e veneno (1/8) tiram PS no fim da rodada, sem derrubar (deixam ao menos 1 PS). Cada evento é um `BattleTurn` com `kind` (`attack`, `guard`, `skip`, `residual`). `summarizeBattle` resume dano, nocautes, críticos e o destaque da luta.
- **Direção** (`src/box/battle-director.ts`, `effects.ts`): a batalha é simulada inteira antes e depois **encenada**. Golpe físico é corpo a corpo e a variante depende do tipo (`PHYSICAL_STYLE`: investida, três socos, mergulho, pisão com onda no chão ou cortes); golpe especial é à distância (`SPECIAL_DELIVERY`: bola, raio que treme, jato, enxame, feixe ou tremor). O impacto tem partículas, anel de choque, extras por tipo (`IMPACT_STYLES`: brasas, gotas, faíscas, folhas, estilhaços…), empurrão proporcional ao dano, clarão na tela (crítico, elétrico, dragão, 4×) e piscada na cor do tipo. Defesa mostra um escudo; paralisia, congelamento, queimadura e veneno têm cor e partículas contínuas. Parado, cada personalidade se mexe de um jeito, quem tem poucos PS treme, e o vencedor comemora conforme a personalidade. Avisos: "Vingança!", "Bloqueou parte!", "Descongelou!", nome da condição, "Errou!", "Golpe crítico!", efetividade e desmaio. Texto e barras são HTML sobre a câmera (`BattleHud`, projetados da cena); o 3D só faz movimento e partículas. `BoxCreature.fx` carrega os efeitos por cima da animação normal.
- **Arena pequena na frente do olhar** (`src/box/arena.ts`, `BoxScene.startBattle`): a batalha não acontece mais na caixa grande. Ao começar, os Pokémon passam para uma raiz (`battleRoot`) posta no chão onde o centro da tela encontra o chão (distância limitada a 0,9–1,7 m), girada para o eixo x acompanhar a direita da tela e **encolhida** (`arenaFrame`) para a arena ocupar cerca de 70 % da largura visível. Os lutadores ficam numa elipse mais larga que funda, de frente para a tela (2 Pokémon: um de cada lado), então nada fica escondido atrás de outro nem exige virar o celular. Tudo da batalha (Pokémon, partículas, anéis, raios, escudos) mora dentro da raiz, então encolhe junto. "Centrar" (`recenterBattle`) traz a arena de volta para onde o celular aponta agora; "Parar" devolve os Pokémon ao passeio na caixa.
- **Cinema** (`BattleDirector`): borda da arena que acende na cor do golpe; escurecer a câmera durante o golpe (`hud.dim`); parada de quadro nos golpes fortes e câmera lenta no nocaute e na vitória (o tempo da batalha é escalado, o relógio real continua); tremor e "soco" de zoom da imagem desenhada (`hud.shake`, aplicado ao canvas, não ao vídeo); avisos grandes no meio da tela ("Já!", "Crítico!", "Super efetivo!", "Nocaute!", "Vitória!"); números de dano com tamanho proporcional ao estrago; refletor e ondas de luz no vencedor. Barras e avisos ficam presos a uma faixa da tela para não cortar na borda; com mais de 4 lutadores as barras ficam compactas.
- **Limites**: é uma batalha de exibição entre cartas escaneadas, não o RPG de ação planejado; sem itens, habilidades nem trocas. As regras são uma simplificação das dos jogos. Efeitos validados só no Chromium com câmera falsa (renderização por software), não em aparelho real.

### Giroscópio e suavização (tracking mais fluido)

- **Fonte de sensores** (`src/sensors/orientation-feed.ts`): uma só para o AR da carta e a Caixa. Prefere o `RelativeOrientationSensor` (Generic Sensor API, Chrome/Android, 60 Hz, sem bússola e sem os saltos magnéticos) e cai no evento `deviceorientation`. A conversão do quaternion do sensor para a câmera do Three.js é testada contra a conta do evento W3C. Guarda 1,5 s de histórico com a hora de cada amostra (`at(t)` interpola), para consultar a orientação **no instante** do quadro.
- **Pose presa ao mundo** (`CardSprite.setCardMatrix` com orientação + `setViewOrientation`, `ArSession`): a pose do rastreador (câmera → carta) é convertida para o mundo pela orientação da câmera no instante da captura do quadro (`TrackingUpdate.capturedAt`, medido com `requestVideoFrameCallback.captureTime` e a hora do `inputLoader.loadInput` do MindAR). A cada quadro de tela, a pose suavizada volta para a câmera pela orientação de "agora − atraso da imagem" (padrão 70 ms, ajustável). Resultado: girar o celular move o Pokémon na hora, sem esperar a próxima leitura do rastreador (10–20/s), e uma perda curta de rastreamento (até 2,5 s com giroscópio) não congela o Pokémon na tela. No harness com câmera falsa o resultado da pose chega 90–200 ms depois da captura, por isso o casamento por instante importa.
- **Suavização adaptativa** (`src/ar/smoothing.ts`): a constante de tempo vai de 100 ms (parado, filtra o tremor) a 25 ms (movendo, não fica para trás), conforme o erro entre a pose desenhada e a medida. Substitui os 60 ms fixos. Na Caixa, `orientationSmoothingAlpha` faz o mesmo com o passo de rotação.
- **Limites**: só rotação (3 graus de liberdade). Andar com o celular continua dependendo do rastreador da carta (e a caixa da Caixa não acompanha a caminhada). O atraso do sensor é uma estimativa; há um controle em Ajustes. Em "Escanear" aparece a taxa de leituras do rastreador e se o giroscópio está corrigindo a pose, para o relato de teste. Nada disso foi validado em aparelho real.
