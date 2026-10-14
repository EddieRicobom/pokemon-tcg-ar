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
- Sprites: repositório PokeAPI/sprites (GIFs `other/showdown`), com espelho no jsDelivr. Os desenhos dos
  Pokémon pertencem aos seus titulares; o app não os redistribui, o celular os baixa na hora.
