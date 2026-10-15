import type { Rng } from '../battle';
import { itemDef } from './catalog';
import { add, count, friendOf, itemName } from './life';
import type { ItemId, VillageState } from './life';
import { hash, personalityOf } from './personality';
import { MAX_SAVED, MOMENT_EMOJI, pairKey, relationStatus, trimMoments } from './social-state';
import type { Moment, MomentKind, MomentLine, Relation } from './social-state';
import { L, calm, is, night, other } from './moments/kit';
import { spreadWords, withWords } from './quiz';
import { DUO_MOMENTS } from './moments/duo';
import { EXTRA_MOMENTS } from './moments/extra';
import { SEASON_MOMENTS } from './moments/season';
import { SOLO_MOMENTS } from './moments/solo';
import { TRIO_MOMENTS } from './moments/trio';
import type { Actor, Ctx, Outcome, SocialEnv, Template } from './moments/kit';

export type { Actor, Ctx, Outcome, SocialEnv, Template } from './moments/kit';

/**
 * A vida social dos Pokémon da Vila, no espírito de Tomodachi Life: de tempos em tempos dois ou três deles se encontram e
 * acontece um "momento" (uma conversa com falas, comédia, ciúmes, paixões, brigas e pazes). Quem se dá bem vira amigo,
 * quem se paquera pode virar casal, quem se pega no pé vira rival. Alguns momentos pedem a sua decisão; todos ficam
 * registrados no Diário, e os Pokémon comentam o que viveram quando você conversa com eles.
 *
 * Tudo aqui é puro e determinístico com o `rng`: a tela sorteia o momento, toca as falas e depois chama `resolveScene`.
 */

