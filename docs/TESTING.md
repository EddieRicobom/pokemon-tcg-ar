# Testes

## O que é automatizado

Roda no GitHub Actions a cada pull request e na `main` (`ci.yml`), e antes de cada deploy (`deploy.yml`).

| Verificação | Comando | O que cobre |
| --- | --- | --- |
| Tipos | `npm run typecheck` | `vue-tsc` no app e `tsc` nas configurações |
| Testes unitários | `npm test` | Vitest com happy-dom (lista abaixo) |
| Build | `npm run build` | Compilação de produção e geração do Service Worker |
| Base path | passo no `ci.yml` | `start_url` e `scope` do manifest iguais a `/<repositório>/` |

### Testes unitários

| Arquivo | Cobre |
| --- | --- |
| `config/base-path.test.ts` | Normalização do caminho base |
| `src/core/capabilities.test.ts` | Avaliação das capacidades e detecção de iOS |
| `src/core/camera.test.ts` | Pedido da câmera traseira, mapeamento de erros, limpeza ao falhar |
| `src/core/showdown.test.ts` | Identificadores no estilo do Showdown e montagem das URLs |
| `src/core/gif.test.ts` | Decodificação de **GIFs reais gerados no teste** (quadros parciais, transparência), métodos de descarte 2 e 3, atrasos e escolha do quadro |
| `src/App.test.ts` | Montagem da interface; confere que ela diz que reconhecimento e AR ainda não existem |

Os GIFs dos testes são produzidos por um codificador mínimo (`src/core/__fixtures__/encode-gif.ts`), então não há binários no repositório nem dependência de rede.

## O que NÃO é coberto automaticamente

- **Câmera real e permissões.** O happy-dom não tem câmera. A lógica é testada com objetos simulados; a integração com o navegador não.
- **Desenho em WebGL** (`src/ar/overlay.ts`). Não há WebGL no happy-dom. O módulo é verificado apenas por tipos e build.
- **Instalação do PWA e uso offline.**
- **Rede do Showdown.** O ambiente de desenvolvimento não alcança o servidor; nomes de arquivo e CORS dos GIFs estão **não verificados**.

## Checklist manual em aparelho real

Fazer no Chrome do Android e no Safari do iPhone, abrindo o endereço do GitHub Pages.

1. A página abre e o painel "Este aparelho" mostra HTTPS e WebGL2 como disponíveis.
2. **Abrir câmera** pede permissão e mostra a câmera **traseira**. Negar a permissão mostra a mensagem em português.
3. **Fechar câmera** apaga o indicador de câmera ativa do aparelho.
4. **Carregar GIF do aparelho** com um GIF animado com fundo transparente: o Pokémon anima, sem retângulo de fundo e sem borda serrilhada de cor errada.
5. **Carregar GIF do Showdown** com `pikachu`, `charizard`, `mrmime`, `nidoranf`: anotar quais funcionam. Se falhar, anotar a mensagem exibida (404 ou CORS). Esta é a validação da Fase 1.
6. Instalar na tela inicial (botão **Instalar app** no Android; Compartilhar → Adicionar à Tela de Início no iOS). O app abre em tela cheia.
7. Com o app instalado e o aparelho em modo avião, abrir de novo: a interface carrega pelo cache.
8. Girar a tela e redimensionar: o desenho do Pokémon acompanha o tamanho da área da câmera.

Registrar o resultado (aparelho, navegador, passou ou falhou) no pull request ou em uma issue.

## Quando reconhecimento e AR existirem

Cada fase do plano tem um critério de pronto medido. Na Fase 4, a taxa de acerto em fotos reais de cartas deve ser publicada aqui, com o conjunto de teste e a data. Sem medição, não há afirmação de que o reconhecimento funciona.
