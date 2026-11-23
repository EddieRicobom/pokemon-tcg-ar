# Fenda do Mew

Hack-n-slash top-down onde **o treinador** (não um Pokémon) atravessa um mapa grande que continua a Vila. A entrada fica na **Estátua do Mew**, no alto do Monte Miragem: ação **🌌 Atravessar a fenda**.

## Mundo

- Mapa de **120×90 tiles** (32 px cada), determinístico pela seed: clareira da Vila (segura e com cura), estradas, lagos, Bosque, Campos, Ruínas ao norte e Brasa a leste.
- Cada bioma tem visual próprio: árvores, arbustos e cogumelos no Bosque; flores e capim nos Campos; colunas, lajes, rachaduras e entulho nas Ruínas; cinza, obsidiana, lava com rachaduras e brasas na Brasa. Estradas têm bordas e pedras; as travessias sobre água/lava usam pontes de madeira.
- A clareira tem casas, fonte e vaga-lumes. A atmosfera muda por zona (vaga-lumes, poeira ou brasas) e há uma vinheta suave.
- Câmera segue o treinador; minimapa mostra o mapa inteiro e os inimigos/chefes.
- A clareira da Vila não recebe dano e recupera 7 de vida por segundo.

## Combate e captura

- O treinador usa as armas do catálogo da Masmorra adaptadas para tempo real (`core/rift.ts`): espada, lâminas, lança, martelo, emissor, rifle e canhão.
- Inimigos perseguem e atacam de perto; chefes têm mais vida, dano e tamanho.
- Pokémon selvagens abaixo de **35% de vida** podem ser capturados com uma Pokébola. Até **3** acompanham o treinador e atacam sozinhos.
- Poções curam 45% da vida; Poções e Pokébolas caem de inimigos; chefes soltam armas novas.
- Ao cair, o treinador volta à clareira, perde 10% do XP atual e mantém nível, arma, itens e Pokémon.

## Progressão salva

`tcg-ar-rift-v1` (entra no backup do app):

- nível, XP, vida máxima, arma equipada, armas liberadas;
- Poções e Pokébolas;
- Pokémon capturados (espécie, nome, nível e vida);
- chefes vencidos (Gengar nas Ruínas, Arcanine na Brasa) e a posição no mapa.

Cada chefe derrotado paga **40 moedas** na carteira da Vila uma única vez. O menu da Fenda mostra as armas, a equipe, o progresso e permite salvar ou apagar o save.

## Controles

- **WASD/setas** andam · **Espaço/J** ataca · **Shift** esquiva · **C** captura · **Q** poção · **M** menu · **Esc** fecha.
- No celular: direcional à esquerda, ataque grande à direita, além de esquivar, capturar e poção.

## Testes

- `src/core/rift.test.ts`: mapa/clareira, colisão, spawn, golpe corpo a corpo e projétil, captura, nível e ressurreição.
- `src/app/rift-store.test.ts`: normalização, ida e volta do save e limpeza.

## Limites atuais

- Não usa carga/capacidade/AP das armas da Masmorra; os números são de tempo real.
- Aliados não recebem dano; não há áudio próprio nem loja.
- Aparência e toque ainda não foram medidos em celular real.