const CORE: readonly Template[] = [
  // ---------------------------------------------------------------------------- sozinho
  {
    id: 'solo-espelho', kind: 'solo', title: 'Ensaio no espelho d\'água', emoji: '🪞', cast: 1, weight: 3,
    lines: ({ n }) => [L(0, `Hoje eu vou falar com todo mundo. Respira... "Oi, eu sou ${n[0]}!"`, 'star'), L(0, 'Não, muito sério. "EI! SOU EU, ' + n[0] + '!"', 'shock'), L(0, '...Vou só acenar.', 'sweat')],
    outcome: {},
  },
  {
    id: 'solo-sonambulo', kind: 'solo', title: 'O sonâmbulo', emoji: '😴', cast: 1, weight: 4, when: (c) => night(c),
    lines: ({ n }) => [L(0, 'zzz... eu não sou uma batata... zzz...', 'zzz'), L(0, `(${n[0]} abraça um arbusto com muito carinho)`, 'heart'), L(0, '...bom dia, arbusto.', 'zzz')],
    outcome: {},
  },
  {
    id: 'solo-sonho', kind: 'solo', title: 'O sonho esquisito', emoji: '☁️', cast: 1, weight: 3, when: (c) => is(c, 0, 'Sonhador') && c.env.hour < 20,
    lines: () => [L(0, 'Olha pro céu: aquela nuvem é um Wailord de óculos.', 'star'), L(0, 'Ontem sonhei que a gente tinha asas e ninguém precisava de mapa.', 'sparkle'), L(0, 'Aí acordei e estava com fome. Mas a ideia continua boa.', 'idea')],
    outcome: {},
  },
  {
    id: 'solo-fruta', kind: 'solo', title: 'Só uma mordidinha', emoji: '🍑', cast: 1, weight: 4, when: (c) => is(c, 0, 'Guloso'),
    lines: () => [L(0, 'Eu não vou comer essa fruta. Eu só vou olhar.', 'question'), L(0, '(mordeu)', 'heart'), L(0, 'Foi só uma. A outra metade é "para depois". Que nunca chega.', 'laugh')],
    outcome: { items: [['oran', 1]] },
  },
  {
    id: 'solo-show', kind: 'solo', title: 'Show de rua', emoji: '🎸', cast: 1, weight: 4, when: (c) => c.has('piano', 'violao', 'radio', 'caixa-som') && c.env.hour > 8 && c.env.hour < 23,
    lines: ({ n }) => [L(0, `Senhoras e senhores... ${n[0]}!`, 'star'), L(0, '(toca uma música animada, desafinando só um pouquinho)', 'note'), L(0, 'Obrigado, obrigado! As moedinhas ficam ali na caixinha.', 'sparkle')],
    outcome: (c) => ({ coins: 6 + Math.floor(c.rng() * 10) }),
    after: (_n) => `Fiz um showzinho outro dia. Deixaram umas moedas na caixinha, acredita?`,
  },
  {
    id: 'solo-pescaria', kind: 'solo', title: 'Pescaria sem sorte', emoji: '🎣', cast: 1, weight: 3, when: (c) => is(c, 0, 'Calmo', 'Curioso', 'Sonhador') && calm(c) && c.env.hour > 6 && c.env.hour < 19,
    lines: () => [L(0, 'Joguei a linha. Agora é só esperar... e esperar... e esperar.', 'zzz'), L(0, 'Peguei! Peguei! É... uma bota. Tem um bilhete: "devolva ao Magikarp".', 'shock'), L(0, 'Pelo menos o peixe que fugiu me contou como é o fundo do lago.', 'idea')],
    outcome: (c) => ({ items: [[c.rng() < 0.5 ? 'peixe' : 'alga', 1]] }),
  },
  {
    id: 'solo-planta', kind: 'solo', title: 'Conversa com a plantinha', emoji: '🌱', cast: 1, weight: 4, when: (c) => c.env.crops > 0 && calm(c),
    lines: () => [L(0, 'Cresça, plantinha, cresça! Eu acredito em você!', 'heart'), L(0, '(derrama a água do baldinho em volta de todo mundo)', 'sweat'), L(0, 'Pronto. Ela não respondeu, mas eu senti o apoio.', 'sparkle')],
    outcome: { water: true },
    after: () => 'Reguei as plantas da sua horta outro dia. Não precisa agradecer. Pode agradecer um pouquinho.',
  },
  {
    id: 'solo-chuva', kind: 'solo', title: 'Dança da poça', emoji: '🌧️', cast: 1, weight: 5, when: (c) => c.env.weather === 'chuva',
    lines: () => [L(0, 'Chuva! Hora de pular em todas as poças!', 'star'), L(0, '(pula, escorrega, desliza um metro de barriga)', 'laugh'), L(0, 'Eu faria de novo. Eu vou fazer de novo!', 'note')],
    outcome: {},
  },
  {
    id: 'solo-neve', kind: 'solo', title: 'Anjo de neve', emoji: '⛄', cast: 1, weight: 5, when: (c) => c.env.weather === 'neve',
    lines: () => [L(0, 'Neve de verdade! Vou fazer um anjo de neve!', 'star'), L(0, '(deita, mexe as patinhas... e fica preso no chão fofinho)', 'sweat'), L(0, 'Alguém me ajuda? ...Na verdade, tá confortável aqui.', 'zzz')],
    outcome: {},
  },

  // ---------------------------------------------------------------------------- amizade
  {
    id: 'par-piquenique', kind: 'amizade', title: 'Piquenique improvisado', emoji: '🧺', cast: 2, weight: 5, when: (c) => calm(c) && c.env.hour > 9 && c.env.hour < 19,
    lines: (c) => [
      L(0, `${c.n[1]}! Trouxe lanche! Divide comigo?`, 'star'),
      c.p[0] === 'Guloso' ? L(0, '(come tudo antes de terminar de convidar)', 'laugh') : L(1, 'Você é a melhor pessoa do mundo.', 'heart'),
      L(1, c.p[0] === 'Guloso' ? 'E o meu pedaço?' : 'Deita aqui, olha as nuvens com a gente.', c.p[0] === 'Guloso' ? 'anger' : 'sparkle'),
      L(0, c.p[0] === 'Guloso' ? 'Eu trago mais amanhã! Prometo! (talvez)' : 'Hoje o dia está perfeito.', c.p[0] === 'Guloso' ? 'sweat' : 'note'),
    ],
    outcome: (c) => ({ bond: c.p[0] === 'Guloso' ? 4 : 10, spark: 2, friend: 1 }),
    after: (n, who) => `Fiz um piquenique com ${other(n, who)}. Foi tão bom!`,
  },
  {
    id: 'par-segredo', kind: 'amizade', title: 'O segredo', emoji: '🤫', cast: 2, weight: 4, when: (c) => is(c, 0, 'Tímido', 'Sonhador', 'Calmo'),
    lines: (c) => [
      L(0, `${c.n[1]}... posso contar uma coisa? Mas promete que não conta?`, 'sweat'),
      L(1, 'Prometo pela minha Pokébola favorita.', 'star'),
      L(0, 'Eu tenho medo de... pássaros que olham demais.', 'shock'),
      L(1, 'Isso é muito específico. Eu entendo. Eu também fico nervoso.', 'heart'),
    ],
    outcome: { bond: 12, spark: 3 },
    after: (n, who) => (who === 1 ? `Prometi não contar o segredo de ${n[0]}. E não vou. Foi sobre pássaros. Ops.` : `Contei um segredo para ${n[1]}. Acho que foi a coisa certa.`),
  },
  {
    id: 'par-corrida', kind: 'amizade', title: 'A grande corrida', emoji: '🏃', cast: 2, weight: 5, when: (c) => is(c, 0, 'Corajoso', 'Brincalhão', 'Mandão') && calm(c),
    lines: (c) => {
      const win = c.rng() < 0.5 ? 0 : 1;
      c.memo.win = win;
      const lose = win === 0 ? 1 : 0;
      return [
        L(0, `${c.n[1]}, vamos ver quem chega primeiro naquela árvore! Valendo a minha honra!`, 'fire'),
        L(1, 'Contar até três? Eu já saí no "um"!', 'star'),
        L(win, 'Cheguei! Cheguei primeiro! Gravem o meu nome na árvore!', 'sparkle'),
        L(lose, 'Foi por um bigode. Eu quero revanche.', 'anger'),
      ];
    },
    outcome: (_c) => ({ bond: 7, spark: 1, friend: 1 }),
    after: (n, who) => `Corri com ${other(n, who)}. Quero a revanche!`,
  },
  {
    id: 'par-nuvens', kind: 'amizade', title: 'Formato de nuvem', emoji: '☁️', cast: 2, weight: 4, when: (c) => calm(c) && c.env.hour > 6 && c.env.hour < 19,
    lines: (c) => [
      L(0, 'Aquela nuvem é um Wailord. Sem dúvida.', 'star'),
      L(1, 'É um sanduíche.', 'question'),
      L(0, 'Tem olhos! Os sanduíches não têm olhos!', 'shock'),
      L(1, 'Esse tem. É um sanduíche muito atento.', c.p[1] === 'Guloso' ? 'heart' : 'laugh'),
    ],
    outcome: { bond: 7, spark: 2 },
  },
  {
    id: 'par-esconde', kind: 'amizade', title: 'Esconde-esconde', emoji: '🙈', cast: 2, weight: 4, when: (c) => is(c, 0, 'Brincalhão', 'Curioso') && calm(c),
    lines: (c) => [
      L(1, 'Um, dois, três... contando! Quem for esconder, esconde!', 'note'),
      L(0, '(se esconde atrás de uma florzinha, com a cabeça de fora)', 'sweat'),
      L(1, `Achei! O ${c.n[0]} estava atrás da flor!`, 'shock'),
      L(0, 'Impossível! Eu estava invisível!', 'laugh'),
    ],
    outcome: { bond: 8, spark: 1, friend: 1 },
  },
  {
    id: 'par-treino', kind: 'amizade', title: 'Treino puxado', emoji: '💪', cast: 2, weight: 4, when: (c) => is(c, 0, 'Corajoso', 'Mandão'),
    lines: (c) => [
      L(0, `${c.n[1]}, hoje é dia de treino! Mais uma! E mais uma!`, 'fire'),
      L(1, 'Eu... acho que... não sinto mais as patas.', 'sweat'),
      L(0, 'Isso é o corpo ficando forte! Mais uma!', 'anger'),
      L(1, 'Você é impossível. Mas obrigado por me puxar.', 'heart'),
    ],
    outcome: { bond: 8, spark: 1 },
    after: (n, who) => (who === 1 ? `${n[0]} me fez treinar até as patas dormirem. Estou orgulhoso, e dolorido.` : `Treinei ${n[1]} hoje. Ele vai longe!`),
  },
  {
    id: 'par-dueto', kind: 'amizade', title: 'Dueto improvável', emoji: '🎤', cast: 2, weight: 5, when: (c) => c.has('piano', 'violao', 'radio', 'caixa-som') && c.env.hour > 8 && c.env.hour < 23,
    lines: (c) => [
      L(0, `${c.n[1]}, eu toco, você canta?`, 'note'),
      L(1, '(canta alto, com muita emoção e nenhuma afinação)', 'note'),
      L(0, 'Isso... foi um jeito de cantar.', 'sweat'),
      L(1, 'Eu sei que arrasei!', 'star'),
    ],
    outcome: { bond: 10, spark: 2, coins: 8 },
    after: (n, who) => `Fiz um dueto com ${other(n, who)}. A vizinhança não pediu bis, mas aplaudiu de longe.`,
  },
  {
    id: 'par-tv', kind: 'comedia', title: 'A guerra do controle remoto', emoji: '📺', cast: 2, weight: 5, when: (c) => c.has('televisao', 'computador', 'fliperama'),
    lines: (_c) => [
      L(0, 'Muda para o programa de culinária!', 'star'),
      L(1, 'Não! Vai começar o de batalhas!', 'fire'),
      L(0, 'Eu cheguei primeiro!', 'anger'),
      L(1, '(dorme no sofá com o controle na mão)', 'zzz'),
      L(0, '...Mudei. Shhh.', 'laugh'),
    ],
    outcome: { bond: 5, spark: 1 },
  },
  {
    id: 'par-agua', kind: 'comedia', title: 'Guerra de água', emoji: '💦', cast: 2, weight: 5, when: (c) => c.has('fonte', 'laguinho') && calm(c) && c.env.hour > 9 && c.env.hour < 19,
    lines: (c) => [
      L(0, `${c.n[1]}! Quem chegar na fonte primeiro ganha!`, 'star'),
      L(1, '(joga água)', 'sweat'),
      L(0, 'Isso é guerra? Então é guerra!', 'fire'),
      L(1, 'Ensopado... eu estou... ensopado e feliz.', 'laugh'),
    ],
    outcome: { bond: 8, spark: 2 },
  },
  {
    id: 'par-fogueira', kind: 'amizade', title: 'Histórias de arrepiar', emoji: '🔥', cast: 2, weight: 6, when: (c) => night(c) && c.has('fogueira', 'tocha'),
    lines: (c) => [
      L(0, 'E então ouviu-se um barulho... atrás da barraca...', 'fire'),
      L(1, c.p[1] === 'Tímido' ? 'Para! Para! Eu já estou arrepiado!' : 'Eu não tenho medo. Nenhum. Quase nenhum.', 'sweat'),
      L(0, 'ERA UM PIDGEY!', 'shock'),
      L(1, '(pula tão alto que cai dentro da cesta de frutas)', 'laugh'),
    ],
    outcome: { bond: 10, spark: 2 },
  },
  {
    id: 'par-pula', kind: 'comedia', title: 'Pula-pula', emoji: '🤸', cast: 2, weight: 5, when: (c) => c.has('cama-elastica', 'balanco', 'escorregador', 'gangorra') && calm(c),
    lines: (c) => [
      L(0, 'Eu vou fazer um salto mortal triplo!', 'star'),
      L(1, 'Você nem sabe fazer um simples.', 'question'),
      L(0, '(pula... e cai de cara na grama)', 'sweat'),
      L(c.p[1] === 'Guloso' ? 1 : 0, c.p[1] === 'Guloso' ? 'Não devia ter comido tanto antes de pular...' : 'Fez parte do plano.', 'laugh'),
    ],
    outcome: { bond: 8, spark: 1 },
  },
  {
    id: 'par-cozinha', kind: 'comedia', title: 'Desastre na cozinha', emoji: '🍳', cast: 2, weight: 5, when: (c) => c.has('fogao', 'churrasqueira', 'fogueira') && c.env.hour > 10,
    lines: (_c) => [
      L(0, 'Eu vou fazer pipoca! Dois minutinhos!', 'idea'),
      L(1, 'Tem certeza que isso é uma boa ideia?', 'question'),
      L(0, '(a pipoca explode e cobre a Vila de neve branca)', 'shock'),
      L(1, 'Pelo menos o cheiro está ótimo.', 'laugh'),
    ],
    outcome: { bond: 6, spark: 1, items: [['pipoca', 1]] },
    after: (n, who) => `${other(n, who)} e eu fizemos pipoca. Metade foi para o teto. A outra metade eu guardei para você.`,
  },

  // ---------------------------------------------------------------------------- comédia
  {
    id: 'par-pegadinha', kind: 'comedia', title: 'A pegadinha do chapéu', emoji: '🎩', cast: 2, weight: 5, when: (c) => is(c, 0, 'Brincalhão'),
    lines: (c) => {
      const grumpy = is(c, 1, 'Mandão', 'Corajoso');
      c.memo.grumpy = grumpy;
      return [
        L(0, '(coloca um chapéu de festa em ' + c.n[1] + ' enquanto ele cochila)', 'idea'),
        L(1, 'Quem colocou isto na minha cabeça?!', 'shock'),
        L(0, 'Foi o vento.', 'laugh'),
        L(1, grumpy ? 'O vento não tem patas! Vem cá!' : 'O vento tem muito bom gosto. Gostei.', grumpy ? 'anger' : 'star'),
      ];
    },
    outcome: (c) => (c.memo.grumpy ? { bond: -5, spark: 1 } : { bond: 6, spark: 2 }),
    after: (n, who) => (who === 1 ? `${n[0]} colocou um chapéu em mim quando eu dormia. Eu vou me vingar. Com amor.` : `Fiz uma pegadinha em ${n[1]}. Valeu cada segundo.`),
  },
  {
    id: 'par-susto', kind: 'comedia', title: 'BUUU!', emoji: '👻', cast: 2, weight: 4, when: (c) => is(c, 0, 'Brincalhão', 'Corajoso') && is(c, 1, 'Tímido', 'Sonhador', 'Guloso'),
    lines: (_c) => [
      L(1, '(caminhando distraído, murmurando uma musiquinha)', 'note'),
      L(0, 'BUUUUU!', 'shock'),
      L(1, 'AAAAAAAAH! (desmaia de lado, bem devagar)', 'shock'),
      L(0, 'Ei? ...Ei? Eu só queria brincar! Acorda! Eu trago fruta!', 'sweat'),
    ],
    outcome: { bond: -4, spark: 0 },
    after: (n, who) => (who === 1 ? `${n[0]} me assustou de verdade. Meu coração ainda está batendo em ritmo de Rapidash.` : `Assustei ${n[1]} sem querer. Vou levar uma fruta para ele depois.`),
  },
  {
    id: 'par-mandao', kind: 'comedia', title: 'Aula de liderança', emoji: '📣', cast: 2, weight: 4, when: (c) => is(c, 0, 'Mandão') && is(c, 1, 'Tímido', 'Calmo'),
    lines: (c) => [
      L(0, `${c.n[1]}, hoje você aprende a mandar. Repita: "EU MANDO!"`, 'fire'),
      L(1, 'e-eu mando... baixinho.', 'sweat'),
      L(0, 'Baixinho não vale!', 'anger'),
      L(1, 'Então... EU... gostaria de pedir licença para dormir.', 'zzz'),
      L(0, '...Aprovado. Você manda muito bem.', 'laugh'),
    ],
    outcome: { bond: 4, spark: 0 },
  },
  {
    id: 'par-roubo', kind: 'drama', title: 'A fruta sumiu', emoji: '🍎', cast: 2, weight: 7, when: (c) => is(c, 0, 'Guloso') && c.env.hour > 8,
    lines: (_c) => [
      L(1, 'Minha Oran! Eu deixei aqui! Estava reservada!', 'shock'),
      L(0, 'Eu... não vi nenhuma fruta. (mastiga muito devagar)', 'sweat'),
      L(1, 'Você está com suco no queixo!', 'anger'),
      L(0, 'Foi o vento.', 'laugh'),
    ],
    outcome: { bond: -8, spark: -2 },
    choice: {
      prompt: 'Foi o Guloso mesmo. O que você faz?',
      options: [
        { label: (c) => `Dar uma Fruta Oran para ${c.n[1]}`, needs: { item: 'oran', qty: 1 }, lines: (c) => [L(1, 'Ah... você é demais. Está perdoado, ' + c.n[0] + '.', 'heart'), L(0, 'Eu sabia que a gente se amava!', 'star')], outcome: { bond: 6, friendBy: [0, 4] } },
        { label: (c) => `Dar bronca em ${c.n[0]}`, lines: (_c) => [L(0, 'Tá bom, tá bom! Me desculpe. Não faço mais. (faz de novo na semana que vem)', 'sweat'), L(1, 'Obrigado por ficar do meu lado.', 'sparkle')], outcome: { bond: -2, friendBy: [-1, 3] } },
        { label: () => 'Rir da cena', lines: (_c) => [L(0, 'Viu? Até o treinador achou graça!', 'laugh'), L(1, 'Tudo bem, é engraçado... mas eu estou com fome.', 'sad')], outcome: { bond: -3, friendBy: [2, 0] } },
      ],
    },
    after: (n, who) => (who === 0 ? `Eu... não comi a fruta do ${n[1]}. Quem disse isso? Foi o vento!` : `${n[0]} comeu a minha fruta e disse que foi o vento. O VENTO!`),
  },
  {
    id: 'par-vaso', kind: 'drama', title: 'Quem quebrou o vaso?', emoji: '🏺', cast: 2, weight: 5, when: (c) => is(c, 0, 'Curioso', 'Brincalhão') && c.has('vaso', 'cerca', 'quadro', 'bonsai', 'samambaia', 'estatua'),
    lines: (c) => [
      L(0, '(cutuca o enfeite para ver o que acontece... e ele cai)', 'shock'),
      L(1, 'O que foi esse barulho?! O que você fez?!', 'shock'),
      L(0, 'Eu? Nada! Foi... a gravidade!', 'sweat'),
      L(1, 'A gravidade não deixa pegadas de patas na massa de bolo, ' + c.n[0] + '.', 'anger'),
    ],
    outcome: { bond: -6, spark: 0 },
    choice: {
      prompt: 'Dá para ver a verdade nas pegadas. O que você faz?',
      options: [
        { label: (_c) => `Perdoar os dois`, lines: (_c) => [L(0, 'Eu limpo tudo! E ainda trago flores!', 'heart'), L(1, 'Está bem... mas a gravidade vai ouvir poucas e boas.', 'laugh')], outcome: { bond: 5, friend: 2 } },
        { label: (c) => `Dar razão para ${c.n[1]}`, lines: (_c) => [L(1, 'Eu sabia! Obrigado por confiar em mim!', 'star'), L(0, 'Traidor! (mas eu mereço)', 'sad')], outcome: { bond: -2, friendBy: [-1, 3] } },
        { label: (c) => `Defender ${c.n[0]}`, lines: (_c) => [L(0, 'Você é meu herói! Eu juro que aprendi a lição.', 'heart'), L(1, 'Você sempre faz isso...', 'sad')], outcome: { bond: -4, friendBy: [3, -1] } },
      ],
    },
  },
  {
    id: 'par-fofoca', kind: 'drama', title: 'A fofoca', emoji: '🗣️', cast: 3, weight: 6, when: (c) => is(c, 0, 'Curioso', 'Brincalhão', 'Mandão', 'Guloso') && is(c, 1, 'Curioso', 'Brincalhão', 'Guloso', 'Sonhador'),
    lines: (c) => [
      L(0, `${c.n[1]}, vem cá. Você não sabe o que o ${c.n[2]} fez ontem.`, 'idea'),
      L(1, 'Conta! Conta tudo! Eu trouxe fruta para ouvir melhor.', 'star'),
      L(0, 'Ele... falou sozinho no espelho d\'água. E disse que o seu corte de cabelo era "ousado".', 'shock'),
      L(2, 'EU OUVI TUDO!', 'anger'),
      L(0, '(finge que está olhando as nuvens)', 'sweat'),
    ],
    outcome: { bond: 0, bond02: -8, bond12: -4 },
    choice: {
      prompt: 'A fofoca virou confusão. O que você faz?',
      options: [
        { label: (_c) => `Pedir paz entre todos`, lines: (_c) => [L(2, 'Está bem. Mas eu quero um pedido de desculpas em forma de bolo.', 'sad'), L(0, 'Um bolo. Combinado. Ou uma fruta. Ou nada.', 'sweat'), L(1, 'Eu só ouvi! Eu não falei nada!', 'sweat')], outcome: { bond: 3, bond02: 3, bond12: 3, friend: 2 } },
        { label: (c) => `Defender ${c.n[2]}`, lines: (_c) => [L(2, 'Viu? Alguém me entende nesta Vila!', 'heart'), L(0, 'Tá, eu fofoquei. Mas era de brincadeira...', 'sad')], outcome: { bond: 0, bond02: -10, bond12: 2, friendBy: [-1, 0, 4] } },
        { label: (_c) => `Fofocar também`, lines: (_c) => [L(0, 'O treinador também fofoca! Que dia!', 'laugh'), L(2, 'Ninguém respeita ninguém aqui!', 'anger'), L(1, 'Quero detalhes! Todos eles!', 'star')], outcome: { bond: 6, bond02: -6, bond12: -8, friendBy: [2, 2, -1] } },
      ],
    },
    after: (n, who) => (who === 2 ? `${n[0]} andou falando de mim. Mas eu ouvi tudo. TUDO.` : who === 0 ? `Fofoquei sobre ${n[2]}. Foi só uma vez. Ou duas.` : `Eu soube de uma fofoca sobre ${n[2]}. Não posso contar. Ok, posso.`),
  },
  {
    id: 'par-mal-entendido', kind: 'comedia', title: 'Mal-entendido', emoji: '🙉', cast: 3, weight: 4, when: (c) => c.has('radio', 'caixa-som', 'televisao', 'piano', 'violao'),
    lines: (c) => [
      L(0, `Eu não aguento mais a música do ${c.n[2]}.`, 'sweat'),
      L(1, `Você disse que não aguenta o ${c.n[2]}?! Vou contar pra ele!`, 'shock'),
      L(2, 'Você disse isso de mim?!', 'sad'),
      L(0, 'Eu falei da MÚSICA! É que a música é muito ALTA! Eu estava falando com a caixa de som!', 'sweat'),
      L(2, '...Ah. Então abaixa o volume que você gosta de mim.', 'laugh'),
    ],
    outcome: { bond: 3, bond02: 4, bond12: 2 },
  },
  {
    id: 'par-colheita', kind: 'drama', title: 'Quem comeu a colheita?', emoji: '🥕', cast: 1, weight: 4, when: (c) => is(c, 0, 'Guloso', 'Curioso') && c.env.ripeCrops > 0,
    lines: (_c) => [
      L(0, 'Aquela planta estava com um cheirinho tão bom... só provei.', 'sweat'),
      L(0, '(provou a colheita inteira)', 'shock'),
      L(0, 'Eu... trouxe isto para compensar. Por favor, não conta pro treinador.', 'sad'),
    ],
    outcome: { eatCrop: true, items: [['mel', 2], ['pena', 1]], friend: -1 },
    choice: {
      prompt: 'A colheita sumiu, mas o ladrão ficou com remorso. O que você faz?',
      options: [
        { label: () => 'Perdoar', lines: (_c) => [L(0, 'Sério?! Eu prometo tomar conta da horta! (da próxima vez, eu peço)', 'heart')], outcome: { eatCrop: true, items: [['mel', 2], ['pena', 1]], friend: 2 } },
        { label: () => 'Dar bronca', lines: (_c) => [L(0, 'Desculpa, desculpa! Eu fiz por amor ao tomate!', 'sad')], outcome: { eatCrop: true, items: [['mel', 3], ['la', 1]], friend: 0 } },
      ],
    },
    after: (_n) => `Eu... eu não sei de colheita nenhuma. Se perguntarem, eu estava no lago.`,
  },
  {
    id: 'par-implicancia', kind: 'rivalidade', title: 'Briguinha boba', emoji: '🥊', cast: 2, weight: 5, when: (c) => !!c.rel && c.rel.bond <= -15,
    lines: (c) => [
      L(0, `${c.n[1]}, seu jeito de andar é ridículo.`, 'anger'),
      L(1, 'Você nem tem pernas direito, ' + c.n[0] + '!', 'shock'),
      L(0, 'Tenho sim! As minhas estão... escondidas. Para surpresas.', 'sweat'),
      L(1, '(os dois se encaram por três minutos, sem piscar)', 'fire'),
    ],
    outcome: { bond: -4, spark: 0 },
  },
  {
    id: 'par-banco', kind: 'rivalidade', title: 'O banco é meu', emoji: '🪑', cast: 2, weight: 5, when: (c) => is(c, 0, 'Mandão', 'Corajoso') && is(c, 1, 'Mandão', 'Corajoso', 'Guloso', 'Curioso'),
    lines: (_c) => [
      L(0, 'Este lugar é meu. Eu cheguei primeiro.', 'fire'),
      L(1, 'Eu cheguei antes de ontem!', 'anger'),
      L(0, 'Ontem não vale!', 'shock'),
      L(1, '(os dois sentam, espremidos, no mesmo banco, sem se falar)', 'sweat'),
    ],
    outcome: { bond: -3, spark: 1 },
    after: (n, who) => `Dividi o banco com ${other(n, who)}. À força. Mas o banco é meu.`,
  },
  {
    id: 'par-duelo', kind: 'rivalidade', title: 'Duelo de honra', emoji: '⚔️', cast: 2, weight: 6, when: (c) => is(c, 0, 'Corajoso', 'Mandão') && (!c.rel || c.rel.bond < 25) && calm(c),
    lines: (c) => [
      L(0, `${c.n[1]}! Eu te desafio para um duelo de honra!`, 'fire'),
      L(1, 'Aqui? Agora? Sem plateia?', 'question'),
      L(0, 'Tem plateia. Aquele arbusto está olhando.', 'sweat'),
      L(1, 'Aceito! Que o melhor Pokémon vença!', 'star'),
      L(0, '(os dois pulam, giram, se enrolam e caem no chão rindo)', 'laugh'),
    ],
    outcome: { bond: 3, spark: 1 },
    choice: {
      prompt: 'Os dois pedem que você seja o juiz. Quem ganhou?',
      options: [
        { label: () => 'Empate!', lines: (_c) => [L(0, 'Empate? Hmpf. Mas eu respeito.', 'sweat'), L(1, 'O próximo duelo é meu!', 'star')], outcome: { bond: 8, spark: 1, friend: 2 } },
        { label: (c) => `${c.n[0]} venceu`, lines: (_c) => [L(0, 'Eu sabia! Eu sempre soube!', 'star'), L(1, 'Revanche. Amanhã. Sem testemunhas.', 'anger')], outcome: { bond: -4, friendBy: [4, -1] } },
        { label: (c) => `${c.n[1]} venceu`, lines: (_c) => [L(1, 'Ha! Anotem na pedra!', 'star'), L(0, 'Isso não vai ficar assim!', 'anger')], outcome: { bond: -4, friendBy: [-1, 4] } },
      ],
    },
  },
  {
    id: 'par-ciume-atencao', kind: 'rivalidade', title: 'Ciúme de atenção', emoji: '😒', cast: 2, weight: 5, when: (c) => c.pts(1) >= c.pts(0) + 25 && c.pts(1) >= 45,
    lines: (c) => [
      L(0, `Todo mundo adora ${c.n[1]}. Eu também faço coisas legais.`, 'sad'),
      L(1, 'Você disse alguma coisa?', 'question'),
      L(0, 'Eu? Nada. Só que ninguém me dá bola hoje.', 'sweat'),
      L(1, 'Quer brincar? Eu empresto a minha bola.', 'heart'),
    ],
    outcome: { bond: 3, friendBy: [0, 0] },
    choice: {
      prompt: `Parece que o mais ciumento precisa de carinho. O que você faz?`,
      options: [
        { label: (c) => `Dar atenção para ${c.n[0]}`, lines: (c) => [L(0, 'Você me notou! Eu sabia que eu era especial!', 'heart'), L(1, 'Que bom. Eu também sou seu fã, ' + c.n[0] + '.', 'sparkle')], outcome: { bond: 8, friendBy: [6, 0] } },
        { label: () => 'Chamar os dois para brincar', lines: (_c) => [L(0, 'Dois contra o mundo!', 'star'), L(1, 'Eu sou o mundo, então vem!', 'laugh')], outcome: { bond: 10, friendBy: [3, 2] } },
      ],
    },
  },
  {
    id: 'par-pazes', kind: 'amizade', title: 'Fazendo as pazes', emoji: '🕊️', cast: 2, weight: 12, when: (c) => c.rel?.flag === 'brigados' && c.rel.since !== c.env.day,
    lines: (c) => [
      L(0, `${c.n[1]}... eu estava pensando. Eu fui um bobo.`, 'sad'),
      L(1, 'Eu também. A culpa não foi só sua. Foi mais sua, mas não só.', 'sweat'),
      L(0, 'Aceita uma fruta como pedido de desculpa?', 'heart'),
      L(1, 'Só se for a maior.', 'laugh'),
    ],
    outcome: { bond: 18, spark: 6, flag: 'clear', friend: 1 },
    after: (n, who) => `Fiz as pazes com ${other(n, who)}. Foi tão difícil e tão fácil ao mesmo tempo.`,
  },

  // ---------------------------------------------------------------------------- romance
  {
    id: 'rom-olhares', kind: 'romance', title: 'Troca de olhares', emoji: '👀', cast: 2, weight: 4, when: (c) => (!c.rel || (c.rel.spark < 35 && c.rel.flag !== 'casal' && c.rel.bond > -15)) && calm(c),
    lines: (c) => [
      L(0, 'Ei, ' + c.n[1] + '... você viu aquele Pidgey?', 'question'),
      L(1, 'Vi. Digo... eu estava olhando para você. Quer dizer, para o Pidgey.', 'sweat'),
      L(0, 'Ah. O Pidgey. Claro.', 'heart'),
      L(1, '(os dois ficam em silêncio, olhando para o horizonte, corados)', 'heart'),
    ],
    outcome: { bond: 3, spark: 10 },
    after: (n, who) => `Eu e ${other(n, who)} vimos um Pidgey. Só isso. Foi só isso. Ok?`,
  },
  {
    id: 'rom-flor', kind: 'romance', title: 'Uma flor sem motivo', emoji: '🌸', cast: 2, weight: 5, when: (c) => (!c.rel || (c.rel.spark < 70 && c.rel.bond > -10)) && c.env.hour > 7 && c.env.hour < 21 && calm(c),
    lines: (c) => [
      L(0, `Colhi isto... não é nada de especial. Só... para você.`, 'heart'),
      L(1, `Uma flor? Para mim? Que flor linda. Digo... que flor. Boa flor.`, 'sweat'),
      L(0, is(c, 0, 'Guloso') ? 'Tem uma fruta escondida embaixo. Mas a flor é a parte romântica.' : 'Eu passei dez minutos escolhendo a mais bonita.', is(c, 0, 'Guloso') ? 'laugh' : 'sparkle'),
      L(1, 'Vou guardar para sempre. Ou até secar. O que vier primeiro.', 'heart'),
    ],
    outcome: { bond: 4, spark: 14 },
    after: (n, who) => (who === 1 ? `${n[0]} me deu uma flor. Eu estou... bem. Muito bem. Ok, estou apaixonado.` : `Dei uma flor para ${n[1]}. Não foi nada. Foi tudo.`),
  },
  {
    id: 'rom-confissao', kind: 'romance', title: 'A confissão', emoji: '💌', cast: 2, weight: 8, keep: true, when: (c) => !!c.rel && c.rel.spark >= 35 && c.rel.bond >= 15 && c.rel.flag === null,
    lines: (c) => {
      const yes = c.rng() < 0.7;
      c.memo.yes = yes;
      return [
        L(0, `${c.n[1]}... eu preciso te falar uma coisa. Desde que a gente se conheceu, eu... eu...`, 'sweat'),
        L(1, 'Respira, ' + c.n[0] + '. Eu estou ouvindo.', 'heart'),
        L(0, 'Eu gosto de você. Mais do que de fruta. E olha que eu gosto muito de fruta.', 'heart'),
        yes ? L(1, 'Eu também gosto de você. Mais do que de dormir. E olha que eu amo dormir.', 'heart') : L(1, 'Eu... gosto de você como amigo. Muito mesmo. Desculpa.', 'sad'),
        yes ? L(0, '(os dois saem de patinhas dadas, sem olhar para trás)', 'sparkle') : L(0, 'Tudo bem. Eu... vou ali. Chorar no arbusto. Volto já.', 'sad'),
      ];
    },
    outcome: (c) => (c.memo.yes ? { bond: 12, spark: 15, flag: 'casal' } : { bond: -2, spark: -25 }),
    after: (n, _who) => `${n[0]} se declarou para ${n[1]}. Foi a coisa mais corajosa e mais constrangedora da Vila.`,
  },
  {
    id: 'rom-encontro', kind: 'romance', title: 'Encontro à luz de lampião', emoji: '🕯️', cast: 2, weight: 8, when: (c) => c.rel?.flag === 'casal' && c.env.hour >= 18 && c.env.hour < 24,
    lines: (c) => [
      L(0, `${c.n[1]}, eu reservei o melhor banquinho da Vila. Vista para as estrelas.`, 'sparkle'),
      L(1, 'Você é tão romântico. E o banquinho é torto.', 'heart'),
      L(0, 'É para a gente ficar mais pertinho.', 'heart'),
      L(1, '(os dois olham as estrelas, e uma estrela cadente cruza o céu)', 'star'),
    ],
    outcome: { bond: 6, spark: 8 },
  },
  {
    id: 'rom-ciumes', kind: 'drama', title: 'O triângulo', emoji: '💔', cast: 3, weight: 10, when: (c) => c.rel?.flag === 'casal' && (!c.rel02 || c.rel02.flag !== 'casal'),
    lines: (c) => [
      L(2, `${c.n[1]}, você sempre é tão atencioso. Quer ver o meu truque de lançar fruta?`, 'star'),
      L(1, 'Eu... acho que quero. Quer dizer, não sei.', 'sweat'),
      L(0, `Quem é esse, ${c.n[1]}?! E por que ele está tão perto?!`, 'anger'),
      L(2, 'Calma. Eu só queria mostrar o truque.', 'sweat'),
      L(0, '(treme de ciúmes, as bochechas pegando fogo)', 'fire'),
    ],
    outcome: { bond: -4, spark: -6, bond02: -10 },
    choice: {
      prompt: 'Ciúmes em plena praça! O que você faz?',
      options: [
        { label: (c) => `Acalmar ${c.n[0]}`, lines: (_c) => [L(0, 'Desculpa. Eu fui muito dramático.', 'sad'), L(1, 'Tudo bem. Você sempre será o meu favorito.', 'heart'), L(2, 'Eu só queria mostrar o truque...', 'sad')], outcome: { bond: 6, spark: 10, bond02: -3, friendBy: [3, 1, 0] } },
        { label: () => 'Provocar ainda mais 😈', lines: (_c) => [L(0, 'Isso é uma guerra!', 'fire'), L(1, 'Quem começou essa confusão?!', 'anger'), L(2, 'Eu só queria mostrar o truque!!', 'shock')], outcome: { bond: -14, spark: -12, bond02: -14, flag: 'brigados', friendBy: [-1, -1, -1] } },
        { label: () => 'Chamar os três para uma sobremesa', needs: { item: 'pipoca', qty: 1 }, lines: (_c) => [L(2, 'Pipoca! Eu tenho um truque com pipoca!', 'star'), L(0, 'Tá bom, mas eu fico de olho.', 'sweat'), L(1, 'Que dia, que dia...', 'laugh')], outcome: { bond: 8, spark: 6, bond02: 6, friend: 2 } },
      ],
    },
    after: (n, who) => (who === 0 ? `Quase tive um ataque quando ${n[2]} chegou perto de ${n[1]}. Quase.` : who === 1 ? `Eu só queria uma tarde tranquila. Mas recebi um triângulo amoroso.` : `Eu só queria mostrar o meu truque. Ninguém me explicou o que era ciúme.`),
  },
  {
    id: 'rom-briga-casal', kind: 'drama', title: 'Briga de casal', emoji: '💥', cast: 2, weight: 7, when: (c) => c.rel?.flag === 'casal' && c.rel.bond < 55,
    lines: (c) => [
      L(0, `${c.n[1]}! Você comeu a última fruta?!`, 'shock'),
      L(1, 'Eu achei que era minha!', 'sweat'),
      L(0, 'A gente combinou que dividia!', 'anger'),
      L(1, 'Então você devia ter dito antes de eu comer!', 'anger'),
      L(0, '(os dois se viram de costas, de braços cruzados, em silêncio)', 'fire'),
    ],
    outcome: { bond: -10, spark: -6, flag: 'brigados' },
    choice: {
      prompt: 'Eles estão de costas um para o outro. O que você faz?',
      options: [
        { label: () => 'Dar uma fruta para os dois', needs: { item: 'oran', qty: 1 }, lines: (_c) => [L(0, 'Uma fruta! Uma só! Para os dois!', 'sparkle'), L(1, 'Divide ao meio?', 'heart'), L(0, 'Divide.', 'heart')], outcome: { bond: 8, spark: 8, flag: 'clear', friend: 2 } },
        { label: () => 'Chamar para conversar', lines: (_c) => [L(1, 'Está bem. Eu devia ter perguntado.', 'sad'), L(0, 'E eu devia ter pedido por favor.', 'sad')], outcome: { bond: 3, spark: 2, flag: 'clear', friend: 1 } },
        { label: () => 'Deixar esfriar', lines: (_c) => [L(0, '(finge que não está olhando)', 'sweat')], outcome: { bond: -10, spark: -6, flag: 'brigados' } },
      ],
    },
  },
  {
    id: 'rom-fim', kind: 'drama', title: 'Fim de namoro', emoji: '💔', cast: 2, weight: 8, keep: true, when: (c) => c.rel?.flag === 'casal' && c.rel.bond < 15,
    lines: (c) => [
      L(0, `${c.n[1]}, a gente precisa conversar.`, 'sad'),
      L(1, 'Eu sei. Eu também sinto.', 'sad'),
      L(0, 'Acho que a gente funciona melhor como amigos.', 'sweat'),
      L(1, 'É... Mas eu vou sempre guardar a flor.', 'heart'),
    ],
    outcome: { bond: 4, spark: -25, flag: 'clear' },
  },
  {
    id: 'rom-casamento', kind: 'festa', title: 'O casamento da Vila', emoji: '💒', cast: 3, weight: 14, keep: true,
    when: (c) => c.rel?.flag === 'casal' && c.rel.bond >= 70 && c.rel.spark >= 70 && !c.seen.has('rom-casamento') && c.env.hour >= 10 && c.env.hour < 20,
    lines: (c) => [
      L(2, `Estamos aqui reunidos para unir ${c.n[0]} e ${c.n[1]} em uma amizade chamada amor.`, 'note'),
      L(0, 'Eu aceito! Eu aceito antes de você terminar de falar!', 'heart'),
      L(1, 'Eu também! Eu trouxe uma coroa de flores! Fui eu que fiz!', 'sparkle'),
      L(2, 'Pode beijar a noiva... ou o noivo. Ou dar um abraço, que é mais fofo.', 'star'),
      L(0, '(a Vila inteira joga pétalas, e um Pidgey rouba o bolo)', 'laugh'),
    ],
    outcome: { bond: 10, spark: 15, bond02: 8, bond12: 8, coins: 60, items: [['bolo-morango', 1], ['coroa-flores', 1]], friend: 4 },
  },

  // ---------------------------------------------------------------------------- festas
  {
    id: 'trio-surpresa', kind: 'festa', title: 'Festa surpresa', emoji: '🎂', cast: 3, weight: 5, when: (c) => c.env.hour > 9 && c.env.hour < 22,
    lines: (c) => [
      L(1, `Shhh! O ${c.n[0]} está chegando! Todo mundo se escondendo!`, 'shock'),
      L(0, '(chega, olha em volta, não vê ninguém, e senta)', 'question'),
      L(2, 'SURPRESAAAA!', 'star'),
      L(0, '...Mas não é meu aniversário.', 'sweat'),
      L(1, 'Era um ensaio! Para quando for!', 'laugh'),
    ],
    outcome: { bond: 8, bond02: 8, bond12: 8, friend: 2 },
  },
  {
    id: 'trio-festa', kind: 'festa', title: 'Festa na praça', emoji: '🪩', cast: 3, weight: 7, when: (c) => c.has('bola-disco', 'caixa-som', 'radio', 'piano') && c.env.hour >= 16,
    lines: (c) => [
      L(0, 'Aumenta o som! É sábado na cabeça de todo mundo!', 'note'),
      L(1, '(dança com os dois pés para a esquerda)', 'note'),
      L(2, is(c, 2, 'Tímido') ? 'Eu... fico aqui no cantinho. Só olhando. E balançando.' : 'Abre roda! Eu vou fazer o passo da Pokébola!', is(c, 2, 'Tímido') ? 'sweat' : 'star'),
      L(0, 'Treinador, vem dançar!', 'sparkle'),
    ],
    outcome: { bond: 8, bond02: 8, bond12: 8, coins: 20, friend: 2 },
  },
  {
    id: 'trio-talentos', kind: 'festa', title: 'Show de talentos', emoji: '🏆', cast: 3, weight: 6, when: (c) => c.has('piano', 'violao', 'caixa-som', 'radio', 'bola-disco', 'gazebo') && c.env.hour > 9 && c.env.hour < 22,
    lines: (c) => [
      L(0, `Senhoras e senhores, o show de talentos da Vila!`, 'star'),
      L(1, `${c.n[1]} apresenta... o grito mais longo do mundo! (AAAAAAAAH)`, 'note'),
      L(2, `${c.n[2]} responde com... malabarismo de frutas! (derruba todas)`, 'sweat'),
      L(0, `E eu faço... uma dancinha secreta. Nem eu sei os passos.`, 'sparkle'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, coins: 12 },
    choice: {
      prompt: 'Você é o jurado. Quem vence o show de talentos?',
      options: [
        { label: (c) => c.n[0]!, lines: (_c) => [L(0, 'Eu ganhei?! EU GANHEI! Obrigado, mãe!', 'star'), L(1, 'Foi injusto! Eu gritei por três minutos!', 'anger'), L(2, 'Pelo menos nenhuma fruta me atingiu.', 'sweat')], outcome: { bond: -3, bond02: -3, bond12: 4, friendBy: [6, 0, 0], coins: 15 } },
        { label: (c) => c.n[1]!, lines: (_c) => [L(1, 'O GRITO FOI MEU! O MUNDO TODO OUVIU!', 'star'), L(0, 'Isso não é um talento...', 'sweat'), L(2, 'Eu sou fã do grito, na verdade.', 'heart')], outcome: { bond: -3, bond02: 4, bond12: -3, friendBy: [0, 6, 0], coins: 15 } },
        { label: (c) => c.n[2]!, lines: (_c) => [L(2, 'Eu venci?! Com todas as frutas no chão?!', 'star'), L(0, 'Minha dança era ótima...', 'sad'), L(1, 'Eu ainda tenho voz para uma revanche.', 'fire')], outcome: { bond: 4, bond02: -3, bond12: -3, friendBy: [0, 0, 6], coins: 15 } },
      ],
    },
    after: (_n, who) => `Teve um show de talentos! ${who === 1 ? 'Eu gritei por três minutos.' : who === 2 ? 'Eu derrubei todas as frutas.' : 'Eu dancei uma coisa secreta.'}`,
  },
  {
    id: 'trio-acampamento', kind: 'amizade', title: 'Noite de acampamento', emoji: '⛺', cast: 3, weight: 6, when: (c) => night(c) && c.has('tenda', 'fogueira', 'tocha') && calm(c),
    lines: (_c) => [
      L(0, 'Quem vai dormir no meio da barraca? Eu fico na beirada!', 'idea'),
      L(1, 'Eu não fico! Tem um barulhinho lá fora!', 'shock'),
      L(2, 'É só um grilo. Um grilo bem grande. Com olhos que brilham.', 'sweat'),
      L(0, '(os três dormem num monte de patas, rabos e cobertores)', 'zzz'),
    ],
    outcome: { bond: 8, bond02: 8, bond12: 8 },
  },
  {
    id: 'trio-banho', kind: 'comedia', title: 'Dia de spa', emoji: '🛁', cast: 3, weight: 4, when: (c) => c.has('banheira', 'laguinho', 'fonte') && calm(c),
    lines: (_c) => [
      L(0, 'Eu trouxe espuma. Muita espuma.', 'idea'),
      L(1, 'Isso não é espuma, isso é uma nuvem!', 'shock'),
      L(2, '(desaparece dentro da espuma e só aparece o rabo)', 'laugh'),
      L(0, 'Isso é relaxante. Eu acho. Não vejo nada.', 'sweat'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6 },
  },
];

/** Todos os momentos: os do começo (`CORE`) e as levas novas, por tipo de elenco e por ocasião. */
export const TEMPLATES: readonly Template[] = [...CORE, ...SOLO_MOMENTS, ...DUO_MOMENTS, ...TRIO_MOMENTS, ...SEASON_MOMENTS, ...EXTRA_MOMENTS];
export const TEMPLATE_COUNT = TEMPLATES.length;
export const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

// -------------------------------------------------------------------------------- relações

/** A relação do par (cria já com um começo meio aleatório: alguns pares nascem simpáticos e outros, implicantes). */
export function relOf(state: VillageState, a: string, b: string, day = ''): Relation {
  const key = pairKey(a, b);
  return (state.rel[key] ??= { bond: (hash(key) % 21) - 10, spark: 0, flag: null, since: day, met: 0 });
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function bump(state: VillageState, a: string, b: string, dBond: number, dSpark: number, day: string): void {
  const r = relOf(state, a, b, day);
  r.bond = clamp(r.bond + dBond, -100, 100);
  r.spark = clamp(r.spark + dSpark, 0, 100);
  r.met++;
}

// -------------------------------------------------------------------------------- escolha do momento

export function makeEnv(state: VillageState, day: string, hour: number, weather: string | null, player = 'Treinador'): SocialEnv {
  const ripe = state.crops.filter((c) => {
    const g = itemDef(c.seed)?.grows;
    return !!g && c.stage >= g.stages;
  }).length;
  return { player, hour, day, weather, placed: new Set(state.placed.map((p) => p.item)), crops: state.crops.length, ripeCrops: ripe, town: state.town.level, lingo: state.lingo.slice(-8).map((x) => x.text) };
}

function makeCtx(state: VillageState, cast: Actor[], env: SocialEnv, rng: Rng): Ctx {
  const rel = (i: number, j: number): Relation | undefined => (cast[i] && cast[j] ? state.rel[pairKey(cast[i]!.id, cast[j]!.id)] ?? undefined : undefined);
  return {
    n: cast.map((a) => a.name),
    p: cast.map((a) => personalityOf(a.id).name),
    types: cast.map((a) => a.types),
    rel: rel(0, 1) ?? (cast.length > 1 ? { bond: (hash(pairKey(cast[0]!.id, cast[1]!.id)) % 21) - 10, spark: 0, flag: null, since: '', met: 0 } : undefined),
    rel02: rel(0, 2),
    rel12: rel(1, 2),
    env,
    seen: new Set(state.seen),
    rng,
    memo: {},
    pts: (i) => (cast[i] ? friendOf(state, cast[i]!.id).points : 0),
    has: (...ids) => ids.some((id) => env.placed.has(id)),
    rolling: false,
    ids: cast.map((a) => a.id),
    date: parseDay(env.day),
  };
}

function parseDay(day: string): { y: number; m: number; d: number; dow: number } {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  return { y: y || 2026, m: m || 1, d: d || 1, dow: date.getUTCDay() };
}

export interface Scene {
  tpl: Template;
  ctx: Ctx;
  cast: Actor[];
  lines: MomentLine[];
}

/** Sorteia o próximo momento entre os Pokémon que estão na Vila; `null` se ninguém combinou com nenhum modelo. */
export function pickMoment(actors: readonly Actor[], state: VillageState, env: SocialEnv, rng: Rng): Scene | null {
  if (actors.length === 0) return null;
  const recent = state.diary.slice(-8).map((m) => m.tpl);
  const seen = new Set(state.seen);
  const pool = TEMPLATES.filter((t) => t.cast <= actors.length);
  const weight = (t: Template): number => t.weight * (seen.has(t.id) ? 1 : 1.8) * (recent.includes(t.id) ? 0.1 : 1);
  for (let attempt = 0; attempt < 60; attempt++) {
    const total = pool.reduce((n, t) => n + weight(t), 0);
    let roll = rng() * total;
    const tpl = pool.find((t) => (roll -= weight(t)) < 0) ?? pool[0]!;
    const cast = pickCast(tpl.cast, actors, state, rng);
    const ctx = makeCtx(state, cast, env, rng);
    if (tpl.when && !tpl.when(ctx)) continue;
    const lines = withWords(tpl.lines(ctx), cast.map((a) => a.id), state, rng);
    return { tpl, ctx, cast, lines };
  }
  // Nenhum sorteio combinou com as condições: cai num modelo sem condição (sempre existe um para cada tamanho de elenco).
  const open = pool.filter((t) => !t.when);
  const tpl = open[Math.floor(rng() * open.length)];
  if (!tpl) return null;
  const cast = pickCast(tpl.cast, actors, state, rng);
  const ctx = makeCtx(state, cast, env, rng);
  return { tpl, ctx, cast, lines: withWords(tpl.lines(ctx), cast.map((a) => a.id), state, rng) };
}

/** Monta a cena de um modelo específico (sorteando o elenco até as condições combinarem). Serve para testar modelos de datas raras. */
export function sceneOfTemplate(tpl: Template, actors: readonly Actor[], state: VillageState, env: SocialEnv, rng: Rng, tries = 40): Scene | null {
  if (actors.length < tpl.cast) return null;
  for (let k = 0; k < tries; k++) {
    const cast = pickCast(tpl.cast, actors, state, rng);
    const ctx = makeCtx(state, cast, env, rng);
    if (tpl.when && !tpl.when(ctx)) continue;
    return { tpl, ctx, cast, lines: tpl.lines(ctx) };
  }
  return null;
}

function pickCast(size: 1 | 2 | 3, actors: readonly Actor[], state: VillageState, rng: Rng): Actor[] {
  const first = actors[Math.floor(rng() * actors.length)]!;
  if (size === 1) return [first];
  const rest = actors.filter((a) => a.id !== first.id);
  // Entre três candidatos, o par que menos se encontrou (para os pares variarem).
  let second = rest[Math.floor(rng() * rest.length)]!;
  for (let k = 0; k < 2; k++) {
    const cand = rest[Math.floor(rng() * rest.length)]!;
    if ((state.rel[pairKey(first.id, cand.id)]?.met ?? 0) < (state.rel[pairKey(first.id, second.id)]?.met ?? 0)) second = cand;
  }
  if (size === 2) return [first, second];
  const third = rest.filter((a) => a.id !== second.id);
  return [first, second, third[Math.floor(rng() * third.length)]!];
}

export interface ChoiceView {
  prompt: string;
  options: { label: string; needs?: { item: ItemId; qty: number } }[];
}

export function sceneChoice(scene: Scene): ChoiceView | null {
  const ch = scene.tpl.choice;
  if (!ch) return null;
  return { prompt: ch.prompt, options: ch.options.map((o) => ({ label: o.label(scene.ctx), ...(o.needs ? { needs: o.needs } : {}) })) };
}

// -------------------------------------------------------------------------------- aplicar

function applyOutcome(state: VillageState, cast: Actor[], o: Outcome, day: string, now: number): string[] {
  const chips: string[] = [];
  const a = cast[0]!;
  const b = cast[1];
  const c = cast[2];
  const before = b ? relationStatus(state.rel[pairKey(a.id, b.id)]) : null;
  if (b && (o.bond !== undefined || o.spark !== undefined || o.flag)) {
    const r = relOf(state, a.id, b.id, day);
    if (o.bond || o.spark) bump(state, a.id, b.id, o.bond ?? 0, o.spark ?? 0, day);
    if (o.flag === 'clear') r.flag = null;
    else if (o.flag) r.flag = o.flag;
    if (o.flag) r.since = day;
    if (o.bond) chips.push(`${o.bond > 0 ? '+' : '−'}${Math.abs(o.bond)} amizade (${a.name} e ${b.name})`);
    if (o.spark && Math.abs(o.spark) >= 6) chips.push(`${o.spark > 0 ? '+' : '−'}${Math.abs(o.spark)} clima`);
  } else if (b) {
    relOf(state, a.id, b.id, day).met++;
  }
  if (b && c) {
    if (o.bond02 || o.spark02) {
      bump(state, a.id, c.id, o.bond02 ?? 0, o.spark02 ?? 0, day);
      if (o.bond02) chips.push(`${o.bond02 > 0 ? '+' : '−'}${Math.abs(o.bond02)} amizade (${a.name} e ${c.name})`);
    }
    if (o.bond12) {
      bump(state, b.id, c.id, o.bond12, 0, day);
      chips.push(`${o.bond12 > 0 ? '+' : '−'}${Math.abs(o.bond12)} amizade (${b.name} e ${c.name})`);
    }
  }
  if (b && before) {
    const after = relationStatus(state.rel[pairKey(a.id, b.id)]);
    if (after.key !== before.key) chips.push(`${a.name} e ${b.name}: ${after.label} ${after.emoji}`);
  }
  if (o.coins) {
    state.coins = Math.min(999999, state.coins + o.coins);
    chips.push(`+${o.coins} moedas`);
  }
  for (const [item, qty] of o.items ?? []) {
    add(state, item, qty);
    chips.push(`+${qty} ${itemName(item)}`);
  }
  const friendDeltas = cast.map((_, i) => o.friendBy?.[i] ?? o.friend ?? 0);
  cast.forEach((m, i) => {
    const d = friendDeltas[i]!;
    if (d !== 0) {
      const f = friendOf(state, m.id);
      f.points = clamp(f.points + d, 0, 100);
    }
  });
  if (friendDeltas.some((d) => d > 0)) chips.push('+ amizade com você');
  if (o.eatCrop) {
    const ripe = state.crops.findIndex((cr) => {
      const g = itemDef(cr.seed)?.grows;
      return !!g && cr.stage >= g.stages;
    });
    if (ripe >= 0) {
      const [gone] = state.crops.splice(ripe, 1);
      chips.push(`comeu a colheita (${itemName(itemDef(gone!.seed)?.grows?.crop ?? gone!.seed)})`);
    }
  }
  if (o.water) {
    let n = 0;
    for (const cr of state.crops) {
      const g = itemDef(cr.seed)?.grows;
      if (g && cr.stage < g.stages && cr.wateredAt === null) {
        cr.wateredAt = now;
        n++;
      }
    }
    if (n > 0) chips.push(`regou ${n} planta${n > 1 ? 's' : ''} da horta`);
  }
  return chips;
}

export interface Resolved {
  moment: Moment;
  /** Falas depois da sua decisão (para tocar na Vila). */
  followUp: MomentLine[];
  firstTime: boolean;
}

/** Aplica o resultado do momento (com a sua decisão, se houve), grava no Diário e atualiza o Álbum. */
export function resolveScene(state: VillageState, scene: Scene, choice: number | null, now: number, away = false): Resolved {
  const { tpl, ctx, cast } = scene;
  const day = ctx.env.day;
  const option = choice !== null ? tpl.choice?.options[choice] : undefined;
  const canPay = !option?.needs || count(state, option.needs.item) >= option.needs.qty;
  const used = option && canPay ? option : undefined;
  if (used?.needs) state.inventory[used.needs.item] = count(state, used.needs.item) - used.needs.qty;
  const spec = used ? used.outcome : tpl.outcome;
  const outcome = typeof spec === 'function' ? spec(ctx) : spec;
  const followUp = used?.lines ? used.lines(ctx) : [];
  const result = applyOutcome(state, cast, outcome, day, now);
  const autoKeep = tpl.keep === true && state.diary.filter((x) => x.fav).length < MAX_SAVED;
  if (autoKeep) result.push('📌 Guardado no Álbum para sempre');
  const spread = spreadWords(state, cast, ctx.rng);
  if (spread) result.push(spread);
  const firstTime = !state.seen.includes(tpl.id);
  if (firstTime) {
    state.seen.push(tpl.id);
    state.coins += 10;
    result.push(`Álbum: momento novo! +10 moedas`);
  }
  const moment: Moment = {
    id: `${now.toString(36)}-${tpl.id}-${state.diary.length}`,
    t: now,
    day,
    hour: ctx.env.hour,
    tpl: tpl.id,
    kind: tpl.kind,
    title: tpl.title,
    emoji: tpl.emoji || MOMENT_EMOJI[tpl.kind],
    cast: cast.map((a) => ({ id: a.id, name: a.name })),
    lines: [...scene.lines, ...followUp],
    result,
    ...(used ? { choice: used.label(ctx) } : {}),
    ...(autoKeep ? { fav: true } : {}),
    ...(away ? { away: true } : {}),
  };
  state.diary.push(moment);
  trimDiary(state);
  return { moment, followUp, firstTime };
}

function trimDiary(state: VillageState): void {
  state.diary = trimMoments(state.diary);
}

/** Guarda (ou solta) um momento no Álbum: o que está guardado nunca sai, mesmo quando o Diário enche. */
export function setFavorite(state: VillageState, id: string, fav: boolean): boolean {
  const m = state.diary.find((x) => x.id === id);
  if (!m) return false;
  if (fav && !m.fav && state.diary.filter((x) => x.fav).length >= MAX_SAVED) return false;
  if (fav) m.fav = true;
  else delete m.fav;
  return true;
}

export const unreadCount = (state: VillageState): number => state.diary.filter((m) => m.t > state.diaryRead).length;

/** O Álbum: quantos modelos de momento você já viu. */
export function albumProgress(state: VillageState): { seen: number; total: number } {
  return { seen: state.seen.filter((id) => TEMPLATE_BY_ID.has(id)).length, total: TEMPLATE_COUNT };
}

// -------------------------------------------------------------------------------- fora da Vila

const AWAY_STEP_MS = 15 * 60_000;
export const MAX_AWAY_MOMENTS = 6;

/** Enquanto você esteve fora, os Pokémon continuaram vivendo: um momento a cada 15 minutos (até 6), sem decisões. */
export function catchUp(state: VillageState, actors: readonly Actor[], now: number, weather: string | null, rng: Rng, player = 'Treinador'): Moment[] {
  const out: Moment[] = [];
  if (state.lastSeen <= 0 || actors.length === 0) return out;
  const gone = now - state.lastSeen;
  const n = Math.min(MAX_AWAY_MOMENTS, Math.floor(gone / AWAY_STEP_MS));
  for (let k = 0; k < n; k++) {
    const t = state.lastSeen + (k + 1) * Math.min(AWAY_STEP_MS, gone / (n + 1)) + Math.floor(rng() * 60_000);
    const when = new Date(t);
    const day = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
    const scene = pickMoment(actors, state, makeEnv(state, day, when.getHours(), weather, player), rng);
    if (!scene) continue;
    out.push(resolveScene(state, scene, null, t, true).moment);
  }
  return out;
}

// -------------------------------------------------------------------------------- comentários

/** O que o Pokémon comenta ao conversar com você sobre o que viveu nas últimas 36 horas (ou `null`). */
export function recentGossip(state: VillageState, id: string, now: number): string | null {
  for (let i = state.diary.length - 1; i >= 0; i--) {
    const m = state.diary[i]!;
    if (now - m.t > 36 * 3_600_000) break;
    const who = m.cast.findIndex((c) => c.id === id);
    if (who < 0) continue;
    const tpl = TEMPLATE_BY_ID.get(m.tpl);
    const line = tpl?.after?.(
      m.cast.map((c) => c.name),
      who,
    );
    if (line) return line;
  }
  return null;
}

export interface Pair {
  a: { id: string; name: string };
  b: { id: string; name: string };
  rel: Relation;
  status: ReturnType<typeof relationStatus>;
}

/** O mapa de relações: os pares que já tiveram momentos juntos ou têm situação definida, dos mais intensos aos mais calmos. */
export function relationMap(state: VillageState, actors: readonly { id: string; name: string }[]): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i]!;
      const b = actors[j]!;
      const rel = state.rel[pairKey(a.id, b.id)];
      if (!rel || (rel.met === 0 && !rel.flag)) continue;
      out.push({ a, b, rel, status: relationStatus(rel) });
    }
  }
  const weight = (p: Pair): number => (p.rel.flag ? 200 : 0) + Math.abs(p.rel.bond) + p.rel.spark;
  return out.sort((x, y) => weight(y) - weight(x));
}

