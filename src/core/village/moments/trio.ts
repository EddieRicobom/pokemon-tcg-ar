import { L, calm, day, evening, is, night, pick, rainy, snowy } from './kit';
import type { Template } from './kit';

/** Momentos com três Pokémon: novela, tribunal, bandas, detetives, torneios e outras confusões coletivas. */
export const TRIO_MOMENTS: readonly Template[] = [
  {
    id: 'trio-novela', kind: 'comedia', title: 'A novela da Vila', emoji: '📺', cast: 3, weight: 5, when: (c) => c.has('televisao', 'sofa', 'poltrona') && evening(c),
    lines: (_c) => [
      L(0, 'Silêncio! Vai começar o capítulo!', 'fire'),
      L(1, '(na tela) "Eu sou o seu irmão gêmeo desaparecido!"', 'shock'),
      L(2, 'NÃO ACREDITO! Ele tinha um irmão?!', 'shock'),
      L(0, 'Ele sempre teve! Estava na terceira temporada!', 'anger'),
      L(2, 'Eu não vi a terceira temporada.', 'sad'),
      L(1, '(chora de emoção, comendo pipoca) ...Que reviravolta.', 'sad'),
    ],
    outcome: { bond: 5, bond02: 5, bond12: 5, spark: 1 },
  },
  {
    id: 'trio-tribunal', kind: 'comedia', title: 'O tribunal do biscoito', emoji: '⚖️', cast: 3, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [
      L(0, 'Ordem no tribunal! O réu é acusado de comer o último biscoito!', 'fire'),
      L(1, 'Eu estava no jardim! Tenho testemunhas!', 'shock'),
      L(2, 'Eu vi uma migalha na barriga dele, meritíssimo.', 'idea'),
      L(1, 'Isso é uma sujeira de nascença!', 'anger'),
      L(0, 'O juiz vai deliberar... Culpado! A pena é: dividir o próximo biscoito!', 'star'),
    ],
    outcome: { bond: 4, bond02: 4, bond12: 2, spark: 0 },
    choice: {
      prompt: 'O juiz ouve o treinador: qual a sentença?',
      options: [
        { label: () => 'Absolvição geral', lines: () => [L(1, 'JUSTIÇA!', 'star'), L(2, 'Eu voto para fazer outro biscoito.', 'laugh'), L(0, 'Caso encerrado, com migalhas.', 'laugh')], outcome: { bond: 6, bond02: 4, bond12: 6, friendBy: [1, 1, 1] } },
        { label: () => 'Culpado, mas com abraço', lines: () => [L(1, 'Aceito a pena!', 'sad'), L(0, '(abraça o réu) Eu perdoo.', 'heart'), L(2, 'Que tribunal estranho.', 'laugh')], outcome: { bond: 7, bond02: 5, bond12: 4, friendBy: [1, 2, 1] } },
        { label: () => 'Pagar um biscoito para todos', needs: { item: 'pao-mel', qty: 1 }, lines: () => [L(0, 'Pão de mel! O juiz aceita suborno!', 'laugh'), L(1, 'Está tudo certo!', 'star'), L(2, 'Corrupção deliciosa.', 'heart')], outcome: { bond: 8, bond02: 8, bond12: 8, friendBy: [2, 2, 2] } },
      ],
    },
  },
  {
    id: 'trio-amigo-secreto', kind: 'festa', title: 'Amigo secreto', emoji: '🎁', cast: 3, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [
      L(0, 'Cada um tirou um nome! Ninguém pode contar!', 'star'),
      L(1, 'Eu tirei... (cobre a boca) ...um que come muito.', 'laugh'),
      L(2, 'Eu também tirei um que come muito.', 'sweat'),
      L(0, 'Então a gente tirou os mesmos? Ou algum de nós come muito?', 'question'),
      L(1, '(os três se olham em silêncio, desconfiados)', 'sweat'),
      L(2, 'Presentes: três pedras embrulhadas. A gente se entendeu.', 'laugh'),
    ],
    outcome: (c) => ({ bond: 6, bond02: 6, bond12: 6, spark: 1, items: [[pick(c, ['pedra', 'flor', 'mel', 'concha'] as const), 1]] }),
  },
  {
    id: 'trio-banda', kind: 'festa', title: 'A banda da garagem', emoji: '🎸', cast: 3, weight: 5, when: (c) => c.has('violao', 'piano', 'caixa-som', 'radio') && (day(c) || evening(c)),
    lines: (_c) => [
      L(0, 'Nome da banda: "Os Três Pinguinhos Furiosos"!', 'fire'),
      L(1, 'Eu toco a bateria. (bate em duas panelas)', 'note'),
      L(2, 'Eu canto! (grita uma nota que só os cachorros ouvem)', 'note'),
      L(0, 'E eu faço a guitarra! (faz o som com a boca)', 'note'),
      L(1, 'Ficou horrível. Ficou ótimo!', 'laugh'),
      L(2, 'Primeiro show: amanhã, no quintal!', 'star'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1, coins: 8 },
    after: (n, who) => `Montamos uma banda com ${n.filter((_, i) => i !== who).join(' e ')}. Ainda estamos escolhendo o nome. O ensaio é o melhor da semana.`,
  },
  {
    id: 'trio-detetives', kind: 'comedia', title: 'Os três detetives', emoji: '🔍', cast: 3, weight: 5, when: (c) => day(c) && calm(c),
    lines: (_c) => [
      L(0, 'Crime na Vila! Alguém roubou a minha fruta preferida!', 'shock'),
      L(1, 'Pelas pegadas, o culpado tem quatro patas.', 'idea'),
      L(2, 'Todo mundo tem quatro patas!', 'anger'),
      L(1, 'E uma cauda. E pelos. E... (olha para a própria cauda) ...Eu?', 'sweat'),
      L(0, 'Era eu! Eu mesmo comi! Fui eu o ladrão!', 'shock'),
      L(2, 'Caso encerrado em tempo recorde.', 'laugh'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1 },
  },
  {
    id: 'trio-reality', kind: 'comedia', title: 'Reality show da Vila', emoji: '🎥', cast: 3, weight: 5, when: (c) => day(c),
    lines: (_c) => [
      L(0, '(fala para a câmera imaginária) Dia três. A situação está tensa. Ninguém lavou a louça.', 'sweat'),
      L(1, '(sussurra) A culpa é dele, mas eu não vou falar.', 'question'),
      L(2, '(aparece) Eu ouvi isso!', 'anger'),
      L(0, 'Emoção, confusão e muito suco derramado. Fique conosco.', 'star'),
      L(1, 'Quem vai ser eliminado hoje?', 'shock'),
      L(2, 'A louça.', 'laugh'),
    ],
    outcome: { bond: 4, bond02: 4, bond12: 4, spark: 1 },
  },
  {
    id: 'trio-torneio', kind: 'rivalidade', title: 'Torneio de corrida', emoji: '🏁', cast: 3, weight: 6, when: (c) => day(c) && calm(c),
    lines: (c) => {
      const w = Math.floor(c.rng() * 3);
      c.memo.w = w;
      return [
        L(0, 'A linha de chegada é a árvore torta. Preparar... apontar...', 'fire'),
        L(1, 'JÁ!', 'fire'),
        L(2, '(tropeça logo na largada)', 'shock'),
        L(w, '(chega primeiro, de braços para cima)', 'star'),
        L((w + 1) % 3, 'Foi por um segundo!', 'anger'),
        L((w + 2) % 3, 'Eu cheguei lanterna, mas com estilo.', 'sweat'),
      ];
    },
    outcome: (c) => ({ bond: 3, bond02: 3, bond12: 3, friendBy: [c.memo.w === 0 ? 3 : 0, c.memo.w === 1 ? 3 : 0, c.memo.w === 2 ? 3 : 0] }),
  },
  {
    id: 'trio-teatro', kind: 'festa', title: 'Peça de teatro', emoji: '🎭', cast: 3, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [
      L(0, 'Narrador: era uma vez um dragão, uma princesa e uma batata.', 'star'),
      L(1, 'Eu sou a princesa!', 'sparkle'),
      L(2, 'Eu sou a batata? Por que eu sou a batata?', 'sad'),
      L(0, 'Porque a batata é o papel mais difícil. Ela tem que ficar parada.', 'idea'),
      L(2, '(vira uma batata muito dramática, e rouba a cena)', 'star'),
      L(1, 'A plateia chora! A batata é a estrela!', 'laugh'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1, coins: 8 },
  },
  {
    id: 'trio-maratona-filmes', kind: 'amizade', title: 'Maratona de filmes', emoji: '🍿', cast: 3, weight: 5, when: (c) => c.has('televisao', 'computador') && evening(c),
    lines: (_c) => [
      L(0, 'Três filmes seguidos! Pipoca para todo mundo!', 'star'),
      L(1, 'Eu vou dormir no segundo.', 'zzz'),
      L(2, 'Eu já dormi no primeiro, mas finjo que assisti.', 'zzz'),
      L(0, '(na hora do final) Gente... acordem... é a melhor parte!', 'shock'),
      L(1, '(acorda com a pipoca no focinho) O quê? Quem morreu?', 'shock'),
      L(2, 'Ninguém. Mas eu adorei o final.', 'sweat'),
    ],
    outcome: (c) => ({ bond: 6, bond02: 6, bond12: 6, items: [['pipoca', 1]], spark: pick(c, [0, 1] as const) }),
  },
  {
    id: 'trio-culinaria', kind: 'amizade', title: 'Receita em equipe', emoji: '👩‍🍳', cast: 3, weight: 5, when: (c) => c.has('fogao', 'churrasqueira', 'fogueira', 'geladeira') && evening(c),
    lines: (_c) => [
      L(0, 'Eu corto! Você mexe! E você... não encosta em nada!', 'fire'),
      L(2, 'Eu também quero ajudar!', 'sad'),
      L(1, 'Então prova o sal. É um trabalho de confiança.', 'idea'),
      L(2, '(prova) Falta sal. (prova de novo) Agora tem demais. (prova) Perfeito!', 'sparkle'),
      L(0, 'Isso são três provadas. Já foi um quarto da sopa.', 'laugh'),
    ],
    outcome: (c) => ({ bond: 7, bond02: 7, bond12: 7, spark: 1, items: [[pick(c, ['sopa-abobora', 'ensopado', 'salada'] as const), 1]] }),
  },
  {
    id: 'trio-pula-corda', kind: 'amizade', title: 'Pula-corda', emoji: '🪢', cast: 3, weight: 4, when: (c) => day(c) && calm(c),
    lines: (_c) => [
      L(0, 'Eu e ele giramos, você pula!', 'star'),
      L(2, 'Um, dois, três... (tropeça no quatro)', 'shock'),
      L(1, 'De novo! A gente ganha quando passar de dez!', 'fire'),
      L(2, '...Onze! Onze! ONZE!', 'star'),
      L(0, '(a corda arrebenta, e os três caem rindo)', 'laugh'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1 },
  },
  {
    id: 'trio-fantasma', kind: 'comedia', title: 'O fantasma da casa', emoji: '👻', cast: 3, weight: 5, when: (c) => night(c),
    lines: (c) => [
      L(0, 'Gente... eu ouvi um barulho no sótão.', 'sweat'),
      L(1, 'Eu não ouvi nada. (está tremendo)', 'sweat'),
      L(2, '(cobre-se com um lençol) Buuuu!', 'laugh'),
      L(0, 'AAAAH! (corre para trás do ' + c.n[1] + ')', 'shock'),
      L(1, 'AAAAH! (corre para trás do ' + c.n[0] + ')', 'shock'),
      L(2, 'Era eu! Era brincadeira!', 'laugh'),
    ],
    outcome: { bond: 3, bond02: 8, bond12: 3, spark: 0 },
    after: (n, who) => `${n[(who + 2) % 3]} se fantasiou de fantasma e me deu o maior susto da minha vida. Estou furioso. Eu ri muito.`,
  },
  {
    id: 'trio-dado', kind: 'amizade', title: 'RPG de mesa', emoji: '🎲', cast: 3, weight: 4, when: (c) => c.has('mesa', 'mesinha') && (evening(c) || rainy(c)),
    lines: (_c) => [
      L(0, 'Narrador: vocês entram numa caverna escura. O que fazem?', 'star'),
      L(1, 'Eu acendo a tocha! Dado de percepção: três!', 'fire'),
      L(2, 'Eu entro primeiro! Dado de coragem: um.', 'sweat'),
      L(0, 'Você cai num buraco e é engolido por um Diglett gigante.', 'laugh'),
      L(2, 'Posso comprar uma vida nova?', 'sad'),
      L(1, 'Só pagando em biscoitos.', 'laugh'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1 },
  },
  {
    id: 'trio-mudanca', kind: 'amizade', title: 'Carregando a mudança', emoji: '📦', cast: 3, weight: 4, when: (c) => day(c) && c.has('estante', 'sofa', 'cama', 'bau', 'guarda-roupa'),
    lines: (c) => [
      L(0, 'Um, dois, três, levanta! Cuidado com o canto!', 'fire'),
      L(1, 'Mais para a esquerda... a esquerda! A MINHA esquerda!', 'anger'),
      L(2, '(preso embaixo do móvel) Alguém me ajuda?', 'sad'),
      L(0, 'O móvel entrou. O ' + c.n[2] + ' também. Mas de lado.', 'laugh'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 0 },
  },
  {
    id: 'trio-ciranda', kind: 'festa', title: 'Ciranda', emoji: '🌀', cast: 3, weight: 4, when: (c) => day(c) && calm(c),
    lines: (_c) => [
      L(0, 'Ciranda, cirandinha, vamos todos cirandar!', 'note'),
      L(1, 'Vamos dar a meia-volta, volta e meia vamos dar!', 'note'),
      L(2, '(gira rápido demais, e os três saem rolando pela grama)', 'shock'),
      L(0, 'Eu vi o céu dar três voltas!', 'laugh'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1 },
  },
  {
    id: 'trio-pirata', kind: 'comedia', title: 'Os piratas do lago', emoji: '🏴‍☠️', cast: 3, weight: 4, when: (c) => day(c) && calm(c) && c.has('laguinho', 'fonte', 'poco'),
    lines: (_c) => [
      L(0, 'Eu sou o capitão! Prepare o navio!', 'fire'),
      L(1, 'Navio? É uma caixa de madeira.', 'question'),
      L(2, 'É um navio muito pequeno, mas o oceano também é.', 'idea'),
      L(0, 'Avistei terra! Ah, é o outro lado da poça.', 'sweat'),
      L(1, '(cai na água) HOMEM AO MAR! Quer dizer, pirata ao mar!', 'shock'),
    ],
    outcome: (c) => ({ bond: 6, bond02: 6, bond12: 6, spark: 1, items: [[pick(c, ['concha', 'perola', 'ouro'] as const), 1]] }),
  },
  {
    id: 'trio-fotos', kind: 'amizade', title: 'Foto de grupo', emoji: '📸', cast: 3, weight: 5, when: (c) => day(c),
    lines: (c) => [
      L(0, 'Todo mundo junto! Sorriam!', 'star'),
      L(1, 'Estou piscando!', 'sweat'),
      L(2, 'Estou espirrando!', 'shock'),
      L(0, '(clique) Ficou ótimo. O ' + c.n[1] + ' tem três olhos.', 'laugh'),
      L(1, 'Eu pisquei. É só um defeito de fábrica.', 'laugh'),
      L(2, 'Quero emoldurar!', 'star'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1 },
  },
  {
    id: 'trio-neve-fort', kind: 'amizade', title: 'O forte de neve', emoji: '🏰', cast: 3, weight: 8, when: (c) => snowy(c),
    lines: (_c) => [
      L(0, 'Parede de neve aqui! Torre ali!', 'fire'),
      L(1, 'E uma bandeira no topo!', 'star'),
      L(2, 'Eu sou o guardião da porta (que não existe).', 'idea'),
      L(0, 'O forte ficou bonito. Quer ver se resiste a uma bola de neve?', 'laugh'),
      L(1, '(joga a bola; o forte desmorona sobre os três)', 'shock'),
    ],
    outcome: { bond: 7, bond02: 7, bond12: 7, spark: 1 },
  },
  {
    id: 'trio-fofoca-roda', kind: 'drama', title: 'Roda de fofoca', emoji: '🗣️', cast: 3, weight: 5, when: (c) => day(c) || evening(c),
    lines: (_c) => [
      L(0, 'Vocês souberam? Dizem que alguém está apaixonado na Vila.', 'idea'),
      L(1, 'Quem?! Fala!', 'shock'),
      L(2, 'Eu ouvi que ele tem pelos... e uma cauda...', 'question'),
      L(0, 'Isso reduz a lista a quase todos nós.', 'laugh'),
      L(1, '(todos se olham, desconfiados, sem falar nada)', 'sweat'),
    ],
    outcome: { bond: 3, bond02: 3, bond12: 3, spark: 1 },
    choice: {
      prompt: 'A roda de fofoca esquentou. O que você faz?',
      options: [
        { label: () => 'Alimentar a fofoca', lines: () => [L(0, 'Eu sabia que ele ia contar!', 'laugh'), L(1, 'Agora eu quero saber os detalhes!', 'star'), L(2, 'Eu vou anotar tudo.', 'idea')], outcome: { bond: 3, bond02: 3, bond12: 3, spark: 2 } },
        { label: () => 'Mudar de assunto', lines: () => [L(0, 'Tá bom, falamos de tempo.', 'sweat'), L(2, 'Hoje está um dia de sol, né?', 'sweat'), L(1, 'Lindo. Que sem graça.', 'laugh')], outcome: { bond: 5, bond02: 5, bond12: 5 } },
        { label: () => 'Contar uma fofoca falsa', lines: () => [L(1, 'MENTIRA?! Eu vou me vingar!', 'anger'), L(0, 'Você é o rei das mentiras!', 'laugh'), L(2, 'Eu vou desconfiar de tudo agora.', 'sweat')], outcome: { bond: -3, bond02: -3, bond12: -3 } },
      ],
    },
  },
  {
    id: 'trio-bolo-aniversario', kind: 'festa', title: 'Bolo de última hora', emoji: '🎂', cast: 3, weight: 4, when: (c) => day(c) && c.has('fogao', 'geladeira', 'mesa'),
    lines: (_c) => [
      L(0, 'O bolo! Cadê o bolo?!', 'shock'),
      L(1, 'Aqui! (levanta o prato: só há uma poça de massa)', 'sweat'),
      L(2, 'Estava crua. Alguém colocou no forno?', 'question'),
      L(0, 'Eu coloquei. Na geladeira.', 'sad'),
      L(1, 'Vamos fazer um bolo de colher. Existe, e é muito fino.', 'idea'),
    ],
    outcome: (c) => ({ bond: 6, bond02: 6, bond12: 6, items: [[pick(c, ['bolo-morango', 'torta-pecha'] as const), 1]] }),
  },
  {
    id: 'trio-cabra-cega', kind: 'amizade', title: 'Cabra-cega', emoji: '🙈', cast: 3, weight: 4, when: (c) => day(c) && calm(c),
    lines: (_c) => [
      L(0, '(de olhos vendados) Onde vocês estão?!', 'shock'),
      L(1, '(muda de lugar, de mansinho) Aqui!', 'laugh'),
      L(2, '(joga uma pedrinha para o lado oposto) Ali!', 'laugh'),
      L(0, '(bate em uma árvore) Achei! Peguei você! ...Isso é uma árvore.', 'sweat'),
    ],
    outcome: { bond: 6, bond02: 6, bond12: 6, spark: 1 },
  },
  {
    id: 'trio-caca-tesouro', kind: 'amizade', title: 'Caça ao tesouro', emoji: '🗺️', cast: 3, weight: 5, when: (c) => day(c) && calm(c) && (is(c, 0, 'Curioso', 'Corajoso') || is(c, 1, 'Curioso', 'Corajoso') || is(c, 2, 'Curioso', 'Corajoso')),
    lines: (_c) => [
      L(0, 'Pista um: "Onde o rio encontra a pedra".', 'idea'),
      L(1, 'É na pedra grande!', 'star'),
      L(2, 'Pista dois: "Debaixo da sombra do carvalho".', 'idea'),
      L(0, 'Escavamos... um baú! Está cheio de... ' + 'moedinhas de chocolate!', 'shock'),
      L(1, 'Moedinhas de chocolate. O tesouro é de comer!', 'laugh'),
    ],
    outcome: (c) => ({ bond: 7, bond02: 7, bond12: 7, spark: 1, coins: 12, items: [[pick(c, ['ouro', 'cristal', 'estrela'] as const), 1]] }),
  },
  {
    id: 'trio-briga-de-trio', kind: 'drama', title: 'Dois contra um', emoji: '⚔️', cast: 3, weight: 5, when: (c) => day(c) && (is(c, 0, 'Mandão', 'Corajoso') || is(c, 2, 'Mandão', 'Corajoso')),
    lines: (_c) => [
      L(0, 'A gente combinou que o jogo era por rodízio!', 'anger'),
      L(2, 'Eu concordo! Você sempre começa!', 'anger'),
      L(1, 'Calma, gente, é só um jogo...', 'sweat'),
      L(0, 'Dois contra um não vale!', 'anger'),
      L(2, 'Vale, sim!', 'anger'),
    ],
    outcome: { bond: -3, bond02: -3, bond12: -2 },
    choice: {
      prompt: 'Dois contra um. Quem você apoia?',
      options: [
        { label: () => 'Mediar com calma', lines: () => [L(1, 'Pronto, vamos sortear a ordem.', 'idea'), L(0, 'Ok, aceito.', 'sweat'), L(2, 'Sorteio justo, então.', 'sweat')], outcome: { bond: 6, bond02: 6, bond12: 6 } },
        { label: () => 'Apoiar os dois que reclamam', lines: () => [L(0, 'Isso! Respeito!', 'star'), L(2, 'Mais um voto para a justiça!', 'star'), L(1, 'Ninguém gosta de mim...', 'sad')], outcome: { bond: -4, bond02: 6, bond12: -4, friendBy: [2, -1, 2] } },
        { label: () => 'Apoiar o sozinho', lines: () => [L(1, 'Pelo menos tenho um aliado!', 'sparkle'), L(0, 'Traição!', 'anger'), L(2, 'A balança virou.', 'sweat')], outcome: { bond: 2, bond02: -4, bond12: 2, friendBy: [-1, 3, -1] } },
      ],
    },
  },
  {
    id: 'trio-luzes', kind: 'festa', title: 'Luzes de São João', emoji: '🎆', cast: 3, weight: 4, when: (c) => night(c) && calm(c) && c.has('pisca-pisca', 'lanterna', 'fogueira', 'tocha'),
    lines: (_c) => [
      L(0, 'Olha para cima! Estão acendendo as luzes!', 'star'),
      L(1, 'É tão bonito. Parece que tem estrelas no chão.', 'sparkle'),
      L(2, 'Eu quero pedir um desejo.', 'heart'),
      L(0, 'Peça baixinho; a luz tem ouvido.', 'idea'),
      L(1, '(os três fecham os olhos, com um desejo diferente cada um)', 'sparkle'),
    ],
    outcome: { bond: 7, bond02: 7, bond12: 7, spark: 2 },
  },
];
