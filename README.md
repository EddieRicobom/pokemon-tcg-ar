# Pokémon TCG AR

PWA para celular que reconhece cartas físicas de Pokémon TCG pela câmera e mostra o Pokémon como um GIF 2D transparente em realidade aumentada. O projeto também inclui uma Vila narrativa, uma Caixa em AR, Arena, Pins, Liga e a Torre de Sobrevivência.

É um projeto de fã, não oficial. Pokémon, nomes, imagens e sprites pertencem aos respectivos detentores; veja [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). O código é MIT ([LICENSE](LICENSE)).

> O app não finge reconhecer cartas nem rastrear AR. Quando uma fonte de dados, sprite ou rastreamento não está disponível, isso aparece como erro ou ausência. Testes em Chromium usam câmera falsa e WebGL por software; eles não medem câmera, sensores, GPU, calor, bateria ou fluidez em um celular. Consulte [docs/TESTING.md](docs/TESTING.md).

## Modos do app

| Modo | O que faz |
| --- | --- |
| **Escanear** | Detecta a carta, corrige a perspectiva, usa OCR e consulta o catálogo para confirmar a impressão. Depois mostra o sprite 2D sobre a carta rastreada. Há modo **Várias** para até quatro cartas. |
| **Vila** | Hub narrativo sem câmera: exploração, conversas, amizades, Diário, Álbum, casas, móveis, roupas, loja, descobertas, festivais, Arena e Torre. |
| **Caixa em AR** | Coloca a equipe no espaço pela câmera e orientação do aparelho. A batalha é uma exibição automática, não um RPG completo. |
| **Arena** | Liga Pokémon, Ginásios, Elite 4, Campeã e PvP ligado à Caixa. |
| **Pins** | Arena sem câmera, com física, adversário e PvP. |
| **Cartas** | Box local com cartas coletadas, filtros, equipe, evolução de companheiros e acesso à Caixa em AR. |
| **Treinador** | XP, nível, missões, coleção, conquistas, minigames, Liga e backup dos dados. |
| **Diagnóstico** | Capacidades do aparelho, estado do catálogo, última leitura e caches locais. |

## Vila autônoma

A Vila é um lugar visitável e conectado aos outros modos. O progresso geral fica no aparelho: amizade, Diário, Álbum, casas, móveis, roupas, cidade, moedas, festivais e descobertas.

### Caixa de sementes e fazenda

Há uma caixa fixa perto dos canteiros da fazenda. Ela aceita apenas sementes que já existem na mochila e permite depositar ou retirar o estoque. O conteúdo é salvo junto com a Vila e entra no backup.

Enquanto a Vila está aberta, até três moradores livres podem escolher agricultura de acordo com aptidões, interesses, energia e necessidade da comunidade. Eles caminham até o canteiro e só concluem a tarefa depois de trabalhar por tempo real:

- plantar consome uma semente da caixa;
- regar usa as regras normais de crescimento;
- colher entrega a produção e eventuais sementes recuperadas à mochila;
- moradores dormindo, seguindo o treinador ou em expedição ficam indisponíveis;
- sair da Vila, abrir um menu ou fechar o app interrompe a tarefa sem consumo nem recompensa;
- não existe produção agrícola offline inventada.

O histórico mostra quem concluiu cada trabalho. A escolha também considera os outros postos, para a fazenda não ocupar automaticamente todos os moradores.

### Mina, madeireira e pescaria

O menu **Minha Vila → Trabalhos da Vila** mostra os quatro postos, os resultados reais e um botão para caminhar até cada local. Também há placas interativas no mapa.

- **Mina ao sul:** moradores mineram pedras, com as mesmas quantidades e chances de cristal e ouro da coleta manual.
- **Madeireira no noroeste:** moradores coletam madeira em árvores acessíveis; árvores já trabalhadas aparecem como tocos até o dia seguinte.
- **Pescaria no lago:** os moradores preferem o píer, lançam a linha e usam a mesma tabela de pesca do jogador. Os dez lançamentos diários são compartilhados.

As ferramentas e o progresso aparecem durante o trabalho. A produção só entra na mochila depois da caminhada e da conclusão; abrir menus ou sair interrompe tarefas em andamento. Aptidões e interesses favorecem profissões, e moradores livres também podem experimentar outros trabalhos. Os efeitos de movimento respeitam as opções visuais e movimento reduzido.

No **passeio guiado**, o Pokémon acompanha a velocidade do treinador. O passeio só é registrado quando os dois chegam; os acessos aos destinos e aos postos têm testes de caminho no mapa real.

### Diorama AR da Vila

O modo experimental da Vila usa a câmera, orientação do aparelho e uma altura estimada. O jogador escolhe o ponto na imagem e pode aproximar ou afastar o diorama; o controle de escala aumenta o tamanho real do modelo no mesmo ponto, até 3×. Ele não declara detectar mesa, chão ou distância física e a âncora precisa ser refeita em uma nova sessão.

## Torre de Sobrevivência

A Torre é um modo próprio da Vila. O jogador movimenta o Pokémon enquanto o ataque acontece automaticamente, enfrenta ondas, treinadores e um chefão final, escolhe melhorias e pode continuar no modo infinito depois do marco correspondente.

