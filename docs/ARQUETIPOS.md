# Arquétipos

101 arquétipos, gerados a partir de `src/core/archetypes.ts` (a fonte da verdade é o código). Os ids são estáveis: nunca renomeie, só acrescente.

- **Fonte `carta`:** só para cartas escaneadas. Sai do nome impresso, da raridade e da coleção; alguns usam os detalhes do TCGdex (`traits`), que as cartas novas guardam e as antigas ganham quando forem escaneadas de novo.
- **Fonte `espécie` / `stats`:** vale para todos, inclusive Digital Pokémon.
- **Uso futuro:** `teamArchetypes()` conta quantos membros de uma equipe dividem cada arquétipo, como base para bônus de sinergia nos modos de jogo (ainda não aplicados).

## Mecânica da carta (28)

| id | Nome | Fonte | Como é detectado |
|---|---|---|---|
| `ex-antigo` | 🔶 ex (EX Ruby & Sapphire) | carta | Pokémon-ex das coleções EX (2003–2007). |
| `lv-x` | 🔺 LV.X | carta | Nível X das coleções Diamond & Pearl e Platinum. |
| `prime` | 💠 Prime | carta | Pokémon Prime de HeartGold & SoulSilver. |
| `legend` | 🧩 LEGEND | carta | Cartas LEGEND em duas metades (HGSS). |
| `ex-maiusculo` | 🟥 EX | carta | Pokémon-EX de Black & White e XY. |
| `mega-evolucao` | 🧬 Mega Evolução | carta | Carta de Mega Evolução (M Pokémon-EX ou Mega ex). |
| `primal` | 🌋 Primitivo | carta | Reversão Primitiva (Groudon e Kyogre Primitivos). |
| `break` | 🟨 BREAK | carta | Evolução BREAK (carta deitada, de XY). |
| `gx` | 🌀 GX | carta | Pokémon-GX de Sun & Moon. |
| `tag-team` | 🤝 TAG TEAM | carta | Dois ou três Pokémon na mesma carta GX. |
| `prisma` | ◇ Estrela Prisma | carta | Cartas Prism Star (◇): só uma por deck. |
| `v` | 🟩 V | carta | Pokémon V de Sword & Shield. |
| `vmax` | 🟪 VMAX | carta | Dinamax/Gigantamax em carta VMAX. |
| `vstar` | ⭐ VSTAR | carta | Pokémon VSTAR e seu poder VSTAR. |
| `v-union` | 🧱 V-UNION | carta | Cartas V-UNION montadas em quatro partes. |
| `radiante` | 🌟 Radiante | carta | Pokémon Radiante: só um por deck. |
| `ex-moderno` | 🔷 ex (Scarlet & Violet) | carta | Pokémon ex da era Scarlet & Violet. |
| `tera` | 💎 Tera | carta | Pokémon ex Terastalizado (cristal na arte). |
| `golpe-unico` | 🥋 Golpe Único | carta | Estilo de batalha Golpe Único (Single Strike). |
| `golpe-fluido` | 🌊 Golpe Fluido | carta | Estilo de batalha Golpe Fluido (Rapid Strike). |
| `golpe-fusao` | 🔗 Golpe Fusão | carta | Estilo de batalha Golpe Fusão (Fusion Strike). |
| `sombrio` | 🌘 Sombrio / Dark | carta | Pokémon «Dark» das coleções clássicas. |
| `luz` | 🌕 Luz / Light | carta | Pokémon «Light» de Neo Destiny. |
| `brilhante` | ✴️ Brilhante (Shining) | carta | Shining Pokémon das coleções Neo e Shining Legends. |
| `estrela` | ☆ Pokémon Estrela | carta | Pokémon ☆ (Gold Star) das coleções EX. |
| `delta` | δ Espécie Delta | carta | Pokémon δ com tipo diferente do normal. |
| `treinador-dono` | 🧢 Pokémon de Treinador | carta | Pokémon de um treinador (Brock’s, Misty’s, de Rocket, de Ethan…). |
| `equipe-vilao` | 🚀 Equipe Vilã | carta | Pokémon da Equipe Rocket, Magma, Aqua, Galáctica, Plasma… |

