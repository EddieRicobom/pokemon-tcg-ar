import { L, calm, day, evening, friendsNow, heard, is, night, other, rainy, said, snowy } from './kit';
import type { Template } from './kit';

/** A vida na cidadinha: casas, Café, Correio, Museu, a fonte da praça, os postes de luz e a rotina de dormir cedo ou tarde. */
export const CIDADE_MOMENTS: readonly Template[] = [
  // ---------------------------------------------------------------------------- casas
  {
    id: 'cid-primeira-noite', kind: 'solo', title: 'A primeira noite em casa', emoji: '🛏️', cast: 1, weight: 5, when: (c) => c.env.town >= 1 && night(c),
    lines: () => [L(0, 'É a minha casa. A minha cama. O meu cheirinho de casa nova.', 'heart'), L(0, '(experimenta cada canto, deita no tapete, rola no sofá)', 'laugh'), L(0, 'Eu nunca mais saio daqui. Só para comer. E para passear. E para o Café.', 'sparkle')],
    outcome: { friend: 1 },
  },
  {
    id: 'cid-visita-surpresa', kind: 'amizade', title: 'Visita de surpresa', emoji: '🔔', cast: 2, weight: 5, when: (c) => day(c) && c.env.town >= 2 && friendsNow(c),
    lines: (c) => [L(0, '(toc toc) Quem é?', 'question'), L(1, `Sou eu, ${c.n[0]}! Trouxe uma torta e muita conversa.`, 'star'), L(0, 'Entra, entra! Pisa só no tapete limpo. Ou em qualquer um, eu não ligo.', 'heart'), L(1, 'A casa está lindíssima! Esse sofá é de nuvem?', 'sparkle')],
    outcome: { bond: 7, spark: 1, friend: 1 },
    after: (n, who) => (who === 0 ? `${other(n, who)} apareceu na minha porta com uma torta. Nunca me senti tão visitado.` : `Visitei ${n[0]} com uma torta. A casa dele é a mais aconchegante da Vila.`),
  },
  {
    id: 'cid-inauguracao', kind: 'festa', title: 'Inauguração da casa nova', emoji: '🎊', cast: 3, weight: 5, when: (c) => c.env.town >= 3 && (day(c) || evening(c)),
    lines: (_c) => [L(0, 'Bem-vindos à minha casa nova! Tem bolo, suco e três cadeiras!', 'star'), L(1, 'Eu trouxe um presente: uma planta pequena e uma barriga grande.', 'laugh'), L(2, 'Eu trouxe um discurso. (pigarreia) Obrigado. Era isso.', 'sparkle'), L(0, 'Perfeito! Essa casa agora tem alma, e migalhas.', 'heart')],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1, friend: 1 },
  },
  {
    id: 'cid-casa-bagunca', kind: 'comedia', title: 'Casa de bagunça', emoji: '🧦', cast: 1, weight: 4, when: (c) => c.env.town >= 2 && day(c) && is(c, 0, 'Brincalhão', 'Guloso', 'Curioso'),
    lines: () => [L(0, 'A visita chega em dez minutos! Eu tenho que arrumar tudo!', 'shock'), L(0, '(enfia tudo debaixo da cama, atrás do sofá e dentro do armário)', 'sweat'), L(0, 'Pronto. Está impecável. Só não abram o armário, por favor.', 'laugh')],
    outcome: {},
  },
  {
    id: 'cid-telhado-goteira', kind: 'comedia', title: 'Goteira no telhado', emoji: '💧', cast: 2, weight: 5, when: (c) => rainy(c) && c.env.town >= 2,
    lines: (c) => [L(0, `${c.n[1]}, tem uma goteira em cima da minha cama!`, 'shock'), L(1, 'Põe uma panela embaixo! Duas! E uma xícara!', 'idea'), L(0, '(plim, plim, plim: o quarto virou uma orquestra de goteiras)', 'note'), L(1, 'Isso é bonito! Parece uma música de relaxamento.', 'sparkle')],
    outcome: { bond: 5, items: [['madeira', 1]] },
  },
  {
    id: 'cid-reforma-casa', kind: 'amizade', title: 'A casa ficou nova', emoji: '🏗️', cast: 2, weight: 5, when: (c) => c.env.town >= 4 && day(c),
    lines: (c) => [L(0, `${c.n[1]}, olha só a minha casa! Tem tijolinho, telhado novo e uma janela maior.`, 'star'), L(1, 'Era uma cabana e virou um palácio! O que você fez?', 'shock'), L(0, 'O treinador ajudou com muita madeira, pedra e carinho.', 'heart'), L(1, 'Eu quero uma igual. Ou uma maior. Ou uma que flutue.', 'laugh')],
    outcome: { bond: 5, spark: 1, friend: 1 },
  },
  {
    id: 'cid-roof-colorido', kind: 'amizade', title: 'Telhado colorido', emoji: '🎨', cast: 2, weight: 4, when: (c) => c.env.town >= 3 && day(c) && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, por que o seu telhado é roxo?`, 'question'), L(1, 'Eu pedi azul e o pintor viu roxo. Mas gostei da surpresa.', 'laugh'), L(0, 'Dá para achar de longe! É um farol de casa.', 'star'), L(1, 'Se eu me perder, é só procurar o roxo. Roxo é bom.', 'sparkle')],
    outcome: { bond: 5 },
  },
  {
    id: 'cid-lampiao-na-porta', kind: 'solo', title: 'O lampião da porta', emoji: '🏮', cast: 1, weight: 4, when: (c) => c.env.town >= 2 && night(c),
    lines: () => [L(0, '(acende o lampião da porta e dá um passo atrás para admirar)', 'sparkle'), L(0, 'Antes eu chegava em casa no escuro e tropeçava no degrau.', 'sweat'), L(0, 'Agora eu tropeço com muita luz. É um avanço.', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'cid-cerca-branca', kind: 'solo', title: 'Pintando a cerca', emoji: '🖌️', cast: 1, weight: 4, when: (c) => c.env.town >= 2 && day(c) && calm(c),
    lines: () => [L(0, 'A cerca branca é o cartão de visitas de uma casa.', 'idea'), L(0, '(pinta uma tábua, a tinta pinga no pé, pinta o pé também)', 'sweat'), L(0, 'Eu fiquei com os dois pés brancos. Moda nova.', 'laugh')],
    outcome: {},
  },
  {
    id: 'cid-dorme-cedo', kind: 'solo', title: 'Hora de dormir', emoji: '🌙', cast: 1, weight: 5, when: (c) => c.env.hour >= 20 && c.env.hour < 23 && c.env.town >= 1,
    lines: () => [L(0, '(boceja, estica, olha para a lua) O dia foi bom. Muito bom.', 'zzz'), L(0, 'Mais um capítulo do livro e eu durmo. Só um. Dois. Três.', 'sweat'), L(0, '(cai no sono no quarto capítulo)', 'zzz')],
    outcome: {},
  },
  {
    id: 'cid-notivago', kind: 'solo', title: 'O notívago', emoji: '🦉', cast: 1, weight: 5, when: (c) => night(c) && c.env.hour >= 22,
    lines: () => [L(0, 'A Vila inteira dormindo, e eu acordado, com a noite só para mim.', 'sparkle'), L(0, 'É a hora em que os pensamentos ficam mais grandes e os biscoitos, mais gostosos.', 'idea'), L(0, '(passa a noite no escuro, com um lampião e uma torta)', 'heart')],
    outcome: { friend: 1 },
  },
  {
    id: 'cid-madrugada-encontro', kind: 'amizade', title: 'Dois notívagos', emoji: '🌌', cast: 2, weight: 5, when: (c) => night(c) && c.env.hour >= 22 && calm(c),
    lines: (c) => [L(0, '(passa em frente à casa dele) Luz acesa? Você também não dorme?', 'question'), L(1, 'Eu durmo de dia. A noite é boa demais para desperdiçar.', 'star'), L(0, `${c.n[1]}, eu pensei que era o único acordado na Vila.`, 'sparkle'), L(1, 'A gente forma o clube dos notívagos. Reunião às duas.', 'laugh')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'cid-bom-dia-vizinho', kind: 'amizade', title: 'Bom dia, vizinho', emoji: '☀️', cast: 2, weight: 6, when: (c) => c.env.hour >= 6 && c.env.hour < 10 && c.env.town >= 1,
    lines: (c) => [L(0, '(abre a janela e acena) Bom dia, vizinho!', 'sparkle'), L(1, 'Bom dia! Dormiu bem?', 'heart'), L(0, `Dormi demais! ${c.n[1]}, o dia já está tão bonito...`, 'laugh'), L(1, 'A gente se vê no café da praça, então!', 'star')],
    outcome: { bond: 4, friend: 1 },
  },
  {
    id: 'cid-acender-postes', kind: 'solo', title: 'Os postes acesos', emoji: '💡', cast: 1, weight: 5, when: (c) => c.env.hour >= 18 && c.env.hour < 21 && calm(c),
    lines: () => [L(0, 'Os postes foram acendendo, um a um, como uma fila de vagalumes.', 'sparkle'), L(0, 'A rua toda amarela, o céu azul e eu bem no meio.', 'heart'), L(0, 'Eu não troco essa hora por nada. Nem por bolo.', 'sweat')],
    outcome: { friend: 1 },
  },
  // ---------------------------------------------------------------------------- Café
  {
    id: 'cid-cafe-bolo-do-dia', kind: 'amizade', title: 'O bolo do dia', emoji: '🍰', cast: 2, weight: 5, when: (c) => c.env.town >= 3 && day(c),
    lines: (c) => [L(0, 'O bolo do dia no Café é de laranja com calda de mel!', 'star'), L(1, `${c.n[0]}, eu vou pedir duas fatias: uma para agora e outra para depois.`, 'fire'), L(0, 'A de depois vai virar a de agora em dois minutos.', 'laugh'), L(1, 'Eu não negocio com o meu estômago.', 'sweat')],
    outcome: { bond: 5, coins: 2 },
  },
  {
    id: 'cid-cafe-barista', kind: 'comedia', title: 'O barista distraído', emoji: '🫖', cast: 2, weight: 5, when: (c) => c.env.town >= 3 && day(c),
    lines: (c) => [L(0, 'Um chá de camomila, por favor.', 'idea'), L(1, '(o barista serve sopa) Aqui está o seu chá!', 'shock'), L(0, 'Isso... é uma sopa?', 'question'), L(1, `${c.n[0]}, a gente tomou sopa de camomila. Estava deliciosa.`, 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'cid-cafe-encontro', kind: 'amizade', title: 'Encontro no Café', emoji: '☕', cast: 2, weight: 5, when: (c) => c.env.town >= 3 && day(c) && friendsNow(c),
    lines: (c) => [L(0, `${c.n[1]}! Tem uma mesa vaga bem perto da janela!`, 'star'), L(1, 'Esse é o meu lugar de sempre. Eu avisei à janela que você vinha.', 'heart'), L(0, 'Eu te conto a minha semana. Você me conta a sua. E a gente se confunde.', 'laugh'), L(1, 'Isso é uma amizade de verdade.', 'sparkle')],
    outcome: { bond: 7, spark: 1, coins: 3 },
  },
  {
    id: 'cid-cafe-intriga', kind: 'drama', title: 'Fofoca na mesa ao lado', emoji: '👂', cast: 3, weight: 5, when: (c) => c.env.town >= 3 && day(c),
    lines: (_c) => [L(0, '(sussurra) Soube de quem estava com quem na praça ontem?', 'idea'), L(1, '(sussurra) Eu soube, mas não vou contar. Só vou sussurrar em voz alta.', 'laugh'), L(2, '(na mesa ao lado, finge ler o cardápio de ponta-cabeça)', 'sweat'), L(0, 'O cardápio está ao contrário. A gente sabe.', 'laugh')],
    outcome: { bond: 3, bond02: 2, bond12: 3 },
  },
  {
    id: 'cid-cafe-conta', kind: 'comedia', title: 'A conta do Café', emoji: '🧾', cast: 2, weight: 4, when: (c) => c.env.town >= 3 && day(c),
    lines: (c) => [L(0, 'Eu pago a minha, e metade da sua.', 'idea'), L(1, 'Eu pago a minha e metade da sua. Então a gente não paga nada?', 'question'), L(0, 'A matemática diz que pagamos o dobro.', 'shock'), L(1, `${c.n[0]}, o treinador paga. Resolvido.`, 'laugh')],
    outcome: { bond: 3 },
  },
  // ---------------------------------------------------------------------------- Correio
  {
    id: 'cid-correio-carta-nova', kind: 'solo', title: 'Chegou carta!', emoji: '📬', cast: 1, weight: 5, when: (c) => c.env.town >= 5 && day(c),
    lines: () => [L(0, 'Uma carta para mim! Quem será? O carteiro, de longe, nem disfarça.', 'shock'), L(0, '(abre devagar, com um sorriso do tamanho do rosto)', 'heart'), L(0, '"Estamos com saudade." Só isso! Eu chorei uma xícara de chá.', 'sad')],
    outcome: { friend: 1 },
  },
  {
    id: 'cid-correio-selo', kind: 'comedia', title: 'O selo no lugar errado', emoji: '📮', cast: 2, weight: 4, when: (c) => c.env.town >= 5 && day(c),
    lines: (c) => [L(0, `${c.n[1]}, eu colei o selo na testa do carteiro.`, 'shock'), L(1, 'Ele ficou nervoso?', 'question'), L(0, 'Ele carimbou a minha testa também. Estamos empatados.', 'laugh'), L(1, 'Hoje você é uma encomenda expressa.', 'laugh')],
    outcome: { bond: 3 },
  },
  {
    id: 'cid-correio-escrevendo', kind: 'amizade', title: 'Escrevendo uma carta', emoji: '✍️', cast: 2, weight: 4, when: (c) => c.env.town >= 5 && (day(c) || evening(c)),
    lines: (c) => [L(0, `${c.n[1]}, como se escreve "saudade" sem chorar?`, 'sad'), L(1, 'Eu escrevo com a letra tremida, assim a lágrima já sai em tinta.', 'heart'), L(0, 'Ficou um borrão lindo. Vou mandar assim mesmo.', 'sparkle'), L(1, 'A pessoa vai entender o borrão como um abraço.', 'heart')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'cid-correio-resposta', kind: 'amizade', title: 'Carta sobre o treinador', emoji: '💌', cast: 2, weight: 8, when: (c) => c.env.town >= 5 && heard(c) && day(c),
    lines: (c) => [L(0, `Escrevi uma carta para o treinador. Falei de "${said(c)}", que ele me respondeu.`, 'idea'), L(1, 'Escreveu em cima do selo? Ou do lado?', 'question'), L(0, 'No papel. Mas o selo ficou meio sujo de emoção.', 'sweat'), L(1, 'O treinador vai amar. Ou vai pensar que é conta.', 'laugh')],
    outcome: { bond: 4, friend: 2 },
  },
  // ---------------------------------------------------------------------------- Museu
  {
    id: 'cid-museu-guia', kind: 'comedia', title: 'O guia do Museu', emoji: '🧑‍🏫', cast: 2, weight: 4, when: (c) => c.env.town >= 8 && day(c),
    lines: (c) => [L(0, 'À esquerda, uma cadeira de 1432. À direita, outra cadeira de 1433.', 'idea'), L(1, 'Qual é a diferença entre elas?', 'question'), L(0, 'Um ano... e um pouquinho de pó.', 'laugh'), L(1, `${c.n[0]}, isso é arte ou faxina?`, 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'cid-museu-silencio', kind: 'comedia', title: 'Silêncio no Museu', emoji: '🤫', cast: 2, weight: 4, when: (c) => c.env.town >= 8 && day(c),
    lines: (_c) => [L(0, '(sussurrando) Psiu! É um museu, não um mercado!', 'idea'), L(1, '(sussurrando mais alto) Eu estou sussurrando!', 'sweat'), L(0, '(espirra e o eco percorre o salão inteiro)', 'shock'), L(1, 'O guarda olha para nós com um olhar de aço.', 'sweat')],
    outcome: { bond: 3 },
  },
  {
    id: 'cid-museu-doacao', kind: 'amizade', title: 'Doação ao Museu', emoji: '🖼️', cast: 2, weight: 4, when: (c) => c.env.town >= 8 && day(c),
    lines: (c) => [L(0, `${c.n[1]}, eu vou doar a minha pedrinha favorita ao Museu.`, 'heart'), L(1, 'A pedrinha da sorte? Aquela que você carregava o tempo todo?', 'shock'), L(0, 'É para todos verem. A sorte que é dividida cresce.', 'sparkle'), L(1, 'Isso é a coisa mais bonita que eu já ouvi hoje.', 'heart')],
    outcome: { bond: 6, spark: 1, friend: 1 },
  },
  {
    id: 'cid-museu-resposta', kind: 'solo', title: 'Exposição de respostas', emoji: '🏛️', cast: 1, weight: 7, when: (c) => c.env.town >= 8 && heard(c) && day(c),
    lines: (c) => [L(0, `No Museu eu inventei uma exposição: "${said(c)}", obra do treinador.`, 'star'), L(0, '(coloca uma plaquinha: "Não toque. Nem comente.")', 'idea'), L(0, 'É a exposição mais visitada da Vila. Tem duas pessoas: eu e eu.', 'laugh')],
    outcome: { friend: 1 },
  },
  // ---------------------------------------------------------------------------- Fonte e praça
  {
    id: 'cid-fonte-pedido', kind: 'solo', title: 'Uma moeda na fonte', emoji: '🪙', cast: 1, weight: 5, when: (c) => day(c) || evening(c),
    lines: () => [L(0, '(joga uma moeda na fonte e fecha os olhos) Eu quero... eu quero...', 'sparkle'), L(0, 'Eu quero muitos amigos, uma torta eterna e um dia sem espirro.', 'idea'), L(0, '(a fonte borbulha, como quem diz: "vou ver o que posso fazer")', 'sparkle')],
    outcome: { coins: 1 },
  },
  {
    id: 'cid-fonte-brincar', kind: 'comedia', title: 'Banho na fonte', emoji: '⛲', cast: 2, weight: 5, when: (c) => day(c) && calm(c) && c.env.hour >= 11 && c.env.hour < 17 && is(c, 0, 'Brincalhão', 'Corajoso', 'Curioso'),
    lines: (c) => [L(0, '(pula na fonte) Está geladinha! Vem!', 'laugh'), L(1, 'Pode? Tem uma placa dizendo que não pode.', 'question'), L(0, 'A placa está do outro lado. Eu não li. Não vi. Não sei.', 'laugh'), L(1, `${c.n[0]}... o guarda da praça está vindo.`, 'shock')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'cid-fonte-segredo', kind: 'amizade', title: 'Segredo na fonte', emoji: '🤫', cast: 2, weight: 5, when: (c) => evening(c) && friendsNow(c),
    lines: (c) => [L(0, `${c.n[1]}, dizem que quem sussurra um segredo na fonte, ele nunca sai de lá.`, 'idea'), L(1, 'E o barulho da água não deixa ninguém ouvir?', 'question'), L(0, '(sussurra um segredo curtinho, de duas palavras)', 'heart'), L(1, 'Eu entendi. Eu guardo. Pode confiar.', 'sparkle')],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'cid-fonte-neve', kind: 'solo', title: 'Fonte congelada', emoji: '🧊', cast: 1, weight: 5, when: (c) => snowy(c),
    lines: () => [L(0, 'A fonte da praça congelou! Parece uma escultura de cristal.', 'shock'), L(0, '(cutuca o gelo com a pata) Tem um barulhinho de sino!', 'note'), L(0, 'Quando derreter, eu volto. Para conferir se o sino ainda toca.', 'sparkle')],
    outcome: { friend: 1 },
  },
  {
    id: 'cid-praca-banco', kind: 'solo', title: 'O banco da praça', emoji: '🪑', cast: 1, weight: 5, when: (c) => day(c) && calm(c),
    lines: () => [L(0, 'Eu amo ficar sentado no banco da praça. É o melhor lugar para não fazer nada.', 'heart'), L(0, '(observa as pessoas, os Pokémon, as nuvens, os pássaros)', 'sparkle'), L(0, 'A cidade toda passa na minha frente, de graça.', 'idea')],
    outcome: { friend: 1 },
  },
  {
    id: 'cid-trio-praca', kind: 'festa', title: 'Tarde na praça', emoji: '🌳', cast: 3, weight: 5, when: (c) => day(c) && calm(c) && c.env.town >= 3,
    lines: (_c) => [L(0, 'A praça está cheia! Tem pipoca, balão e um violão.', 'star'), L(1, 'Eu vou competir no concurso de bolhas de sabão!', 'fire'), L(2, 'Eu ajudo a segurar o balão. Mas não solto jamais.', 'laugh'), L(0, '(o balão sobe com um suspiro; os três acenam, felizes)', 'sparkle')],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1 },
  },
  {
    id: 'cid-feira-sabado', kind: 'festa', title: 'Feira de sábado', emoji: '🥕', cast: 2, weight: 5, when: (c) => c.date.dow === 6 && day(c) && c.env.town >= 2,
    lines: (c) => [L(0, `${c.n[1]}, sábado é dia de feira! Eu quero tudo o que tiver verde.`, 'star'), L(1, 'Eu quero tudo o que tiver cheiro. E tudo o que tiver preço baixo.', 'idea'), L(0, '(volta com uma sacola enorme e três cenouras tortas)', 'laugh'), L(1, 'A barraquinha de mel me convenceu. Eu tenho um problema.', 'sweat')],
    outcome: { bond: 5, coins: 4, items: [['mel', 1]] },
  },
  {
    id: 'cid-domingo-passeio', kind: 'amizade', title: 'Passeio de domingo', emoji: '🚶', cast: 2, weight: 5, when: (c) => c.date.dow === 0 && day(c) && calm(c) && c.env.town >= 2,
    lines: (c) => [L(0, 'Domingo é o dia de passear pela rua principal, olhando as casas.', 'sparkle'), L(1, `${c.n[0]}, aquela tem uma janela redonda! Eu quero uma.`, 'star'), L(0, 'E essa tem um jardim cheio de girassol!', 'heart'), L(1, 'A gente vai montar uma lista de desejos para a nossa casa.', 'idea')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'cid-trem-fantasma', kind: 'comedia', title: 'A casa mal-assombrada', emoji: '👻', cast: 2, weight: 4, when: (c) => night(c) && c.env.town >= 4 && is(c, 0, 'Corajoso', 'Curioso', 'Brincalhão'),
    lines: (c) => [L(0, `${c.n[1]}, aquela casa vazia da esquina é mal-assombrada. Eu ouvi um gemido!`, 'shock'), L(1, 'Gemido? Eu ouvi um ronco. Vem, vamos olhar!', 'fire'), L(0, '(abrem a porta devagar: é o notívago, roncando)', 'laugh'), L(1, 'O fantasma tem um cobertor de bolinhas.', 'laugh')],
    outcome: { bond: 5 },
  },
  {
    id: 'cid-chuva-calcada', kind: 'solo', title: 'Chuva na calçada', emoji: '☔', cast: 1, weight: 4, when: (c) => rainy(c) && c.env.town >= 2,
    lines: () => [L(0, 'A chuva cai nas calçadas e faz um som de aplauso suave.', 'note'), L(0, 'Eu escuto da janela, com uma xícara quente e o gato do vizinho.', 'heart'), L(0, 'Não preciso de mais nada. Só mais uma xícara.', 'laugh')],
    outcome: { friend: 1 },
  },
];
