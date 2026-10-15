import { L, calm, day, evening, is, night, pick, rainy, snowy } from './kit';
import type { Template } from './kit';

/** Momentos de um Pokémon sozinho: pequenas manias, medos, sonhos e desastres domésticos. */
export const SOLO_MOMENTS: readonly Template[] = [
  {
    id: 'solo-discurso', kind: 'solo', title: 'O discurso de ninguém', emoji: '🎤', cast: 1, weight: 3, when: (c) => is(c, 0, 'Tímido', 'Sonhador'),
    lines: ({ n }) => [L(0, `Boa tarde, Vila. Eu sou ${n[0]} e hoje eu vou... vou...`, 'sweat'), L(0, '(olha para o arbusto, que parece esperar)', 'question'), L(0, 'Era isso. Obrigado, arbusto. Você foi muito atencioso.', 'sparkle')],
    outcome: {},
    after: () => 'Ensaiei um discurso para um arbusto. Ele não interrompeu uma vez sequer.',
  },
  {
    id: 'solo-pedrinhas', kind: 'solo', title: 'A coleção de pedrinhas', emoji: '🪨', cast: 1, weight: 4, when: (c) => is(c, 0, 'Curioso', 'Calmo'),
    lines: () => [L(0, 'Esta é a pedrinha número 41. Redondinha. Quase perfeita.', 'star'), L(0, 'Esta é a 42. Também é redondinha. A 43... igualzinha.', 'idea'), L(0, 'Não é que sejam todas iguais. É que eu sou exigente.', 'sweat')],
    outcome: { items: [['pedra', 1]] },
  },
  {
    id: 'solo-trovao', kind: 'solo', title: 'Quem tem medo de trovão?', emoji: '⛈️', cast: 1, weight: 5, when: (c) => rainy(c),
    lines: ({ n }) => [L(0, 'Eu não tenho medo. Eu só estou... prestando muita atenção.', 'sweat'), L(0, '(um trovão ecoa e ' + n[0] + ' pula dois metros)', 'shock'), L(0, 'Isso foi um espirro do céu! Sim! Do céu!', 'sweat'), L(0, '(se esconde atrás da primeira árvore, que não adianta nada)', 'sad')],
    outcome: { friend: 1 },
    after: () => 'Troveja e eu finjo coragem. Se você aparecesse por perto, eu não reclamaria.',
  },
  {
    id: 'solo-boneco-neve', kind: 'solo', title: 'O boneco de neve', emoji: '⛄', cast: 1, weight: 6, when: (c) => snowy(c),
    lines: () => [L(0, '(rola uma bola de neve, rola, rola e ela passa do tamanho dele)', 'star'), L(0, 'Prontinho! Falta só o nariz. Uma cenoura... uma pedrinha...', 'idea'), L(0, 'Eu vou chamá-lo de Gélido. Ele me entende. Ele não responde, mas entende.', 'heart')],
    outcome: { friend: 2, items: [['pedra', 1]] },
    after: () => 'Fiz um boneco de neve e ele me deu a melhor companhia do dia: silêncio.',
  },
  {
    id: 'solo-poca', kind: 'solo', title: 'Campeonato de poças', emoji: '💦', cast: 1, weight: 5, when: (c) => rainy(c) && is(c, 0, 'Brincalhão', 'Corajoso', 'Curioso', 'Guloso'),
    lines: () => [L(0, 'Poça pequena: pulo nível fácil!', 'star'), L(0, 'Poça média: pulo nível mestre!', 'fire'), L(0, '(pula na poça gigante e desaparece até a cintura)', 'shock'), L(0, 'Nota da juíza imaginária: dez!', 'laugh')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo-sombra', kind: 'solo', title: 'A sombra perseguidora', emoji: '👤', cast: 1, weight: 4, when: (c) => day(c) && calm(c),
    lines: () => [L(0, 'Ei. Tem uma coisa me seguindo. Preta. Silenciosa.', 'shock'), L(0, '(corre para a esquerda, a coisa vai junto)', 'sweat'), L(0, '(corre para a direita, a coisa vai junto)', 'sweat'), L(0, 'Ah... é a minha sombra. Que gracinha. Quase me matou de susto.', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo-diario', kind: 'solo', title: 'O diário secreto', emoji: '📔', cast: 1, weight: 4, when: (c) => night(c) || c.env.hour >= 20,
    lines: (c) => [L(0, 'Querido diário: hoje eu comi, dormi e olhei as nuvens. Foi tudo bom.', 'note'), L(0, `Observação: o ${c.env.player} passou perto e eu fingi estar ocupado. Fui péssimo.`, 'sweat'), L(0, 'Prometo ser mais corajoso amanhã. Ou depois. Ou semana que vem.', 'sparkle')],
    outcome: { friend: 2 },
    after: (_n) => 'Eu escrevo um diário. Não conta para ninguém, tá?',
  },
  {
    id: 'solo-poema', kind: 'solo', title: 'Poema para o treinador', emoji: '📜', cast: 1, weight: 4, when: (c) => c.pts(0) >= 40 && is(c, 0, 'Sonhador', 'Calmo', 'Tímido', 'Curioso'),
    lines: (c) => [L(0, `Rosas são vermelhas, a Vila é verdinha, ${c.env.player} é o melhor treinador da minha vidinha.`, 'heart'), L(0, '...Rimou? Eu acho que rimou. Preciso de uma segunda opinião.', 'question'), L(0, '(dobra o papel e esconde debaixo de uma pedra, para achar depois)', 'sparkle')],
    outcome: { friend: 3 },
    after: (_n) => 'Escrevi um poema. Está debaixo de uma pedra. Nunca vou te mostrar. Talvez mostre.',
  },
  {
    id: 'solo-treino-fail', kind: 'solo', title: 'Treino que deu errado', emoji: '🏋️', cast: 1, weight: 5, when: (c) => is(c, 0, 'Corajoso', 'Mandão', 'Brincalhão'),
    lines: () => [L(0, 'Hoje eu vou levantar aquela pedra gigante!', 'fire'), L(0, '(faz força, faz força, faz mais força)', 'anger'), L(0, '(a pedra não se mexe, mas ele sim: sentado, sem ar)', 'sweat'), L(0, 'Estratégia nova: amanhã ela vem até mim.', 'idea')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo-dieta', kind: 'solo', title: 'A dieta de três minutos', emoji: '🥗', cast: 1, weight: 4, when: (c) => is(c, 0, 'Guloso'),
    lines: () => [L(0, 'A partir de hoje: só folhas. Folhas e água. Disciplina!', 'fire'), L(0, '(passa um cheiro de torta de pecha)', 'shock'), L(0, 'Eu... preciso verificar se a torta está segura para a população.', 'sweat'), L(0, 'Estava. Verifiquei a torta inteira.', 'laugh')],
    outcome: {},
    after: () => 'Entrei em uma dieta. Duramos três minutos, eu e a minha vontade.',
  },
  {
    id: 'solo-espirro', kind: 'solo', title: 'O espirro épico', emoji: '🤧', cast: 1, weight: 4,
    lines: () => [L(0, 'Eu... eu... EU...', 'shock'), L(0, 'ATCHIIIIM!', 'laugh'), L(0, '(um bando de passarinhos sai voando da árvore ao lado)', 'sweat'), L(0, 'Desculpa! Foi sem querer! Foi um espirro de nascença!', 'sweat')],
    outcome: {},
  },
  {
    id: 'solo-arbusto', kind: 'solo', title: 'A discussão com o arbusto', emoji: '🌿', cast: 1, weight: 4, when: (c) => is(c, 0, 'Mandão', 'Corajoso'),
    lines: () => [L(0, 'Sai da frente, arbusto. Eu estou passando.', 'anger'), L(0, '(o arbusto não se mexe)', 'question'), L(0, 'Última chance. Eu venci Ginásios. Eu sou muito respeitado.', 'fire'), L(0, '(dá a volta pelo lado e finge que era o plano desde o começo)', 'sweat')],
    outcome: {},
    after: () => 'Quase venci um arbusto hoje. Foi por pouco. Ele estava muito bem posicionado.',
  },
  {
    id: 'solo-estrela', kind: 'solo', title: 'Pedido à estrela cadente', emoji: '🌠', cast: 1, weight: 4, when: (c) => night(c) || c.env.hour >= 20,
    lines: (c) => [L(0, 'Olha! Uma estrela cadente! Rápido, um pedido!', 'star'), L(0, `Eu quero... eu quero... uma torta. Não! Eu quero que o ${c.env.player} nunca vá embora!`, 'heart'), L(0, '(pensa um pouco) ...E a torta também, se não for pedir demais.', 'sparkle')],
    outcome: { friend: 2, coins: 5 },
    after: () => 'Fiz um pedido a uma estrela cadente. Não posso contar. Mas você vai gostar.',
  },
  {
    id: 'solo-sesta', kind: 'solo', title: 'A sesta interrompida', emoji: '😴', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Calmo', 'Sonhador', 'Guloso'),
    lines: () => [L(0, '(sonhando) ...aí o bolo pedia para eu comer, e eu comia...', 'zzz'), L(0, '(uma borboleta pousa no focinho)', 'question'), L(0, 'Ei! Eu estava no melhor pedaço! Volta, bolo, volta!', 'sad'), L(0, '(fecha os olhos e tenta encontrar o sonho de novo, sem sucesso)', 'zzz')],
    outcome: {},
  },
  {
    id: 'solo-pintor', kind: 'solo', title: 'O pintor da praça', emoji: '🎨', cast: 1, weight: 4, when: (c) => day(c) && c.has('quadro', 'quadro-mar', 'quadro-flores', 'quadro-pokebola'),
    lines: () => [L(0, 'Hoje eu pinto a Vila inteira: a casa, o lago, as árvores...', 'sparkle'), L(0, '(a tela fica com um borrão verde e uma mancha vermelha)', 'question'), L(0, 'É arte abstrata. Chama-se "Domingo de manhã com susto".', 'idea')],
    outcome: (c) => ({ coins: 8 + Math.floor(c.rng() * 12) }),
    after: () => 'Pintei um quadro e vendi para um passarinho. Foi uma boa semana.',
  },
  {
    id: 'solo-jardineiro', kind: 'solo', title: 'Jardineiro orgulhoso', emoji: '🌻', cast: 1, weight: 6, when: (c) => c.env.crops > 0 && calm(c) && day(c),
    lines: () => [L(0, 'Bom dia, plantinhas! Quem está com sede? Todo mundo? Pois é.', 'sparkle'), L(0, '(rega devagar, uma por uma, como se fosse uma cerimônia)', 'star'), L(0, 'Cresçam fortes! Eu vou estar de olho. Com carinho. Mas de olho.', 'heart')],
    outcome: { water: true, friend: 2 },
    after: () => 'Reguei a horta por conta própria. Ninguém pediu. Eu simplesmente sou uma pessoa responsável.',
  },
  {
    id: 'solo-tesouro', kind: 'solo', title: 'Caça ao tesouro', emoji: '🗺️', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Curioso', 'Corajoso', 'Brincalhão'),
    lines: () => [L(0, 'Este mapa mostra um X! E o X está... aqui. Debaixo desta pedra.', 'star'), L(0, '(cava, cava, cava e encontra uma moedinha enferrujada)', 'shock'), L(0, 'É isso? Um pirata se aposentou com isso? Que decepção... ou não, ainda é ouro.', 'laugh')],
    outcome: (c) => (c.rng() < 0.2 ? { items: [['ouro', 1]], coins: 10 } : { coins: 6 + Math.floor(c.rng() * 14) }),
  },
  {
    id: 'solo-reflexo', kind: 'solo', title: 'O outro no espelho', emoji: '🪞', cast: 1, weight: 4, when: (c) => c.has('espelho', 'laguinho', 'fonte') && is(c, 0, 'Curioso', 'Brincalhão', 'Tímido'),
    lines: () => [L(0, '(se aproxima devagar do próprio reflexo)', 'question'), L(0, 'Ei... quem é você? Você é muito parecido comigo.', 'shock'), L(0, '(dá um passo, o reflexo dá um passo)', 'sweat'), L(0, 'Tá bom. Você é legal. A gente pode ser amigo. Mas eu mando.', 'sparkle')],
    outcome: {},
  },
  {
    id: 'solo-banho-fonte', kind: 'solo', title: 'Banho de fonte', emoji: '🛁', cast: 1, weight: 4, when: (c) => day(c) && calm(c) && c.has('fonte', 'banheira', 'laguinho'),
    lines: () => [L(0, '(testa a água com uma patinha)', 'question'), L(0, 'Gelada! Muito gelada! Eu vou entrar de uma vez e acabar com isso.', 'fire'), L(0, '(entra de uma vez e sai gritando duas vezes mais rápido)', 'shock'), L(0, 'Ahhh... agora sim. Pelo menos metade de mim está limpa.', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo-danca-radio', kind: 'solo', title: 'Dança de uma pessoa só', emoji: '💃', cast: 1, weight: 5, when: (c) => c.has('radio', 'caixa-som', 'bola-disco') && c.env.hour > 9 && c.env.hour < 24,
    lines: () => [L(0, '(a música começa e ele finge que não está interessado)', 'note'), L(0, '(o pé começa a bater o ritmo)', 'note'), L(0, '(em dez segundos, está dançando tudo: braço, quadril, rabo)', 'star'), L(0, 'Eu não danço. Eu só sou muito sensível ao ritmo.', 'sparkle')],
    outcome: { friend: 1 },
    after: () => 'Dancei sozinho. Se alguém tiver filmado, eu apago do planeta.',
  },
  {
    id: 'solo-maratona', kind: 'solo', title: 'Maratona de série', emoji: '📺', cast: 1, weight: 5, when: (c) => c.has('televisao') && evening(c),
    lines: () => [L(0, 'Só mais um episódio. Eu juro. Um só.', 'idea'), L(0, '(três episódios depois) Só mais um. Esse acabou em suspense!', 'sweat'), L(0, '(amanhece) ...eu perdi a noite. A série foi boa, pelo menos.', 'zzz')],
    outcome: {},
    after: () => 'Fiquei acordado a noite toda vendo uma série. A culpa é do suspense.',
  },
  {
    id: 'solo-bicicleta', kind: 'solo', title: 'Aprendendo a pedalar', emoji: '🚲', cast: 1, weight: 4, when: (c) => day(c) && c.has('bicicleta', 'skate'),
    lines: () => [L(0, 'Equilíbrio é só uma questão de... UAAAH!', 'shock'), L(0, '(cai de lado em câmera lenta)', 'sweat'), L(0, 'De novo! Agora vai! Agora... UAAAH!', 'shock'), L(0, '(na décima tentativa, passa pela praça gritando de alegria)', 'star')],
    outcome: { friend: 1 },
  },
  {
    id: 'solo-balanco', kind: 'solo', title: 'Até o céu', emoji: '🎠', cast: 1, weight: 4, when: (c) => day(c) && c.has('balanco', 'gangorra', 'escorregador', 'roda-giratoria'),
    lines: () => [L(0, 'Mais alto! Mais alto! Eu quase toco a nuvem!', 'star'), L(0, '(a corrente range, ele grita e ri ao mesmo tempo)', 'laugh'), L(0, 'Se eu soltar agora, eu voo! ...tá, eu não vou soltar.', 'sweat')],
    outcome: {},
  },
  {
    id: 'solo-cozinheiro', kind: 'solo', title: 'Culinária experimental', emoji: '👨‍🍳', cast: 1, weight: 4, when: (c) => is(c, 0, 'Guloso', 'Curioso') && c.has('fogao', 'churrasqueira', 'fogueira'),
    lines: () => [L(0, 'Receita inédita: fruta com mel, com uma pitada de... surpresa.', 'idea'), L(0, '(prova) Hum... o gosto é... instigante.', 'question'), L(0, '(prova de novo) Não é ruim! É diferente! Eu chamo de "prato autoral".', 'sparkle')],
    outcome: { items: [['pao-mel', 1]] },
  },
  {
    id: 'solo-moeda', kind: 'solo', title: 'A moedinha da sorte', emoji: '🪙', cast: 1, weight: 4, when: (c) => day(c),
    lines: () => [L(0, '(vê uma moeda brilhando perto do lago)', 'star'), L(0, 'É minha! Não! É de alguém! Não... é do lago? Não... é MINHA.', 'sweat'), L(0, 'Vou guardar. Se alguém reclamar, eu devolvo. Se não reclamar, é sorte.', 'laugh')],
    outcome: (c) => ({ coins: 4 + Math.floor(c.rng() * 10) }),
  },
  {
    id: 'solo-pensamentos', kind: 'solo', title: 'Pensamentos profundos', emoji: '🤔', cast: 1, weight: 4, when: (c) => is(c, 0, 'Sonhador', 'Calmo', 'Curioso'),
    lines: () => [L(0, 'Será que as nuvens sabem que estão passando?', 'question'), L(0, 'E se o lago for só um céu deitado?', 'idea'), L(0, 'E se eu for a única pessoa pensando nisso agora? ...bom, já passou da hora do lanche.', 'laugh')],
    outcome: {},
    after: () => 'Hoje pensei em coisas profundas. Perdi a noção do tempo e o lanche.',
  },
  {
    id: 'solo-saudade', kind: 'solo', title: 'Saudade de ser carta', emoji: '🃏', cast: 1, weight: 3, when: (c) => night(c) || c.env.hour >= 19,
    lines: (c) => [L(0, 'Eu me lembro de quando eu era só uma imagem numa carta.', 'sad'), L(0, `E aí o ${c.env.player} me olhou e eu ganhei vida. Dá para acreditar?`, 'sparkle'), L(0, 'Não troco isso por nada. Nem por uma torta. ...talvez por duas.', 'heart')],
    outcome: { friend: 3 },
    after: () => 'Às vezes eu lembro que eu era só uma carta. E agradeço por ter virado isto aqui.',
  },
  {
    id: 'solo-selfie', kind: 'solo', title: 'A selfie perfeita', emoji: '🤳', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Brincalhão', 'Mandão', 'Corajoso'),
    lines: () => [L(0, 'Ângulo da esquerda... ângulo da direita... ângulo "mistério".', 'star'), L(0, '(faz pose, pisca, mostra a língua, derruba o aparelho)', 'shock'), L(0, 'Saiu desfocada. Mas o meu espírito estava nítido.', 'sparkle')],
    outcome: {},
  },
  {
    id: 'solo-eco', kind: 'solo', title: 'O eco do lago', emoji: '📣', cast: 1, weight: 3, when: (c) => day(c) && calm(c) && is(c, 0, 'Brincalhão', 'Curioso', 'Mandão'),
    lines: () => [L(0, 'OIIIII!', 'note'), L(0, '(do outro lado, um eco) oiii... oiii...', 'question'), L(0, 'Ei! Para de me imitar!', 'anger'), L(0, '(do outro lado) ...imitar... imitar... Que pessoa chata!', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo-lista', kind: 'solo', title: 'A lista de tarefas', emoji: '📝', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Mandão', 'Curioso', 'Calmo'),
    lines: () => [L(0, 'Lista de hoje: um, comer. Dois, olhar as nuvens. Três, conversar com alguém.', 'idea'), L(0, 'Pronto, já fiz o um e o dois. O três é perigoso, vou deixar para amanhã.', 'sweat'), L(0, '(risca tudo e faz uma lista nova, só com "comer")', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo-susto-sino', kind: 'solo', title: 'O sino misterioso', emoji: '🔔', cast: 1, weight: 3, when: (c) => night(c) || c.env.hour >= 21,
    lines: () => [L(0, '(ouve um "tlim" distante e fica imóvel)', 'shock'), L(0, 'Quem está aí? Eu sou muito forte. Eu tenho pelo menos duas patas.', 'sweat'), L(0, '(era uma folha batendo na lanterna) ...Muito bem. Todos viram como eu fui corajoso.', 'laugh')],
    outcome: {},
  },
  {
    id: 'solo-fruta-caida', kind: 'solo', title: 'A fruta que caiu', emoji: '🍎', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Guloso', 'Curioso', 'Brincalhão'),
    lines: () => [L(0, '(uma fruta cai da árvore bem na cabeça dele)', 'shock'), L(0, 'Ai! ...Mas que presente da natureza! Obrigado, árvore!', 'laugh'), L(0, '(come a fruta e agradece a árvore com uma reverência)', 'heart')],
    outcome: (c) => ({ items: [[pick(c, ['oran', 'pecha'] as const), 1]] }),
  },
];
