import { L, calm, day, evening, friendsNow, is, night, other, pick, rainy, rivals, sameType, snowy } from './kit';
import type { Template } from './kit';
import { ROMANCE_MOMENTS } from './romance';

/** Momentos de dupla que não são romance: amizade, comédia, rivalidade e drama de vizinhança. */
const FRIENDS: readonly Template[] = [
  // ---------------------------------------------------------------------------- amizade
  {
    id: 'duo-lanche-dividido', kind: 'amizade', title: 'O lanche dividido', emoji: '🍪', cast: 2, weight: 5, when: (c) => is(c, 0, 'Guloso') && day(c),
    lines: (c) => [
      L(0, `${c.n[1]}, eu tenho um biscoito. Só um. E eu estou olhando para ele há dez minutos.`, 'sweat'),
      L(1, 'Parece uma decisão difícil.', 'question'),
      L(0, '(parte ao meio e entrega a maior metade, com lágrimas nos olhos)', 'heart'),
      L(1, 'Você chorou pela metade do biscoito?', 'laugh'),
      L(0, 'Foi uma despedida digna.', 'sad'),
    ],
    outcome: { bond: 10, spark: 1, friend: 1 },
    after: (n, who) => (who === 0 ? `Dividi meu biscoito com ${n[1]}. Eu sou uma boa pessoa. Meu estômago ainda está processando.` : `${n[0]} me deu metade do biscoito dele. Dá para confiar em quem faz um sacrifício assim.`),
  },
  {
    id: 'duo-aula-nado', kind: 'amizade', title: 'Aula de natação', emoji: '🏊', cast: 2, weight: 4, when: (c) => day(c) && calm(c) && (c.types[0]?.includes('water') ?? false) && !(c.types[1]?.includes('water') ?? false),
    lines: (c) => [
      L(0, `${c.n[1]}, é fácil. Você bate as patinhas, respira, bate de novo.`, 'idea'),
      L(1, 'Eu estou batendo! Estou muito batendo! Por que eu estou afundando?!', 'shock'),
      L(0, 'Você bate as patas do jeito de quem quer fugir de abelhas.', 'laugh'),
      L(1, 'Eu ESTOU fugindo de abelhas! (nenhuma abelha à vista)', 'sweat'),
      L(0, '(segura com cuidado e o leva até a beira)', 'heart'),
    ],
    outcome: { bond: 9, spark: 1 },
    after: (n, who) => (who === 0 ? `Ensinei ${n[1]} a boiar. Ele boia com a dignidade de uma pedra.` : `${n[0]} me ensinou a boiar. Eu só afundei três vezes.`),
  },
  {
    id: 'duo-pipa', kind: 'amizade', title: 'Pipa no vento', emoji: '🪁', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [
      L(0, `Segura aqui, ${c.n[1]}! Quando eu falar "já", você solta!`, 'star'),
      L(1, 'Já? Já! Já!', 'shock'),
      L(0, 'Eu não falei "já" ainda!', 'anger'),
      L(1, '(solta, a pipa sobe, mas arrasta o ' + c.n[1] + ' junto por três metros)', 'sweat'),
      L(0, 'MAS QUE VOO LINDO! Tinha que ser filmado!', 'laugh'),
    ],
    outcome: { bond: 8, spark: 1 },
  },
  {
    id: 'duo-cartas', kind: 'amizade', title: 'Mesa de cartas', emoji: '🃏', cast: 2, weight: 5, when: (c) => c.has('mesa', 'mesinha', 'banco', 'cesta-piquenique') && day(c),
    lines: (c) => [
      L(0, `${c.n[1]}, vamos jogar cartas? Eu sou muito bom. Já fui carta, conheço o ramo.`, 'fire'),
      L(1, 'Eu também já fui. Mas nunca soube blefar.', 'sweat'),
      L(0, 'Então eu vou ganhar sem dó. Com pena, mas sem dó.', 'laugh'),
      L(1, '(joga uma carta e olha para o céu, para disfarçar)', 'sparkle'),
      L(0, 'Você disfarçou como quem esqueceu de disfarçar.', 'laugh'),
    ],
    outcome: { bond: 8, spark: 1 },
    after: (n, who) => `Jogamos cartas. ${who === 0 ? n[1] : n[0]} não sabe blefar. Eu amo isso.`,
  },
  {
    id: 'duo-segredo-carta', kind: 'amizade', title: 'Memórias do tempo de carta', emoji: '🗃️', cast: 2, weight: 4, when: (c) => night(c) || evening(c),
    lines: (c) => [
      L(0, `${c.n[1]}, você lembra do álbum em que a gente morava?`, 'question'),
      L(1, 'Lembro. Era escuro, mas tinha um plástico transparente. Muito chique.', 'sparkle'),
      L(0, 'Ao lado de mim tinha uma carta de Energia que roncava.', 'laugh'),
      L(1, 'Era ela! Ela roncava mesmo! Eu quase morri de rir!', 'laugh'),
      L(0, 'Que saudade... mas aqui o ar é melhor.', 'heart'),
    ],
    outcome: { bond: 10, spark: 2 },
  },
  {
    id: 'duo-curativo', kind: 'amizade', title: 'O curativo', emoji: '🩹', cast: 2, weight: 4, when: (c) => is(c, 0, 'Corajoso', 'Brincalhão') || is(c, 1, 'Calmo', 'Tímido'),
    lines: (c) => [
      L(0, `Não doeu nada! Eu estou bem! (a pata está sangrando um pouquinho)`, 'sweat'),
      L(1, `${c.n[0]}, para. Fica quieto. Eu cuido disso.`, 'idea'),
      L(0, 'Pode ser rápido? Eu tenho muita coisa para fazer.', 'sweat'),
      L(1, '(passa o curativo com tanto carinho que ele fica imóvel)', 'heart'),
      L(0, '...Obrigado. Você é meio mágico.', 'sparkle'),
    ],
    outcome: { bond: 9, spark: 2 },
  },
  {
    id: 'duo-coreografia', kind: 'comedia', title: 'A coreografia', emoji: '🕺', cast: 2, weight: 5, when: (c) => (c.has('radio', 'caixa-som', 'bola-disco', 'piano') && c.env.hour > 9) || is(c, 0, 'Brincalhão'),
    lines: (c) => [
      L(0, `Passo um: gira! Passo dois: pula! Passo três: ${c.n[1]} faz o que sentir!`, 'note'),
      L(1, '(faz um movimento que nem a física entende)', 'shock'),
      L(0, 'Isso... não estava no plano. Mas ficou bom.', 'star'),
      L(1, 'Eu chamo de "o Salmão Furioso".', 'laugh'),
      L(0, 'Vamos apresentar na festa!', 'fire'),
    ],
    outcome: { bond: 9, spark: 1, coins: 5 },
    after: (n, who) => `${other(n, who)} e eu criamos uma coreografia. O Salmão Furioso vai conquistar o mundo.`,
  },
  {
    id: 'duo-conselho', kind: 'amizade', title: 'Pedido de conselho', emoji: '💭', cast: 2, weight: 5, when: (c) => friendsNow(c),
    lines: (c) => [
      L(0, `${c.n[1]}, eu preciso de um conselho de amigo.`, 'sweat'),
      L(1, 'Pode falar. Eu sou ótimo em conselhos. Nunca segui nenhum, mas dou.', 'star'),
      L(0, 'Se alguém te dá um presente muito bonito e você não tem nada para dar de volta... o que faz?', 'question'),
      L(1, 'Aperta a pessoa num abraço bem forte e diz "agora a gente está quites".', 'heart'),
    ],
    outcome: { bond: 5 },
    choice: {
      prompt: 'Eles olham para você: "E o treinador, o que acha?"',
      options: [
        { label: () => 'Dar um abraço coletivo', lines: (_c) => [L(0, 'Eu sabia que tinha que perguntar!', 'heart'), L(1, 'Rápido, antes que eu me arrependa!', 'laugh')], outcome: { bond: 6, spark: 1, friend: 2 } },
        { label: () => 'Dar uma flor aos dois', needs: { item: 'flor', qty: 1 }, lines: () => [L(0, 'Uma flor! O universo está respondendo!', 'sparkle'), L(1, 'Hoje ninguém precisa de conselho.', 'heart')], outcome: { bond: 8, spark: 3, friend: 3 } },
        { label: () => 'Dizer que isso é com eles', lines: () => [L(1, 'Tá bom, a gente se vira.', 'sweat'), L(0, 'O abraço do ' + 'colega ainda vale?', 'question')], outcome: { bond: 2 } },
      ],
    },
  },
  {
    id: 'duo-caminhada', kind: 'amizade', title: 'Caminhada sem pressa', emoji: '🚶', cast: 2, weight: 4, when: (c) => day(c) && calm(c) && friendsNow(c),
    lines: (c) => [
      L(0, `${c.n[1]}, eu gosto de andar com você. A gente não precisa falar.`, 'heart'),
      L(1, 'Eu também. Silêncio com você é confortável. Com os outros é esquisito.', 'sparkle'),
      L(0, '(andam lado a lado por dez minutos sem dizer uma palavra)', 'note'),
      L(1, '...Já falamos o suficiente por hoje?', 'laugh'),
    ],
    outcome: { bond: 8, spark: 2 },
  },
  {
    id: 'duo-historias-medo', kind: 'comedia', title: 'Histórias de arrepiar', emoji: '👻', cast: 2, weight: 5, when: (c) => night(c) || c.env.hour >= 21,
    lines: (_c) => [
      L(0, `E então a luz apagou... e do fundo da floresta... veio um barulho: "creeeeec..."`, 'shock'),
      L(1, 'Para! Eu não quero mais ouvir! Eu estou com a barriga gelada!', 'sweat'),
      L(0, 'Era só um galho. Mas a gente não sabia.', 'laugh'),
      L(1, '(escuta um galho estalar de verdade) AAAAAAH!', 'shock'),
      L(0, 'AAAAAAAH! (os dois correm para a casa abraçados)', 'shock'),
    ],
    outcome: { bond: 9, spark: 2 },
    after: (n, who) => `${other(n, who)} contou uma história de terror. Eu não durmo desde então.`,
  },
  {
    id: 'duo-mapa', kind: 'amizade', title: 'Dois exploradores', emoji: '🧭', cast: 2, weight: 4, when: (c) => day(c) && (is(c, 0, 'Curioso', 'Corajoso') || is(c, 1, 'Curioso')),
    lines: (c) => [
      L(0, `Pelo mapa, o tesouro está a dez passos da árvore torta. ${c.n[1]}, conta os passos!`, 'idea'),
      L(1, 'Um... dois... seis... onze... Perdi a conta. Posso inventar?', 'sweat'),
      L(0, 'Se a gente inventar, o tesouro inventa de sumir.', 'laugh'),
      L(1, '(cavam, cavam e acham um embrulho com coisas brilhantes)', 'star'),
    ],
    outcome: (c) => ({ bond: 8, spark: 1, items: [[pick(c, ['concha', 'cristal', 'ouro', 'perola'] as const), 1]] }),
  },
  {
    id: 'duo-nao-aniversario', kind: 'amizade', title: 'Presente de não-aniversário', emoji: '🎁', cast: 2, weight: 4, when: (c) => friendsNow(c) && day(c),
    lines: (c) => [
      L(0, `${c.n[1]}! Parabéns pelo seu dia!`, 'star'),
      L(1, 'Hoje não é meu aniversário.', 'question'),
      L(0, 'Eu sei. É o seu não-aniversário. Eu comemoro todo dia que não é.', 'sparkle'),
      L(1, '(ganha uma pedrinha embrulhada em folha) ...Eu vou guardar para sempre.', 'heart'),
    ],
    outcome: { bond: 9, spark: 2, items: [['pedra', 1]] },
  },
  {
    id: 'duo-massagem', kind: 'amizade', title: 'Massagem de pata', emoji: '💆', cast: 2, weight: 4, when: (c) => evening(c) && is(c, 0, 'Calmo', 'Tímido', 'Sonhador'),
    lines: (c) => [
      L(0, `${c.n[1]}, você parece tenso. Senta aqui.`, 'heart'),
      L(1, 'Eu? Tenso? (os ombros estão na altura das orelhas)', 'sweat'),
      L(0, '(massageia devagar) Respira...', 'sparkle'),
      L(1, 'Ahhh... pode ficar fazendo isso para sempre?', 'zzz'),
      L(0, 'Posso por uns vinte minutos. Depois eu peço a minha.', 'laugh'),
    ],
    outcome: { bond: 9, spark: 2 },
  },
  {
    id: 'duo-bolha', kind: 'comedia', title: 'Bolhas de sabão', emoji: '🫧', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [
      L(0, `${c.n[1]}, olha! Eu fiz uma bolha do tamanho da minha cabeça!`, 'star'),
      L(1, '(tenta estourar, estoura, fica todo molhado) Estourou! Estourou na minha cara!', 'laugh'),
      L(0, 'De novo! Faz uma maior! Quero uma que carregue a gente!', 'sparkle'),
      L(1, '(sopra tanto que fica tonto e senta no chão rindo)', 'laugh'),
    ],
    outcome: { bond: 7, spark: 1 },
  },
  // ---------------------------------------------------------------------------- comédia
  {
    id: 'duo-trocar-nomes', kind: 'comedia', title: 'O dia dos nomes trocados', emoji: '🔄', cast: 2, weight: 4,
    lines: (c) => [
      L(0, `A partir de hoje, eu sou ${c.n[1]}.`, 'idea'),
      L(1, `Então eu sou ${c.n[0]}! Eu amo ser ${c.n[0]}!`, 'star'),
      L(0, `Ei, ${c.n[0]}! Vem cá!`, 'laugh'),
      L(1, '(fica parado, sem entender quem foi chamado)', 'question'),
      L(0, 'Isso é tão confuso. Eu amei.', 'laugh'),
    ],
    outcome: { bond: 8, spark: 1 },
    after: (n, who) => `Hoje eu fui ${other(n, who)} o dia todo. Foi cansativo ser tão popular.`,
  },
  {
    id: 'duo-imitacao', kind: 'comedia', title: 'A imitação do treinador', emoji: '🎭', cast: 2, weight: 5, when: (c) => is(c, 0, 'Brincalhão', 'Mandão') && is(c, 1, 'Brincalhão', 'Curioso', 'Guloso', 'Corajoso', 'Sonhador'),
    lines: (c) => [
      L(0, `Olha só! "Eu sou ${c.env.player}! Eu fico olhando as cartas e dizendo hum, hum!"`, 'laugh'),
      L(1, '(cai na gargalhada) Faz a outra! A do pedir a mochila!', 'laugh'),
      L(0, '"Cadê a mochila? Cadê? Está nas minhas costas!" (finge procurar)', 'star'),
      L(1, 'Eu vou passar mal de tanto rir. Para! Para!', 'sweat'),
    ],
    outcome: { bond: 9, spark: 1, friend: -1 },
    after: (_n, who) => (who === 0 ? 'Fiz uma imitação de você. Você ficou ótimo. Foi só um pouquinho exagerado.' : 'Vi uma imitação de você. A mochila foi a melhor parte.'),
  },
  {
    id: 'duo-careta', kind: 'comedia', title: 'Concurso de caretas', emoji: '🤪', cast: 2, weight: 5,
    lines: (c) => [
      L(0, 'Valendo pontos! Quem fizer a pior careta, vence!', 'fire'),
      L(1, '(faz uma careta que deixa só o branco dos olhos à mostra)', 'shock'),
      L(0, '(faz uma careta puxando as bochechas com as patas)', 'laugh'),
      L(1, `Você parece uma batata. ${c.n[0]}, você parece uma batata assustada!`, 'laugh'),
      L(0, 'Eu aceito o elogio! Quem ganhou? O treinador decide!', 'star'),
    ],
    outcome: { bond: 4 },
    choice: {
      prompt: 'Duas caretas horríveis. Quem ganha?',
      options: [
        { label: (c) => `${c.n[0]} ganhou`, lines: (_c) => [L(0, 'EU SABIA! Troféu para mim, por favor!', 'star'), L(1, 'Foi por pouco! Revanche amanhã!', 'fire')], outcome: { bond: 3, friendBy: [3, 0] } },
        { label: (c) => `${c.n[1]} ganhou`, lines: (_c) => [L(1, 'Mais uma vitória para os feios!', 'star'), L(0, 'Eu faço caretas pior ainda no sono!', 'sad')], outcome: { bond: 3, friendBy: [0, 3] } },
        { label: () => 'Empate (os dois são horríveis)', lines: () => [L(0, 'Honra aos dois!', 'laugh'), L(1, 'A gente ganha, o mundo perde.', 'laugh')], outcome: { bond: 8, friend: 2 } },
      ],
    },
  },
  {
    id: 'duo-cabo-guerra', kind: 'comedia', title: 'Cabo de guerra', emoji: '🪢', cast: 2, weight: 4, when: (c) => day(c) && (is(c, 0, 'Corajoso', 'Mandão', 'Brincalhão') || is(c, 1, 'Corajoso', 'Mandão')),
    lines: (c) => {
      const w = c.rng() < 0.5 ? 0 : 1;
      c.memo.w = w;
      return [
        L(0, 'Uma corda, duas equipes, e uma poça de lama no meio!', 'fire'),
        L(1, 'Quem cair na lama paga um lanche!', 'star'),
        L(0, '(puxam com todas as forças, o chão estremece)', 'anger'),
        L(w, '(dá um tranco final)', 'fire'),
        L(1 - w, '(voa em direção à lama, aterrissa de barriga) PLOFT!', 'shock'),
      ];
    },
    outcome: (c) => ({ bond: 5, spark: 1, friendBy: c.memo.w === 0 ? [1, 0] : [0, 1] }),
  },
  {
    id: 'duo-piscar', kind: 'comedia', title: 'Quem pisca primeiro', emoji: '👁️', cast: 2, weight: 4,
    lines: (c) => [
      L(0, `${c.n[1]}, olha nos meus olhos. Quem piscar, perde.`, 'fire'),
      L(1, 'Fechado. Nem uma piscadinha.', 'anger'),
      L(0, '(um minuto se passa; os olhos começam a lacrimejar)', 'sweat'),
      L(1, '(um mosquito pousa no nariz) ...Não vou piscar... não vou...', 'sweat'),
      L(0, 'Você já piscou três vezes! Eu estava contando!', 'laugh'),
      L(1, 'Foi pelo mosquito! Isso não conta!', 'anger'),
    ],
    outcome: { bond: 4, spark: 1 },
  },
  {
    id: 'duo-palavra-errada', kind: 'comedia', title: 'Pó de bola, não Pokébola', emoji: '🔤', cast: 2, weight: 4,
    lines: (c) => [
      L(0, `${c.n[1]}, o treinador falou que vai usar uma "Pó-de-bola"!`, 'shock'),
      L(1, 'Pó de bola? É um tipo de farinha?', 'question'),
      L(0, 'Acho que é o que as bolas soltam quando caem no chão.', 'idea'),
      L(1, 'Ah... então é por isso que eu sempre espirro perto delas!', 'idea'),
      L(0, 'A gente descobriu uma coisa importante hoje.', 'star'),
    ],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'duo-teatro', kind: 'comedia', title: 'Teatro improvisado', emoji: '🎬', cast: 2, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [
      L(0, `Cena um: eu sou um dragão, e você é uma maçã.`, 'fire'),
      L(1, 'Por que eu sou a maçã?', 'question'),
      L(0, 'Porque você tem cara de maçã. Rrrraaar! Vou te comer!', 'anger'),
      L(1, '"Por favor, dragão! Eu tenho filhos! São sementes!"', 'sad'),
      L(0, '(chora de rir e esquece a fala)', 'laugh'),
      L(1, 'A plateia imaginária pede bis.', 'star'),
    ],
    outcome: { bond: 8, spark: 2 },
  },
  {
    id: 'duo-aposta', kind: 'comedia', title: 'A aposta boba', emoji: '🎲', cast: 2, weight: 4,
    lines: (_c) => [
      L(0, 'Aposto uma fruta que o próximo pássaro a passar é azul.', 'idea'),
      L(1, 'Aposto duas que é vermelho.', 'fire'),
      L(0, '(passa um pássaro... verde)', 'question'),
      L(1, 'Hum... ninguém ganhou. Os dois erraram.', 'sweat'),
      L(0, 'Então a aposta é... divertida. Os dois pagam. Ao treinador!', 'laugh'),
    ],
    outcome: { bond: 5, coins: 4 },
  },
  {
    id: 'duo-camuflagem', kind: 'comedia', title: 'Camuflagem profissional', emoji: '🌳', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => [
      L(0, `${c.n[1]}, eu virei um arbusto. Está me vendo?`, 'idea'),
      L(1, 'Estou. Você está com uma folha na cabeça e as quatro patas à mostra.', 'laugh'),
      L(0, 'Eu sou um arbusto de quatro patas. É uma espécie rara.', 'sparkle'),
      L(1, '(joga uma pedrinha e o "arbusto" pula) AH! Arbustos pulam?', 'laugh'),
    ],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'duo-sorvete', kind: 'comedia', title: 'Sorvete derretendo', emoji: '🍦', cast: 2, weight: 4, when: (c) => day(c) && c.has('carrinho-sorvete', 'barraca-suco'),
    lines: (_c) => [
      L(0, 'Dois sorvetes, dois sabores: morango para mim, pecha para você!', 'star'),
      L(1, 'O meu está derretendo! Escorreu na pata! Na outra pata! Na cauda!', 'shock'),
      L(0, 'Lambe rápido! Rápido! Rápido!', 'fire'),
      L(1, '(lambe tão rápido que sofre uma dor de cabeça gelada) AAAAI!', 'sweat'),
    ],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'duo-trote', kind: 'comedia', title: 'O trote da pedra falante', emoji: '🗿', cast: 2, weight: 4, when: (c) => is(c, 0, 'Brincalhão', 'Curioso') && day(c),
    lines: (c) => [
      L(0, `${c.n[1]}! Aquela pedra falou comigo!`, 'shock'),
      L(1, 'Pedras não falam.', 'question'),
      L(0, '(com voz grossa, escondido atrás da pedra) "Eu falo, sim, pequeno Pokémon!"', 'laugh'),
      L(1, 'Essa voz é a sua. Eu conheço o seu sotaque de pedra.', 'laugh'),
      L(0, '"Eu não sou o ' + c.n[0] + '! Sou uma pedra muito séria!"', 'laugh'),
    ],
    outcome: { bond: 6, spark: 1 },
  },
  // ---------------------------------------------------------------------------- rivalidade
  {
    id: 'duo-comilao', kind: 'rivalidade', title: 'Quem come mais', emoji: '🍽️', cast: 2, weight: 5, when: (c) => is(c, 0, 'Guloso') || is(c, 1, 'Guloso'),
    lines: (c) => {
      const w = c.rng() < 0.5 ? 0 : 1;
      c.memo.w = w;
      return [
        L(0, 'Dez frutas. Dois minutos. Quem comer mais, ganha o título.', 'fire'),
        L(1, 'Título? Qual título?', 'question'),
        L(0, '"Garganta de Ouro". Um título com muito prestígio.', 'star'),
        L(w, '(devora oito frutas, e o olho dele brilha como se fosse um vulcão)', 'fire'),
        L(1 - w, '(chega a seis e tem que deitar) Eu... só preciso de um minutinho.', 'sweat'),
      ];
    },
    outcome: (c) => ({ bond: -2, spark: 0, friendBy: c.memo.w === 0 ? [1, 0] : [0, 1] }),
    after: (n, who) => `Eu e ${other(n, who)} fizemos um campeonato de comer. Saímos rolando.`,
  },
  {
    id: 'duo-queda-braco', kind: 'rivalidade', title: 'Queda de braço', emoji: '💪', cast: 2, weight: 4, when: (c) => day(c) && (is(c, 0, 'Corajoso', 'Mandão') || is(c, 1, 'Corajoso', 'Mandão')),
    lines: (c) => [
      L(0, `${c.n[1]}, meu braço contra o seu. Agora.`, 'fire'),
      L(1, 'Eu aceito. Mas eu vou ganhar com uma pata só.', 'anger'),
      L(0, '(a mesa começa a ranger)', 'sweat'),
      L(1, '(os dois ficam vermelhos, tremendo, sem que nada mude)', 'anger'),
      L(0, 'Empate técnico?', 'question'),
      L(1, 'Empate. Mas eu estava quase ganhando.', 'sweat'),
    ],
    outcome: { bond: 3, spark: 1 },
  },
  {
    id: 'duo-revanche', kind: 'rivalidade', title: 'A revanche', emoji: '🔁', cast: 2, weight: 6, when: (c) => rivals(c) || c.memo.recentRivalry === true,
    lines: (c) => [
      L(0, `${c.n[1]}! Ontem você ganhou de mim e ainda dançou no final!`, 'anger'),
      L(1, 'A dança foi parte do show. Eu sou um artista completo.', 'star'),
      L(0, 'Hoje a gente se resolve. Corrida até a árvore torta!', 'fire'),
      L(1, 'Se eu ganhar de novo, você aprende a dançar também.', 'laugh'),
      L(0, '(a corrida termina com os dois caídos na árvore, rindo sem querer)', 'laugh'),
    ],
    outcome: { bond: 6, spark: 1 },
    after: (n, who) => `${other(n, who)} e eu fizemos uma revanche. O resultado foi um empate com muito orgulho ferido.`,
  },
  {
    id: 'duo-sombra', kind: 'rivalidade', title: 'A disputa da sombra', emoji: '🌳', cast: 2, weight: 4, when: (c) => day(c) && c.env.hour >= 11 && c.env.hour < 16 && c.env.weather !== 'chuva',
    lines: (_c) => [
      L(0, 'Esta sombra é minha! Eu cheguei primeiro!', 'anger'),
      L(1, 'Primeiro, mas o sol se moveu! A sombra agora é minha por direito!', 'fire'),
      L(0, 'Sombra não se move!', 'anger'),
      L(1, 'Pergunta para o sol, então!', 'laugh'),
      L(0, '(os dois se espremem na mesma sombra, emburrados, sem se olhar)', 'sweat'),
    ],
    outcome: { bond: -4 },
  },
  {
    id: 'duo-ultima-fruta', kind: 'rivalidade', title: 'A última fruta', emoji: '🍑', cast: 2, weight: 6, when: (c) => is(c, 0, 'Guloso') || is(c, 1, 'Guloso') || rivals(c),
    lines: (c) => [
      L(0, 'Sobrou uma. Uma só. Uma fruta linda.', 'star'),
      L(1, 'Eu vi primeiro!', 'anger'),
      L(0, 'Mas eu toquei primeiro!', 'anger'),
      L(1, `${c.n[0]}, solta! Eu vou chorar!`, 'sad'),
      L(0, '(os dois seguram a fruta, sem querer largar, cara a cara)', 'sweat'),
    ],
    outcome: { bond: -3 },
    choice: {
      prompt: 'Uma fruta para dois. O que você faz?',
      options: [
        { label: () => 'Cortar ao meio', lines: () => [L(0, 'Que justo! Obrigado!', 'sparkle'), L(1, 'A metade é quase a fruta inteira.', 'laugh')], outcome: { bond: 6, friend: 1 } },
        { label: (c) => `Dar para ${c.n[0]}`, lines: (c) => [L(0, 'Eu mereço! Sou muito mais fofo!', 'star'), L(1, `${c.n[0]}... eu vou lembrar disso.`, 'anger')], outcome: { bond: -5, friendBy: [3, -2] } },
        { label: (c) => `Dar para ${c.n[1]}`, lines: (c) => [L(1, 'Justiça foi feita!', 'star'), L(0, `Você está do lado do ${c.n[1]}! Eu vou lembrar disso!`, 'anger')], outcome: { bond: -5, friendBy: [-2, 3] } },
        { label: () => 'Entregar uma fruta nova', needs: { item: 'oran', qty: 1 }, lines: () => [L(0, 'Duas frutas! Existem duas frutas!', 'shock'), L(1, 'O universo é generoso hoje.', 'heart')], outcome: { bond: 8, friend: 2 } },
      ],
    },
  },
  {
    id: 'duo-dance-battle', kind: 'rivalidade', title: 'Dança de rua', emoji: '🪩', cast: 2, weight: 5, when: (c) => c.has('radio', 'caixa-som', 'bola-disco') && c.env.hour > 12,
    lines: (c) => [
      L(0, `${c.n[1]}, você não aguenta o meu giro!`, 'fire'),
      L(1, 'Giro? Olha o meu rebolado de seis tempos!', 'star'),
      L(0, '(faz um passo que parece o desmaio de um ventilador)', 'shock'),
      L(1, '(responde com um moonwalk que vai direto para a lama)', 'sweat'),
      L(0, 'Eu ganhei porque você caiu!', 'laugh'),
      L(1, 'Eu cai com estilo!', 'anger'),
    ],
    outcome: { bond: 3, spark: 1, coins: 6 },
    choice: {
      prompt: 'Quem dançou melhor?',
      options: [
        { label: (c) => `${c.n[0]}`, lines: (_c) => [L(0, 'Eu aceito as palmas!', 'star'), L(1, 'A lama é injusta.', 'sad')], outcome: { bond: 1, friendBy: [3, 0] } },
        { label: (c) => `${c.n[1]}`, lines: (_c) => [L(1, 'O moonwalk não falha!', 'star'), L(0, 'Eu só fui trocado pela lama.', 'sad')], outcome: { bond: 1, friendBy: [0, 3] } },
      ],
    },
  },
  {
    id: 'duo-trapaca', kind: 'rivalidade', title: 'Trapaça no jogo', emoji: '🕵️', cast: 2, weight: 4, when: (c) => c.has('mesa', 'mesinha', 'ping-pong', 'fliperama') && (is(c, 0, 'Brincalhão', 'Mandão') || rivals(c)),
    lines: (c) => [
      L(0, `${c.n[1]}, você está com uma carta na manga!`, 'shock'),
      L(1, 'Eu? Eu não tenho manga!', 'sweat'),
      L(0, '(aponta) Ali! Na cauda!', 'anger'),
      L(1, 'Foi... uma carta que eu estava guardando. Para lembrar de você.', 'sweat'),
      L(0, 'Isso é a pior desculpa da história!', 'anger'),
    ],
    outcome: { bond: -6 },
    choice: {
      prompt: 'Trapaça flagrada! O que você faz?',
      options: [
        { label: () => 'Dar bronca nos dois', lines: () => [L(0, 'Foi só uma brincadeira...', 'sad'), L(1, 'Desculpa. Eu jogo limpo da próxima vez. Quase sempre.', 'sweat')], outcome: { bond: 3, friend: 1 } },
        { label: (c) => `Rir da cara de ${c.n[1]}`, lines: () => [L(1, 'Foi uma traição!', 'anger'), L(0, 'Mas foi uma cara muito boa!', 'laugh')], outcome: { bond: 5, friendBy: [1, -1] } },
        { label: () => 'Deixar rolar', lines: () => [L(1, 'Ah, então vale trapacear!', 'star'), L(0, 'Nesse caso, eu também tenho uma carta.', 'fire')], outcome: { bond: -2, friend: -1 } },
      ],
    },
  },
  // ---------------------------------------------------------------------------- drama
  {
    id: 'duo-segredo-vazou', kind: 'drama', title: 'O segredo vazou', emoji: '🤫', cast: 2, weight: 5, when: (c) => friendsNow(c) && is(c, 1, 'Curioso', 'Brincalhão', 'Mandão', 'Guloso'),
    lines: (c) => [
      L(0, `${c.n[1]}, você contou o meu segredo para o Pidgey?`, 'anger'),
      L(1, 'Eu? Eu contei só para um! E ele jurou que não contaria!', 'sweat'),
      L(0, 'Agora a Vila inteira sabe que eu tenho medo de borboleta!', 'shock'),
      L(1, 'Mas é um medo tão bonitinho!', 'sweat'),
      L(0, '(sai pisando firme, com uma borboleta pousada na cabeça)', 'sad'),
    ],
    outcome: { bond: -10, spark: -2 },
    choice: {
      prompt: 'Uma amizade abalada por um segredo. E agora?',
      options: [
        { label: () => 'Ajudar nas pazes', lines: (_c) => [L(1, 'Desculpa, de verdade. Eu nunca mais vazo nada.', 'sad'), L(0, 'Tá. Mas a borboleta fica sendo minha amiga.', 'sparkle')], outcome: { bond: 12, friend: 2 } },
        { label: () => 'Dar um doce para os dois', needs: { item: 'geleia', qty: 1 }, lines: () => [L(0, 'Geleia! Eu perdoo tudo por geleia.', 'heart'), L(1, 'Eu também! Que injustiça deliciosa!', 'laugh')], outcome: { bond: 14, friend: 3 } },
        { label: () => 'Não se meter', lines: () => [L(0, 'Eu vou ali chorar escondido.', 'sad'), L(1, 'E eu vou ali pedir desculpa para o vento.', 'sad')], outcome: { bond: -3 } },
      ],
    },
    after: (n, who) => (who === 0 ? `${n[1]} contou o meu segredo. Eu ainda não superei.` : `Eu contei um segredo sem querer. Estou me escondendo da vergonha.`),
  },
  {
    id: 'duo-promessa', kind: 'drama', title: 'A promessa quebrada', emoji: '💔', cast: 2, weight: 4, when: (c) => friendsNow(c) && is(c, 1, 'Sonhador', 'Brincalhão', 'Guloso'),
    lines: (c) => [
      L(0, `${c.n[1]}, você prometeu que a gente ia ver o nascer do sol juntos.`, 'sad'),
      L(1, 'Eu prometi... Mas eu dormi. Muito. Eu estava sonhando com bolos.', 'sweat'),
      L(0, 'Eu esperei duas horas.', 'sad'),
      L(1, 'Eu estou muito triste de ter te deixado esperando.', 'sad'),
      L(0, 'Amanhã a gente tenta de novo. Eu levo travesseiro. Para você.', 'heart'),
    ],
    outcome: { bond: -2, spark: 1 },
    after: (n, who) => `${who === 1 ? n[0] : n[1]} me esperou um tempão e eu dormi. Amanhã eu estarei lá. Eu juro.`,
  },
  {
    id: 'duo-mentirinha', kind: 'drama', title: 'A mentirinha que cresceu', emoji: '🤥', cast: 2, weight: 4, when: (c) => is(c, 0, 'Brincalhão', 'Guloso', 'Tímido'),
    lines: (c) => [
      L(0, `${c.n[1]}, eu... eu não comi o seu bolo. Foi um ladrão. Alto. Com chapéu.`, 'sweat'),
      L(1, 'Um ladrão alto com chapéu? Que descrição específica.', 'question'),
      L(0, 'Ele tinha bigode. E um sotaque estrangeiro.', 'sweat'),
      L(1, 'Você está com migalhas no bigode, ' + c.n[0] + '.', 'laugh'),
      L(0, '...Eu não tenho bigode.', 'sad'),
    ],
    outcome: { bond: -2, spark: 0 },
    choice: {
      prompt: 'Confissão em andamento. O que você faz?',
      options: [
        { label: () => 'Perdoar com humor', lines: () => [L(0, 'Eu juro nunca mais mentir! Só se for muito necessário!', 'sweat'), L(1, 'Eu perdoo. Mas o bolo você paga.', 'laugh')], outcome: { bond: 6, friend: 1 } },
        { label: () => 'Dar bolo novo', needs: { item: 'bolo-morango', qty: 1 }, lines: () => [L(1, 'Um bolo novo! Vocês dois ganharam fatias!', 'star'), L(0, 'Eu aceito a punição: comer a fatia.', 'laugh')], outcome: { bond: 10, friend: 3 } },
        { label: () => 'Fingir que acreditou', lines: () => [L(0, 'Ele acreditou! Eu sou um gênio do crime!', 'star'), L(1, 'Treinador... você viu o bigode também, né?', 'question')], outcome: { bond: -3 } },
      ],
    },
  },
  {
    id: 'duo-pisou-horta', kind: 'drama', title: 'Quem pisou na horta?', emoji: '🥕', cast: 2, weight: 4, when: (c) => c.env.crops > 0 && is(c, 0, 'Brincalhão', 'Corajoso', 'Curioso'),
    lines: (c) => [
      L(0, `${c.n[1]}! Tem pegadas de pata na horta! Do seu tamanho!`, 'anger'),
      L(1, 'Pegadas de pata? Eu tenho patas, mas todo mundo tem patas!', 'sweat'),
      L(0, 'Tem uma pegada com um furinho no meio. Igualzinho ao seu corte.', 'shock'),
      L(1, '...Eu estava só fazendo um atalho.', 'sweat'),
      L(0, '(arruma as plantinhas pisoteadas, murmurando)', 'anger'),
    ],
    outcome: { bond: -5, water: true },
    after: (n, who) => `${other(n, who)} pisou na horta. Eu reguei de novo para compensar.`,
  },
  {
    id: 'duo-despedida', kind: 'drama', title: 'A despedida dramática', emoji: '🎻', cast: 2, weight: 4, when: (c) => is(c, 0, 'Sonhador', 'Brincalhão', 'Guloso') && (c.env.hour > 9 && c.env.hour < 20),
    lines: (c) => [
      L(0, `${c.n[1]}... eu preciso partir.`, 'sad'),
      L(1, 'Para onde?! Para quê?! Por quanto tempo?!', 'shock'),
      L(0, 'Para o outro lado da praça. Buscar lanche. Volto em cinco minutos.', 'sad'),
      L(1, 'Cinco minutos?! Eu não vou aguentar!', 'sad'),
      L(0, '(se abraçam como se fosse uma guerra, e ele sai chorando de alegria)', 'sparkle'),
    ],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'duo-perdao', kind: 'amizade', title: 'O pedido de desculpas', emoji: '🌷', cast: 2, weight: 8, when: (c) => c.rel?.flag === 'brigados' && c.rel.since !== c.env.day && c.pts(0) >= 0,
    lines: (c) => [
      L(0, `${c.n[1]}, eu fiz uma coisa para você. Não sei se vai gostar.`, 'sweat'),
      L(1, '(vira de costas, de braços cruzados) Eu não quero saber.', 'anger'),
      L(0, '(coloca uma flor ao lado dele, sem dizer nada, e senta ao longe)', 'sparkle'),
      L(1, '(espia a flor, espia o ' + c.n[0] + ', espia a flor) ...Foi você que catou essa?', 'question'),
      L(0, 'Foi. A mais bonita da Vila.', 'heart'),
    ],
    outcome: { bond: 14, flag: 'clear' },
    after: (n, who) => `${other(n, who)} me deu uma flor em silêncio. Eu desmanchei na hora.`,
  },
  {
    id: 'duo-cumplices', kind: 'comedia', title: 'Cúmplices do crime', emoji: '🥷', cast: 2, weight: 5, when: (c) => is(c, 0, 'Brincalhão', 'Curioso', 'Guloso') && is(c, 1, 'Brincalhão', 'Curioso', 'Guloso', 'Tímido'),
    lines: (c) => [
      L(0, `${c.n[1]}, a missão é simples: pegar um biscoito do pote sem fazer barulho.`, 'idea'),
      L(1, 'O pote está em cima do móvel! Eu não alcanço!', 'sweat'),
      L(0, 'Sobe nas minhas costas. Eu aguento. Eu acho.', 'fire'),
      L(1, '(sobe, o pote cai, e os dois ficam paralisados no escuro)', 'shock'),
      L(0, 'Nunca mais fazemos isso... até amanhã.', 'sweat'),
    ],
    outcome: { bond: 9, spark: 1 },
    after: (n, who) => `${other(n, who)} e eu planejamos um golpe do biscoito. Quase deu certo. Foi o pote que nos traiu.`,
  },
  {
    id: 'duo-bola-praia', kind: 'comedia', title: 'Voleibol de praia', emoji: '🏐', cast: 2, weight: 4, when: (c) => day(c) && calm(c) && c.has('bola-praia', 'rede', 'guarda-sol'),
    lines: (c) => [
      L(0, `${c.n[1]}, saque! Com carinho!`, 'star'),
      L(1, '(sacou, a bola subiu e não voltou. Ninguém sabe onde ela caiu)', 'shock'),
      L(0, 'Uma bola a menos. Que tragédia.', 'sweat'),
      L(1, '(a bola cai na cabeça do ' + c.n[0] + ') Achei!', 'laugh'),
    ],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'duo-piquenique-chuva', kind: 'amizade', title: 'Piquenique debaixo da chuva', emoji: '☔', cast: 2, weight: 5, when: (c) => rainy(c) && friendsNow(c),
    lines: (c) => [
      L(0, `Começou a chover, ${c.n[1]}! O piquenique acabou!`, 'sad'),
      L(1, 'Acabou nada! A gente come debaixo da árvore. Com guarda-chuva de folha!', 'idea'),
      L(0, '(se espremem sob uma folha gigante, com o lanche pingando)', 'sweat'),
      L(1, 'É o melhor piquenique da minha vida!', 'heart'),
      L(0, 'A sanduíche está meio ensopada.', 'laugh'),
      L(1, 'É sopa de sanduíche.', 'laugh'),
    ],
    outcome: { bond: 10, spark: 2 },
  },
  {
    id: 'duo-neve-guerra', kind: 'comedia', title: 'Guerra de bolas de neve', emoji: '❄️', cast: 2, weight: 8, when: (c) => snowy(c),
    lines: (c) => [
      L(0, `${c.n[1]}, eu declaro guerra! Bolas de neve! Sem piedade!`, 'fire'),
      L(1, 'Aceito! Eu fiz um arsenal de dez bolas ontem à noite!', 'star'),
      L(0, '(a primeira bola acerta em cheio na cara dele)', 'shock'),
      L(1, '(responde com uma bola gigante que derruba os dois)', 'laugh'),
      L(0, 'Rendição... rendição... estou congelando de tanto rir.', 'laugh'),
    ],
    outcome: { bond: 10, spark: 1 },
  },
  {
    id: 'duo-mesmo-tipo', kind: 'amizade', title: 'Gente do mesmo tipo', emoji: '🧬', cast: 2, weight: 4, when: (c) => sameType(c),
    lines: (c) => [
      L(0, `${c.n[1]}, você também sente aquele formigamento nas patas quando chove?`, 'question'),
      L(1, 'Sinto! Achei que era só eu! Meu corpo todo reage!', 'star'),
      L(0, 'Isso é coisa do nosso tipo. A gente é meio especial.', 'sparkle'),
      L(1, 'Quer fazer um clube? Só nós dois, com regras secretas.', 'idea'),
      L(0, 'Regra um: ninguém pode ficar de fora. Regra dois: só nós dois.', 'laugh'),
    ],
    outcome: { bond: 9, spark: 1 },
  },
  {
    id: 'duo-ninho', kind: 'amizade', title: 'O ninho abandonado', emoji: '🪺', cast: 2, weight: 4, when: (c) => day(c) && calm(c) && is(c, 0, 'Calmo', 'Corajoso', 'Curioso'),
    lines: (c) => [
      L(0, `${c.n[1]}, tem um ovinho caído do ninho! Está inteiro!`, 'shock'),
      L(1, 'Vamos devolver para a mãe! Vem, eu te dou uma ajuda!', 'heart'),
      L(0, '(sobem juntos, um nas costas do outro, até chegar ao galho)', 'sweat'),
      L(1, '(devolvem o ovo e a mãe pássaro canta, agradecida)', 'note'),
      L(0, 'Isso foi o mais corajoso que já fiz. E eu já lutei contra um arbusto.', 'star'),
    ],
    outcome: { bond: 11, spark: 2, friend: 2 },
    after: (n, who) => `${other(n, who)} e eu devolvemos um ovinho ao ninho. Passei o dia com o coração quentinho.`,
  },
  {
    id: 'duo-bandeirinha', kind: 'amizade', title: 'Decorando a Vila', emoji: '🎏', cast: 2, weight: 4, when: (c) => day(c) && c.has('bandeirinhas', 'mastro', 'pisca-pisca', 'poste'),
    lines: (c) => [
      L(0, `${c.n[1]}, a gente podia deixar a Vila mais bonita!`, 'sparkle'),
      L(1, 'Boa! Bandeirinhas aqui, laços ali, flor naquele canto!', 'idea'),
      L(0, '(penduram as bandeirinhas ao contrário, e ficam muito orgulhosos)', 'star'),
      L(1, 'Está lindo! Estou emocionado!', 'heart'),
    ],
    outcome: { bond: 8, spark: 1, coins: 5 },
  },
  {
    id: 'duo-mestre-chefe', kind: 'comedia', title: 'Chef e ajudante', emoji: '🧑‍🍳', cast: 2, weight: 5, when: (c) => c.has('fogao', 'churrasqueira', 'fogueira', 'geladeira') && evening(c),
    lines: (c) => [
      L(0, `${c.n[1]}, eu sou o chef. Você é o ajudante. Corte a fruta.`, 'fire'),
      L(1, 'Quero ser o chef!', 'anger'),
      L(0, 'O chef não discute com a fruta.', 'idea'),
      L(1, '(corta a fruta em pedaços tão pequenos que parecem poeira)', 'sweat'),
      L(0, 'Isso... é uma receita nova. Chama-se "areia de pecha".', 'laugh'),
    ],
    outcome: (c) => ({ bond: 7, spark: 1, items: [[pick(c, ['geleia', 'salada', 'suco-oran'] as const), 1]] }),
  },
];

export const DUO_MOMENTS: readonly Template[] = [...FRIENDS, ...ROMANCE_MOMENTS];
