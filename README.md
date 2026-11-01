<div align="center">

<img src="public/icons/icon-512.png" width="128" alt="Digital Holo" />

# Digital Holo

**Uma carta física vira uma porta para uma pequena aventura.**

Escaneie cartas reais, veja o Pokémon em AR, cuide da sua Vila e leve sua coleção para a Caixa, Arena, Pins e Torre de Sobrevivência.

[![CI](https://github.com/EddieRicobom/pokemon-tcg-ar/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/EddieRicobom/pokemon-tcg-ar/actions/workflows/ci.yml)
[![Deploy](https://github.com/EddieRicobom/pokemon-tcg-ar/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/EddieRicobom/pokemon-tcg-ar/actions/workflows/deploy.yml)
[![Licença MIT](https://img.shields.io/badge/código-MIT-2f855a)](LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue%203-TypeScript-42b883?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![PWA](https://img.shields.io/badge/PWA-GitHub%20Pages-5b5bd6)](https://developer.mozilla.org/docs/Web/Progressive_web_apps)

<br />

<a href="https://eddiericobom.github.io/pokemon-tcg-ar/"><strong>▶ Abrir a demonstração ao vivo</strong></a>
&nbsp; · &nbsp;
<a href="#comece-em-dois-minutos">Começar localmente</a>
&nbsp; · &nbsp;
<a href="docs/TESTE_NO_CELULAR.md">Testar no celular</a>

</div>

> Projeto de fã, não oficial. Pokémon, nomes, imagens, músicas e sprites pertencem aos respectivos detentores. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). O código deste repositório é MIT.

## O que é

Digital Holo é uma PWA mobile-first que combina coleção física, reconhecimento visual e uma Vila persistente. A carta precisa estar realmente na câmera: o app não simula reconhecimento, não sorteia uma carta e não coloca um Pokémon no espaço sem rastreamento.

O projeto é totalmente estático e roda no GitHub Pages. Não há servidor próprio, conta obrigatória ou banco remoto. O progresso fica no navegador e pode ser exportado para backup.

## A experiência em uma tela

| Modo | Experiência |
| --- | --- |
| **Escanear** | Corrige a perspectiva, usa OCR e confirma a impressão no catálogo antes de mostrar o sprite 2D rastreado sobre a carta. Também há rastreamento de até quatro cartas. |
| **Vila** | Hub narrativo com exploração, moradores, amizade, histórias, Diário, casas, móveis, roupas, fazenda, mina, madeireira, pescaria, festivais e descobertas. |
| **Caixa em AR** | Coloca sua equipe no espaço com câmera e orientação. A batalha é uma apresentação automática para ver os Pokémon juntos, não um RPG manual completo. |
| **Arena** | Liga, Ginásios, Elite 4, Campeã e partidas ligadas à equipe da Caixa. |
| **Pins** | Disputas sem câmera com física, efeitos elementais e partidas PvP. |
| **Torre** | Survival com ondas, treinadores, regiões, escolhas de buffs, artefatos, meta-progressão e recompensas persistentes para corridas concluídas. |
| **Cartas** | Box local, filtros, seleção de Vila/equipe, evolução de companheiros e entrada para a Caixa. |
| **Treinador** | Perfil, XP, missões, moedas, conquistas, minigames e backup local ou opcional no Google Drive. |

### Fluxo recomendado para a primeira visita

```text
Escanear uma carta real
        ↓
Confirmar a impressão e guardar a carta
        ↓
Escolher “Ver na Vila” ou abrir a Caixa em AR
        ↓
Voltar à Vila para conversar, explorar e desbloquear histórias
```

Se você não possui cartas, o onboarding permite entrar direto na Vila. Um Digital Pokémon é sempre identificado como digital e nunca é apresentado como uma carta reconhecida.

## Demonstração

**[Abrir o app publicado](https://eddiericobom.github.io/pokemon-tcg-ar/)** · **[roteiro de teste no aparelho real](docs/TESTE_NO_CELULAR.md)**

O repositório usa um link para a demonstração ao vivo em vez de versionar um GIF grande e rapidamente desatualizado. Assim, o botão acima sempre abre a versão que está no ar, com o fluxo real de câmera e AR. O [harness de câmera falsa](docs/TESTING.md) oferece uma demonstração reproduzível em Chromium sem precisar de uma carta ou câmera física.

## Comece em dois minutos

### Requisitos

- **Node.js 22 ou superior** e npm.
- Navegador atual com ES2022, `getUserMedia`, IndexedDB e WebGL2 para os modos 3D/AR.
- **HTTPS** em produção; `localhost` é aceito como origem segura no desenvolvimento.
- Câmera traseira e uma carta real para testar o reconhecimento.

**Não é necessário instalar Unity, Python ou OpenCV.** O app é Vue 3 + TypeScript + Vite. Three.js, MindAR e TensorFlow.js entram somente nos modos que precisam deles, via carregamento sob demanda.

### Instalação

```bash
git clone https://github.com/EddieRicobom/pokemon-tcg-ar.git
cd pokemon-tcg-ar
npm ci
cp .env.example .env
npm run dev
```

No PowerShell, use `Copy-Item .env.example .env` no lugar de `cp`. Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173/pokemon-tcg-ar/`.

Para abrir a partir de outro aparelho na rede:

```bash
npm run dev -- --host 0.0.0.0
```

O aparelho ainda precisará de HTTPS ou de um túnel seguro para liberar a câmera. A aparência e a fluidez de sensores só podem ser confirmadas em hardware real.

## Câmera, sensores e AR

1. Entre em **Escanear** ou **Caixa** e toque no botão de abrir a câmera; a permissão precisa partir de um gesto.
2. Conceda acesso à câmera traseira e use boa luz, foco e uma carta inteira no enquadramento.
3. No iOS, aceite também o pedido de movimento/orientação quando ele aparecer para o AR da Caixa e o diorama da Vila.
4. Se a câmera ficar preta, reative a permissão nas configurações do site, feche outras abas que usam a câmera e recarregue.
5. Sem sensor, alguns fluxos oferecem arraste manual. Isso não inventa posição física: o diorama da Vila usa uma âncora e uma altura estimada, sem detectar mesa ou distância real.

## Dados externos e configuração

O núcleo não exige chave de API. As fontes públicas são consultadas sob demanda, com cache local quando possível:

| Fonte | Para que serve | Necessária? |
| --- | --- | --- |
| [TCGdex](https://tcgdex.dev/) | Imagem de referência, identificação e dados impressos da carta | Para cartas ainda não guardadas |
| [PokéAPI](https://pokeapi.co/) | Tipos, atributos e golpes | Para painéis e batalhas ainda não cacheados |
| [PokeAPI/sprites](https://github.com/PokeAPI/sprites) | Sprites GIF/PNG 2D | Para visuais ainda não cacheados |
| Google Drive | Cópia opcional do backup completo | Não; o backup local funciona sem conta |

O único valor de build opcional é o Client ID público do Google Drive. Ele já está documentado em [`.env.example`](.env.example):

```dotenv
# Opcional: OAuth “Aplicativo da Web”. Nunca coloque Client Secret aqui.
VITE_GOOGLE_CLIENT_ID=
```

Sem esse valor, o app continua completo e mantém o backup local. No deploy, configure a variável `GOOGLE_DRIVE_CLIENT_ID` em **Settings → Secrets and variables → Actions → Variables**; o workflow a injeta como `VITE_GOOGLE_CLIENT_ID`. Veja [docs/BACKUP_NUVEM.md](docs/BACKUP_NUVEM.md) para origens autorizadas, escopo e limites.

## Progresso, privacidade e backup

- Cartas, progresso, configurações e caches ficam no navegador, em `localStorage`, IndexedDB e Cache API.
- O backup local exporta e importa o estado completo, inclusive Vila, companheiros, cartas e caches cobertos pelo manifesto.
- O arquivo exportado pode usar extensão genérica `.dat`; isso mascara o tipo para o sistema de arquivos, mas **não é criptografia**.
- O Google Drive é opcional, usa a pasta privada `appDataFolder` e só envia uma cópia quando o jogador pede.
- Tokens de autorização não entram no save nem no backup.
- O reconhecimento depende de luz, foco, qualidade da carta, disponibilidade de rede e compatibilidade do aparelho. Uma falha aparece como falha; nenhum dado é inventado em silêncio.

## Arquitetura

```text
Vue 3 / componentes
        │
        ├── src/app          rotas, stores, catálogo, backup e serviços
        ├── src/core         regras puras e testáveis
        ├── src/recognition  contorno, OCR e decisão de evidências
        ├── src/ar           MindAR, câmera, rastreamento e sprites
        ├── src/box          Three.js, Caixa e batalha automática
        ├── src/village      mapa, renderização, trabalhos e histórias
        └── src/sensors      orientação e sensores

GitHub Actions → build estático → GitHub Pages
```

Tecnologias principais:

- Vue 3, TypeScript estrito e Vite 8;
- PWA com `vite-plugin-pwa`;
- MindAR, TensorFlow.js e Three.js carregados dinamicamente para AR/Caixa;
- Tesseract.js para OCR e `gifuct-js` para GIF;
- Vitest + happy-dom para regras e Playwright para fluxos com câmera falsa;
- sprites 2D; sem Unity, Flutter, React Native, GLB ou glTF.

## Validar antes de abrir um PR

```bash
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

O CI roda tipos, testes, verificação dos atlas, build e conferência do `dist/`. Testes automatizados usam câmera falsa e WebGL por software; eles não medem bateria, calor, sensores ou GPU de celular. Consulte [docs/TESTING.md](docs/TESTING.md) e [docs/TESTE_NO_CELULAR.md](docs/TESTE_NO_CELULAR.md).

## Limites atuais e próximos passos

- A batalha da Caixa continua sendo uma exibição automática; controle manual de golpes, itens e trocas é parte do plano futuro.
- AR real depende de câmera, carta, iluminação, sensores e navegador compatíveis.
- O catálogo e os sprites são carregados sob demanda para não transformar a primeira abertura em um download enorme.
- O estado detalhado do roteiro fica em [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Documentação e créditos

- [Arquitetura](docs/ARCHITECTURE.md) · [Testes](docs/TESTING.md) · [Teste no celular](docs/TESTE_NO_CELULAR.md)
- [Atlas de treinadores](docs/TRAINER_ART.md) · [Backup no Google Drive](docs/BACKUP_NUVEM.md)
- [Histórico de mudanças](CHANGELOG.md) · [Avisos de terceiros](THIRD_PARTY_NOTICES.md)
- [Créditos de áudio](public/audio/CREDITS.md)

Contribuições devem usar uma branch `Codex/...`, commits pequenos em português e pull request. A `main` recebe mudanças depois do CI verde.
