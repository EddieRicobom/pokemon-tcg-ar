# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não tem versões publicadas: tudo está em "Não lançado", agrupado por tema, do mais recente para o mais antigo. Nada abaixo foi validado em celular real (ver [docs/TESTE_NO_CELULAR.md](docs/TESTE_NO_CELULAR.md)).

## [Não lançado]

### Biomas mecânicos na Torre (2026-10-19)

- Kanto, Hoenn e Sinnoh ganharam zonas ambientais visíveis e determinísticas: folhagem desacelera o passo e projéteis, poças desaceleram e amplificam golpes Elétricos, e neve reduz mais a velocidade.
- As zonas têm marcação visual no canvas e nome no HUD; as outras seis regiões continuam decorativas até receberem regras próprias.
- O motor calcula os efeitos fora da interface, mantém a arena sem bloqueios e ganhou testes de integração para movimento e dano ambiental.
- A Torre ganhou pausa explícita: relógio, inimigos, projéteis e efeitos ficam congelados até a pessoa tocar em “Retomar”.

### Treinadores animados, carregamento e confiabilidade (2026-10-18)

- Folhas PNG novas dos treinadores na Vila, com quatro direções, caminhada e repouso; preparo com pés alinhados e verificação dos arquivos no CI.
- Telas carregadas ao abrir, com aviso de carregamento e recuperação de falha; permissão dos sensores separada do renderizador para preservar o gesto no iOS sem baixar Three.js no scanner inicial.
- Carteira recusa valores inválidos e confirma operações persistidas; cache de batalha rejeita dados incompletos; TCGdex tem prazo por tentativa e respeita os dois formatos de Retry-After.
- Folhas e conversa com foco por teclado, Escape e retorno do foco; falhas na instalação do PWA ganham uma mensagem de recuperação.
- Documentação revisada pelo código atual; verificações externas e e2e também cobrem branches Codex.

### Câmera em tela cheia e rastreio que larga a carta perdida (2026-10-14)

- Escanear, Várias, Caixa e o teste do renderizador (Diagnóstico): com a câmera ligada a imagem cobre a tela e tudo que ficava embaixo (etapas, estado do rastreio, resultado, erros, busca à mão, ajustes, equipe, resumo da batalha) passou para avisos no topo e folhas sobre a imagem. Não é mais preciso rolar a página.
- Rastreio: poses repetidas pelo MindAR depois de perder a carta (até 90 leituras) deixam de manter o Pokémon na tela; ele some em poucos segundos e volta na hora ao achar a carta. No teste com câmera falsa: ~3,5 s contra ~16 s.
- Câmera em 1280×720 com foco, exposição e balanço de branco contínuos onde o aparelho permite; renderizador limitado a 1,5× de densidade de pixels.

### Sons da batalha (2026-10-14)

- Sons sintetizados na hora (WebAudio, sem arquivos) para a batalha: carga, lançamento, impacto com timbre próprio para cada um dos 18 tipos, crítico, super efetivo, defesa, erro, imunidade, condições, nocaute e uma fanfarra do Pokémon vencedor que muda com a personalidade. Opção "Som da batalha" ligado/desligado em "Suavizar".

### Luz difícil no scan e leveza do rastreador (2026-10-14)

- Normalização de contraste local do quadro da câmera (ideia do Momentoos): em meia resolução, 1 quadro normalizado a cada 3, com volta ao quadro cru se falhar. Medido em Chromium sem GPU: ~6–8 leituras/s (a primeira versão, 1 a cada 2 quadros em resolução cheia, caía para ~4).
- Alvo de rastreamento compilado em cinza de luminância, o mesmo critério da câmera. `TARGET_VERSION` 3: cartas guardadas recompilam o alvo uma vez.

### Luz dos golpes e interface da batalha (2026-10-14)