/** O que o Pokémon `id` é de cada colega (para as páginas do Livro). */
export function relationsOf(state: VillageState, id: string, others: readonly { id: string; name: string }[]): { name: string; status: ReturnType<typeof relationStatus>; met: number }[] {
  return others
    .filter((o) => o.id !== id)
    .map((o) => ({ name: o.name, status: relationStatus(state.rel[pairKey(id, o.id)]), met: state.rel[pairKey(id, o.id)]?.met ?? 0 }))
    .filter((r) => r.met > 0 || r.status.key !== 'conhecidos');
}

export interface AlbumEntry {
  id: string;
  kind: MomentKind;
  title: string;
  emoji: string;
  seen: boolean;
}

/** O Álbum de modelos: todos os momentos que existem, com o que você já viu (o resto fica escondido na tela). */
export function albumEntries(state: VillageState): AlbumEntry[] {
  const seen = new Set(state.seen);
  return TEMPLATES.map((t) => ({ id: t.id, kind: t.kind, title: t.title, emoji: t.emoji || MOMENT_EMOJI[t.kind], seen: seen.has(t.id) }));
}

/** Os momentos guardados no Álbum, do mais novo para o mais antigo. */
export const savedMoments = (state: VillageState): Moment[] => state.diary.filter((m) => m.fav).reverse();
