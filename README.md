# Pokémon TCG AR

PWA para celular que vai reconhecer uma carta física de Pokémon TCG pela câmera e mostrar, em realidade aumentada, o GIF animado do Pokémon Showdown como uma figura 2D transparente, em pé sobre a carta.

Projeto de fã, não oficial. Pokémon e os nomes, imagens e sprites relacionados pertencem aos seus respectivos donos.

## Estado atual: Fase 0 (fundação)

O que **funciona** hoje:

- App instalável (PWA) em português do Brasil, com cache offline e base path do GitHub Pages.
- Diagnóstico do aparelho: HTTPS, câmera, WebGL2, Service Worker e se está instalado.
- Abrir e fechar a câmera traseira, com mensagens de erro em português.
- Teste do renderizador: decodifica um GIF animado (do Showdown ou de um arquivo do aparelho) e o desenha com fundo transparente em Three.js sobre a câmera.
- Testes automatizados, build e deploy por GitHub Actions.

O que **ainda não existe** (e a tela do app diz isso claramente):

- Reconhecimento de cartas.
- Rastreamento da carta e o Pokémon em pé sobre ela.

No teste do renderizador o Pokémon aparece **fixo na tela**. Isso não é AR sobre a carta; é só a validação do desenho do GIF. O roteiro do que falta está em [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Publicar no GitHub Pages (uma vez só)

Você não precisa instalar nada nem usar terminal. O GitHub Actions faz o build e o deploy.

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Faça o merge do pull request na `main`. O workflow **Deploy no GitHub Pages** roda sozinho.
4. O app fica em `https://eddiericobom.github.io/pokemon-tcg-ar/`.

Sem o passo 2, o workflow de deploy falha na etapa de configuração do Pages.

A câmera exige HTTPS; o GitHub Pages já serve por HTTPS.

## Infraestrutura

Apenas GitHub gratuito com repositório público:

- Hospedagem: GitHub Pages (site estático).
- Automação: GitHub Actions (build, testes, processamento estático do catálogo e deploy).
- Sem backend hospedado, VPS, hospedagem paga, servidor de banco de dados ou serviço Python permanente.
- Python entra só como ferramenta de build/CI (preparação de dados), quando necessário.

## Stack

Vue 3, TypeScript, Vite, `vite-plugin-pwa`, Three.js e `gifuct-js` (decodificação de GIF). A escolha da biblioteca de AR/visão está documentada em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e fica para a Fase 3.

## Desenvolvimento

Só é necessário para quem quiser rodar localmente. Requer Node 22 ou superior.

```bash
npm ci
npm run dev        # servidor de desenvolvimento
npm run typecheck  # vue-tsc + tsc
npm test           # vitest
npm run build      # build de produção em dist/
```

O caminho base vem da variável `BASE_PATH` (padrão `/pokemon-tcg-ar/`). No CI ela é definida como `/<nome-do-repositório>/`.

## Estrutura

```
config/            caminho base do site (e seu teste)
public/icons/      ícones do PWA (favicon.svg é a fonte)
src/core/          lógica sem interface: câmera, capacidades, GIF, URLs do Showdown
src/ar/            renderizador Three.js (carregado sob demanda)
src/components/    componentes Vue
src/composables/   utilitários reativos do Vue
.github/workflows/ ci.yml e deploy.yml
docs/              arquitetura e testes
```

## Documentação

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): fases, critérios de pronto, riscos e decisões em aberto
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): arquitetura, decisões e análise do projeto de referência pokeum
- [docs/TESTING.md](docs/TESTING.md): o que é testado automaticamente e o que precisa de teste manual no celular
- [CLAUDE.md](CLAUDE.md): regras para sessões do Claude Code neste repositório
- [CHANGELOG.md](CHANGELOG.md): histórico de mudanças