- Luzes dos golpes (carga, projétil, impacto, defesa, vencedor) que iluminam os sprites por shader, o chão (poças de luz) e o vídeo (clarão colorido). A luz real da sala ajusta de leve brilho e tom dos Pokémon. Opção "Luz dos golpes" ligada/desligada.
- O escurecimento de cinema agora afeta só o vídeo (antes apagava os sprites junto).
- Batalhar entra em tela cheia; o resumo virou o botão "Resumo" dentro do visor; destaque de quem age; indicador de rodada; banner compacto.

### Batalha (2026-10-13/14)

- Batalha automática na Caixa (tipos, atributos, golpes da carta e do jogo, efetividade, críticos), depois com personalidades (agressivo, defensivo, veloz, equilibrado), defesa, condições (queimadura, veneno, paralisia, congelamento) e golpes encenados por tipo.
- Arena pequena à frente do olhar, câmera lenta, tremor, avisos grandes e botão "Centrar".

### Imagem e Caixa (2026-10-13)

- **Removido:** filtros de imagem (cor, câmera, contorno). **Adicionado:** quatro modos de suavização dos pixels dos GIFs (Nítido, Bordas suaves, Suave, Macio).
- Caixa: Pokémon soltos no chão, com giroscópio; equipe de até 6; formação; tela cheia com botões sobre a câmera.
- Aba **Várias**: rastreia até 4 cartas ao mesmo tempo. Corrigido o Pokémon que ficava parado depois de a carta sair.
- Giroscópio no AR e na Caixa: pose presa ao mundo entre as leituras do rastreador, suavização adaptativa.
- Interface nova (abas na base, tipografia, Pokébola, contorno holográfico no rastreamento).
- Painel de status no chão (tipo, atributos, ataques da carta, golpes do jogo), ajuste do Pokémon com os dedos e toque nos golpes.

### AR e rastreamento (2026-10-12/13)

- Rastreamento mais firme: janela de busca maior, pose suavizada, tolerâncias do MindAR, rastreador lendo cópia reduzida do vídeo (640 px).
- Estados explícitos do AR, erro com recuperação, alvo de alta resolução versionado e busca manual da carta (nome/número) como plano B.
- GIF: espelho do jsDelivr quando o `raw.githubusercontent.com` falha; fundo transparente e ampliação Scale2x.
- Corrigido o erro de WebGL em celulares Android (`Cannot read properties of null (reading 'precision')`).

### Reconhecimento (2026-10-11/13)

- Detecção do contorno por bordas, máscara de primeiro plano e retas (Hough); endireitamento 630×880; OCR da faixa inferior (segunda tentativa nas metades) e do nome; fusão de evidências e confirmação em vários quadros; cache de cartas no aparelho.
- Índice estático do catálogo gerado no deploy; índice de ilustrações opcional como reserva automática.
- Corrigido o filtro rígido por total da coleção, que descartava a carta quando o OCR errava um dígito; o regex do OCR aceita `\` e `|` como separadores.
- Telas Escanear, Cartas e Diagnóstico; testes com fotos reais; teste de ponta a ponta com câmera falsa (Playwright) e verificação do `dist/`.
- Sprites: o módulo do Showdown foi removido; os GIFs vêm do PokeAPI/sprites pelo número da Pokédex, com PNG estático de reserva.

### Fundação (2026-10-10)

- Vue 3, TypeScript, Vite 8, `vite-plugin-pwa`, Three.js; PWA em pt-BR com base path do GitHub Pages.
- Diagnóstico do aparelho, câmera traseira com erros em português, decodificação de GIF com transparência.
- Workflows de CI e deploy no GitHub Pages; documentação e análise do pokeum.

### Não verificado

- Câmera, GPU, sensores, desempenho e a aparência dos efeitos em **celular real**.
- Taxa de acerto do reconhecimento com a câmera de um celular.
- O job `e2e.yml` está falhando em parte dos casos (CORS ao buscar imagens do TCGdex de `localhost`; worker do OCR); não é obrigatório no CI.
