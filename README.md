# Pokémon TCG AR

PWA para celular que reconhece uma carta física de Pokémon TCG pela câmera e mostra o Pokémon como um **GIF animado e transparente, em pé sobre a carta**, em realidade aumentada. Também guarda as cartas lidas, solta a sua equipe num quadrado do chão (a "Caixa") e faz os Pokémon batalharem sozinhos.

Projeto de fã, não oficial. Pokémon e os nomes, imagens e sprites relacionados pertencem aos seus respectivos donos (ver [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). Licença do código: [MIT](LICENSE).

> **Como interpretar as verificações:** testes automatizados e Chromium com câmera falsa cobrem lógica e integração. GL por software não mede fluidez, calor, bateria, câmera ou sensores de um celular. Os limites de cada verificação estão em [docs/TESTING.md](docs/TESTING.md).

## O que o app faz

| Aba | O que faz |
| --- | --- |
| **Escanear** | Lê a carta pela câmera (detecção do contorno, OCR do número e do nome, busca pela ilustração como reserva), identifica a impressão, guarda no aparelho e mostra o Pokémon em pé sobre ela, com um painel de status no chão (tipo, atributos, ataques da carta, golpes do jogo). Há busca manual por nome e ajuste do Pokémon com os dedos. |
| **Várias** | Rastreia até 4 cartas da equipe ao mesmo tempo, cada uma com o seu Pokémon. |
| **Vila** | Modo vida em aba própria: arraste para andar ou toque no destino, converse, colete, plante, cozinhe, decore casas e acompanhe amizades e memórias. Tem Fonte, Fliperama, Arena e Torre de Sobrevivência. O botão **Menu** ou **B** abre as opções. Funciona sem câmera por padrão; o **AR Beta** opcional usa câmera e orientação, sem rastreamento de chão. |
| **Caixa** | Solta a equipe (até 40) num quadrado do chão visto pela câmera, usando o giroscópio. **Batalhar** faz os Pokémon lutarem sozinhos (todos contra todos, em equipes ou 3 contra 3) numa arena pequena com chão em pixel art que os golpes elementais marcam à frente do olhar, com personalidades, defesa, condições, golpes encenados por tipo, luz e sons dos golpes e câmera de cinema. |
| **Pins** | Sem câmera: puxe para trás, solte e derrube os adversários da arena. Jogue contra o computador, com dificuldade à escolha, ou contra um amigo. Peso, atributos, tipos, rebatedores e marcas elementais mudam a física; os golpes das cartas têm recarga. Há repetição da partida e opções de borda que encolhe e marcas no chão. Contra o computador, cada disparo custa de 5 a 40 moedas; no PvP não há custo. |
| **Cartas** | As cartas guardadas no aparelho, organizadas numa **Box** como nos jogos (caixas 6 × 5 com nome, mover e trocar de lugar, arrumar pela Pokédex ou nome), ou em lista com detalhes: busca, filtros, equipe, ver em AR, remover. |
| **Treinador** | Nível e XP, sequência de dias, 3 missões por dia, coleções, conquistas e minigames (Quem é esse Pokémon?, Duelo de tipos e Memória). A aba **Liga** reúne os Ginásios e insígnias. Em **Seus dados**, baixe ou restaure o backup. O progresso fica no aparelho. |
| **Diagnóstico** | Capacidades do aparelho (HTTPS, câmera, WebGL2, Service Worker), estado do índice do catálogo, cartas guardadas e a última leitura (resultado, confiança, tempos, texto do OCR). Em Escanear, "Mostrar o que o app está vendo" desenha o contorno e as miniaturas. |

Detalhes e limites de cada parte: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### A vida na Vila e a Torre

Os moradores ganham casas conforme o nível do Treinador libera terrenos. Você pode melhorar as casas, pintar telhados, decorar e visitar Café, Correio e Museu. Conversas, perguntas, apelidos e passeios criam amizades; os Pokémon também desenvolvem relações entre si. O Diário guarda os 60 momentos recentes, e o Álbum preserva até 500 memórias escolhidas ou marcos importantes.

O questionário inicial dá um **Digital Pokémon**, identificado como companheiro sem carta física. A Fonte invoca outros por 500 moedas; evoluir exige 1000 moedas, amizade alta e uma próxima forma real. Eles participam da Vila, Caixa, Pins e Torre. Encontros raros com Suicune, Zapdos e Celebi trazem efeitos temporários e registros na Vila.

Na **Torre de Sobrevivência**, escolha entre até três espécies sorteadas das suas cartas e Digital Pokémon. Mova o Pokémon enquanto ele ataca automaticamente; escolha melhorias e evoluções durante a corrida. Há treinadores a cada cinco minutos e um chefão final aos vinte. Vencer libera o modo infinito e um bônus diário de moedas. Os golpes podem ser projétil, aura, área, cone ou órbita; Pokémon de dois tipos permitem escolher qual ataca.

### Liga e partidas com amigos

A **Liga Pokémon**, no Treinador ou na Arena da Vila, tem oito Ginásios, Elite 4 e Campeã, com revanches, insígnias, Hall da Fama e maleta 3D. Os desafios usam as batalhas automáticas de exibição da Caixa, em revezamento.

O **PvP** dos Pins e da Caixa conecta dois jogadores por WebRTC: um gera o convite, o outro devolve o código de resposta. Não há servidor do app nem sala pública; a conexão direta pode não fechar em algumas redes. Na Caixa, o anfitrião escolhe 1 contra 1, 3 contra 3 ou 6 contra 6, com um duelo por vez; cada jogador vê a batalha na própria caixa.

### Como funciona, em poucas linhas

- **Reconhecer**: o contorno da carta é achado e endireitado (630×880); o OCR lê o número e o nome; um índice estático do catálogo (gerado no deploy) transforma "número/total" em candidatas; a imagem de referência real confirma. Se o texto não bastar, um índice de ilustrações sugere candidatas. Só confirma uma carta que se repete em vários quadros.
- **Rastrear**: o alvo da carta é compilado **no aparelho** (MindAR) a partir da imagem do TCGdex e guardado. O rastreador tem ajustes para luz difícil (contraste local normalizado em quadros alternados, alvo em cinza de luminância), e o giroscópio mantém a pose firme entre as leituras.
- **Desenhar**: Three.js desenha o GIF do Pokémon (sprites do PokeAPI/sprites, com espelho no jsDelivr) com suavização de pixels à escolha.

## Publicar no GitHub Pages (uma vez só)

Você não precisa instalar nada nem usar terminal. O GitHub Actions faz o build e o deploy.

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Faça o merge na `main`. O workflow **Deploy no GitHub Pages** roda sozinho (e toda semana, para o índice de cartas acompanhar coleções novas).
4. O app fica em `https://eddiericobom.github.io/pokemon-tcg-ar/`.

A câmera exige HTTPS; o GitHub Pages já serve por HTTPS. O PWA só atualiza na **segunda** abertura depois de um deploy: feche e abra de novo.

## Infraestrutura

Apenas GitHub gratuito com repositório público: hospedagem no GitHub Pages (site estático) e automação no GitHub Actions (tipos, testes, build, índices estáticos, deploy, verificações externas). Sem backend, VPS, hospedagem paga nem servidor de banco de dados.

## Stack

Vue 3, TypeScript (estrito), Vite 8, `vite-plugin-pwa`, Three.js, MindAR (rastreamento de imagem, sobre TensorFlow.js), `tesseract.js` (OCR), `gifuct-js` (GIF) e `idb` (IndexedDB). Testes com Vitest + happy-dom e Playwright.

## Desenvolvimento

Só é necessário para quem quiser rodar localmente. Requer Node 22 ou superior.

```bash
npm ci
npm run dev          # servidor de desenvolvimento
npm run typecheck    # vue-tsc + tsc
npm test             # vitest (happy-dom)
npm run build        # build de produção em dist/
npm run build:index  # índice estático do catálogo (precisa de rede; roda no deploy)
```

O caminho base vem de `BASE_PATH` (padrão `/pokemon-tcg-ar/`); no CI vira `/<nome-do-repositório>/`. Outros fluxos (teste de ponta a ponta com câmera falsa, avaliações com rede, verificação do `dist/`) estão em [docs/TESTING.md](docs/TESTING.md).

## Estrutura

```
config/            caminho base do site
public/            ícones do PWA e OCR (copiado no build); data/ é gerado no deploy
scripts/           índices do catálogo e das ilustrações, verificações, avaliações
e2e/               teste de ponta a ponta (Playwright) e harness do AR com câmera falsa
src/app/           orquestração: scan, preparo do AR, equipe, dados de Pokémon, rotas, ajustes
src/ar/            AR: rastreador MindAR, sessão, sprite, painel de status, gestos
src/box/           Caixa: cena, criaturas, arena, batalha (diretor, efeitos, luzes, sons)
src/cache/         cartas e arquivos guardados no aparelho (IndexedDB + Cache API)
src/core/          lógica sem interface: câmera, GIF, suavização, tipos, motor de batalha
src/recognition/   detecção da carta, OCR, índices, fusão de evidências
src/sensors/       giroscópio
src/views/         telas (abas); src/components/ componentes
.github/workflows/ ci, deploy, e2e, verificação externa
docs/              arquitetura, testes e roteiro de teste no celular
```

## Documentação

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): arquitetura, decisões, limites conhecidos
- [docs/TESTING.md](docs/TESTING.md): o que é testado e como; o que só um celular valida
- [docs/TESTE_NO_CELULAR.md](docs/TESTE_NO_CELULAR.md): roteiro de teste em aparelho real
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): estado por fase, riscos e próximos passos
- [CHANGELOG.md](CHANGELOG.md): histórico de mudanças
- [CLAUDE.md](CLAUDE.md): regras para sessões do Claude Code neste repositório