## Raridade (15)

| id | Nome | Fonte | Como é detectado |
|---|---|---|---|
| `comum` | ● Comum | carta | Raridade comum. |
| `incomum` | ◆ Incomum | carta | Raridade incomum. |
| `rara` | ★ Rara | carta | Raridade rara. |
| `holo` | 🪩 Holo | carta | Rara holográfica. |
| `dupla-rara` | ★★ Dupla Rara | carta | Double Rare (ex comuns de Scarlet & Violet). |
| `ultra-rara` | 💫 Ultra Rara | carta | Ultra Rara / Full Art. |
| `full-art` | 🖼️ Full Art | carta | Arte que ocupa a carta inteira. |
| `ilustracao` | 🎨 Rara Ilustração | carta | Illustration Rare: arte de cena, sem moldura. |
| `ilustracao-especial` | 🖌️ Ilustração Especial | carta | Special Illustration Rare (arte alternativa). |
| `arco-iris` | 🌈 Arco-íris | carta | Rainbow Rare (Hyper Rare das eras GX e V). |
| `dourada` | 🥇 Dourada | carta | Gold / Hyper Rare. |
| `secreta` | 🔒 Secreta | carta | Número acima do total oficial da coleção. |
| `shiny-carta` | ✨ Carta Shiny | carta | Shiny Rare / Shiny Vault / Amazing Rare. |
| `amazing` | 🌠 Incrível (Amazing) | carta | Amazing Rare de Sword & Shield. |
| `ace-spec` | 🃏 ACE SPEC | carta | ACE SPEC: só uma por deck. |

## Coleção (4)

| id | Nome | Fonte | Como é detectado |
|---|---|---|---|
| `promo` | 🎟️ Promo | carta | Carta promocional. |
| `galeria` | 🏛️ Galeria | carta | Trainer Gallery, Galarian Gallery ou Character Rare. |
| `classica-wotc` | 📜 Clássica (WOTC) | carta | Coleções da Wizards of the Coast (Base a Skyridge). |
| `regulacao` | 🔤 Marca de regulação | carta | Carta com marca de regulação (D em diante). |

## Tipo (20)

| id | Nome | Fonte | Como é detectado |
|---|---|---|---|
| `tipo-normal` | ⚪ Normal | espécie | Pokémon do tipo Normal. |
| `tipo-fire` | 🔥 Fogo | espécie | Pokémon do tipo Fogo. |
| `tipo-water` | 💧 Água | espécie | Pokémon do tipo Água. |
| `tipo-electric` | ⚡ Elétrico | espécie | Pokémon do tipo Elétrico. |
| `tipo-grass` | 🌿 Planta | espécie | Pokémon do tipo Planta. |
| `tipo-ice` | ❄️ Gelo | espécie | Pokémon do tipo Gelo. |
| `tipo-fighting` | 🥊 Lutador | espécie | Pokémon do tipo Lutador. |
| `tipo-poison` | ☠️ Venenoso | espécie | Pokémon do tipo Venenoso. |
| `tipo-ground` | ⛰️ Terrestre | espécie | Pokémon do tipo Terrestre. |
| `tipo-flying` | 🪽 Voador | espécie | Pokémon do tipo Voador. |
| `tipo-psychic` | 🔮 Psíquico | espécie | Pokémon do tipo Psíquico. |
| `tipo-bug` | 🐛 Inseto | espécie | Pokémon do tipo Inseto. |
| `tipo-rock` | 🪨 Pedra | espécie | Pokémon do tipo Pedra. |
| `tipo-ghost` | 👻 Fantasma | espécie | Pokémon do tipo Fantasma. |
| `tipo-dragon` | 🐉 Dragão | espécie | Pokémon do tipo Dragão. |
| `tipo-dark` | 🌑 Sombrio | espécie | Pokémon do tipo Sombrio. |
| `tipo-steel` | ⚙️ Metálico | espécie | Pokémon do tipo Metálico. |
| `tipo-fairy` | ✨ Fada | espécie | Pokémon do tipo Fada. |
| `monotipo` | ① Monotipo | espécie | Um tipo só. |
| `dois-tipos` | ② Dois tipos | espécie | Dois tipos. |

