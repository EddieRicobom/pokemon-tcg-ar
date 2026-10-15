import { L, birthday, between, calm, day, evening, is, night, onDay, other, pick, snowy } from './kit';
import type { Ctx, Template } from './kit';

/** Posição (no elenco) de quem faz aniversário hoje, ou -1. */
const bday = (c: Ctx): number => c.ids.findIndex((_, i) => birthday(c, i));
/** Segundo domingo do mês. */
const secondSunday = (c: Ctx, m: number): boolean => c.date.m === m && c.date.dow === 0 && c.date.d >= 8 && c.date.d <= 14;

/**
 * Momentos de datas especiais. Só acontecem no dia (ou na semana) certo, pelo relógio do aparelho, e os mais marcantes
 * (aniversário, Natal, Ano Novo) vão direto para o Álbum. As datas móveis (Carnaval, Páscoa) usam uma janela aproximada.
 */
export const SEASON_MOMENTS: readonly Template[] = [
  // ---------------------------------------------------------------------------- aniversários
  {
    id: 'data-aniversario-solo', kind: 'festa', title: 'Aniversário do Pokémon', emoji: '🎂', cast: 1, weight: 40, keep: true, when: (c) => birthday(c, 0) && c.env.hour >= 7 && c.env.hour < 22,
    lines: (c) => [
      L(0, 'Hoje é o meu aniversário! Eu acordei cantando parabéns para mim mesmo.', 'star'),
      L(0, '(faz um chapeuzinho de folha, assopra uma velinha imaginária)', 'sparkle'),
      L(0, `Desejo: que o ${c.env.player} nunca falte à Vila. E um bolo. Dois bolos.`, 'heart'),
      L(0, '(ri sozinho, de bochechas coradas) Mais um ano. Estou ótimo.', 'sparkle'),
    ],
    outcome: { spark: 0, bond: 0, friend: 4, coins: 15 },
    after: (_n, who) => (who === 0 ? 'Hoje eu fiz aniversário! Eu fiz uma festinha sozinho. Mas a sua visita foi o presente.' : null),
  },
  {
    id: 'data-aniversario-surpresa', kind: 'festa', title: 'Festa surpresa', emoji: '🎉', cast: 2, weight: 50, keep: true, when: (c) => bday(c) >= 0 && c.env.hour >= 9 && c.env.hour < 22,
    lines: (c) => {
      const b = bday(c);
      const o = b === 0 ? 1 : 0;
      c.memo.b = b;
      return [
        L(b, 'Hoje é um dia comum. Um dia bem comum. Não esperem nada.', 'sad'),
        L(o, `(esconde o bolo atrás da árvore) ${c.n[b]}, vem aqui um minuto!`, 'sweat'),
        L(b, 'O que é isso? Tem um monte de gente na moita?', 'question'),
        L(o, 'SURPRESA! Feliz aniversário!', 'star'),
        L(b, '(emocionado, esquece o que ia dizer) Vocês lembraram...', 'heart'),
        L(o, 'Esquecer seu aniversário? Nunca.', 'sparkle'),
      ];
    },
    outcome: (c) => ({ bond: 12, spark: 4, friend: 4, coins: 20, items: [[pick(c, ['bolo-morango', 'torta-pecha', 'pao-mel'] as const), 1]] }),
    after: (n, who) => `Teve festa surpresa hoje na Vila! ${other(n, who)} e eu guardamos o bolo no escuro. Foi bom ver a cara do aniversariante.`,
  },
  {
    id: 'data-aniversario-presente', kind: 'festa', title: 'O presente de aniversário', emoji: '🎁', cast: 2, weight: 45, keep: true, when: (c) => bday(c) >= 0 && c.env.hour < 22,
    lines: (c) => {
      const b = bday(c);
      const o = b === 0 ? 1 : 0;
      return [
        L(o, `${c.n[b]}, feliz aniversário! Eu fiz uma coisa para você.`, 'sparkle'),
        L(b, '(abre o pacote com cuidado) Um desenho! Somos nós dois!', 'shock'),
        L(o, 'Eu desenhei com o dedo, mas a intenção é boa.', 'sweat'),
        L(b, 'Está torto e é a coisa mais linda que já vi. Vou pendurar na parede.', 'heart'),
      ];
    },
    outcome: { bond: 12, spark: 5, friend: 3 },
  },
  {
    id: 'data-aniversario-trio', kind: 'festa', title: 'Parabéns a você', emoji: '🎈', cast: 3, weight: 50, keep: true, when: (c) => bday(c) >= 0 && c.env.hour >= 9 && c.env.hour < 23,
    lines: (c) => {
      const b = bday(c);
      const [x, y] = [0, 1, 2].filter((i) => i !== b) as [number, number];
      return [
        L(x, `Todo mundo junto! Um, dois, três: PARABÉNS, ${c.n[b]}!`, 'star'),
        L(y, '(desafinado) Parabéns pra você, nessa data querida...', 'note'),
        L(b, '(chora de rir) Vocês cantam muito mal. Eu amei.', 'laugh'),
        L(x, 'Agora assopra a vela!', 'fire'),
        L(b, '(sopra, apaga a vela e o cabelo do ' + c.n[y] + ')', 'shock'),
      ];
    },
    outcome: { bond: 10, bond02: 10, bond12: 10, spark: 2, friend: 3, coins: 15 },
  },
  // ---------------------------------------------------------------------------- fim de ano
  {
    id: 'data-natal', kind: 'festa', title: 'Noite de Natal', emoji: '🎄', cast: 3, weight: 40, keep: true, when: (c) => between(c, 12, 24, 12, 25) && c.env.hour >= 17,
    lines: (c) => [
      L(0, 'Feliz Natal, gente! Olha o pinheirinho que a gente enfeitou!', 'sparkle'),
      L(1, 'Falta a estrela no topo. Quem alcança?', 'question'),
      L(2, '(sobe nos ombros do ' + c.n[0] + ' e coloca a estrela)', 'star'),
      L(0, 'Pronto! Brilhou!', 'sparkle'),
      L(1, `Pensei no ${c.env.player} a noite toda. Ele devia estar aqui hoje.`, 'heart'),
      L(2, 'Ele está. A Vila é dele.', 'heart'),
    ],
    outcome: (c) => ({ bond: 12, bond02: 12, bond12: 12, spark: 2, friend: 5, coins: 30, items: [[pick(c, ['bolo-morango', 'pao-mel', 'torta-pecha'] as const), 1]] }),
  },
  {
    id: 'data-natal-duo', kind: 'festa', title: 'O presente de Natal', emoji: '🎁', cast: 2, weight: 40, when: (c) => between(c, 12, 20, 12, 26),
    lines: (c) => [
      L(0, `${c.n[1]}, abre o seu primeiro! O meu eu abro depois.`, 'star'),
      L(1, '(abre: um cachecol feito de folhas) Que lindo!', 'sparkle'),
      L(0, 'Eu fiz com as minhas próprias patas. Tem um furo.', 'sweat'),
      L(1, 'É o furo da cabeça. Perfeito.', 'laugh'),
    ],
    outcome: { bond: 10, spark: 3, friend: 2 },
  },
  {
    id: 'data-ano-novo', kind: 'festa', title: 'Contagem regressiva', emoji: '🎆', cast: 3, weight: 50, keep: true, when: (c) => onDay(c, 12, 31) && c.env.hour >= 21,
    lines: (c) => [
      L(0, 'Dez! Nove! Oito!', 'fire'),
      L(1, 'Sete! Seis! Cinco!', 'fire'),
      L(2, 'Quatro! Três! Dois!', 'fire'),
      L(0, 'UM! FELIZ ANO NOVO!', 'star'),
      L(1, '(os fogos explodem; a Vila toda ilumina)', 'sparkle'),
      L(2, `Que ano que vem seja cheio de amigos, frutas e do ${c.env.player}.`, 'heart'),
    ],
    outcome: { bond: 12, bond02: 12, bond12: 12, spark: 2, friend: 5, coins: 30 },
  },
  {
    id: 'data-ano-novo-manha', kind: 'solo', title: 'Primeira manhã do ano', emoji: '🌅', cast: 1, weight: 40, when: (c) => onDay(c, 1, 1) && c.env.hour >= 5 && c.env.hour < 12,
    lines: (_c) => [
      L(0, '(boceja) Primeiro dia do ano. Eu fiz uma lista de resoluções.', 'zzz'),
      L(0, 'Número um: comer mais frutas. Número dois: dormir mais. Número três: fazer mais listas.', 'idea'),
      L(0, '(risca o número um, porque já comeu tudo)', 'laugh'),
    ],
    outcome: { friend: 2 },
  },
  // ---------------------------------------------------------------------------- festas do ano
  {
    id: 'data-halloween', kind: 'festa', title: 'Noite das bruxas', emoji: '🎃', cast: 3, weight: 45, keep: true, when: (c) => between(c, 10, 28, 10, 31) && c.env.hour >= 17,
    lines: (c) => [
      L(0, 'Doces ou travessuras! (fantasiado de lençol)', 'fire'),
      L(1, '(fantasiado de abóbora, rolando) Eu sou a abóbora mais assustadora da Vila!', 'star'),
      L(2, '(fantasiado de bruxa, o chapéu cobre os olhos) Eu não enxergo nada! Mas é aterrorizante!', 'sweat'),
      L(0, 'Vamos bater de porta em porta!', 'star'),
      L(1, '(a primeira porta se abre e é o próprio ' + c.env.player + ' com uma tigela de doces)', 'shock'),
      L(2, 'Ai, que susto! Que doce! Obrigado, treinador!', 'heart'),
    ],
    outcome: (c) => ({ bond: 10, bond02: 10, bond12: 10, spark: 2, friend: 4, coins: 20, items: [[pick(c, ['pao-mel', 'torta-pecha', 'geleia', 'pipoca'] as const), 1]] }),
  },
  {
    id: 'data-halloween-duo', kind: 'festa', title: 'Susto de Halloween', emoji: '🦇', cast: 2, weight: 40, when: (c) => between(c, 10, 25, 10, 31) && night(c),
    lines: (c) => [
      L(0, `${c.n[1]}, eu fiz uma abóbora com uma vela dentro. Olha que cara de bravo!`, 'star'),
      L(1, '(chega perto) Ela está sorrindo.', 'question'),
      L(0, '(com a voz de monstro) Eu sou a abóbora assombrada!', 'laugh'),
      L(1, 'AAAAH! (corre, tropeça, rola até a cerca)', 'shock'),
      L(0, 'Era só eu! Desculpa!', 'laugh'),
    ],
    outcome: { bond: 8, spark: 1 },
  },
  {
    id: 'data-dia-criancas', kind: 'festa', title: 'Dia das Crianças', emoji: '🎈', cast: 2, weight: 40, when: (c) => onDay(c, 10, 12) && day(c),
    lines: (c) => [
      L(0, `Hoje é dia de ser criança, ${c.n[1]}! Vale tudo: pega-pega, lama e bolhas!`, 'star'),
      L(1, 'Eu sou criança todos os dias.', 'laugh'),
      L(0, 'Hoje com autorização oficial!', 'fire'),
      L(1, '(os dois saem correndo pelo campo, sem rumo, gritando)', 'laugh'),
    ],
    outcome: { bond: 9, spark: 2, friend: 2 },
  },
  {
    id: 'data-namorados', kind: 'romance', title: 'Dia dos Namorados', emoji: '❤️', cast: 2, weight: 50, keep: true, when: (c) => onDay(c, 6, 12) && c.rel?.flag === 'casal' && c.env.hour >= 9,
    lines: (c) => [
      L(0, `Feliz Dia dos Namorados, ${c.n[1]}.`, 'heart'),
      L(1, 'Eu fiz um jantar. Tem quatro velas e uma sopa que talvez esteja fria.', 'sweat'),
      L(0, 'Eu amo sopa fria. E amo quem fez.', 'heart'),
      L(1, '(os dois jantam à luz de velas, com o céu cheio de estrelas)', 'sparkle'),
    ],
    outcome: { bond: 14, spark: 14 },
  },
  {
    id: 'data-namorados-solo', kind: 'romance', title: 'Dia dos Namorados sem par', emoji: '💘', cast: 2, weight: 30, when: (c) => onDay(c, 6, 12) && c.rel?.flag !== 'casal' && (c.rel?.spark ?? 0) >= 10,
    lines: (c) => [
      L(0, `${c.n[1]}... hoje é o Dia dos Namorados.`, 'sweat'),
      L(1, 'Eu sei. Sou um solteiro orgulhoso, com uma flor na mão.', 'star'),
      L(0, '...É para mim?', 'question'),
      L(1, 'É para quem chegar primeiro. Chegou você.', 'heart'),
    ],
    outcome: { bond: 6, spark: 8, items: [['flor', 1]] },
  },
  {
    id: 'data-junina', kind: 'festa', title: 'Festa junina', emoji: '🎪', cast: 3, weight: 40, keep: true, when: (c) => between(c, 6, 12, 6, 29) && c.env.hour >= 15,
    lines: (_c) => [
      L(0, 'Arraiá da Vila! Bandeirinha, fogueira e quentão de oran!', 'star'),
      L(1, 'Eu vou dançar quadrilha! Anarriê!', 'fire'),
      L(2, 'Eu fico com a pipoca e o pé-de-moleque.', 'heart'),
      L(0, '(a quadrilha começa; ninguém sabe o passo, mas todo mundo gira)', 'note'),
      L(1, 'Olha o balão! Olha o balão!', 'shock'),
    ],
    outcome: (c) => ({ bond: 9, bond02: 9, bond12: 9, spark: 2, friend: 3, coins: 15, items: [[pick(c, ['pipoca', 'pao-mel', 'geleia'] as const), 1]] }),
  },
  {
    id: 'data-sao-joao-fogueira', kind: 'festa', title: 'Noite de São João', emoji: '🔥', cast: 2, weight: 40, when: (c) => between(c, 6, 23, 6, 24) && c.env.hour >= 18,
    lines: (_c) => [
      L(0, 'Dizem que quem pula a fogueira em São João tem sorte o ano todo.', 'idea'),
      L(1, 'Eu pulo! Eu pulo!', 'fire'),
      L(1, '(salta, passa raspando, o rabo pega um pouquinho de fogo) AAAI! Pronto, já tenho sorte!', 'shock'),
      L(0, '(joga um balde de água nele, rindo)', 'laugh'),
    ],
    outcome: { bond: 8, spark: 1 },
  },
  {
    id: 'data-carnaval', kind: 'festa', title: 'Bloquinho de Carnaval', emoji: '🎭', cast: 3, weight: 40, when: (c) => between(c, 2, 10, 3, 5) && c.env.hour >= 10,
    lines: (_c) => [
      L(0, 'Olha a marchinha! Mamãe, eu quero, mamãe, eu quero!', 'note'),
      L(1, 'Eu estou de confete! Tenho confete até no focinho!', 'star'),
      L(2, 'Eu sou o rei do bloco, com uma coroa de papel!', 'fire'),
      L(0, '(o bloco desfila pela Vila, e os vizinhos acompanham)', 'note'),
      L(1, 'Quarta-feira ninguém me acorda.', 'zzz'),
    ],
    outcome: { bond: 9, bond02: 9, bond12: 9, spark: 2, friend: 3, coins: 15 },
  },
  {
    id: 'data-pascoa', kind: 'festa', title: 'Caça aos ovos', emoji: '🥚', cast: 2, weight: 35, when: (c) => between(c, 3, 22, 4, 25) && day(c) && c.date.dow === 0,
    lines: (c) => [
      L(0, `${c.n[1]}, tem ovinhos escondidos por toda a Vila!`, 'star'),
      L(1, 'Achei um! Debaixo da moita!', 'star'),
      L(0, 'Aquele é uma pedra pintada.', 'laugh'),
      L(1, 'Então é um ovo de pedra. Dos mais raros!', 'sparkle'),
      L(0, '(achou um de chocolate, e come antes de mostrar)', 'sweat'),
    ],
    outcome: { bond: 8, spark: 1, items: [['mel', 1]] },
  },
  {
    id: 'data-pokemon-day', kind: 'festa', title: 'Dia do Pokémon', emoji: '⭐', cast: 3, weight: 40, when: (c) => onDay(c, 2, 27) && c.env.hour >= 8,
    lines: (c) => [
      L(0, 'Hoje é o Dia do Pokémon! Dia de festa para a gente!', 'star'),
      L(1, 'Quem faz parte? Todos nós!', 'sparkle'),
      L(2, `E quem organiza? O ${c.env.player}!`, 'heart'),
      L(0, 'Três vivas para o treinador: hip, hip...', 'fire'),
      L(1, 'HURRA!', 'star'),
      L(2, 'HURRA!', 'star'),
    ],
    outcome: { bond: 10, bond02: 10, bond12: 10, spark: 2, friend: 4, coins: 15 },
  },
  {
    id: 'data-sexta-13', kind: 'comedia', title: 'Sexta-feira 13', emoji: '🐈‍⬛', cast: 2, weight: 40, when: (c) => c.date.dow === 5 && c.date.d === 13,
    lines: (c) => [
      L(0, `${c.n[1]}, hoje é sexta-feira 13! Cuidado com tudo!`, 'shock'),
      L(1, 'Eu não acredito nessas coisas.', 'sweat'),
      L(1, '(um gato preto cruza o caminho; uma escada cai; o espelho trinca)', 'shock'),
      L(1, '...Eu acredito.', 'sad'),
      L(0, 'Vamos ficar dentro de casa até amanhã.', 'sweat'),
    ],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'data-mae', kind: 'amizade', title: 'Dia das Mães', emoji: '🌷', cast: 1, weight: 40, when: (c) => secondSunday(c, 5) && day(c),
    lines: (_c) => [
      L(0, 'Hoje é o dia dela. Eu catei uma flor e vou levar.', 'heart'),
      L(0, '(treina na frente do espelho) "Mãe, você é a melhor." ...Não, soa estranho.', 'sweat'),
      L(0, '"Mãe, obrigado por tudo." ...Melhor. Vou chorar.', 'sad'),
      L(0, '(guarda a flor com cuidado e sai sorrindo)', 'sparkle'),
    ],
    outcome: { friend: 2, items: [['flor', 1]] },
  },
  {
    id: 'data-pais', kind: 'amizade', title: 'Dia dos Pais', emoji: '👔', cast: 1, weight: 40, when: (c) => secondSunday(c, 8) && day(c),
    lines: (_c) => [
      L(0, 'Hoje é o dia do meu pai. Eu lembrei dele quando vi uma gravata.', 'heart'),
      L(0, '(amarra um laço de folha no pescoço) Fiquei parecido com ele. Um pouco.', 'sparkle'),
      L(0, 'Vou mandar um cartão. Escrito com dignidade e com três erros de grafia.', 'laugh'),
    ],
    outcome: { friend: 2 },
  },
  {
    id: 'data-amigo', kind: 'amizade', title: 'Dia do Amigo', emoji: '🤝', cast: 2, weight: 40, keep: true, when: (c) => onDay(c, 7, 20) && c.env.hour >= 8,
    lines: (c) => [
      L(0, `${c.n[1]}, hoje é o Dia do Amigo!`, 'star'),
      L(1, 'Eu sei! Eu fiz uma pulseira de capim para você.', 'sparkle'),
      L(0, 'Eu também fiz uma para você! (trocam as pulseiras ao mesmo tempo)', 'laugh'),
      L(1, 'Agora a gente tem uma pulseira igual.', 'heart'),
      L(0, 'Prometo nunca tirar. Só no banho.', 'sweat'),
    ],
    outcome: { bond: 12, spark: 3, friend: 3 },
  },
  {
    id: 'data-independencia', kind: 'festa', title: 'Sete de Setembro', emoji: '🇧🇷', cast: 2, weight: 35, when: (c) => onDay(c, 9, 7) && day(c),
    lines: (_c) => [
      L(0, 'Independência ou lanche! Hoje não tem aula!', 'fire'),
      L(1, 'Aula de quê? A gente é Pokémon.', 'question'),
      L(0, 'Aula de fazer nada. E hoje é feriado.', 'sparkle'),
      L(1, '(passa um desfile minúsculo de formigas com bandeirinhas) Olha, está tendo um!', 'shock'),
    ],
    outcome: { bond: 7, spark: 1 },
  },
  {
    id: 'data-estacao', kind: 'solo', title: 'Chegada da estação', emoji: '🍃', cast: 1, weight: 30, when: (c) => onDay(c, 3, 20) || onDay(c, 6, 21) || onDay(c, 9, 22) || onDay(c, 12, 21),
    lines: (c) => [
      L(0, 'Eu senti no ar. A estação mudou hoje.', 'idea'),
      L(0, c.date.m === 12 ? 'Chegou o verão. Mais sol, mais sorvete, mais cochilo.' : c.date.m === 9 ? 'Chegou a primavera! As flores estão acordando.' : c.date.m === 6 ? 'Chegou o inverno. Hora de encher o armário de cachecol.' : 'Chegou o outono. As folhas viram tapete.', 'sparkle'),
      L(0, '(respira fundo e sorri) Gosto de acompanhar o tempo passando.', 'heart'),
    ],
    outcome: { friend: 1 },
  },
  // ---------------------------------------------------------------------------- dias da semana
  {
    id: 'data-segunda', kind: 'solo', title: 'Segunda-feira', emoji: '😩', cast: 1, weight: 14, when: (c) => c.date.dow === 1 && c.env.hour >= 6 && c.env.hour < 12,
    lines: (_c) => [
      L(0, 'Segunda-feira. Eu e a minha cama temos assuntos pendentes.', 'zzz'),
      L(0, '(se espreguiça por vinte minutos) Café... café... suco de oran...', 'sweat'),
      L(0, 'Eu vou dizer que estou trabalhando. Por favor, não me chamem.', 'zzz'),
    ],
    outcome: { friend: 0 },
  },
  {
    id: 'data-sabado', kind: 'amizade', title: 'Sábado de faxina', emoji: '🧹', cast: 2, weight: 14, when: (c) => c.date.dow === 6 && day(c),
    lines: (c) => [
      L(0, `Sábado é dia de organizar a Vila! ${c.n[1]}, você varre, eu espano.`, 'fire'),
      L(1, '(varre o mesmo lugar por dez minutos, depois se deita sobre a vassoura)', 'zzz'),
      L(0, 'Isso não é varrer. Isso é pescaria com vassoura.', 'laugh'),
      L(1, 'Estou descansando para ser mais eficiente.', 'sweat'),
    ],
    outcome: { bond: 5, spark: 0 },
  },
  {
    id: 'data-domingo', kind: 'amizade', title: 'Domingo de preguiça', emoji: '🛋️', cast: 2, weight: 14, when: (c) => c.date.dow === 0 && day(c) && calm(c),
    lines: (_c) => [
      L(0, 'Hoje eu não faço nada.', 'zzz'),
      L(1, 'Eu faço menos que nada.', 'zzz'),
      L(0, 'Isso é possível?', 'question'),
      L(1, 'Estou tentando. (fecha os olhos) Já estou quase lá.', 'zzz'),
    ],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'data-sexta-noite', kind: 'festa', title: 'Sextou!', emoji: '🥳', cast: 3, weight: 14, when: (c) => c.date.dow === 5 && evening(c) && !(c.date.d === 13),
    lines: (_c) => [
      L(0, 'SEXTOU! A semana acabou!', 'star'),
      L(1, 'Eu nem sabia que tinha começado.', 'laugh'),
      L(2, 'Vamos fazer algo especial! Dançar! Pular! Comer!', 'fire'),
      L(0, 'Todas as três opções, ao mesmo tempo.', 'laugh'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1, coins: 8 },
  },
  {
    id: 'data-lua-cheia', kind: 'solo', title: 'Lua grande', emoji: '🌕', cast: 1, weight: 10, when: (c) => night(c) && calm(c) && (c.date.d === 15 || c.date.d === 14 || c.date.d === 16),
    lines: (_c) => [
      L(0, 'Olha só que lua grandona! Dá para contar as crateras daqui.', 'sparkle'),
      L(0, '(uiva baixinho) Ahuuu... Não sou lobo. Mas tento.', 'laugh'),
      L(0, '(alguém lá longe responde: "ahuuu!") ...Eu tenho um fã.', 'star'),
    ],
    outcome: { friend: 1 },
  },
  {
    id: 'data-neve-natal', kind: 'festa', title: 'Natal com neve', emoji: '❄️', cast: 2, weight: 50, when: (c) => between(c, 12, 22, 12, 26) && snowy(c),
    lines: (c) => [
      L(0, `${c.n[1]}! Está nevando no Natal! Igualzinho aos cartões!`, 'star'),
      L(1, 'É a coisa mais linda. Chega perto, que esquenta.', 'heart'),
      L(0, '(abraçam-se, com a neve se acumulando nas orelhas)', 'sparkle'),
    ],
    outcome: { bond: 10, spark: 4 },
  },
  {
    id: 'data-treinador', kind: 'amizade', title: 'Conversa sobre o treinador', emoji: '🧢', cast: 2, weight: 5, when: (c) => day(c) || evening(c),
    lines: (c) => [
      L(0, `${c.n[1]}, você acha que o ${c.env.player} gosta mais de mim ou de você?`, 'question'),
      L(1, 'Gosta igual! Ele me falou ontem. (não falou)', 'sweat'),
      L(0, 'Ele me trouxe uma fruta hoje. Só para mim.', 'sparkle'),
      L(1, 'Ele me trouxe duas! Mas estavam amassadas.', 'laugh'),
      L(0, 'Disputa de fruta! O treinador não deve saber que somos tão ciumentos.', 'laugh'),
    ],
    outcome: { bond: 6, spark: 1 },
    after: (n, who) => `${other(n, who)} acha que você me dá mais frutas. Você pode tirar essa dúvida distribuindo igual.`,
  },
  {
    id: 'data-treinador-solo', kind: 'solo', title: 'Ensaiando um agradecimento', emoji: '💬', cast: 1, weight: 5, when: (c) => is(c, 0, 'Tímido', 'Calmo', 'Sonhador') && day(c),
    lines: (c) => [
      L(0, `(para o espelho) "${c.env.player}, obrigado por cuidar da gente."`, 'sparkle'),
      L(0, '(para o espelho de novo) "Obrigado por cuidar da gente e por trazer frutas." Melhor.', 'sweat'),
      L(0, '(agora com fôlego) "Obrigado por tudo, treinador." ...Vou dizer isso na próxima vez. Talvez.', 'heart'),
    ],
    outcome: { friend: 2 },
  },
];
