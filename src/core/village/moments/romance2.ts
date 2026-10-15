import { L, calm, coupled, day, evening, heard, night, other, rainy, said, snowy } from './kit';
import type { Ctx, Template } from './kit';

const crush = (c: Ctx): boolean => !!c.rel && c.rel.flag === null && c.rel.spark >= 15 && c.rel.bond > -5;

/** Mais romance: paquera, vida de casal e cenas de cidade pequena. */
export const ROMANCE2_MOMENTS: readonly Template[] = [
  // ---------------------------------------------------------------------------- paquera
  {
    id: 'rom2-flor-na-janela', kind: 'romance', title: 'Flor na janela', emoji: '🌷', cast: 2, weight: 5, when: (c) => crush(c) && c.env.town >= 2 && day(c),
    lines: (c) => [L(0, '(coloca uma flor na janela do vizinho e sai correndo, de ponta de pé)', 'heart'), L(1, 'Uma flor na minha janela! Quem será o admirador secreto?', 'shock'), L(1, `Tem uma pegada no canteiro, do tamanho do pé do ${c.n[0]}.`, 'idea'), L(0, '(escondido atrás da cerca) ...Eu vou mudar de nome.', 'sweat')],
    outcome: { bond: 5, spark: 8 },
    after: (n, who) => (who === 0 ? `Deixei uma flor na janela de ${n[1]}. Eu sou um crime ambulante.` : `Uma flor apareceu na minha janela. Eu sei quem foi. Vou fingir que não sei.`),
  },
  {
    id: 'rom2-sopa-pro-crush', kind: 'romance', title: 'Sopa para o amor', emoji: '🍲', cast: 2, weight: 5, when: (c) => crush(c) && (rainy(c) || snowy(c)),
    lines: (c) => [L(0, `${c.n[1]}, eu fiz sopa demais. Será que você me ajuda a terminar?`, 'sweat'), L(1, 'Uma sopa demais? Eu nunca ouvi essa reclamação na vida.', 'laugh'), L(0, '(a panela ainda estava cheia; foram duas horas de colher e conversa)', 'heart'), L(1, 'Eu volto amanhã. Quer dizer, se sobrar sopa. Ou não.', 'sparkle')],
    outcome: { bond: 6, spark: 9 },
  },
  {
    id: 'rom2-carta-de-amor', kind: 'romance', title: 'Carta de amor no correio', emoji: '💌', cast: 2, weight: 5, when: (c) => crush(c) && c.env.town >= 5 && day(c),
    lines: (c) => [L(0, '(coloca a carta no Correio, com um selo de coração) ...Pronto. Agora é com o destino.', 'heart'), L(1, 'Uma carta! "Com carinho, de alguém que passa por aqui todo dia."', 'shock'), L(1, `A letra é a do ${c.n[0]}! Eu reconheceria esse "g" torto em qualquer lugar.`, 'sparkle'), L(0, '(de longe, vendo ele ler, com o coração a mil) ...', 'sweat')],
    outcome: { bond: 6, spark: 10 },
  },
  {
    id: 'rom2-cafe-a-dois', kind: 'romance', title: 'Café a dois', emoji: '☕', cast: 2, weight: 6, when: (c) => crush(c) && c.env.town >= 3 && day(c),
    lines: (c) => [L(0, `${c.n[1]}, aceita um café? Eu pago. Quer dizer, o treinador paga.`, 'sparkle'), L(1, 'Eu aceito, mas só se for na mesa da janela.', 'heart'), L(0, '(sentam, calados; o açúcar derrama; os dedos se tocam sem querer)', 'heart'), L(1, 'Mais um café? Eu ainda não terminei de te olhar... de olhar o café.', 'sweat')],
    outcome: { bond: 6, spark: 10 },
  },
  {
    id: 'rom2-caminhar-na-praca', kind: 'romance', title: 'Volta na praça', emoji: '⛲', cast: 2, weight: 5, when: (c) => crush(c) && evening(c) && calm(c),
    lines: (c) => [L(0, 'A fonte da praça é bonita à noite. Dá para ver a lua dentro dela.', 'sparkle'), L(1, 'Eu prefiro ver a lua em você. Quer dizer, nos seus olhos.', 'heart'), L(0, `${c.n[1]}... você é sempre assim, tão direto?`, 'sweat'), L(1, 'Só quando a água está batendo bem no rosto.', 'laugh')],
    outcome: { bond: 6, spark: 9 },
  },
  {
    id: 'rom2-musica-janela', kind: 'romance', title: 'Serenata', emoji: '🎻', cast: 2, weight: 4, when: (c) => crush(c) && night(c) && calm(c),
    lines: (c) => [L(0, '(embaixo da janela, com um violão sem uma corda) Lá-lá-lá, amor...', 'note'), L(1, '(abre a janela) Isso é uma serenata ou um gato preso?', 'question'), L(0, 'É uma serenata com acompanhamento de gato preso!', 'sweat'), L(1, `Eu amei. Volta amanhã. Mas ${c.n[0]}, com menos gato.`, 'laugh')],
    outcome: { bond: 5, spark: 10 },
  },
  {
    id: 'rom2-pose-foto', kind: 'romance', title: 'Foto a dois', emoji: '📸', cast: 2, weight: 4, when: (c) => crush(c) && day(c),
    lines: (c) => [L(0, `${c.n[1]}, vem para a foto! A luz está perfeita!`, 'star'), L(1, '(chega perto, meio sem jeito) Assim? Mais perto?', 'sweat'), L(0, '(o clique sai: os dois piscando, uma folha na cabeça, o fundo desfocado)', 'laugh'), L(1, 'É a melhor foto que eu já tirei. E olha que eu estou meio feio.', 'heart')],
    outcome: { bond: 5, spark: 8 },
  },
  {
    id: 'rom2-dividir-guarda-chuva', kind: 'romance', title: 'Voltando para casa', emoji: '🏠', cast: 2, weight: 5, when: (c) => crush(c) && rainy(c) && c.env.town >= 2,
    lines: (c) => [L(0, '(chega à porta dele) Eu moro aqui. Obrigado pela companhia.', 'sweat'), L(1, 'A chuva me convidou a te levar até a porta.', 'heart'), L(0, `${c.n[1]}... quer entrar para um chá?`, 'sparkle'), L(1, '(olha para a chuva, olha para ele) Eu gostaria. Muito.', 'heart')],
    outcome: { bond: 6, spark: 10 },
  },
  // ---------------------------------------------------------------------------- vida de casal
  {
    id: 'rom2-casal-compras', kind: 'romance', title: 'Compras do casal', emoji: '🛒', cast: 2, weight: 5, when: (c) => coupled(c) && day(c),
    lines: (c) => [L(0, `${c.n[1]}, vamos levar a sopa de legumes, a geleia e o pão?`, 'idea'), L(1, 'E a torta de maçã que eu vi na vitrine.', 'star'), L(0, 'A lista tinha três itens. Já estamos em quinze.', 'sweat'), L(1, 'Mas todos têm o seu charme, como nós.', 'heart')],
    outcome: { bond: 4, spark: 3 },
  },
  {
    id: 'rom2-casal-jardim', kind: 'romance', title: 'Jardinagem a dois', emoji: '🌻', cast: 2, weight: 5, when: (c) => coupled(c) && day(c) && calm(c),
    lines: (c) => [L(0, 'Eu planto, você rega. A gente tem uma divisão de tarefas perfeita.', 'idea'), L(1, 'Eu rego, você derruba. Quase perfeita.', 'laugh'), L(0, `${c.n[1]}, esse girassol vai crescer mais que eu.`, 'star'), L(1, 'Ele vai ter a nossa altura somada. Dois amores, um girassol.', 'heart')],
    outcome: { bond: 4, spark: 3, items: [['flor', 1]] },
  },
  {
    id: 'rom2-casal-janta', kind: 'romance', title: 'Jantar à luz de vela', emoji: '🕯️', cast: 2, weight: 5, when: (c) => coupled(c) && evening(c),
    lines: (_c) => [L(0, 'A mesa está posta. A vela é de verdade, a sopa também.', 'sparkle'), L(1, 'Está tudo lindo. Só falta a gente não deixar a vela cair.', 'sweat'), L(0, '(a vela cai; os dois apagam o fogo com guardanapo e riem)', 'laugh'), L(1, 'Eu repetiria esse jantar uma centena de vezes.', 'heart')],
    outcome: { bond: 4, spark: 5 },
  },
  {
    id: 'rom2-casal-dancinha', kind: 'romance', title: 'Dança na cozinha', emoji: '💃', cast: 2, weight: 5, when: (c) => coupled(c) && (evening(c) || night(c)),
    lines: (c) => [L(0, '(liga o rádio) Essa música me lembra do dia em que a gente se conheceu.', 'note'), L(1, `${c.n[0]}, eu nem lembro da música. Só lembro de você.`, 'heart'), L(0, '(dançam em volta da mesa, pisando um no pé do outro)', 'sparkle'), L(1, 'A gente erra os passos, mas nunca perde o ritmo.', 'star')],
    outcome: { bond: 4, spark: 5 },
  },
  {
    id: 'rom2-casal-briga-boba', kind: 'romance', title: 'Briguinha boba', emoji: '🙄', cast: 2, weight: 4, when: (c) => coupled(c) && day(c),
    lines: (c) => [L(0, `${c.n[1]}, quem deixou a tampa do açúcar aberta?`, 'anger'), L(1, 'Eu? Eu nunca. O açúcar abre sozinho!', 'anger'), L(0, 'Hmm. Você ainda é a pessoa mais fofa quando mente.', 'heart'), L(1, 'E você, quando fecha a tampa com ódio.', 'laugh')],
    outcome: { bond: -1, spark: 2 },
  },
  {
    id: 'rom2-casal-aniversario-namoro', kind: 'romance', title: 'Aniversário de namoro', emoji: '💞', cast: 2, weight: 3, when: (c) => coupled(c) && day(c) && c.date.d % 7 === 0,
    lines: (c) => [L(0, `${c.n[1]}, sabe que dia é hoje? Hoje faz exatamente um tempinho que a gente ficou junto.`, 'sparkle'), L(1, 'Eu lembro! A data exata me escapou, mas o sentimento está inteiro.', 'sweat'), L(0, '(entrega uma pedrinha em forma de coração) Para guardar.', 'heart'), L(1, 'Eu vou guardar na gaveta mais especial da casa.', 'heart')],
    outcome: { bond: 5, spark: 6, friend: 1 },
  },
  {
    id: 'rom2-casal-medo-trovao', kind: 'romance', title: 'Trovão e colo', emoji: '⛈️', cast: 2, weight: 5, when: (c) => coupled(c) && rainy(c),
    lines: (c) => [L(0, '(um trovão ecoa) Eu não tenho medo. É só que o chão tremeu.', 'sweat'), L(1, `${c.n[0]}, vem aqui. Aqui é mais quentinho.`, 'heart'), L(0, 'Agora o trovão me dá uma sensação ótima.', 'laugh'), L(1, 'Eu agradeço ao céu pela chuva e pelo trovão.', 'sparkle')],
    outcome: { bond: 5, spark: 6 },
  },
  {
    id: 'rom2-casal-planos-casa', kind: 'romance', title: 'Planos para a casa', emoji: '🏡', cast: 2, weight: 5, when: (c) => coupled(c) && c.env.town >= 3 && day(c),
    lines: (c) => [L(0, 'Eu quero um sobrado com varanda, uma lareira e um quarto de hóspedes.', 'star'), L(1, `${c.n[0]}, a nossa casinha cabe nisso tudo?`, 'question'), L(0, 'Se encostarmos a lareira na varanda, cabe!', 'idea'), L(1, 'A gente vai pedir ao treinador uma reforma. E um colchão macio.', 'laugh')],
    outcome: { bond: 4, spark: 4, friend: 1 },
  },
  {
    id: 'rom2-casal-saudade', kind: 'romance', title: 'Saudade de duas horas', emoji: '🥹', cast: 2, weight: 5, when: (c) => coupled(c) && day(c),
    lines: (c) => [L(0, '(volta do passeio) Eu fiquei fora duas horas e já estava morrendo de saudade.', 'sad'), L(1, `${c.n[0]}, eu contei cada minuto no relógio de sol.`, 'heart'), L(0, 'Relógio de sol? À noite?', 'question'), L(1, 'A saudade é boa para o cálculo.', 'laugh')],
    outcome: { bond: 4, spark: 5 },
  },
  {
    id: 'rom2-casal-resposta', kind: 'romance', title: 'Frase do casal', emoji: '💬', cast: 2, weight: 8, when: (c) => coupled(c) && heard(c) && (day(c) || evening(c)),
    lines: (c) => [L(0, `Sabe o que o treinador respondeu? "${said(c)}". Eu pensei em você.`, 'heart'), L(1, 'Em mim? Por quê? Eu sou "' + 'isso" para você?', 'question'), L(0, 'Você é isso, aquilo e tudo o que está no meio.', 'sparkle'), L(1, 'Então eu aceito ser a sua resposta favorita.', 'heart')],
    outcome: { bond: 4, spark: 6, friend: 1 },
  },
  {
    id: 'rom2-casal-bilhete-geladeira', kind: 'romance', title: 'Bilhete na geladeira', emoji: '📝', cast: 2, weight: 5, when: (c) => coupled(c) && c.env.hour < 10,
    lines: (c) => [L(0, '(acorda e encontra um bilhete na geladeira) "Fui buscar frutas. Volto já. Te amo."', 'heart'), L(0, 'Ele escreveu "Te amo" com a letra mais tremida do mundo.', 'sparkle'), L(1, '(entra com uma cesta enorme) Voltei! A cesta pesou mais do que eu pensava.', 'laugh'), L(0, `Eu já te amo mais que a cesta, ${c.n[1]}.`, 'heart')],
    outcome: { bond: 4, spark: 5, items: [['oran', 1]] },
  },
  {
    id: 'rom2-casal-estrelas', kind: 'romance', title: 'Deitados no telhado', emoji: '🌌', cast: 2, weight: 5, when: (c) => coupled(c) && night(c) && calm(c),
    lines: (_c) => [L(0, 'Olha, uma estrela cadente! Vai, faz um pedido!', 'star'), L(1, 'Já fiz, mas é segredo.', 'heart'), L(0, 'Eu também. Acho que é o mesmo.', 'sparkle'), L(1, '(pega na mão dele) Então a estrela só tem um trabalho a fazer.', 'heart')],
    outcome: { bond: 5, spark: 7 },
  },
  {
    id: 'rom2-casal-ensina-cozinhar', kind: 'romance', title: 'Receita de família', emoji: '🥘', cast: 2, weight: 4, when: (c) => coupled(c) && (day(c) || evening(c)),
    lines: (c) => [L(0, `${c.n[1]}, a receita da minha avó tem um segredo.`, 'idea'), L(1, 'Qual? Eu juro que guardo.', 'sparkle'), L(0, 'É uma pitada de paciência. E muito amor, e um pouco de sal.', 'heart'), L(1, 'A receita é perfeita. Mas a paciência estava em falta hoje.', 'laugh')],
    outcome: { bond: 4, spark: 4 },
  },
  {
    id: 'rom2-casal-ciumes-bobos', kind: 'romance', title: 'Ciúme do girassol', emoji: '🌻', cast: 2, weight: 3, when: (c) => coupled(c) && c.env.crops > 0 && day(c),
    lines: (c) => [L(0, `${c.n[1]}, você passou meia hora conversando com o girassol!`, 'anger'), L(1, 'Ele é um bom ouvinte. Não interrompe.', 'laugh'), L(0, 'Eu não interrompo! Quer dizer... às vezes.', 'sweat'), L(1, 'Para você eu tenho um assunto inteiro. O girassol só tem folhas.', 'heart')],
    outcome: { bond: 3, spark: 3 },
  },
  {
    id: 'rom2-casal-frio-casaco', kind: 'romance', title: 'Um casaco para dois', emoji: '🧥', cast: 2, weight: 5, when: (c) => snowy(c) && (coupled(c) || crush(c)),
    lines: (c) => [L(0, `${c.n[1]}, você está tremendo. Vem aqui debaixo.`, 'heart'), L(1, 'Eu não estou com frio. Eu só estou com saudade de calor.', 'sparkle'), L(0, '(abre o casaco e cabem os dois, dividindo o capuz)', 'heart'), L(1, 'Se alguém passar, eu digo que somos um monstro de quatro pernas.', 'laugh')],
    outcome: { bond: 5, spark: 8 },
  },
  {
    id: 'rom2-cena-cinema', kind: 'romance', title: 'Cinema no sofá', emoji: '🎞️', cast: 2, weight: 5, when: (c) => (coupled(c) || crush(c)) && evening(c) && c.has('televisao', 'sofa', 'poltrona'),
    lines: (c) => [L(0, 'Esse filme é romântico. Se eu chorar, finja que não viu.', 'sweat'), L(1, '(já está com os olhos molhados, mas finge que é alergia)', 'sad'), L(0, `${c.n[1]}, você chorou mais do que eu.`, 'laugh'), L(1, 'Foi o cheiro de pipoca. Muito emotivo.', 'sparkle')],
    outcome: { bond: 4, spark: 6 },
  },
  {
    id: 'rom2-triangulo-ciume', kind: 'drama', title: 'O vizinho charmoso', emoji: '😠', cast: 2, weight: 4, when: (c) => coupled(c) && day(c) && other(c.n, 0) !== '',
    lines: (c) => [L(0, `${c.n[1]}, o vizinho elogiou o seu laço. Ele ficou olhando por três segundos!`, 'anger'), L(1, 'Três segundos? Eu estava tentando desamarrar o laço dele!', 'question'), L(0, 'Ah... então foi um ato de gentileza.', 'sweat'), L(1, 'Eu só tenho olhos para você. E para os laços, às vezes.', 'laugh')],
    outcome: { bond: 1, spark: 3 },
  },
];
