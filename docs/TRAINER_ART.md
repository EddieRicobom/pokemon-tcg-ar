# Arte e animação dos treinadores

O personagem da Vila usa uma folha PNG própria para cada treinador selecionável. As poses foram geradas como imagens novas com a ferramenta integrada `image_gen.imagegen`, usando o sprite individual do catálogo `src/core/trainer-sprites.ts` como referência de identidade e Lucas como referência de estilo. São desenhos derivados de personagens Pokémon; os avisos de terceiros continuam se aplicando.

Cada folha em `public/art/trainers/<id>.png` tem 256 × 320 pixels: quatro colunas de 64 × 80, nas direções **baixo, esquerda, direita e cima**. Cada linha contém **repouso, passo esquerdo, repouso alternativo e passo direito**. A caminhada acompanha o movimento real do personagem; o repouso alterna as duas imagens paradas. Não há espelhamento do retrato de batalha nem deformação de membros por código.

O preparo aguarda a imagem do treinador escolhido antes de abrir a cena. O renderizador mantém o tamanho no mundo e o ponto dos pés entre as poses, com os acessórios existentes sobrepostos. Somente a folha escolhida é solicitada; o Service Worker guarda as folhas usadas, sem baixar o catálogo inteiro na instalação. Se o arquivo não carregar, o desenho anterior continua como reserva.

## Preparar e conferir os arquivos

As imagens originais geradas podem ter margens e dimensões diferentes. O preparo local encontra corredores transparentes entre as quatro linhas e entre as quatro poses de cada linha, recorta sem cortar cabelo ou pés e aplica **um único fator de escala por treinador**. Não desenha nem inventa poses. Os quadros são colocados com o centro dos pés na mesma posição.

```bash
node scripts/prepare-trainer-atlas.ts origem.png public/art/trainers/lucas.png
node scripts/verify-trainer-atlases.ts
```

O verificador exige as 40 folhas do catálogo, transparência, margens, poses distintas de caminhada e limite de tamanho. Ele roda no CI e antes do deploy. Identidade, cores e direção exigem inspeção visual; os testes de pixels não pretendem reconhecer personagens. A seleção das poses, o recorte comum e a detecção dos corredores transparentes têm testes unitários em `src/core/`.

## Prompt de produção

Prompt-base do conjunto, complementado pela identidade e roupa da referência individual:

> Production transparent PNG overworld animation atlas for a Pokémon village game. Preserve the exact clothing, hair, accessories and colors of the individual trainer reference, but create a NEW overworld drawing, never repeat the battle portrait pose. Lucas is the style reference: refined Nintendo DS pixel art, crisp deliberate pixels, about 2.8 heads tall. Exactly four columns by four rows, sixteen full-body instances of the same character. Row 1 down/front; row 2 left profile; row 3 right profile; row 4 up/back. Every row: neutral idle, left-foot stride with opposing arm, subtle idle breathing, right-foot stride with opposing arm. Keep scale, pivot, lighting and feet baseline consistent. Genuine transparent background, ample margins, no floor, shadow, text, labels or grid lines. Draw each direction appropriately; preserve asymmetric accessories.

Erros de direção e paleta observados nas primeiras versões de Médium, Treinador Ás e Guarda Pokémon foram corrigidos por nova geração ou edição com `image_gen`, antes de preparar as folhas finais. Os arquivos consumidos pelo jogo são as imagens PNG locais; nenhuma geração ocorre no celular ou no GitHub Actions.
