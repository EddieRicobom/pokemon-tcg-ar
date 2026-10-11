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

## Bibliotecas

| Pacote | Licença | Uso |
| --- | --- | --- |
| tesseract.js, tesseract.js-core, @tesseract.js-data/eng | Apache-2.0 | OCR no navegador |
| mind-ar | MIT | Rastreamento de imagem (AR) |
| three | MIT | Renderização |
| gifuct-js | MIT | Decodificação de GIF |
| idb | ISC | IndexedDB |

## Dados e imagens

- Dados de cartas e imagens de referência: TCGdex (<https://tcgdex.dev/>). As imagens das cartas
  pertencem aos seus titulares (The Pokémon Company, Nintendo, Creatures, Game Freak). O app baixa
  somente as cartas que o usuário escaneia e as guarda no aparelho dele.
- Sprites: repositório PokeAPI/sprites. Os desenhos dos Pokémon pertencem aos seus titulares.
