import { L, calm, day, evening, friendsNow, heard, is, night, other, rainy, said, sameType, snowy } from './kit';
import type { Template } from './kit';

/** Mais duplas, parte 1: amizade e comédia. */
export const DUO2A_MOMENTS: readonly Template[] = [
  // ---------------------------------------------------------------------------- amizade
  {
    id: 'duo2-guarda-chuva-ao-contrario', kind: 'amizade', title: 'O guarda-chuva ao contrário', emoji: '☔', cast: 2, weight: 5, when: (c) => rainy(c),
    lines: (c) => [L(0, `${c.n[1]}, entra aqui debaixo! (abre uma folha gigante)`, 'star'), L(1, 'Eu ia reclamar da chuva, mas agora estou com vontade de agradecer.', 'heart'), L(0, '(um vento vira a folha do avesso; os dois ficam molhados e rindo)', 'laugh'), L(1, 'A intenção foi linda. O resultado foi ensopado.', 'laugh')],
    outcome: { bond: 7, friend: 1 },
    after: (n, who) => `${other(n, who)} e eu dividimos uma folha. Chovia dentro dela. Mas valeu.`,
  },
  {
    id: 'duo2-pique-esconde', kind: 'amizade', title: 'Pique-esconde', emoji: '🙈', cast: 2, weight: 5, when: (c) => day(c) && calm(c) && is(c, 0, 'Brincalhão', 'Curioso', 'Tímido'),
    lines: (c) => [L(0, 'Um, dois, três... trinta! Pronto ou não, lá vou eu!', 'star'), L(1, '(escondido atrás de uma árvore, mas com o rabo de fora)', 'sweat'), L(0, `Estou vendo um rabo muito suspeito, ${c.n[1]}!`, 'laugh'), L(1, 'É a sombra do rabo! Não conta!', 'anger')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'duo2-sopa-pro-doente', kind: 'amizade', title: 'Sopa para o resfriado', emoji: '🤧', cast: 2, weight: 4, when: (c) => (rainy(c) || snowy(c)) && friendsNow(c),
    lines: (c) => [L(1, '(atchim!) Eu estou ótimo. Só um pouquinho entupido de tudo.', 'sweat'), L(0, `${c.n[1]}, você está pior do que diz. Eu fiz sopa!`, 'heart'), L(1, 'Tem gosto de colher de pau e carinho.', 'sparkle'), L(0, 'É a receita secreta da minha avó. Eu inventei agora.', 'laugh')],
    outcome: { bond: 9, spark: 1, friend: 1 },
    after: (n, who) => (who === 0 ? `Cuidei do ${n[1]} com sopa. O espirro dele quase derrubou a casa.` : `${n[0]} fez sopa para mim. Eu nunca me senti tão bem estando tão mal.`),
  },
  {
    id: 'duo2-troca-figurinhas', kind: 'amizade', title: 'Troca de figurinhas', emoji: '🃏', cast: 2, weight: 5, when: (c) => day(c) && is(c, 0, 'Curioso', 'Brincalhão', 'Mandão'),
    lines: (c) => [L(0, 'Tenho duas repetidas! A do Pikachu e a do Magikarp.', 'star'), L(1, 'Eu troco a do Magikarp pela minha do Snorlax. É uma boa proposta.', 'idea'), L(0, `${c.n[1]}, o Snorlax é raríssimo!`, 'shock'), L(1, 'O Magikarp também! Na minha opinião, tecnicamente.', 'laugh')],
    outcome: { bond: 6, coins: 3 },
  },
  {
    id: 'duo2-dividindo-guarda-sol', kind: 'amizade', title: 'Sombra para dois', emoji: '⛱️', cast: 2, weight: 4, when: (c) => day(c) && calm(c) && c.env.hour >= 11 && c.env.hour < 16,
    lines: (c) => [L(0, 'Que sol! Eu estou virando um churrasquinho.', 'sweat'), L(1, `${c.n[0]}, a sombra aqui dá para dois. Vem.`, 'heart'), L(0, 'Eu estava esperando o convite, mas fingindo que não.', 'laugh'), L(1, '(a sombra é bem pequena; os dois ficam grudadinhos)', 'sparkle')],
    outcome: { bond: 6 },
  },
  {
    id: 'duo2-aula-de-voo', kind: 'amizade', title: 'Aula de voo', emoji: '🪂', cast: 2, weight: 4, when: (c) => day(c) && calm(c) && ((c.types[0]?.includes('flying') ?? false) || is(c, 0, 'Sonhador', 'Corajoso')),
    lines: (c) => [L(0, `${c.n[1]}, bate as asas assim, olha: um, dois, três!`, 'idea'), L(1, 'Eu bato, mas parece que as asas só vão para os lados.', 'sweat'), L(0, 'O segredo é acreditar. E um pouquinho de vento.', 'star'), L(1, '(sobe dois centímetros e volta) Dois centímetros! Eu voei!', 'shock')],
    outcome: { bond: 8, spark: 1 },
  },
  {
    id: 'duo2-construindo-casinha', kind: 'amizade', title: 'Casinha na árvore', emoji: '🌳', cast: 2, weight: 4, when: (c) => day(c) && calm(c) && is(c, 0, 'Corajoso', 'Mandão', 'Curioso'),
    lines: (c) => [L(0, 'A planta da casinha tem três quartos, uma cozinha e uma biblioteca!', 'fire'), L(1, 'Cabem cinco galhos, quatro folhas e a gente, no máximo.', 'sweat'), L(0, 'Então é só um quarto, mas é o melhor quarto da Vila!', 'star'), L(1, `${c.n[0]}, pelo menos dá pra ver tudo lá de cima.`, 'heart')],
    outcome: { bond: 7, items: [['madeira', 1]] },
  },
  {
    id: 'duo2-pipoca-filme', kind: 'amizade', title: 'Sessão de filme', emoji: '🍿', cast: 2, weight: 5, when: (c) => evening(c) && c.has('televisao', 'sofa'),
    lines: (c) => [L(0, 'Eu escolho o filme! É de suspense, com um monstro no fim.', 'fire'), L(1, 'Eu fecho os olhos nas partes de medo. Me avisa.', 'sweat'), L(0, '(avisa tarde; o ' + c.n[1] + ' derruba a pipoca inteira)', 'shock'), L(1, 'A pipoca é a verdadeira vítima do filme.', 'sad')],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'duo2-sopa-fofoca', kind: 'amizade', title: 'Fofoca com chá', emoji: '🫖', cast: 2, weight: 5, when: (c) => day(c) && friendsNow(c) && c.env.town >= 3,
    lines: (c) => [L(0, '(no Café) Você ficou sabendo? Dizem que alguém roubou a última torta!', 'shock'), L(1, 'Quem? Eu quero nome, sobrenome e cor da pelagem.', 'question'), L(0, `Eu não sei, mas eu estava comendo uma, ${c.n[1]}...`, 'sweat'), L(1, 'Caso encerrado. Culpado confesso, com migalhas.', 'laugh')],
    outcome: { bond: 7, coins: 2 },
  },
  {
    id: 'duo2-vizinhos-cerca', kind: 'amizade', title: 'Conversa de vizinhos', emoji: '🏡', cast: 2, weight: 5, when: (c) => c.env.town >= 2 && day(c) && calm(c),
    lines: (c) => [L(0, `Bom dia, ${c.n[1]}! A sua cerquinha está linda hoje.`, 'sparkle'), L(1, 'Obrigado! É a mesma de ontem. Mas hoje eu estou me sentindo orgulhoso.', 'star'), L(0, 'Se precisar de açúcar, de pedra ou de companhia, é só bater.', 'heart'), L(1, 'Eu já ia pedir as três.', 'laugh')],
    outcome: { bond: 6, friend: 1 },
    after: (n, who) => `Vizinho é uma bênção. ${other(n, who)} mora logo ali e já me emprestou um guarda-chuva e um assunto.`,
  },
  {
    id: 'duo2-ajuda-reforma', kind: 'amizade', title: 'Ajuda na reforma', emoji: '🔨', cast: 2, weight: 4, when: (c) => c.env.town >= 2 && day(c) && is(c, 0, 'Corajoso', 'Mandão', 'Curioso'),
    lines: (c) => [L(0, `${c.n[1]}, segura a tábua que eu martelo!`, 'fire'), L(1, '(segura a tábua; o martelo acerta o dedo errado)', 'shock'), L(0, 'Desculpa! Eu errei a pontaria! Não era para você!', 'sweat'), L(1, 'Fica tranquilo. Pelo menos a tábua está firme.', 'laugh')],
    outcome: { bond: 6, items: [['madeira', 1]] },
  },
  {
    id: 'duo2-pintando-parede', kind: 'amizade', title: 'Pintando a parede', emoji: '🎨', cast: 2, weight: 4, when: (c) => c.env.town >= 3 && day(c),
    lines: (c) => [L(0, `${c.n[1]}, você pinta o de cima, eu o de baixo.`, 'idea'), L(1, 'Pronto! Fiz uma carinha no cantinho. Gostei dela.', 'laugh'), L(0, 'Eu fiz um coração. O coração ficou meio torto, mas é sincero.', 'heart'), L(1, 'A parede mais bonita da Vila!', 'sparkle')],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'duo2-troca-de-bordao', kind: 'amizade', title: 'O bordão emprestado', emoji: '🗣️', cast: 2, weight: 6, when: (c) => friendsNow(c) && (day(c) || evening(c)),
    lines: (c) => [L(0, 'Aquela sua frase de sempre, como é que é? Eu quero usar.', 'question'), L(1, 'É assim: é só falar com confiança e o resto acontece.', 'idea'), L(0, 'Vou usar o dia inteiro até todo mundo me odiar!', 'fire'), L(1, `${c.n[0]}... assim eu não tenho mais frase minha.`, 'sad')],
    outcome: { bond: 5, friend: 1 },
  },
  {
    id: 'duo2-conversa-resposta', kind: 'amizade', title: 'Ouviu falar do treinador', emoji: '👂', cast: 2, weight: 9, when: (c) => heard(c) && (day(c) || evening(c)),
    lines: (c) => [L(0, `${c.n[1]}, o treinador me falou que adora "${said(c)}". Você sabia?`, 'idea'), L(1, 'Hmm! Eu vou providenciar isso. Para ganhar uns pontinhos.', 'star'), L(0, 'Pontos pra você, e uma fatia pra mim!', 'laugh'), L(1, `Entendi o plano, ${c.n[0]}. É um bom plano.`, 'sparkle')],
    outcome: { bond: 5, friend: 1 },
  },
  {
    id: 'duo2-imita-resposta', kind: 'amizade', title: 'Imitando o treinador', emoji: '🎭', cast: 2, weight: 8, when: (c) => heard(c) && day(c),
    lines: (c) => [L(0, `(imitando o ${c.env.player}) "${said(c)}!" E então eu pulo assim!`, 'laugh'), L(1, 'Fez a voz errada, mas a pose está igualzinha!', 'star'), L(0, 'Vou ensaiar até ficar perfeito. É a minha missão.', 'fire'), L(1, 'Eu sou o público. Cobro ingresso em biscoitos.', 'laugh')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'duo2-concurso-resposta', kind: 'amizade', title: 'Quem adivinha a resposta', emoji: '🔮', cast: 2, weight: 7, when: (c) => heard(c) && is(c, 0, 'Curioso', 'Brincalhão'),
    lines: (c) => [L(0, `Aposto que a resposta favorita do treinador é "${said(c)}"!`, 'idea'), L(1, 'Eu aposto que é outra. Tem que ser mais misteriosa.', 'question'), L(0, 'Mistério? Pergunta pro mestre e depois a gente compara!', 'star'), L(1, 'Quem perder lava a louça. A de pedra. Que é mais pesada.', 'laugh')],
    outcome: { bond: 5 },
  },
  {
    id: 'duo2-ensina-andar', kind: 'amizade', title: 'Primeiro passo na neve', emoji: '⛄', cast: 2, weight: 4, when: (c) => snowy(c),
    lines: (c) => [L(0, `${c.n[1]}, pisa devagar. Se escorregar, a culpa é do chão.`, 'idea'), L(1, '(dá um passo, dois, três e desliza dez metros)', 'shock'), L(0, 'Isso foi um recorde de distância! Quer fazer de novo?', 'laugh'), L(1, 'Eu quero fazer de novo, mas com um aviso antes.', 'laugh')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'duo2-jogo-de-adivinhar', kind: 'amizade', title: 'Jogo de adivinhação', emoji: '❓', cast: 2, weight: 4, when: (c) => day(c) || evening(c),
    lines: (c) => [L(0, 'Estou pensando em algo vermelho, redondo e comestível.', 'idea'), L(1, 'Uma pecha! Não... uma maçã! Não... o seu nariz!', 'laugh'), L(0, 'Era uma baga oran, mas o nariz também é vermelho.', 'sweat'), L(1, `${c.n[0]}, vale um ponto pelo nariz.`, 'star')],
    outcome: { bond: 5 },
  },
  {
    id: 'duo2-nome-para-pedra', kind: 'amizade', title: 'Batizando a pedra', emoji: '🪨', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Curioso', 'Sonhador', 'Calmo'),
    lines: (_c) => [L(0, 'Essa pedra precisa de um nome. Eu acho que ela é um Marcos.', 'idea'), L(1, 'Ela não tem cara de Marcos. É uma Sandra.', 'question'), L(0, 'Sandra Marcos? Um nome composto. Gostei!', 'star'), L(1, 'Agora ela é da família. Dê as boas-vindas.', 'heart')],
    outcome: { bond: 5, items: [['pedra', 1]] },
  },
  {
    id: 'duo2-pega-pega', kind: 'amizade', title: 'Pega-pega', emoji: '🏃', cast: 2, weight: 5, when: (c) => day(c) && calm(c) && is(c, 0, 'Brincalhão', 'Corajoso', 'Curioso'),
    lines: (_c) => [L(0, 'Pegou! Agora é você!', 'star'), L(1, 'Eu estava distraído! Contagem de novo, por favor!', 'sweat'), L(0, 'Regra é regra! Corre, que eu conto até cinco!', 'fire'), L(1, '(corre, tropeça, corre mais; o pique é o poste de luz)', 'laugh')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'duo2-guardando-segredo', kind: 'amizade', title: 'Um segredo guardado', emoji: '🤫', cast: 2, weight: 5, when: (c) => friendsNow(c) && (evening(c) || night(c)),
    lines: (c) => [L(0, `${c.n[1]}, posso contar um segredo? Promete que não conta?`, 'sweat'), L(1, 'Prometo por todos os biscoitos do mundo.', 'heart'), L(0, 'Eu... tenho medo de borboleta.', 'sad'), L(1, 'Isso é fofo. Eu tenho medo de gente que tem medo de borboleta.', 'laugh')],
    outcome: { bond: 8, spark: 1 },
  },
  {
    id: 'duo2-piada-ruim', kind: 'amizade', title: 'A piada ruim', emoji: '😅', cast: 2, weight: 5, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Guloso', 'Curioso'),
    lines: (c) => [L(0, 'O que o tomate foi fazer no banco? Tirar extrato!', 'laugh'), L(1, '(silêncio de quase um minuto)', 'sweat'), L(0, 'Não riu? Eu ensaiei por uma semana!', 'sad'), L(1, `${c.n[0]}... eu ri por dentro. O pulmão está de prova.`, 'laugh')],
    outcome: { bond: 5 },
  },
  {
    id: 'duo2-acampamento', kind: 'amizade', title: 'Acampamento improvisado', emoji: '⛺', cast: 2, weight: 4, when: (c) => night(c) && calm(c) && c.has('tenda', 'fogueira', 'tocha'),
    lines: (c) => [L(0, 'Marshmallow no palito! Estou quase queimando a sobrancelha.', 'fire'), L(1, `${c.n[0]}, o seu marshmallow virou carvão.`, 'laugh'), L(0, 'Carvão artesanal. Disse o chef.', 'star'), L(1, 'Divide o meu, que está no ponto.', 'heart')],
    outcome: { bond: 8, spark: 1 },
  },
  {
    id: 'duo2-jardineiros', kind: 'amizade', title: 'Dupla de jardineiros', emoji: '🌻', cast: 2, weight: 4, when: (c) => c.env.crops > 0 && day(c) && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, o regador está na minha mão e a água nos meus planos.`, 'idea'), L(1, 'Eu faço o buraquinho; você, a regação. A gente é uma boa dupla.', 'sparkle'), L(0, '(a água respinga no ' + c.n[1] + ')', 'sweat'), L(1, 'Essa não estava no plano. Mas refrescou.', 'laugh')],
    outcome: { bond: 6, water: true },
  },
  {
    id: 'duo2-sombra-lampiao', kind: 'amizade', title: 'Passeio com lampião', emoji: '🏮', cast: 2, weight: 4, when: (c) => night(c) && calm(c) && c.env.town >= 2,
    lines: (c) => [L(0, 'Eu levo o lampião; você segura meu rabo para não se perder.', 'idea'), L(1, '(segura o rabo, e o rabo segura de volta)', 'laugh'), L(0, `Pronto! Fila indiana, ${c.n[1]}! Nenhum monstro vai nos pegar.`, 'fire'), L(1, 'Só se ele tiver coragem de enfrentar um rabo.', 'laugh')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'duo2-amigos-de-tipo', kind: 'amizade', title: 'Clube do mesmo tipo', emoji: '🔰', cast: 2, weight: 5, when: (c) => sameType(c) && day(c),
    lines: (c) => [L(0, `${c.n[1]}, você também é desse tipo? A gente tem que fundar um clube!`, 'star'), L(1, 'Presidente: eu. Vice: você. Tesoureiro: o biscoito.', 'laugh'), L(0, 'A primeira regra do clube é... ser muito bom.', 'fire'), L(1, 'A segunda é lanchar às quatro.', 'idea')],
    outcome: { bond: 8, spark: 1 },
  },
  // ---------------------------------------------------------------------------- comédia
  {
    id: 'duo2-troca-de-lugar', kind: 'comedia', title: 'O lugar na sombra', emoji: '🪑', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, esse é o meu lugar, eu cheguei primeiro!`, 'anger'), L(1, 'Eu cheguei primeiro, só que ontem.', 'question'), L(0, '(os dois sentam no mesmo banco e se empurram sem dizer nada)', 'sweat'), L(1, 'Isso não pode dar certo. E está dando certo.', 'laugh')],
    outcome: { bond: 2 },
  },
  {
    id: 'duo2-grito-susto', kind: 'comedia', title: 'Susto de brincadeira', emoji: '👻', cast: 2, weight: 5, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Corajoso', 'Mandão'),
    lines: (c) => [L(0, `(sai de trás do arbusto) BUUU!`, 'shock'), L(1, 'AAAH! Eu pulei tão alto que vi a minha casa de cima!', 'shock'), L(0, 'Eu consegui! Foi o melhor susto da minha vida!', 'star'), L(1, `${c.n[0]}, amanhã eu me vingo com outro, no meio da sua soneca.`, 'fire')],
    outcome: { bond: 3 },
    after: (n, who) => (who === 0 ? `Dei um susto no ${n[1]}. Ele pulou três metros. Eu ri por uma hora.` : `${n[0]} me assustou. Eu estou planejando uma vingança sutil.`),
  },
  {
    id: 'duo2-dueto-desafinado', kind: 'comedia', title: 'Dueto desafinado', emoji: '🎤', cast: 2, weight: 5, when: (c) => day(c) || evening(c),
    lines: (c) => [L(0, '(cantando) Lálálá, o sol nasceu!', 'note'), L(1, '(cantando) Lálálá, e o dia acabou!', 'note'), L(0, 'A gente não combina em tom, mas combina em coragem.', 'star'), L(1, `Um dia a gente grava um disco. De longe, ${c.n[0]}, de bem longe.`, 'laugh')],
    outcome: { bond: 5 },
  },
  {
    id: 'duo2-concurso-comilao', kind: 'comedia', title: 'Concurso de comilão', emoji: '🥧', cast: 2, weight: 5, when: (c) => day(c) && is(c, 0, 'Guloso') || (day(c) && is(c, 1, 'Guloso')),
    lines: (c) => [L(0, 'Eu como cinco tortas em um minuto! Valendo!', 'fire'), L(1, `${c.n[0]}, eu como seis e ainda pergunto se tem mais.`, 'star'), L(0, '(os dois comem; ninguém levanta nem para respirar)', 'sweat'), L(1, 'Empate. E uma soneca coletiva.', 'zzz')],
    outcome: { bond: 4 },
  },
  {
    id: 'duo2-equilibrio', kind: 'comedia', title: 'Desafio de equilíbrio', emoji: '🤹', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Corajoso', 'Brincalhão', 'Mandão'),
    lines: (c) => [L(0, 'Uma pata só, uma pedra na cabeça, olhos fechados!', 'fire'), L(1, `${c.n[0]}, a sua pedra está na minha cabeça.`, 'question'), L(0, 'Isso é uma pedra emprestada. Vale o ponto.', 'laugh'), L(1, '(os dois caem de lado, bem juntinhos)', 'sweat')],
    outcome: { bond: 4 },
  },
  {
    id: 'duo2-trocou-de-nome', kind: 'comedia', title: 'Nome trocado', emoji: '🏷️', cast: 2, weight: 4, when: (c) => day(c) || evening(c),
    lines: (c) => [L(0, `Oi, ${c.n[0]}! (para si mesmo) Ué, eu me chamei de ${c.n[1]}.`, 'sweat'), L(1, 'Eu estava aqui pensando: por que será que ninguém me chamou de nada?', 'question'), L(0, 'Eu me chamei de você. Foi um acidente de nomes.', 'laugh'), L(1, 'Tudo bem. Eu sou você, e você é eu. Onde eu moro?', 'laugh')],
    outcome: { bond: 3 },
  },
  {
    id: 'duo2-detetive-pegadas', kind: 'comedia', title: 'Detetives das pegadas', emoji: '🕵️', cast: 2, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Pegadas! Grandes e fundas. Foi um monstro de seis metros!', 'shock'), L(1, `${c.n[0]}, essas pegadas são do ${c.n[0]}. Olha o seu rastro.`, 'question'), L(0, 'Então o monstro sou eu!? Isso explica muito sobre a minha vida.', 'sweat'), L(1, 'Caso resolvido. Tira a lupa do olho.', 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'duo2-medo-escuro', kind: 'comedia', title: 'Medo do escuro, a dois', emoji: '🔦', cast: 2, weight: 5, when: (c) => night(c) && is(c, 0, 'Tímido', 'Guloso', 'Curioso') && is(c, 1, 'Tímido', 'Guloso', 'Curioso', 'Brincalhão'),
    lines: (_c) => [L(0, 'Eu não tenho medo, eu só quero ir para casa. Bem rápido.', 'sweat'), L(1, 'Eu também não tenho medo. Só estou agarrado no seu rabo porque está frio.', 'sweat'), L(0, '(um galho estala) AAAH!', 'shock'), L(1, 'AAAAH! (os dois correm juntos, de mãos dadas, para a casa mais perto)', 'laugh')],
    outcome: { bond: 6, spark: 1 },
  },
];
