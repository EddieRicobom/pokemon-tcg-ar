import { L, calm, day, evening, friendsNow, heard, is, night, rainy, rivals, said, snowy } from './kit';
import type { Template } from './kit';

/** Mais duplas, parte 2: rivalidade, drama de vizinhança e festas a dois. */
export const DUO2B_MOMENTS: readonly Template[] = [
  // ---------------------------------------------------------------------------- rivalidade
  {
    id: 'duo2-corrida-ate-arvore', kind: 'rivalidade', title: 'Corrida até a árvore', emoji: '🏁', cast: 2, weight: 5, when: (c) => day(c) && calm(c) && (is(c, 0, 'Corajoso', 'Brincalhão', 'Mandão') || is(c, 1, 'Corajoso', 'Mandão')),
    lines: (c) => [L(0, `${c.n[1]}, até aquela árvore! Quem perder paga o lanche!`, 'fire'), L(1, 'Eu aceito! Um, dois... (já saiu correndo)', 'anger'), L(0, 'Trapaça! Você largou antes do "três"!', 'anger'), L(1, 'O "três" é uma sugestão!', 'laugh')],
    outcome: { bond: -2, spark: 0 },
    choice: {
      prompt: 'Quem chegou primeiro? O treinador é o juiz.',
      options: [
        { label: (c) => `${c.n[0]}`, lines: (c) => [L(0, 'Eu sabia! Meu lanche favorito é o que vem de graça!', 'star'), L(1, `Hum. Revanche, ${c.n[0]}.`, 'anger')], outcome: { bond: -1, friendBy: [3, 0] } },
        { label: (c) => `${c.n[1]}`, lines: (_c) => [L(1, 'Eu sou veloz como um raio de sol!', 'star'), L(0, 'Foi por uma casca de banana!', 'sad')], outcome: { bond: -1, friendBy: [0, 3] } },
        { label: () => 'Empate técnico', lines: () => [L(0, 'Cada um paga o seu.', 'laugh'), L(1, 'Justo.', 'sparkle')], outcome: { bond: 4 } },
      ],
    },
  },
  {
    id: 'duo2-concurso-beleza', kind: 'rivalidade', title: 'Quem é mais bonito', emoji: '💅', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Mandão', 'Sonhador'),
    lines: (c) => [L(0, 'É claro que eu sou o mais bonito da Vila. Isso é um fato científico.', 'star'), L(1, `${c.n[0]}, a ciência pediu para você repensar.`, 'laugh'), L(0, 'Eu tenho penas lindas, olhos brilhantes e um perfil nobre.', 'fire'), L(1, 'Eu tenho um espelho. Posso emprestar.', 'laugh')],
    outcome: { bond: -3 },
  },
  {
    id: 'duo2-reclamacao-barulho', kind: 'rivalidade', title: 'A reclamação do barulho', emoji: '📣', cast: 2, weight: 5, when: (c) => c.env.town >= 2 && (evening(c) || night(c)),
    lines: (c) => [L(0, `${c.n[1]}, são dez da noite e você está cantando alto!`, 'anger'), L(1, 'É ópera! A minha ópera. Por isso tem que ser alta.', 'fire'), L(0, 'Se a ópera passar das onze, eu vou responder com tambor!', 'anger'), L(1, 'Desafio aceito. Eu tenho uma gaita também.', 'laugh')],
    outcome: { bond: -4 },
    choice: {
      prompt: 'A vizinhança está um caos sonoro. O que você faz?',
      options: [
        { label: () => 'Pedir silêncio aos dois', lines: () => [L(0, 'Tá bom, treinador.', 'sad'), L(1, 'Eu só queria cantar...', 'sad')], outcome: { bond: 1 } },
        { label: () => 'Propor uma banda', lines: () => [L(0, 'Eu na bateria, ele no vocal!', 'star'), L(1, 'E a gaita no solo!', 'note')], outcome: { bond: 8, spark: 1, friend: 2 } },
        { label: () => 'Fingir que dormiu', lines: () => [L(1, 'Até o treinador dormiu. Que luxo.', 'sweat'), L(0, 'A gente pode brigar de manhã.', 'zzz')], outcome: { bond: -1 } },
      ],
    },
  },
  {
    id: 'duo2-cerca-invadida', kind: 'rivalidade', title: 'A cerca invadida', emoji: '🚧', cast: 2, weight: 5, when: (c) => c.env.town >= 2 && day(c),
    lines: (c) => [L(0, `${c.n[1]}, a sua cerca está dois centímetros dentro do meu quintal.`, 'anger'), L(1, 'Dois? Eu mediria dois milímetros. E olha que eu cheguei primeiro.', 'anger'), L(0, 'Eu vou trazer uma fita métrica!', 'fire'), L(1, 'E eu, uma pá! Para mover tudo para trás, claro.', 'sweat')],
    outcome: { bond: -5 },
    choice: {
      prompt: 'A cerca virou uma guerra. Como você resolve?',
      options: [
        { label: () => 'Medir com cuidado', lines: () => [L(0, 'Metade, metade.', 'sweat'), L(1, 'Foi um grande empate de cerca.', 'laugh')], outcome: { bond: 3 } },
        { label: () => 'Colocar uma flor na divisa', needs: { item: 'flor', qty: 1 }, lines: () => [L(0, 'Uma flor no meio... isso é bonito.', 'heart'), L(1, 'O limite agora é um jardim.', 'sparkle')], outcome: { bond: 8, friend: 2 } },
        { label: () => 'Dar razão a um dos dois', lines: (c) => [L(0, 'Eu sempre soube!', 'star'), L(1, `${c.n[0]}, não vale se aliar ao ${c.n[0]}.`, 'anger')], outcome: { bond: -4, friendBy: [2, -2] } },
      ],
    },
  },
  {
    id: 'duo2-ultimo-bolo', kind: 'rivalidade', title: 'A última fatia', emoji: '🍰', cast: 2, weight: 5, when: (c) => (day(c) || evening(c)) && (is(c, 0, 'Guloso') || is(c, 1, 'Guloso')),
    lines: (c) => [L(0, 'Uma fatia de bolo! Eu vi primeiro!', 'fire'), L(1, `${c.n[0]}, mas eu já estava com o garfo na mão!`, 'anger'), L(0, 'O garfo não define o dono da fatia!', 'anger'), L(1, '(os dois seguram o prato, sem soltar)', 'sweat')],
    outcome: { bond: -4 },
  },
  {
    id: 'duo2-ciume-amizade', kind: 'rivalidade', title: 'Ciúme de amigo', emoji: '😒', cast: 2, weight: 4, when: (c) => day(c) && (is(c, 0, 'Mandão', 'Tímido', 'Guloso') && c.rel !== undefined && c.rel.bond < 25),
    lines: (c) => [L(0, `${c.n[1]}, ontem você brincou com o Pokémon da esquina. Eu vi.`, 'anger'), L(1, 'Eu brinco com todo mundo! É a minha graça!', 'question'), L(0, 'Eu queria ser o seu preferido... só isso.', 'sad'), L(1, `${c.n[0]}... você é o meu preferido de segunda e quarta.`, 'laugh')],
    outcome: { bond: 3 },
  },
  {
    id: 'duo2-medalha-injusta', kind: 'rivalidade', title: 'A medalha injusta', emoji: '🥇', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Eu ganhei a medalha de ouro da gincana!', 'star'), L(1, `${c.n[0]}, foi uma gincana de um participante só.`, 'laugh'), L(0, 'Eu fui o melhor participante! Venci todos os outros... que eu mesmo imaginei.', 'sweat'), L(1, 'Parabéns, campeão do nada.', 'laugh')],
    outcome: { bond: -1 },
  },
  {
    id: 'duo2-fila-do-correio', kind: 'rivalidade', title: 'Furou a fila', emoji: '📮', cast: 2, weight: 4, when: (c) => c.env.town >= 5 && day(c),
    lines: (c) => [L(0, `${c.n[1]}! Eu estava na frente!`, 'anger'), L(1, 'Eu só dei um passinho. Dois. Cinco.', 'sweat'), L(0, 'A fila tem regra: quem chegou primeiro, sai primeiro!', 'fire'), L(1, 'O carteiro, olhando de lá: "Os dois são os últimos."', 'laugh')],
    outcome: { bond: -3 },
  },
  {
    id: 'duo2-torneio-pedra', kind: 'rivalidade', title: 'Pedra, papel, folha', emoji: '✊', cast: 2, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [L(0, 'Pedra, papel, folha! Um, dois, três!', 'fire'), L(1, '(os dois fazem pedra) De novo!', 'star'), L(0, '(os dois fazem folha) Hmm... de novo!', 'star'), L(1, '(os dois fazem a mesma coisa pela décima vez)', 'sweat')],
    outcome: { bond: 3 },
  },
  {
    id: 'duo2-chuva-disputa', kind: 'rivalidade', title: 'O melhor abrigo', emoji: '🌂', cast: 2, weight: 4, when: (c) => rainy(c),
    lines: (c) => [L(0, `${c.n[1]}, essa árvore é minha, a folhagem é minha, a chuva... é de todos.`, 'anger'), L(1, 'Eu não pedi para a chuva molhar o meu lado.', 'sweat'), L(0, 'Pode ficar. Só que o meu lado é maior.', 'fire'), L(1, '(os dois ficam em pé, com meio corpo na chuva, para provar um argumento)', 'laugh')],
    outcome: { bond: 1 },
  },
  {
    id: 'duo2-dueto-rivais', kind: 'rivalidade', title: 'Duelo de calças', emoji: '👖', cast: 2, weight: 3, when: (c) => day(c) && rivals(c),
    lines: (c) => [L(0, `${c.n[1]}, você pegou a minha cadeira!`, 'anger'), L(1, 'É a minha! Eu sentei nela primeiro!', 'anger'), L(0, 'Isso dá briga e não dá em nada!', 'fire'), L(1, '(os dois se sentam, lado a lado, de cara fechada, na mesma cadeira)', 'sweat')],
    outcome: { bond: 3 },
  },
  // ---------------------------------------------------------------------------- drama
  {
    id: 'duo2-mudanca', kind: 'drama', title: 'Adeus ao vizinho', emoji: '📦', cast: 2, weight: 4, when: (c) => c.env.town >= 3 && day(c) && friendsNow(c),
    lines: (c) => [L(0, `${c.n[1]}, eu vou me mudar para o lado de lá da Vila.`, 'sad'), L(1, 'Para o lado de lá? É quinze passos daqui!', 'shock'), L(0, 'Mas são quinze passos que antes eram zero.', 'sad'), L(1, `${c.n[0]}, eu venho todo dia. Com sopa. Com saudade. Com um passo a mais.`, 'heart')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'duo2-bilhete-errado', kind: 'drama', title: 'O bilhete trocado', emoji: '📝', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}, você leu o bilhete que eu deixei na caixa de correio?`, 'sweat'), L(1, 'Li. "Preciso conversar sobre o que aconteceu ontem". Eu entrei em pânico.', 'shock'), L(0, 'Era sobre o seu bolo! Eu queria a receita!', 'laugh'), L(1, 'Meu Deus. Eu já tinha pedido desculpa para três pessoas.', 'sweat')],
    outcome: { bond: 4 },
  },
  {
    id: 'duo2-mentira-pequena', kind: 'drama', title: 'Uma mentirinha', emoji: '🤥', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Guloso', 'Tímido'),
    lines: (c) => [L(0, `${c.n[1]}, eu não comi o seu doce. Juro.`, 'sweat'), L(1, 'Tem açúcar no seu nariz, no seu queixo e na sua orelha.', 'question'), L(0, 'Isso é... orvalho de açúcar. Acontece nas melhores famílias.', 'sweat'), L(1, 'Eu vou fingir que acreditei. Mas só dessa vez.', 'laugh')],
    outcome: { bond: -1 },
  },
  {
    id: 'duo2-sumiu-presente', kind: 'drama', title: 'O presente sumiu', emoji: '🎁', cast: 2, weight: 4, when: (c) => day(c) || evening(c),
    lines: (c) => [L(0, `${c.n[1]}, eu deixei o seu presente aqui e ele sumiu!`, 'shock'), L(1, 'Um presente? Para mim? E sumiu?', 'sad'), L(0, '(procura em todo lugar) Eu achei! Estava embaixo de mim, eu sentei em cima.', 'sweat'), L(1, 'Está amassado, mas é o presente mais honesto que eu já ganhei.', 'heart')],
    outcome: { bond: 5, spark: 1 },
  },
  {
    id: 'duo2-fofoca-vaza', kind: 'drama', title: 'A fofoca que vazou', emoji: '🗞️', cast: 2, weight: 5, when: (c) => day(c) && c.rel !== undefined && c.rel.bond < 30,
    lines: (c) => [L(0, `${c.n[1]}, você contou o meu segredo para o Pokémon da esquina?!`, 'anger'), L(1, 'Eu contei só um pouquinho. Para uma pessoa. E ela contou para duas.', 'sweat'), L(0, 'Agora a Vila inteira sabe que eu tenho medo de balão!', 'shock'), L(1, 'Eu juro que os balões já sabiam.', 'sweat')],
    outcome: { bond: -5 },
    choice: {
      prompt: 'O segredo vazou. O que você diz?',
      options: [
        { label: () => 'Pedir desculpas pelos dois', lines: () => [L(0, 'Tá bom... eu perdoo. Só que balão eu continuo odiando.', 'sad'), L(1, 'Eu levo um para a próxima festa e estouro, por você.', 'laugh')], outcome: { bond: 6 } },
        { label: () => 'Dizer que a Vila esquece rápido', lines: () => [L(1, 'É verdade! Daqui a dois dias ninguém lembra.', 'star'), L(0, 'Eu lembro, pelo menos.', 'sad')], outcome: { bond: 1 } },
        { label: () => 'Ficar em silêncio, tomando sorvete', lines: () => [L(0, 'O treinador não ajudou em nada.', 'anger'), L(1, 'Mas o sorvete era bom.', 'laugh')], outcome: { bond: -2 } },
      ],
    },
  },
  {
    id: 'duo2-erro-bolo', kind: 'drama', title: 'O bolo queimado', emoji: '🔥', cast: 2, weight: 4, when: (c) => day(c) || evening(c),
    lines: (c) => [L(0, `${c.n[1]}, eu fiz um bolo de aniversário para você!`, 'star'), L(1, '(olha para o bolo, preto como carvão) É... diferente.', 'sweat'), L(0, 'Eu esqueci o forno ligado. Mas a intenção estava no ponto.', 'sad'), L(1, 'Eu vou comer. Com um copo de água do lado.', 'heart')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'duo2-segredo-sonhos', kind: 'drama', title: 'O sonho abandonado', emoji: '🌙', cast: 2, weight: 4, when: (c) => night(c) && friendsNow(c) && is(c, 0, 'Sonhador', 'Tímido', 'Calmo'),
    lines: (c) => [L(0, 'Eu queria ser um cantor famoso. Mas hoje cantei e ninguém aplaudiu.', 'sad'), L(1, `${c.n[0]}, eu aplaudi. Em silêncio, pelo lado de fora.`, 'heart'), L(0, 'Isso conta como plateia?', 'question'), L(1, 'Conta mais do que cem plateias de papel.', 'sparkle')],
    outcome: { bond: 8, spark: 1 },
  },
  {
    id: 'duo2-chuva-adeus', kind: 'drama', title: 'Despedida na chuva', emoji: '🌧️', cast: 2, weight: 3, when: (c) => rainy(c) && friendsNow(c),
    lines: (c) => [L(0, `${c.n[1]}, eu vou viajar uns dias. Não é muito, são só três.`, 'sad'), L(1, 'Três dias é uma eternidade com sopa fria.', 'sad'), L(0, 'Eu volto com uma pedrinha de cada lugar. Prometo.', 'heart'), L(1, 'Então eu espero, com a pedra do seu dia mais bonito.', 'sparkle')],
    outcome: { bond: 6, spark: 1 },
  },
  // ---------------------------------------------------------------------------- festa
  {
    id: 'duo2-piquenique-surpresa', kind: 'festa', title: 'Piquenique surpresa', emoji: '🧺', cast: 2, weight: 5, when: (c) => day(c) && calm(c) && c.env.hour >= 11,
    lines: (c) => [L(0, `${c.n[1]}! Fecha os olhos! Agora pode abrir!`, 'star'), L(1, 'Uma toalha, sanduíches e... uma flor no meio. Para mim?', 'heart'), L(0, 'Para você e para as formigas que chegarem depois.', 'laugh'), L(1, 'Eu divido com elas. Elas vão me contar tudo da Vila.', 'sparkle')],
    outcome: { bond: 8, spark: 1, friend: 1 },
  },
  {
    id: 'duo2-mini-festa-chuva', kind: 'festa', title: 'Festa na chuva', emoji: '🪩', cast: 2, weight: 4, when: (c) => rainy(c) && is(c, 0, 'Brincalhão', 'Corajoso', 'Sonhador'),
    lines: (_c) => [L(0, 'Música! Eu ligo o rádio, você dança!', 'note'), L(1, 'Dançar na chuva? Eu vou me molhar até o último fio!', 'laugh'), L(0, 'A chuva é a nossa bola de espelhos!', 'sparkle'), L(1, '(os dois giram, e a lama acompanha cada passo)', 'star')],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'duo2-brinde-cafe', kind: 'festa', title: 'Brinde de café', emoji: '☕', cast: 2, weight: 5, when: (c) => c.env.town >= 3 && day(c),
    lines: (c) => [L(0, `${c.n[1]}, um brinde! (levanta a xícara) À Vila!`, 'star'), L(1, 'À Vila, ao bolo, e ao último gole!', 'laugh'), L(0, 'Cuidado, a xícara está quente!', 'shock'), L(1, 'Agora eu sei como o chá é por dentro. Do lado de fora da língua.', 'sweat')],
    outcome: { bond: 5, coins: 2 },
  },
  {
    id: 'duo2-musica-resposta', kind: 'festa', title: 'A música das respostas', emoji: '🎶', cast: 2, weight: 8, when: (c) => heard(c) && (day(c) || evening(c)),
    lines: (c) => [L(0, `Eu fiz uma música com a frase do treinador: "${said(c)}"!`, 'note'), L(1, 'Canta! Eu faço a segunda voz!', 'star'), L(0, `(cantando) ${said(c)}, ${said(c)}, tralalá!`, 'note'), L(1, '(cantando) Tralalá, tralalá, mais uma vez!', 'note')],
    outcome: { bond: 6, spark: 1, friend: 1 },
  },
  {
    id: 'duo2-bolo-de-aniversario-feito', kind: 'festa', title: 'Parabéns improvisado', emoji: '🎂', cast: 2, weight: 3, when: (c) => day(c) && c.date.d % 5 === 0,
    lines: (c) => [L(0, `${c.n[1]}, hoje é o dia de ninguém, mas eu fiz um bolo mesmo assim!`, 'star'), L(1, 'Uma vela, um bolo e uma ótima desculpa. Eu aceito!', 'heart'), L(0, 'Parabéns pra você, nessa data querida!', 'note'), L(1, 'Muitas felicidades, e pouca pressa na vida!', 'sparkle')],
    outcome: { bond: 6, spark: 1, friend: 1 },
  },
  {
    id: 'duo2-neve-guerra', kind: 'festa', title: 'Guerra de bolas de neve', emoji: '❄️', cast: 2, weight: 6, when: (c) => snowy(c) && is(c, 0, 'Brincalhão', 'Corajoso', 'Mandão', 'Curioso'),
    lines: (c) => [L(0, `${c.n[1]}, prepare-se! Uma bola de neve a caminho!`, 'fire'), L(1, '(desvia e acerta o ' + c.n[0] + ' na cara)', 'laugh'), L(0, 'Isso foi um golpe baixo! De nevinha!', 'anger'), L(1, 'Eu sou um profissional. Treino todo inverno.', 'star')],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'duo2-pique-bandeira', kind: 'festa', title: 'Pega a bandeira', emoji: '🚩', cast: 2, weight: 4, when: (c) => day(c) && calm(c) && is(c, 0, 'Corajoso', 'Mandão', 'Brincalhão'),
    lines: (c) => [L(0, `${c.n[1]}, eu levo a bandeira para o meu lado!`, 'fire'), L(1, 'Só se você passar por mim e pelo meu rabo de ferro!', 'fire'), L(0, '(corre, desvia, cai de cara na grama e ainda segura a bandeira)', 'shock'), L(1, 'Vitória... de quem? Dos dois, que caíram juntos.', 'laugh')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'duo2-noite-estrelada', kind: 'festa', title: 'Noite de estrelas', emoji: '🌌', cast: 2, weight: 5, when: (c) => night(c) && calm(c) && friendsNow(c),
    lines: (c) => [L(0, `${c.n[1]}, olha quantas estrelas! Cada uma é um desejo de alguém.`, 'sparkle'), L(1, 'Eu quero uma só para mim. A mais pequenininha.', 'heart'), L(0, 'Eu escolho aquela, a piscadeira.', 'star'), L(1, 'Então ela é nossa, de um jeito meio cósmico.', 'sparkle')],
    outcome: { bond: 8, spark: 2 },
  },
  {
    id: 'duo2-troca-de-cartas', kind: 'amizade', title: 'Cartas de longe', emoji: '📬', cast: 2, weight: 4, when: (c) => c.env.town >= 5 && day(c) && friendsNow(c),
    lines: (c) => [L(0, `${c.n[1]}, recebi a sua carta! A letra está linda!`, 'heart'), L(1, 'Eu escrevi sem borrão, em três tentativas, dois ensaios e uma lágrima.', 'laugh'), L(0, 'Eu respondi em cinco páginas. Segura o papel para não voar.', 'idea'), L(1, 'O carteiro vai ganhar um bônus de pescoço.', 'laugh')],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'duo2-troca-de-casa', kind: 'comedia', title: 'Casa trocada', emoji: '🏘️', cast: 2, weight: 4, when: (c) => c.env.town >= 2 && night(c),
    lines: (c) => [L(0, '(entra na casa errada no escuro) Cheirinho de bolo... Que bom estar em casa.', 'zzz'), L(1, 'Quem está na minha cama?!', 'shock'), L(0, 'Ué, a minha cama está mais macia hoje.', 'question'), L(1, `${c.n[0]}, essa é a minha casa. A sua é a que tem o telhado vermelho.`, 'laugh')],
    outcome: { bond: 4 },
  },
];
