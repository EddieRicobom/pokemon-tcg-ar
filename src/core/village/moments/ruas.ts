import { L, calm, coupled, day, evening, friendsNow, is, night, other, rainy, rivals, snowy } from './kit';
import type { Template } from './kit';

/**
 * A cidade grande (mapa novo): as ruas largas e a avenida, o mercado das barracas de guarda-sol, o mural de recados e
 * as jardineiras da praça, a Rua dos Jogos (Arena, Fliperama, Pista de Pins, Torre) e os prédios novos (o casarão do
 * Museu, a cabana de toras do Café).
 */
export const RUAS_MOMENTS: readonly Template[] = [
  {
    id: 'rua-cidade-cresceu', kind: 'amizade', title: 'A Vila cresceu', emoji: '🏙️', cast: 2, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}, você reparou? A Vila ficou enorme! Tem rua que eu nunca andei!`, 'shock'), L(1, 'Tem lago, fazenda, parque, bosque... a gente vai precisar de um mapa.', 'idea'), L(0, 'Ou de um dia inteiro só para passear.', 'star'), L(1, 'Ou de muitos dias. Começa amanhã, depois do café.', 'heart')],
    outcome: { bond: 5, friend: 1 },
    after: (n, who) => `${other(n, who)} e eu combinamos de conhecer cada rua nova da Vila. Já marquei no calendário.`,
  },
  {
    id: 'rua-mercado-barracas', kind: 'amizade', title: 'As barracas do mercado', emoji: '⛱️', cast: 2, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, 'O mercado tem três barracas de guarda-sol: azul, vermelha e verde!', 'star'), L(1, 'Qual é a melhor?', 'question'), L(0, `A que tiver biscoito, ${c.n[1]}. Vamos visitar as três para descobrir.`, 'idea'), L(1, '(meia hora depois, os dois saem com sacolas e farelo no queixo)', 'laugh')],
    outcome: { bond: 5 },
  },
  {
    id: 'rua-pechincha', kind: 'comedia', title: 'Pechinchando', emoji: '💰', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Mandão', 'Guloso', 'Brincalhão'),
    lines: (c) => [L(0, 'Moço, essa maçã por uma moeda? Faz por meia?', 'question'), L(1, `${c.n[0]}, a maçã é de graça. É uma amostra.`, 'sweat'), L(0, 'Então eu levo duas. Pela metade do preço de graça.', 'idea'), L(1, 'Isso não existe! ...me ensina?', 'laugh')],
    outcome: { bond: 3 },
  },
  {
    id: 'rua-mural-recados', kind: 'solo', title: 'O mural de recados', emoji: '📌', cast: 1, weight: 5, when: (c) => day(c) || evening(c),
    lines: () => [L(0, '(lê o mural da praça) "Perdi uma meia." "Achei uma meia." "Alguém quer jogar bola?"', 'question'), L(0, '(pega um papel e escreve) "Quem quiser ser meu amigo, é só chegar."', 'heart'), L(0, '(volta no dia seguinte: o papel está cheio de assinaturas)', 'sparkle')],
    outcome: { friend: 2 },
  },
  {
    id: 'rua-recado-anonimo', kind: 'romance', title: 'Um recado sem nome', emoji: '💌', cast: 2, weight: 4, when: (c) => (c.rel?.spark ?? 0) >= 30 || coupled(c),
    lines: (c) => [L(1, '(lê no mural: "Alguém aqui tem o sorriso mais bonito da Vila.")', 'question'), L(1, `${c.n[0]}, você viu esse recado? Quem será?`, 'sparkle'), L(0, '(fica vermelho até as orelhas) Não faço ideia. Nenhuma. Zero.', 'sweat'), L(1, 'Hum. A letra parece muito com a sua.', 'heart')],
    outcome: { bond: 3, spark: 5 },
  },
  {
    id: 'rua-jardineira', kind: 'solo', title: 'Regando a jardineira', emoji: '🪴', cast: 1, weight: 4, when: (c) => day(c) && !rainy(c),
    lines: () => [L(0, 'As jardineiras da praça estão com sede. Ninguém rega elas?', 'sad'), L(0, '(enche o regador na fonte e rega uma por uma)', 'heart'), L(0, 'Agora sim. A praça está sorrindo de novo.', 'sparkle')],
    outcome: { friend: 1, water: true },
  },
  {
    id: 'rua-avenida-corrida', kind: 'rivalidade', title: 'Corrida na avenida', emoji: '🏁', cast: 2, weight: 5, when: (c) => day(c) && calm(c),
    lines: (c) => {
      const v = c.rng() < 0.5 ? 0 : 1;
      c.memo.v = v;
      return [L(0, 'A avenida é comprida e reta. Perfeita para uma corrida!', 'fire'), L(1, 'Da fonte até a Rua do Sul. Já!', 'fire'), L(v, '(cruza a Rua do Sul primeiro, de braços para cima)', 'star'), L(v === 0 ? 1 : 0, `Eu tropecei numa lombada imaginária, ${c.n[v]}. Revanche amanhã.`, 'anger')];
    },
    outcome: { bond: 2, spark: 1 },
  },
  {
    id: 'rua-perdido-cidade', kind: 'drama', title: 'Perdido na cidade grande', emoji: '🗺️', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Tímido', 'Sonhador', 'Curioso'),
    lines: (c) => [L(0, 'Eu fui comprar pão e agora não sei mais onde é a minha casa.', 'sad'), L(1, `${c.n[0]}! Eu te levo. A sua casa é na rua das casas, do lado da fonte.`, 'heart'), L(0, 'A cidade ficou tão grande. Eu me senti pequenininho.', 'sad'), L(1, 'Grande ou pequena, a gente se acha. Vem, segura aqui.', 'star')],
    outcome: { bond: 7, friend: 1 },
  },
  {
    id: 'rua-placas', kind: 'comedia', title: 'Placas das ruas', emoji: '🪧', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Toda rua grande precisa de um nome. Vou batizar essa: Rua do Biscoito.', 'idea'), L(1, 'E aquela? Rua do Segundo Biscoito?', 'question'), L(0, `Não seja bobo, ${c.n[1]}. Aquela é a Avenida do Bolo.`, 'laugh'), L(1, 'Eu moro onde? Travessa do Lanche?', 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'rua-arena-torcida', kind: 'festa', title: 'Torcida na Arena', emoji: '📣', cast: 3, weight: 4, when: (c) => c.env.town >= 6 && (day(c) || evening(c)),
    lines: (c) => [L(0, 'Hoje tem batalha na Arena! Vamos torcer!', 'fire'), L(1, 'Eu fiz um cartaz: "VAI, TREINADOR!"', 'star'), L(2, `Eu trouxe pipoca. ${c.n[1]}, para de comer a pipoca da torcida!`, 'anger'), L(0, '(os três gritam tão alto que a Arena inteira olha)', 'note')],
    outcome: { bond: 4, bond02: 4, bond12: 4, friend: 1 },
  },
  {
    id: 'rua-fliperama-recorde', kind: 'rivalidade', title: 'Recorde no Fliperama', emoji: '🕹️', cast: 2, weight: 4, when: (c) => c.env.town >= 2,
    lines: (c) => [L(0, 'Eu bati o recorde da máquina do Fliperama! Meu nome está lá em cima!', 'star'), L(1, `${c.n[0]}, você escreveu "AAA".`, 'question'), L(0, 'É um nome de campeão. Três vezes A.', 'fire'), L(1, '(no dia seguinte, o recorde é de "BBB") Agora sou eu o campeão.', 'laugh')],
    outcome: { bond: 2, spark: 1 },
  },
  {
    id: 'rua-pins-strike', kind: 'comedia', title: 'Strike na Pista de Pins', emoji: '🎳', cast: 2, weight: 4, when: (c) => c.env.town >= 4,
    lines: (c) => [L(0, '(joga a bola com força, ela vai devagar, devagar, devagar...)', 'zzz'), L(1, 'Ela não vai chegar. Ela está desistindo.', 'sweat'), L(0, '(a bola encosta no primeiro pino e todos caem como dominó) STRIIIKE!', 'star'), L(1, `${c.n[0]}, isso foi sorte pura. E lindo.`, 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'rua-torre-olhando', kind: 'solo', title: 'A Torre lá em cima', emoji: '🗼', cast: 1, weight: 4, when: (c) => c.env.town >= 7,
    lines: () => [L(0, '(olha para o alto da Torre de Sobrevivência)', 'question'), L(0, 'Dizem que lá dentro tem ondas e ondas de desafios.', 'fire'), L(0, 'Um dia eu entro. Hoje eu só olho. E respiro fundo.', 'sweat')],
    outcome: {},
  },
  {
    id: 'rua-torre-coragem', kind: 'amizade', title: 'Coragem para a Torre', emoji: '💪', cast: 2, weight: 4, when: (c) => c.env.town >= 7 && is(c, 0, 'Tímido', 'Calmo', 'Sonhador'),
    lines: (c) => [L(0, 'O treinador vai me levar para a Torre. Eu estou com medo.', 'sad'), L(1, 'Medo é normal. Todo mundo que entra lá tem medo.', 'heart'), L(0, `Até você, ${c.n[1]}?`, 'question'), L(1, 'Principalmente eu. Mas eu entro assim mesmo. E você também vai.', 'fire')],
    outcome: { bond: 7, friend: 1 },
  },
  {
    id: 'rua-museu-casarao', kind: 'amizade', title: 'O casarão do Museu', emoji: '🏛️', cast: 2, weight: 4, when: (c) => c.env.town >= 8 && day(c),
    lines: (c) => [L(0, 'O Museu agora é um casarão! Tem varanda e escada de madeira.', 'sparkle'), L(1, 'Dizem que tem um quarto secreto lá em cima.', 'question'), L(0, `Vamos procurar, ${c.n[1]}? Bem quietinhos, é museu.`, 'idea'), L(1, '(acham o quarto: é o depósito de vassouras) ...secretíssimo.', 'laugh')],
    outcome: { bond: 5 },
  },
  {
    id: 'rua-cafe-cabana', kind: 'amizade', title: 'O Café de toras', emoji: '🪵', cast: 2, weight: 4, when: (c) => c.env.town >= 3 && (day(c) || evening(c)),
    lines: (c) => [L(0, 'O Café agora parece uma cabana de montanha. Tem lareira e cheiro de canela.', 'heart'), L(1, 'Eu vou pedir um chocolate quente e sentar perto do fogo.', 'sparkle'), L(0, `E eu vou sentar perto de você, ${c.n[1]}. Para dividir o chantili.`, 'heart'), L(1, 'Você só quer o chantili.', 'laugh')],
    outcome: { bond: 5, spark: 1 },
  },
  {
    id: 'rua-correio-quiosque', kind: 'solo', title: 'O quiosque do Correio', emoji: '📮', cast: 1, weight: 4, when: (c) => c.env.town >= 5,
    lines: () => [L(0, 'O Correio é um quiosque pequenininho. Como cabe tanta carta lá dentro?', 'question'), L(0, '(espia pela janela: pilhas e pilhas de cartas até o teto)', 'shock'), L(0, 'É mágica. Ou organização. As duas coisas são parecidas.', 'sparkle')],
    outcome: {},
  },
  {
    id: 'rua-postes-noite', kind: 'romance', title: 'Passeio sob os postes', emoji: '🏮', cast: 2, weight: 4, when: (c) => (evening(c) || night(c)) && calm(c) && (coupled(c) || friendsNow(c)),
    lines: (c) => [L(0, 'A rua principal à noite fica toda dourada.', 'sparkle'), L(1, 'Parece que cada poste acende só para a gente passar.', 'heart'), L(0, `Vamos até o fim da rua, ${c.n[1]}? E voltar? E ir de novo?`, 'heart'), L(1, 'Até os postes cansarem.', 'heart')],
    outcome: { bond: 5, spark: 3 },
  },
  {
    id: 'rua-chuva-guarda-chuva', kind: 'romance', title: 'Um guarda-chuva para dois', emoji: '☂️', cast: 2, weight: 4, when: (c) => rainy(c) && ((c.rel?.spark ?? 0) >= 20 || coupled(c)),
    lines: (c) => [L(0, `${c.n[1]}, você está se molhando todo. Vem para baixo do meu guarda-chuva.`, 'heart'), L(1, 'Ele é pequeno. A gente não cabe.', 'sweat'), L(0, 'Cabe se a gente andar bem juntinho.', 'heart'), L(1, '(andam bem juntinho, metade molhados, inteiros felizes)', 'heart')],
    outcome: { bond: 4, spark: 4 },
  },
  {
    id: 'rua-neve-rua', kind: 'festa', title: 'Guerra de bolas de neve na rua', emoji: '❄️', cast: 3, weight: 4, when: (c) => snowy(c),
    lines: (c) => [L(0, '(faz uma bola de neve e esconde atrás das costas)', 'laugh'), L(1, `${c.n[0]}, por que você está sorrindo assim?`, 'question'), L(0, '(PLOFT!) Por isso!', 'laugh'), L(2, '(PLOFT! PLOFT!) Ninguém fica de fora da guerra! Ninguém!', 'fire')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'rua-vizinhos-novos', kind: 'amizade', title: 'Vizinhos da Rua do Sul', emoji: '🏘️', cast: 2, weight: 4, when: (c) => c.env.town >= 5 && day(c),
    lines: (c) => [L(0, 'Eu me mudei para a Rua do Sul. É mais quieta, tem mais grama.', 'heart'), L(1, 'Eu também moro lá! Duas casas depois da sua!', 'shock'), L(0, `Então a gente é vizinho, ${c.n[1]}! Vou levar bolo de boas-vindas.`, 'star'), L(1, 'E eu levo o café. Vizinhança resolvida.', 'heart')],
    outcome: { bond: 6 },
  },
  {
    id: 'rua-carrinho-mercado', kind: 'comedia', title: 'O carrinho desgovernado', emoji: '🛒', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Vou empurrar o carrinho das compras na descida! Segura!', 'fire'), L(1, 'Na descida? Que descida? A Vila é plana!', 'question'), L(0, '(empurra mesmo assim, o carrinho vai três passos e para)', 'sweat'), L(1, `Foi a aventura mais lenta da minha vida, ${c.n[0]}.`, 'laugh')],
    outcome: { bond: 3 },
  },
  {
    id: 'rua-banda-praca', kind: 'festa', title: 'A banda da praça', emoji: '🎺', cast: 3, weight: 4, when: (c) => evening(c) && calm(c),
    lines: (c) => [L(0, 'Montamos uma banda! Eu toco tambor de panela!', 'note'), L(1, 'Eu toco flauta de bambu.', 'note'), L(2, 'Eu toco o triângulo. Na hora errada, mas com muito sentimento.', 'sweat'), L(0, `A praça inteira dançou. Até ${c.n[2]}, que estava tocando.`, 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4, friend: 1 },
  },
  {
    id: 'rua-sorveteria', kind: 'amizade', title: 'Sorvete na avenida', emoji: '🍦', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Sorvete de duas bolas: uma de pecha, uma de oran.', 'star'), L(1, 'Eu quero de três. E com granulado. E com cobertura. E com...', 'heart'), L(0, `${c.n[1]}, isso não é mais um sorvete. É uma escultura.`, 'laugh'), L(1, 'Uma escultura deliciosa. (a bola de cima cai) ...agora é de duas.', 'sad')],
    outcome: { bond: 4 },
  },
  {
    id: 'rua-chafariz-moeda', kind: 'solo', title: 'Uma moeda na fonte', emoji: '🪙', cast: 1, weight: 4, when: (c) => calm(c),
    lines: () => [L(0, '(joga uma moeda na fonte da praça e fecha os olhos)', 'sparkle'), L(0, 'Desejo que o treinador nunca esqueça de mim.', 'heart'), L(0, '(abre um olho) ...e que tenha bolo amanhã. Dois desejos, uma moeda. Tudo bem.', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'rua-guia-turistico', kind: 'comedia', title: 'O guia da Vila', emoji: '🧳', cast: 3, weight: 4, when: (c) => day(c) && is(c, 0, 'Mandão', 'Curioso', 'Brincalhão'),
    lines: (c) => [L(0, 'Bem-vindos ao tour da Vila! À esquerda, o mercado. À direita, a fonte.', 'star'), L(1, 'Moço, a fonte está à esquerda.', 'question'), L(0, 'Depende de que lado você olha. Próxima parada: o lago!', 'sweat'), L(2, `${c.n[0]}, a gente mora aqui. A gente conhece tudo.`, 'laugh')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
  {
    id: 'rua-banco-praca-velhos', kind: 'amizade', title: 'Conversa de banco de praça', emoji: '🪑', cast: 2, weight: 5, when: (c) => (day(c) || evening(c)) && calm(c),
    lines: (c) => [L(0, '(sentados no banco da praça, vendo a Vila passar)', 'heart'), L(1, 'Lembra quando a Vila era só uma rua e uma barraca?', 'sparkle'), L(0, `Lembro. Agora tem cidade, lago, fazenda... e a gente continua no mesmo banco, ${c.n[1]}.`, 'heart'), L(1, 'Algumas coisas não precisam mudar.', 'heart')],
    outcome: { bond: 6, friend: 1 },
  },
  {
    id: 'rua-briga-calcada', kind: 'rivalidade', title: 'Quem sai da frente', emoji: '🚶', cast: 2, weight: 4, when: (c) => rivals(c) || is(c, 0, 'Mandão'),
    lines: (c) => [L(0, '(os dois vêm andando na mesma calçada, um de frente para o outro)', 'anger'), L(1, 'Sai da frente.', 'anger'), L(0, 'Sai você.', 'anger'), L(1, `...a rua tem dois metros de largura, ${c.n[0]}. A gente está sendo ridículo.`, 'sweat')],
    outcome: { bond: 1, spark: 1 },
  },
  {
    id: 'rua-feirante-presente', kind: 'amizade', title: 'Presente da feira', emoji: '🎁', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}, eu comprei uma coisa para você na barraca verde.`, 'heart'), L(1, '(abre) Um lenço! Com a minha cor favorita!', 'sparkle'), L(0, 'Eu lembrei que você gosta. Eu presto atenção nas coisas.', 'heart'), L(1, 'Eu vou usar todo dia. Até lavar. E depois de lavar.', 'star')],
    outcome: { bond: 7, items: [['tecido', 1]] },
  },
  {
    id: 'rua-noite-avenida-vazia', kind: 'solo', title: 'A avenida vazia', emoji: '🌃', cast: 1, weight: 4, when: (c) => night(c),
    lines: () => [L(0, '(anda sozinho pelo meio da avenida, de madrugada)', 'zzz'), L(0, 'De dia é cheia de gente. De noite é toda minha.', 'sparkle'), L(0, '(dá uma pirueta no meio da rua, sem ninguém para ver)', 'laugh')],
    outcome: {},
  },
  {
    id: 'rua-trio-sorvete-chuva', kind: 'drama', title: 'Sorvete e chuva', emoji: '🌦️', cast: 3, weight: 4, when: (c) => rainy(c),
    lines: (c) => [L(0, 'A gente saiu para tomar sorvete e começou a chover!', 'sad'), L(1, 'O sorvete está ficando aguado.', 'sad'), L(2, 'Vamos para o Café! Sorvete com chocolate quente!', 'idea'), L(0, `${c.n[2]}, você salvou o dia.`, 'heart')],
    outcome: { bond: 4, bond02: 4, bond12: 5 },
  },
  {
    id: 'rua-limpeza', kind: 'festa', title: 'Mutirão de limpeza', emoji: '🧹', cast: 3, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'A Vila ficou grande e precisa de cuidado. Mutirão de limpeza!', 'fire'), L(1, 'Eu varro a praça!', 'star'), L(2, 'Eu tiro as folhas da fonte!', 'star'), L(0, `E eu fiscalizo. Bom trabalho, ${c.n[1]}! Muito bem, ${c.n[2]}!`, 'laugh')],
    outcome: { bond: 3, bond02: 3, bond12: 4, friend: 1 },
  },
  {
    id: 'rua-gato-telhado', kind: 'comedia', title: 'Preso no telhado', emoji: '🏠', cast: 2, weight: 3, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Corajoso', 'Curioso'),
    lines: (c) => [L(0, '(subiu no telhado de uma casa para pegar uma bola)', 'fire'), L(0, '...e agora não sabe descer.', 'sweat'), L(1, `${c.n[0]}, pula que eu seguro!`, 'heart'), L(0, '(pula, os dois caem num monte de folhas e riem até perder o fôlego)', 'laugh')],
    outcome: { bond: 6 },
  },
  {
    id: 'rua-relogio-praca', kind: 'solo', title: 'Que horas são?', emoji: '⏰', cast: 1, weight: 3,
    lines: (c) => [L(0, 'Que horas são? Eu não tenho relógio.', 'question'), L(0, c.env.hour < 12 ? 'O sol está daquele lado, então é de manhã. Hora do primeiro lanche.' : c.env.hour < 18 ? 'O sol está alto, então é de tarde. Hora do lanche da tarde.' : 'Está escuro, então é de noite. Hora do lanche da noite.', 'idea'), L(0, 'Eu sempre sei que horas são. Toda hora é hora de lanche.', 'laugh')],
    outcome: {},
  },
  {
    id: 'rua-pintura-casa', kind: 'amizade', title: 'A casa pintada', emoji: '🎨', cast: 2, weight: 4, when: (c) => c.env.town >= 3 && day(c),
    lines: (c) => [L(0, `${c.n[1]}, o treinador pintou a minha casa de uma cor nova!`, 'star'), L(1, 'Ficou linda! Combina com você.', 'heart'), L(0, 'Agora dá para achar a minha casa lá do lago.', 'sparkle'), L(1, 'E eu vou achar sempre que quiser te visitar.', 'heart')],
    outcome: { bond: 5 },
  },
  {
    id: 'rua-saudade-antiga', kind: 'drama', title: 'Saudade da Vila pequena', emoji: '🥲', cast: 2, weight: 4, when: (c) => is(c, 0, 'Sonhador', 'Calmo', 'Tímido'),
    lines: (c) => [L(0, 'A Vila ficou tão grande... às vezes eu sinto falta de quando era pequena.', 'sad'), L(1, 'Era bom conhecer cada pedrinha.', 'sad'), L(0, `Mas agora tem mais lugar para a gente criar memória, ${c.n[1]}.`, 'idea'), L(1, 'Então vamos criar uma agora. (dá um abraço)', 'heart')],
    outcome: { bond: 7, spark: 1 },
  },
];
