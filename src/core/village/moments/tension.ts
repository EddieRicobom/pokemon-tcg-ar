import { L, day, evening, friendsNow, is, night, rivals } from './kit';
import type { Template } from './kit';

/** Conflitos cotidianos: desacordos pequenos, consequências reais e espaço para o treinador intervir. */
export const TENSION_MOMENTS: readonly Template[] = [
  {
    id: 'tens-banco-reservado', kind: 'rivalidade', title: 'O banco reservado', emoji: '🪑', cast: 2, weight: 4,
    when: (c) => day(c) && (is(c, 0, 'Mandão', 'Tímido') || rivals(c)),
    lines: (c) => [L(0, `Eu deixei uma folha aqui. Isso significa que o banco é meu, ${c.n[1]}!`, 'anger'), L(1, 'A folha voou há três horas.', 'question'), L(0, 'Então eu reservo o vento também!', 'fire')],
    outcome: { bond: -5, spark: -2 },
    choice: {
      prompt: 'Os dois chegaram primeiro ao mesmo banco.',
      options: [
        { label: () => 'Dividir o banco', lines: () => [L(0, 'Cabe todo mundo quando ninguém empurra.', 'sparkle'), L(1, 'Tá. Mas eu fico com a sombra.', 'sweat')], outcome: { bond: 5, friend: 1 } },
        { label: (c) => `Dar o banco para ${c.n[0]}`, lines: () => [L(0, 'Vitória da folha!', 'star'), L(1, 'Eu vou achar outro. Bem longe.', 'sad')], outcome: { bond: -7, friendBy: [3, -2] } },
        { label: () => 'Deixar os dois decidirem', lines: () => [L(0, 'Então é uma disputa oficial!', 'fire'), L(1, 'Eu não acredito que isso funcionou.', 'sad')], outcome: { bond: -3, friend: -1 } },
      ],
    },
  },
  {
    id: 'tens-troca-desfeita', kind: 'drama', title: 'A troca desfeita', emoji: '🔄', cast: 2, weight: 4,
    when: (c) => day(c) && c.rel !== undefined && c.rel.bond < 35,
    lines: (c) => [L(0, `Eu troco minha fruta pela sua pedra, ${c.n[1]}.`, 'star'), L(1, 'Fechado!', 'sparkle'), L(0, 'Pensando bem... eu quero a fruta de volta.', 'shock'), L(1, 'Você não pode desfazer uma troca depois de comemorar!', 'anger')],
    outcome: { bond: -4, spark: -2 },
    choice: {
      prompt: 'Uma troca mal combinada azedou a conversa.',
      options: [
        { label: () => 'Respeitar a troca', lines: () => [L(0, 'Tá bom. Palavra dada.', 'sad'), L(1, 'A próxima troca vai ser por escrito.', 'sparkle')], outcome: { bond: 4, friend: 1 } },
        { label: () => 'Devolver tudo', lines: () => [L(1, 'Eu aceito... mas fiquei desconfiado.', 'sad'), L(0, 'Eu também vou ler as letras pequenas.', 'question')], outcome: { bond: 1, friend: 1 } },
        { label: () => 'Ficar do lado de ninguém', lines: () => [L(0, 'Então a gente resolve sozinho.', 'anger'), L(1, 'Sem problema. Grande problema.', 'sweat')], outcome: { bond: -5 } },
      ],
    },
  },
  {
    id: 'tens-barulho-madrugada', kind: 'rivalidade', title: 'Barulho na madrugada', emoji: '🌙', cast: 2, weight: 4,
    when: (c) => night(c) || evening(c),
    lines: (c) => [L(0, '(bate na porta) Quem está fazendo barulho?', 'anger'), L(1, `Eu estava só treinando uma música para ${c.n[0]}!`, 'note'), L(0, 'À meia-noite? O público está dormindo!', 'sad')],
    outcome: { bond: -4, spark: -3 },
    choice: {
      prompt: 'A música animou um Pokémon e acordou o outro.',
      options: [
        { label: () => 'Pedir silêncio', lines: () => [L(1, 'Tá bom... amanhã eu toco mais baixo.', 'sad')], outcome: { bond: 2, friend: 1 } },
        { label: () => 'Deixar tocar uma última', lines: () => [L(0, 'Uma só. E sem refrão.', 'sweat'), L(1, 'Esse é o melhor tipo de permissão!', 'star')], outcome: { bond: 5, friend: 1 } },
        { label: () => 'Mandar os dois dormir', lines: () => [L(0, 'Nem eu queria dormir ainda.', 'sad'), L(1, 'A Vila perdeu um show histórico.', 'anger')], outcome: { bond: -3, friend: -1 } },
      ],
    },
  },
  {
    id: 'tens-fila-encurtada', kind: 'rivalidade', title: 'A fila encurtada', emoji: '📮', cast: 2, weight: 4,
    when: (c) => c.env.town >= 2 && day(c),
    lines: (c) => [L(0, `Eu estava aqui antes, ${c.n[1]}.`, 'anger'), L(1, 'Você chegou depois de mim!', 'shock'), L(0, 'Cheguei antes no meu coração.', 'sweat')],
    outcome: { bond: -5, spark: -1 },
    choice: {
      prompt: 'A fila do Correio parou por causa de dois lugares disputados.',
      options: [
        { label: () => 'Organizar a fila', lines: () => [L(0, 'Justo.', 'sparkle'), L(1, 'Eu odeio quando a justiça funciona.', 'sad')], outcome: { bond: 3, friend: 1 } },
        { label: (c) => `Passar ${c.n[1]} na frente`, lines: () => [L(1, 'Obrigado!', 'star'), L(0, 'Eu vou lembrar disso.', 'anger')], outcome: { bond: -6, friendBy: [-2, 3] } },
        { label: () => 'Fechar o Correio por hoje', lines: () => [L(0, 'Problema resolvido por ausência de fila.', 'sweat'), L(1, 'Isso não foi resolver.', 'sad')], outcome: { bond: -2, friend: -1 } },
      ],
    },
  },
  {
    id: 'tens-pegadas-na-horta', kind: 'drama', title: 'Pegadas no canteiro', emoji: '👣', cast: 2, weight: 4,
    when: (c) => c.env.crops > 0 && day(c),
    lines: (c) => [L(0, 'Alguém passou pela horta e amassou minhas folhas!', 'anger'), L(1, `Eu só estava seguindo ${c.n[0]}...`, 'sad'), L(0, 'Seguir não significa pisar!', 'shock')],
    outcome: { bond: -6, spark: -2 },
    choice: {
      prompt: 'A horta ficou com uma trilha no meio.',
      options: [
        { label: () => 'Replantar juntos', lines: () => [L(1, 'Eu faço a parte mais difícil.', 'sad'), L(0, 'E eu ensino onde pisar.', 'sparkle')], outcome: { bond: 6, friend: 2 } },
        { label: () => 'Dar uma bronca', lines: () => [L(1, 'Eu já entendi!', 'anger'), L(0, 'Espero que sim.', 'sad')], outcome: { bond: -2, friendBy: [2, -1] } },
        { label: () => 'Deixar a trilha', lines: () => [L(0, 'Agora é um caminho oficial.', 'sweat'), L(1, 'Posso pisar só nele?', 'question')], outcome: { bond: 1 } },
      ],
    },
  },
  {
    id: 'tens-piada-pesada', kind: 'drama', title: 'A piada passou do ponto', emoji: '😬', cast: 2, weight: 4,
    when: (c) => is(c, 0, 'Brincalhão', 'Mandão', 'Guloso') && c.rel !== undefined,
    lines: (c) => [L(0, `Era só uma piada sobre ${c.n[1]}!`, 'laugh'), L(1, 'Eu não achei engraçado.', 'sad'), L(0, 'Mas todo mundo riu!', 'question')],
    outcome: { bond: -7, spark: -3 },
    choice: {
      prompt: 'A brincadeira deixou uma ferida de verdade.',
      options: [
        { label: () => 'Pedir desculpas', lines: () => [L(0, 'Foi mal. Eu devia ter parado.', 'sad'), L(1, 'Obrigado por reconhecer.', 'heart')], outcome: { bond: 7, friend: 2 } },
        { label: () => 'Fazer outra piada', lines: () => [L(1, 'Chega.', 'anger'), L(0, 'Tá, tá... chega.', 'sweat')], outcome: { bond: -10, friend: -1, flag: 'brigados' } },
        { label: () => 'Mudar de assunto', lines: () => [L(1, 'Eu ainda estou chateado.', 'sad'), L(0, 'Eu percebi.', 'question')], outcome: { bond: -2 } },
      ],
    },
  },
  {
    id: 'tens-objeto-quebrado', kind: 'drama', title: 'O objeto quebrado', emoji: '💥', cast: 2, weight: 3,
    when: (c) => c.env.town >= 1,
    lines: (c) => [L(0, 'Quem quebrou o enfeite?', 'shock'), L(1, `Foi um acidente. Eu estava ajudando ${c.n[0]}.`, 'sad'), L(0, 'Ajudar não era girar tão rápido!', 'anger')],
    outcome: { bond: -4, spark: -2 },
    choice: {
      prompt: 'O conserto vai exigir trabalho e confiança.',
      options: [
        { label: () => 'Consertar sem culpar', lines: () => [L(0, 'O importante é voltar a funcionar.', 'sparkle'), L(1, 'Eu vou ter mais cuidado.', 'heart')], outcome: { bond: 5, friend: 1 } },
        { label: () => 'Descobrir o culpado', lines: () => [L(1, 'Eu já falei que foi acidente!', 'anger'), L(0, 'Então prove ajudando a consertar.', 'fire')], outcome: { bond: -2, friend: -1 } },
        { label: () => 'Deixar para amanhã', lines: () => [L(0, 'Amanhã eu talvez esteja menos irritado.', 'sad')], outcome: { bond: -3 } },
      ],
    },
  },
  {
    id: 'tens-convite-esquecido', kind: 'drama', title: 'O convite esquecido', emoji: '💌', cast: 2, weight: 3,
    when: (c) => friendsNow(c),
    lines: (c) => [L(0, `Você convidou todo mundo, menos eu, ${c.n[1]}.`, 'sad'), L(1, 'Eu achei que você não queria ir.', 'sweat'), L(0, 'Você podia ter perguntado!', 'anger')],
    outcome: { bond: -6, spark: -2 },
    choice: {
      prompt: 'Uma amizade forte também pode sofrer com uma suposição.',
      options: [
        { label: () => 'Refazer o convite', lines: () => [L(1, 'Agora eu pergunto antes de imaginar.', 'heart')], outcome: { bond: 8, friend: 2 } },
        { label: () => 'Dizer que foi sem querer', lines: () => [L(0, 'Eu sei. Mas doeu mesmo assim.', 'sad')], outcome: { bond: 1 } },
        { label: () => 'Deixar a festa acontecer', lines: () => [L(0, 'Então eu fico em casa.', 'sad'), L(1, 'Eu estraguei tudo.', 'sad')], outcome: { bond: -8, friend: -1 } },
      ],
    },
  },
];