A meta-progressão é persistente e só registra resultados de corridas encerradas:

- corridas, melhores ondas e níveis;
- chefes e treinadores derrotados;
- doze desafios opcionais sorteados para cada corrida;
- modo infinito após o chefão final aos 20 minutos;
- preparações estratégicas liberadas aos 3, 6, 9 e 12 objetivos distintos;
- segunda troca de sorteio após três desafios distintos concluídos.

Abandonar uma corrida não registra objetivos, marcos ou recompensas. A tela da Torre mostra o próximo marco e a trilha de desafios.

## Dados, privacidade e limites

O projeto é estático e não tem backend, conta obrigatória ou banco remoto. Cartas, progresso, configurações e caches ficam no navegador, usando `localStorage`, IndexedDB e Cache API. O app exporta e importa backup JSON/ZIP, incluindo a Vila, companheiros, cartas e caches locais.

O reconhecimento real depende de iluminação, foco, qualidade da carta, rede para dados ainda não cacheados e compatibilidade do aparelho. O rastreamento MindAR usa a imagem da carta; clicar em um botão nunca substitui a detecção. Companheiros digitais da Fonte são identificados como digitais e não entram no reconhecimento de cartas.

O RPG de ação completo continua pendente: a batalha da Caixa é uma exibição automática e não oferece controle manual de golpes, itens, trocas ou progressão de RPG.

## Publicação no GitHub Pages

O projeto usa somente GitHub gratuito, repositório público, GitHub Actions e GitHub Pages.

1. Em **Settings → Pages**, selecione **GitHub Actions** como fonte.
2. Faça merge na `main`.
3. O workflow **Deploy no GitHub Pages** instala dependências, atualiza os dados estáticos, roda tipos e testes, gera o build e publica `dist/`.

O deploy também roda semanalmente para atualizar o índice do catálogo. O endereço público deste repositório é <https://eddiericobom.github.io/pokemon-tcg-ar/>.

O site precisa de HTTPS para câmera e sensores. O PWA atualiza os arquivos quando uma nova versão assume, sem interromper uma câmera que já está aberta.

## Desenvolvimento

Requer Node.js 22 ou superior.

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
BASE_PATH=/pokemon-tcg-ar/ npm run build
node scripts/verify-dist.mjs
```

Comandos auxiliares:

```bash
npm run prepare:assets
npm run build:index
npm run build:art-index
npm run sync:sprites
npm run verify:sprite-pack
npm run preview
```

O `BASE_PATH` padrão é `/pokemon-tcg-ar/`; no CI ele é derivado do nome do repositório. Não use caminhos absolutos no código.

## Stack e arquitetura

- Vue 3, TypeScript estrito e Vite 8;
- PWA com `vite-plugin-pwa`;
- MindAR, TensorFlow.js e Three.js apenas nas integrações de AR/Caixa, carregadas de forma dinâmica;
- Tesseract.js para OCR e `gifuct-js` para GIF;
- Vitest + happy-dom para testes unitários e Playwright para fluxos de câmera falsa;
- lógica pura em `src/core/`, com testes ao lado dos módulos;
- sprites 2D, sem Unity, Flutter, React Native, GLB ou glTF.

Estrutura principal:

```text
config/                 base path e configuração do site
public/                 ícones, OCR, dados e sprites estáticos
scripts/                índices, sincronização, verificações e avaliações
e2e/                    Playwright e harnesses de câmera falsa
src/app/                rotas, stores, backup, catálogo e serviços
src/ar/                 rastreamento MindAR e renderização AR
src/box/                Caixa, arena e batalha automática
src/components/         telas e componentes Vue
src/core/               lógica testável sem interface
src/recognition/        contorno, OCR e fusão de evidências
src/village/            renderizador, mapa, arte e movimento da Vila
src/sensors/            orientação e sensores
.github/workflows/      CI, deploy, E2E e verificações externas
docs/                   arquitetura e procedimentos de teste
```

## Fluxo de contribuição

Trabalhe em uma branch `Codex/...`, faça commits pequenos em português e abra um pull request. Antes de relatar sucesso, confirme `typecheck`, testes, build com `BASE_PATH`, `verify-dist`, estado do Git, CI e deploy. A `main` só deve receber mudanças depois do CI verde.

## Documentação

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): decisões técnicas e limites;
- [docs/TESTING.md](docs/TESTING.md): testes automatizados e limites do ambiente;
- [docs/TRAINER_ART.md](docs/TRAINER_ART.md): atlas e sprites dos treinadores;
- [docs/TESTE_NO_CELULAR.md](docs/TESTE_NO_CELULAR.md): roteiro para aparelho real;
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): estado por etapa e pendências;
- [CHANGELOG.md](CHANGELOG.md): histórico de versões;
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): créditos e licenças de assets.

### Backup em nuvem (Google Drive)

Em **Treinador → Seus dados**, o backup local continua disponível. A integração opcional com Google Drive envia cópias completas por data e permite baixar, validar e confirmar a restauração em outro aparelho. Não sincroniza nem substitui saves automaticamente. Requer configurar o Client ID do Google no deploy; sem isso, a interface informa a indisponibilidade. Veja [configuração e limites](docs/BACKUP_NUVEM.md).
