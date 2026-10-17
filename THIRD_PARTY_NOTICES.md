# Avisos de terceiros

## pokeum (MIT)

Técnicas de reconhecimento adaptadas do projeto <https://github.com/TBLgGamin/pokeum>
(licença MIT): retificação para 630×880, regiões fracionárias da carta, interpretação do texto
do OCR, hash perceptual de 16×16, fusão ponderada com reforço/penalidade do OCR, limiares de
decisão e agregação temporal. O código foi reescrito em TypeScript para rodar no navegador; nenhum
trecho do servidor foi copiado.

> MIT License — Copyright (c) the pokeum authors. Permission is hereby granted, free of charge, to
> any person obtaining a copy of this software and associated documentation files, to deal in the
> software without restriction, subject to the inclusion of the original copyright and permission
> notice in all copies or substantial portions of the software. THE SOFTWARE IS PROVIDED "AS IS",
> WITHOUT WARRANTY OF ANY KIND.

O texto completo da licença está no repositório de origem.

## Momentoos

Ideias de rastreamento em luz difícil (normalização de contraste local do quadro e preparo do alvo) vêm do
Momentoos, outro repositório do dono deste projeto; o código foi reescrito aqui.

## Bibliotecas

| Pacote | Licença | Uso |
| --- | --- | --- |
| vue | MIT | Interface |
| three | MIT | Renderização |
| mind-ar | MIT | Rastreamento de imagem (AR) |
| @tensorflow/tfjs (dependência do mind-ar) | Apache-2.0 | Contas do rastreador e normalização de contraste |
| tesseract.js, tesseract.js-core, @tesseract.js-data/eng | Apache-2.0 | OCR no navegador |
| gifuct-js | MIT | Decodificação de GIF |
| idb | ISC | IndexedDB |
| @fontsource-variable/bricolage-grotesque | OFL-1.1 | Fonte da interface |

As licenças exatas de cada versão estão nos pacotes (`node_modules/<pacote>/LICENSE`) e no `package-lock.json`.

## Dados e imagens

