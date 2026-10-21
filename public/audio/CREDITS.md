# Músicas de Pokémon em estilo retrô

Arranjos © 2023–2024 **Meeow’s Music**: https://www.youtube.com/@MeeowsMusic

Composições originais © The Pokémon Company International e seus respectivos compositores.

Fonte primária e condições de uso: https://eeveeexpo.com/resources/1527/
Pacote público do artista: https://drive.google.com/drive/folders/1Wn69Hr66PNTWkAB6ccSU4RHAXlDoz1gd

O artista disponibiliza o pacote de arranjos em estilo Gen 3 para uso em projetos de fãs, pedindo crédito e link para o canal. Contato prévio é preferido pelo artista. Nenhum contato foi enviado por esta implementação. Não é uma licença MIT/CC0, e a licença do código do projeto não se aplica às músicas. Os 17 arquivos desse pacote foram preservados sem alterar o arranjo.

## Vila — 12 faixas

| Arquivo | Tema original / arquivo do pacote | ID público do arquivo na pasta do artista |
| --- | --- | --- |
| village/new-bark.mp3 | New Bark Town / PKGSC_NewBark.mp3 | 1DZxlGGZNs2qFU9QBvaPJNdt6votcHMdO |
| village/cherrygrove.mp3 | Cherrygrove City / PKGSC_CherrygroveCity.mp3 | 1U-e5m4T_-dWN-_XUVnFgti9l9_DBX-sc |
| village/goldenrod.mp3 | Goldenrod City / PKGSC_Goldenrod.mp3 | 1H33p3WCoQLfPIhvPFiUG2Maonr_aKdSn |
| village/viridian.mp3 | Viridian City / PKGBA_ViridianCity.mp3 | 1u29Su3SeUmtSNl3gs3r69KcN9Q99FLkC |
| village/cianwood.mp3 | Cianwood City / PKHGSS_Cianwood.mp3 | 1Pyil5UVPwy5uQEfH-kS63nu0AFKFWITV |
| village/hearthome.mp3 | Hearthome City / PKDPPt_HearthomeCity.mp3 | 1Rrp8EbPTKkgs6S9kKH1P3tTcOAutq0Y- |
| village/heahea-night.mp3 | Heahea City (Night) / PKSM_HeaheaNight.mp3 | 1wHzVc3KjP39S-8Qp0V8xe787IMrgNUyU |
| village/oreburgh-night.mp3 | Oreburgh City (Night) / PKDPPt_OreburghNight.mp3 | 1y9s5bo1MzB7hmGfgOMUpLajIlgv1390X |
| village/canalave.mp3 | Canalave City / PKDPPt_Canalave.mp3 | 1Upl7DTo2WoEhyCyCmd0Xnkt8R_sMx_BE |
| village/hearthome-night.mp3 | Hearthome City (Night) / PKDPPt_HearthomeCityNight.mp3 | 15jWVQYt1tsxW-Yr_PaktCpG0So_xcwc7 |
| village/azalea-winter.mp3 | Azalea Town (Christmas) / PKGSC_AzaleaChristmas.mp3 | 1EhYzQoROC6CyU2vcxDUFZBp2ko29nKB- |
| village/humilau-night.mp3 | Humilau City (Night) / PKB2W2_HumilauNight.mp3 | 1STFgts6zlQvTBy8jYjj_8UjbOuvV9kup |

## Survival — 9 temas regionais

| Região da corrida | Arquivo | Tema real / arquivo do pacote | ID público |
| --- | --- | --- | --- |
| Kanto | survival/kanto.mp3 | Gym Leader / PKRBY_GymLeader.mp3 | 1WPIvjCEy9uiHWduFUtqJw6owC1v1edvA |
| Johto | survival/johto.mp3 | Champion / PKGSC_ChampionGBA.mp3 | 1l37xN9SA8PqqMK8TPJmAxpdq3vorphFi |
| Hoenn | survival/hoenn.mp3 | Frontier Brain / PKRSE_FrontierBrain.mp3 | 1JUxtVZRU9T2Tr-TCrFyMi79N17l456cn |
| Sinnoh | survival/sinnoh.mp3 | Cynthia / PKDPPt_CynthiaFinal.mp3 | 11Z6s7rKyE0UAHmho0vPitwQ0esaQ8GQF |
| Unova | survival/unova.mp3 | Trainer / PKBW_TrainerBattle.mp3 | 12rEPZwKniUhHFD5UbZjd9KA_1K0PQGtp |

As quatro faixas seguintes usam temas das próprias regiões, com tratamento retrô solicitado pelo dono do projeto, e não são arranjos da Meeow’s Music:

| Região / arquivo local | Arquivo original em `audio/bgm/` do PokeRogue | SHA do blob original (Git) |
| --- | --- | --- |
| Kalos / survival/kalos.mp3 | battle_kalos_gym.mp3 | 46c3fd04eb758e85c336c631ade07a26498f9731 |
| Alola / survival/alola.mp3 | battle_alola_elite.mp3 | 2d595c25f1eb8d03fc50b6090dd9b0af9711f12d |
| Galar / survival/galar.mp3 | battle_galar_gym.mp3 | 539b389bb3aace5b8797bc5d6e8bb3bde9496c17 |
| Paldea / survival/paldea.mp3 | battle_paldea_gym.mp3 | 2cef63209fb42d7baa2f81f8f124f4423316153e |

Fonte fixada: https://github.com/pagefaultgames/pokerogue-assets/tree/009cac30c39d3615c7b2c320c3984af368871031/audio/bgm

Direitos: Nintendo, Creatures Inc., GAME FREAK inc., conforme a atribuição do repositório de origem em https://github.com/pagefaultgames/pokerogue-assets/blob/009cac30c39d3615c7b2c320c3984af368871031/audio/REUSE.toml — `LicenseRef-FAIR-USE`. A publicação em um repositório aberto não torna essas composições uma licença aberta nem as coloca sob a licença do código deste app.

Conversão reproduzível: `node scripts/prepare-retro-audio.mjs caminho/ffmpeg pasta-dos-originais`. FFmpeg 7.1, filtro passa-altas/baixas, reamostragem a 22050 Hz, granulação leve misturada a 18%, estágio PCM de 16 bits e normalização a −20 LUFS; saída MP3 estéreo de 96 kb/s. Esse tratamento preserva a gravação e a melodia original; não troca a instrumentação por um arranjo GBA. Os cinco primeiros temas são arranjos GBA propriamente ditos.

Os efeitos da cidade são receitas sintetizadas pelo próprio projeto (`src/box/sound-recipes.ts`), sem gravações extraídas de jogos.