## Categoria da espécie (9)

| id | Nome | Fonte | Como é detectado |
|---|---|---|---|
| `inicial` | 🎒 Inicial | espécie | Um dos iniciais de alguma região (com as evoluções). |
| `bebe` | 🍼 Bebê | espécie | Pokémon bebê. |
| `fossil` | 🦴 Fóssil | espécie | Revivido de um fóssil. |
| `pseudo-lendario` | 🐲 Pseudolendário | espécie | Linha de três estágios com 600 de stats no fim. |
| `lendario` | 🏛️ Lendário | espécie | Pokémon lendário. |
| `mitico` | 🌌 Mítico | espécie | Pokémon mítico (de evento). |
| `ultracriatura` | 🕳️ Ultracriatura | espécie | Ultra Beast de outro mundo. |
| `paradoxo` | ⏳ Paradoxo | espécie | Forma Paradoxo, antiga ou futura. |
| `forma-regional` | 🗺️ Forma regional | espécie | Forma de Alola, Galar, Hisui ou Paldea. |

## Estágio (4)

| id | Nome | Fonte | Como é detectado |
|---|---|---|---|
| `basico` | ① Básico | espécie | Não evolui de ninguém (sem contar bebês). |
| `estagio-1` | ② Estágio 1 | espécie | Evolui uma vez. |
| `estagio-2` | ③ Estágio 2 | espécie | Evolui duas vezes. |
| `final` | 🏁 Forma final | espécie | Não evolui mais. |

## Região (9)

| id | Nome | Fonte | Como é detectado |
|---|---|---|---|
| `regiao-kanto` | 📍 Kanto | espécie | Espécie apresentada em Kanto. |
| `regiao-johto` | 📍 Johto | espécie | Espécie apresentada em Johto. |
| `regiao-hoenn` | 📍 Hoenn | espécie | Espécie apresentada em Hoenn. |
| `regiao-sinnoh` | 📍 Sinnoh | espécie | Espécie apresentada em Sinnoh. |
| `regiao-unova` | 📍 Unova | espécie | Espécie apresentada em Unova. |
| `regiao-kalos` | 📍 Kalos | espécie | Espécie apresentada em Kalos. |
| `regiao-alola` | 📍 Alola | espécie | Espécie apresentada em Alola. |
| `regiao-galar` | 📍 Galar | espécie | Espécie apresentada em Galar. |
| `regiao-paldea` | 📍 Paldea | espécie | Espécie apresentada em Paldea. |

## Estilo de luta (8)

| id | Nome | Fonte | Como é detectado |
|---|---|---|---|
| `atacante-fisico` | 🗡️ Atacante físico | stats | Attack é o maior stat de ataque, e alto (≥ 100). |
| `atacante-especial` | 🪄 Atacante especial | stats | Special Attack é o maior stat de ataque, e alto (≥ 100). |
| `muralha` | 🛡️ Muralha | stats | Defense + Special Defense bem acima dos ataques. |
| `velocista` | 💨 Velocista | stats | Speed ≥ 100. |
| `tanque` | 🧱 Tanque | stats | HP ≥ 100. |
| `vidro` | 🔭 Canhão de vidro | stats | Ataca forte (≥ 100) e aguenta pouco (defesas somadas < 140). |
| `equilibrado` | ⚖️ Equilibrado | stats | Nenhum stat se destaca muito (todos entre 60 e 110). |
| `peso-pesado` | 🏋️ Peso-pesado | stats | Soma de stats ≥ 580 (fora lendários e míticos). |

## Especial (4)

| id | Nome | Fonte | Como é detectado |
|---|---|---|---|
| `shiny` | ✨ Shiny | espécie | Sorteado shiny no escaneamento ou invocado shiny. |
| `mega` | 🧬 Mega | espécie | Escaneado como carta Mega. |
| `digital` | 💾 Digital | espécie | Digital Pokémon, sem carta física. |
| `carta-fisica` | 🃏 Carta física | carta | Veio de uma carta escaneada. |