- Dados de cartas e imagens de referência: TCGdex (<https://tcgdex.dev/>). As imagens das cartas
  pertencem aos seus titulares (The Pokémon Company, Nintendo, Creatures, Game Freak). O app baixa
  somente as cartas que o usuário escaneia e as guarda no aparelho dele.
- Dados de espécies, atributos e golpes: PokéAPI (<https://pokeapi.co/>).
- Altura das espécies e das formas alternativas (`src/core/data/pokemon-heights.json`): gerada por
  `scripts/build-heights.mjs` a partir do `data/v2/csv/pokemon.csv` do repositório PokeAPI/pokeapi
  (<https://github.com/PokeAPI/pokeapi>, licença BSD-3-Clause). Só a coluna de altura é guardada.
- Tipos das espécies e das formas alternativas (`src/core/data/pokemon-types.json`): gerados por
  `scripts/build-types.mjs` a partir de `pokemon.csv`, `pokemon_types.csv` e `types.csv` do mesmo repositório
  PokeAPI/pokeapi (BSD-3-Clause), para os filtros de tipo de "Minhas cartas".
- Sprites: repositório PokeAPI/sprites (GIFs `other/showdown`), com espelho no jsDelivr. Os desenhos dos
  Pokémon pertencem aos seus titulares; o app não os redistribui, o celular os baixa na hora.

## Sprites locais da Vila e da Sobrevivência (`public/sprites/`) — PMD SpriteCollab, CC BY-NC 4.0

A Vila usa, quando disponível para a espécie, um sprite de ação ("Idle") guardado no próprio repositório em
vez de baixar o GIF do PokeAPI/sprites; a Zona de Sobrevivência (modo próprio da Vila, aberto pela Torre de
Sobrevivência) usa a animação "Walk" do mesmo pacote para o Pokémon do jogador e para os inimigos. Esses arquivos (e o corte em
quadros/direções, `public/data/village-sprite-meta.json`) vêm do port Android (Godot) do **PokéSurvivor**:
<https://github.com/JayElDragon/poke-survivor> (jogo original de JPTER78:
<https://github.com/JPTER78/pokesurvivor>). A arte em si é do **PMD SpriteCollab**
(<https://github.com/PMDCollab/SpriteCollab>), sob **CC BY-NC 4.0** (<https://creativecommons.org/licenses/by-nc/4.0/>):
**uso não comercial e com atribuição**. Este projeto é gratuito e sem fins lucrativos (não vende nada, não
tem anúncios), compatível com essa licença.

A lista completa dos artistas por número de Pokédex está no `CREDITS.md` do poke-survivor
(<https://github.com/JayElDragon/poke-survivor/blob/main/CREDITS.md>), copiada de lá do CREDITS.md original do
PokéSurvivor — são centenas de nomes, por isso apontamos para a fonte em vez de duplicar aqui. Diferente do
sprite do PokeAPI/sprites (baixado na hora), este pacote **é redistribuído** junto com o app: cobre 966 das
espécies existentes; quando a espécie não está no pacote, a Vila volta a baixar o GIF normalmente (a
Sobrevivência cai para uma forma neutra, sem fingir ser outro Pokémon).

A **jogabilidade** da Zona de Sobrevivência (andar, autoataque no inimigo mais perto, orbes de XP, upgrade a
cada nível, ondas e chefe periódico) espelha o **laço** do poke-survivor/PokéSurvivor — não é um port do
código: motor próprio em TypeScript (`src/core/survivor.ts`), números e upgrades originais, e nenhum dos
sistemas de gacha, missões, conquistas ou fendas de lendário de lá foi trazido.

## Tilesets (`tilesets/`)

Conjunto de tilesets de cenário (prédios, interiores, natureza) de artistas da comunidade de fãs de Pokémon
(cada um listado por conjunto em `tilesets/Credits.txt`), sem licença formal publicada junto — a prática usual
dessa comunidade (RPG Maker/Pokémon Essentials) é uso livre em fangames não comerciais, com crédito aos
autores. Como este projeto é gratuito, público e sem fins lucrativos, mantemos essa mesma condição: uso não
comercial, com crédito. A Zona de Sobrevivência usa um recorte de grama de `Daisy Route.png` (32×32, emendável,
salvo em `public/tilesets/survivor-grass.png`), que também é a grama da Vila.

Desde o rework da Vila (mapa grande), quase todo o resto da Vila também sai desse conjunto: os recortes listados em
`src/village/atlas-spec.ts` são juntados em `public/tilesets/vila-atlas.png` (por `scripts/build-vila-atlas.mjs`,
sem alterar os desenhos; os autotiles entram reduzidos pela metade porque estão em 2×, sem perder pixel). As cores
das casas da Vila são tingidas por código a partir desses desenhos. Ficam desenhados por código, ainda: os postes de
luz, a fonte da praça, os móveis, as plantas da horta e o seu personagem. Folhas usadas e créditos (de
`tilesets/Credits.txt`):

- `Daisy Route.png` (mato alto, flores): Idilio, Heroalistar, Ekat, Zeo, Zein, J-Treecko252, 874521, The Red-Ex,
  Kyledove, Magiscarf, Wesley FG.
- `Route 224.png` (praia, mar, pinheiros, árvore grande, pedras): Ekat, Vurtax, Heartlessdragoon, Zein.
- `Thistle Town.png` (arbusto): Ekat, Anonalpaca, Idilio, Heartlessdragoon, Vurtax, Skidmarc25, Thewilddeadhero, Zein.
- `Jonquil Town.png` (barracas de guarda-sol do mercado, a Torre): Ekat, Heartlessdragoon, Vurtax.
- `Apathy Houses.png` (o sobrado): Ekat, Heartlessdragoon.
- `Brick House Tiles.png` (a casa de tijolos): Ekat, Heartlessdragoon.
- `Fall Harvest.png` (o celeiro): Ekat, Heartlessdragoon, Vurtax.
- `Garden House Sheet.png` (o casarão do Museu, jardineira, vaso): Ekat, Heartlessdragoon, Vurtax.
- `General Store.png` (a cabana do Café): Ekat, Heartlessdragoon.
- `Park Tileset.png` (o gazebo da Cabana): Ekat, Heartlessdragoon, Vurtax.
- `Pokémon Center and Mart Buildings.png` (Arena, Fliperama, Pista de Pins, Correio): Ekat, Vurtax.
- `Autotiles/Default_2.png`, `Default_4.png`, `Default_6.png` e `dust grass.png` (canteiro, rua, praça e trilha):
  fazem parte do mesmo conjunto, mas `Credits.txt` não traz um crédito próprio para a pasta
  de autotiles; ficam creditados ao conjunto como um todo.

O parquinho (balanço, escorregador, carrossel, gangorra, trepa-trepa), a cerca, o muro de pedra e o mural de recados
vêm de `Daisy Route.png`.
