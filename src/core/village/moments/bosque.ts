import { L, calm, coupled, day, evening, friendsNow, is, night, other, rainy, rivals, snowy } from './kit';
import type { Template } from './kit';

/** O bosque, as trilhas de terra e a pedreira (mapa grande): exploração, cogumelos, ecos, pinheiros e cristais. */
export const BOSQUE_MOMENTS: readonly Template[] = [
  {
    id: 'bos-trilha-nova', kind: 'amizade', title: 'Uma trilha nova', emoji: '🥾', cast: 2, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}, tem uma trilha nova saindo da rua! Aonde será que dá?`, 'question'), L(1, 'Só tem um jeito de descobrir. Mochila, lanche e coragem.', 'fire'), L(0, '(seguem a trilha de terra até uma clareira cheia de flores)', 'sparkle'), L(1, 'Valeu cada passo. E cada pedrinha no sapato.', 'heart')],
    outcome: { bond: 6, items: [['flor', 1]] },
    after: (n, who) => `Eu e ${other(n, who)} seguimos uma trilha até uma clareira secreta. Não conta para ninguém.`,
  },
  {
    id: 'bos-cogumelos', kind: 'solo', title: 'Caça aos cogumelos', emoji: '🍄', cast: 1, weight: 5, when: (c) => day(c) || rainy(c),
    lines: () => [L(0, '(agacha embaixo dos pinheiros e encontra um cogumelo gordinho)', 'shock'), L(0, 'Esse é dos bons. Esse eu conheço. Esse dá sopa.', 'idea'), L(0, '(aquele outro, vermelho de bolinha, eu deixo quieto)', 'sweat')],
    outcome: { items: [['champignon', 1]] },
  },
  {
    id: 'bos-eco', kind: 'comedia', title: 'O eco da pedreira', emoji: '🗣️', cast: 2, weight: 5,
    lines: (c) => [L(0, 'OLÁÁÁ!', 'note'), L(1, '(eco: olááá... olááá... oláá...)', 'question'), L(0, `${(c.n[1] ?? "o colega").toUpperCase()} COME BISCOITO ESCONDIDO!`, 'laugh'), L(1, '(eco: ...escondido... escondido...) Isso é calúnia! Ecoada!', 'anger')],
    outcome: { bond: 3 },
  },
  {
    id: 'bos-cristal', kind: 'amizade', title: 'O cristal na pedra', emoji: '💎', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Olha! Tem alguma coisa brilhando dentro dessa pedra!', 'shock'), L(1, 'É um cristal! Cuidado, bate devagar.', 'idea'), L(0, '(toc, toc, toc... e o cristal sai inteiro, azul e frio)', 'sparkle'), L(1, `${c.n[0]}, dá para o treinador. Ele vai guardar no museu.`, 'heart')],
    outcome: { bond: 5, items: [['cristal', 1]] },
  },
  {
    id: 'bos-perdidos', kind: 'drama', title: 'Perdidos no bosque', emoji: '🧭', cast: 2, weight: 4, when: (c) => evening(c) || night(c),
    lines: (c) => [L(0, 'A gente já passou por esse pinheiro. Três vezes.', 'sweat'), L(1, 'Todo pinheiro é igual! Isso é uma conspiração dos pinheiros!', 'shock'), L(0, `${c.n[1]}, olha: dá para ver a luz dos postes da Vila por ali.`, 'idea'), L(1, '(correm na direção da luz e saem bem na frente de casa)', 'heart')],
    outcome: { bond: 7 },
  },
  {
    id: 'bos-pinha', kind: 'comedia', title: 'Chuva de pinhas', emoji: '🌲', cast: 1, weight: 4, when: (c) => day(c) && calm(c),
    lines: () => [L(0, '(passa embaixo de um pinheiro bem na hora que cai uma pinha) AI!', 'shock'), L(0, '(cai outra) AI! (e outra) AI!', 'anger'), L(0, 'Tá bom, pinheiro. Eu entendi. Vou passar por outro lado.', 'sweat')],
    outcome: { items: [['madeira', 1]] },
  },
  {
    id: 'bos-acampamento', kind: 'festa', title: 'Acampamento no bosque', emoji: '⛺', cast: 3, weight: 5, when: (c) => (evening(c) || night(c)) && calm(c),
    lines: (c) => [L(0, 'Barraca montada, fogueira acesa, marshmallow no palito!', 'fire'), L(1, 'Eu conto uma história de assombração.', 'idea'), L(2, `Por favor, ${c.n[1]}, uma que termine bem.`, 'sweat'), L(1, '(conta a história de um fantasma que só queria um abraço)', 'heart')],
    outcome: { bond: 5, bond02: 5, bond12: 5, friend: 1 },
  },
  {
    id: 'bos-barulho-mato', kind: 'drama', title: 'Barulho no mato', emoji: '👀', cast: 2, weight: 4, when: (c) => evening(c) || night(c),
    lines: (c) => [L(0, '(crec, crec) Você ouviu isso?', 'shock'), L(1, 'Ouvi. Fica atrás de mim. Não, fica na frente. Não, do lado.', 'sweat'), L(0, '(do mato sai um Pokémon selvagem pequenininho, piscando)', 'question'), L(1, `${c.n[0]}... ele estava com mais medo que a gente.`, 'laugh')],
    outcome: { bond: 6 },
  },
  {
    id: 'bos-arvore-oca', kind: 'solo', title: 'A árvore oca', emoji: '🕳️', cast: 1, weight: 4, when: (c) => is(c, 0, 'Curioso', 'Corajoso', 'Brincalhão'),
    lines: () => [L(0, 'Tem uma árvore oca no bosque. Dá para entrar dentro!', 'shock'), L(0, '(entra) É escuro, cheira a terra molhada e tem um eco abafado.', 'question'), L(0, 'Vou fazer disso a minha base secreta. Senha: biscoito.', 'star')],
    outcome: {},
  },
  {
    id: 'bos-musgo', kind: 'solo', title: 'O tapete de musgo', emoji: '🟩', cast: 1, weight: 4, when: (c) => rainy(c) || (day(c) && is(c, 0, 'Calmo', 'Sonhador')),
    lines: () => [L(0, '(pisa num tapete de musgo macio) Ohhh. É um colchão de floresta.', 'sparkle'), L(0, '(deita em cima e ouve as gotas caindo das folhas)', 'zzz'), L(0, 'Se eu dormir aqui, alguém me acha? (dorme)', 'zzz')],
    outcome: { friend: 1 },
  },
  {
    id: 'bos-pedreira-escalada', kind: 'rivalidade', title: 'Escalada na pedreira', emoji: '🧗', cast: 2, weight: 4, when: (c) => day(c) && calm(c),
    lines: (c) => {
      const v = c.rng() < 0.5 ? 0 : 1;
      c.memo.v = v;
      return [L(0, 'Quem subir na pedra grande primeiro escolhe o lanche!', 'fire'), L(1, 'Escolho bolo. Já estou escolhendo antes de ganhar.', 'fire'), L(v, '(chega lá em cima, ofegante) A vista daqui é... vale o bolo!', 'star'), L(v === 0 ? 1 : 0, `Tá bom, ${c.n[v]}. Mas eu escolho o sabor.`, 'sweat')];
    },
    outcome: { bond: 3, spark: 1, items: [['pedra', 1]] },
  },
  {
    id: 'bos-fossil', kind: 'amizade', title: 'Um fóssil?', emoji: '🦴', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}! Essa pedra tem a forma de uma concha antiga!`, 'shock'), L(1, 'Pode ser um fóssil! De milhões de anos!', 'sparkle'), L(0, 'Vamos levar para o Museu! O treinador vai ficar orgulhoso!', 'star'), L(1, '(carregam a pedra juntos, devagarinho, como um tesouro)', 'heart')],
    outcome: { bond: 5, friend: 1, items: [['pedra', 1]] },
  },
  {
    id: 'bos-rastro', kind: 'amizade', title: 'Seguindo pegadas', emoji: '🐾', cast: 2, weight: 4, when: (c) => day(c) || snowy(c),
    lines: (c) => [L(0, 'Pegadas! Pequenas, depois grandes, depois pequenas de novo!', 'question'), L(1, 'Vamos seguir! Pode ser um Pokémon raro!', 'star'), L(0, '(seguem as pegadas em círculo e voltam para o mesmo lugar)', 'sweat'), L(1, `${c.n[0]}... são as nossas pegadas.`, 'laugh')],
    outcome: { bond: 4 },
  },
  {
    id: 'bos-pinheiro-natal', kind: 'solo', title: 'O pinheiro mais bonito', emoji: '🎄', cast: 1, weight: 4, when: (c) => snowy(c) || c.date.m === 12,
    lines: () => [L(0, 'Esse pinheiro está todo coberto de neve. Parece enfeitado.', 'sparkle'), L(0, 'Se eu pendurar umas pinhas e umas frutinhas, vira árvore de festa.', 'idea'), L(0, '(pendura uma frutinha) Pronto. Começou o enfeite. Faltam mil.', 'laugh')],
    outcome: {},
  },
  {
    id: 'bos-casal-trilha', kind: 'romance', title: 'Mãos dadas na trilha', emoji: '🤝', cast: 2, weight: 4, when: (c) => coupled(c) && (day(c) || evening(c)),
    lines: (c) => [L(0, 'A trilha fica estreita aqui. Me dá a mão?', 'heart'), L(1, 'Pela trilha ou porque você quer?', 'question'), L(0, `Pelos dois, ${c.n[1]}.`, 'heart'), L(1, '(seguem de mãos dadas até muito depois da trilha alargar)', 'heart')],
    outcome: { bond: 4, spark: 4 },
  },
  {
    id: 'bos-chuva-abrigo', kind: 'amizade', title: 'Abrigo da chuva', emoji: '🌧️', cast: 2, weight: 4, when: (c) => rainy(c),
    lines: (c) => [L(0, 'A chuva pegou a gente no meio do bosque!', 'shock'), L(1, 'Debaixo da pedra grande! Corre!', 'fire'), L(0, '(espremidos debaixo da pedra, ouvindo a chuva)', 'heart'), L(1, `Sabe, ${c.n[0]}? Até que é aconchegante ficar preso aqui com você.`, 'sparkle')],
    outcome: { bond: 6, spark: 1 },
  },
  {
    id: 'bos-pica-pau', kind: 'comedia', title: 'O pica-pau', emoji: '🐦', cast: 1, weight: 4, when: (c) => day(c),
    lines: () => [L(0, '(toc-toc-toc-toc) Quem está batendo?', 'question'), L(0, '(procura a porta, olha em volta, ninguém)', 'sweat'), L(0, '(lá em cima, um pica-pau) Ah. Pode entrar, então.', 'laugh')],
    outcome: {},
  },
  {
    id: 'bos-mapa-tesouro', kind: 'festa', title: 'Mapa do tesouro', emoji: '🗺️', cast: 3, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Desenhei um mapa do tesouro! O X fica perto da pedreira.', 'star'), L(1, 'Quem enterrou o tesouro?', 'question'), L(0, 'Eu. Ontem. Mas eu esqueci onde.', 'sweat'), L(2, `(cava) Achei! ${c.n[0]}, é... a sua meia?`, 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4, coins: 10 },
  },
  {
    id: 'bos-pedra-equilibrio', kind: 'solo', title: 'Torre de pedrinhas', emoji: '🗿', cast: 1, weight: 4, when: (c) => calm(c) && is(c, 0, 'Calmo', 'Sonhador', 'Tímido'),
    lines: () => [L(0, '(empilha pedrinhas com cuidado, uma em cima da outra)', 'zzz'), L(0, 'Uma... duas... sete... nove...', 'sparkle'), L(0, '(a torre fica de pé) Ninguém respira perto dela, por favor.', 'shock')],
    outcome: { friend: 1 },
  },
  {
    id: 'bos-ninho', kind: 'amizade', title: 'O ninho caído', emoji: '🪺', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Um ninho caiu da árvore! Os filhotinhos estão piando!', 'sad'), L(1, 'Calma, calma. Eu seguro, você sobe e devolve.', 'idea'), L(0, '(devolve o ninho ao galho com todo o cuidado do mundo)', 'heart'), L(1, `A mãe passarinho voltou, ${c.n[0]}. Ela fez um barulhinho de obrigado.`, 'sparkle')],
    outcome: { bond: 7, friend: 1, items: [['pena', 1]] },
  },
  {
    id: 'bos-ruido-noite', kind: 'solo', title: 'O bosque à noite', emoji: '🦉', cast: 1, weight: 4, when: (c) => night(c),
    lines: () => [L(0, '(o bosque de noite tem sons que de dia não tem)', 'question'), L(0, 'Uma coruja. Um grilo. O vento. Meu coração batendo rápido.', 'sweat'), L(0, 'Vou voltar para a rua iluminada. Com calma. Correndo com calma.', 'laugh')],
    outcome: {},
  },
  {
    id: 'bos-trio-expedicao', kind: 'amizade', title: 'A grande expedição', emoji: '🎒', cast: 3, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Expedição até o fim da trilha! Eu sou o capitão!', 'fire'), L(1, 'Eu levo o mapa.', 'idea'), L(2, 'Eu levo o lanche. E o segundo lanche. E o lanche de emergência.', 'heart'), L(0, `A expedição durou vinte minutos. ${c.n[2]} comeu todos os lanches.`, 'laugh')],
    outcome: { bond: 4, bond02: 4, bond12: 4 },
  },
  {
    id: 'bos-briga-atalho', kind: 'rivalidade', title: 'O atalho', emoji: '↗️', cast: 2, weight: 4, when: (c) => rivals(c) || is(c, 0, 'Mandão', 'Corajoso'),
    lines: (c) => [L(0, 'Eu conheço um atalho. É por aqui.', 'fire'), L(1, 'A trilha é por ali. Atalho é como a gente se perde.', 'anger'), L(0, '(meia hora depois, os dois estão no meio do mato, cheios de carrapicho)', 'sweat'), L(1, `Belo atalho, ${c.n[0]}.`, 'anger')],
    outcome: { bond: -1, spark: 1 },
  },
  {
    id: 'bos-frutinhas', kind: 'amizade', title: 'Frutinhas silvestres', emoji: '🫐', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Achei um arbusto cheio de frutinhas na beira da trilha!', 'star'), L(1, 'Uma para a cesta, uma para a boca. Você já sabe a regra.', 'laugh'), L(0, `${c.n[1]}, sua boca está toda roxa.`, 'question'), L(1, 'A sua também. É o batom da floresta.', 'heart')],
    outcome: { bond: 5, items: [['oran', 1]] },
  },
  {
    id: 'bos-pedra-rolando', kind: 'comedia', title: 'A pedra que rolou', emoji: '🪨', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, '(chuta uma pedrinha, que rola, bate numa maior, que rola também)', 'shock'), L(1, 'Ela está vindo! Ela está vindo!', 'shock'), L(0, '(os dois pulam para o lado; a pedra para sozinha num buraco)', 'sweat'), L(1, `${c.n[0]}, a gente vai fingir que isso nunca aconteceu.`, 'laugh')],
    outcome: { bond: 3 },
  },
  {
    id: 'bos-musica-folhas', kind: 'solo', title: 'A música das folhas', emoji: '🍃', cast: 1, weight: 4, when: (c) => calm(c) && c.env.weather !== 'neve',
    lines: () => [L(0, '(fecha os olhos no meio dos pinheiros)', 'zzz'), L(0, 'As folhas fazem shhhh. O vento faz uuuu. Um passarinho faz piu.', 'note'), L(0, 'É uma orquestra. E eu sou a plateia.', 'heart')],
    outcome: { friend: 1 },
  },
  {
    id: 'bos-flor-rara', kind: 'drama', title: 'A flor rara', emoji: '🌸', cast: 2, weight: 4, when: (c) => day(c),
    lines: (c) => [L(0, 'Achei uma flor que eu nunca vi. Só tem uma.', 'sparkle'), L(1, 'Vai colher?', 'question'), L(0, `Se eu colher, não tem mais nenhuma. ${c.n[1]}, eu vou deixar ela aqui.`, 'heart'), L(1, 'A gente volta todo dia para visitar. Ela vai ser nossa amiga.', 'heart')],
    outcome: { bond: 6, friend: 1 },
  },
  {
    id: 'bos-ouro-pedreira', kind: 'amizade', title: 'Pepita na pedreira', emoji: '🪙', cast: 2, weight: 3, when: (c) => day(c),
    lines: (c) => [L(0, '(algo dourado no meio do cascalho) Isso é... ouro?', 'shock'), L(1, 'Ou uma tampinha muito bonita.', 'question'), L(0, '(morde de leve) É ouro! Eu acho! Tem gosto de ouro!', 'star'), L(1, `${c.n[0]}, ninguém sabe qual é o gosto de ouro.`, 'laugh')],
    outcome: { bond: 4, items: [['ouro', 1]] },
  },
  {
    id: 'bos-pinheiro-grande', kind: 'solo', title: 'Abraçar um pinheiro', emoji: '🫂', cast: 1, weight: 4, when: (c) => day(c) && is(c, 0, 'Sonhador', 'Calmo', 'Tímido'),
    lines: () => [L(0, '(abraça o tronco de um pinheiro bem alto)', 'heart'), L(0, 'Dizem que árvore abraçada cresce mais feliz.', 'sparkle'), L(0, '(fica grudado de resina) ...e mais grudenta também.', 'sweat')],
    outcome: {},
  },
  {
    id: 'bos-neve-trilha', kind: 'amizade', title: 'Trilha de neve', emoji: '❄️', cast: 2, weight: 4, when: (c) => snowy(c),
    lines: (c) => [L(0, 'A trilha sumiu embaixo da neve!', 'shock'), L(1, 'Então a gente faz uma nova. A primeira pegada é sua.', 'heart'), L(0, '(afunda até a cintura) ...a primeira pegada é bem funda.', 'sweat'), L(1, `Eu te puxo, ${c.n[0]}. Um, dois... (os dois caem rindo na neve)`, 'laugh')],
    outcome: { bond: 6 },
  },
  {
    id: 'bos-mel-colmeia', kind: 'drama', title: 'A colmeia', emoji: '🐝', cast: 2, weight: 4, when: (c) => day(c) && is(c, 0, 'Guloso', 'Curioso', 'Brincalhão'),
    lines: (c) => [L(0, 'Uma colmeia! Cheia de mel! Só um pouquinho...', 'heart'), L(1, `${c.n[0]}, não! As abelhas...`, 'shock'), L(0, '(zzzzzz) CORREEEE!', 'shock'), L(1, '(os dois se jogam no lago) ...valeu a pena? (lambe o dedo) ...valeu.', 'laugh')],
    outcome: { bond: 4, items: [['mel', 1]] },
  },
  {
    id: 'bos-sinal-fumaca', kind: 'comedia', title: 'Sinal de fumaça', emoji: '💨', cast: 2, weight: 3, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Se a gente se perder, faz sinal de fumaça! Eu treinei!', 'idea'), L(1, '(o sinal de fumaça sai em forma de nuvem torta)', 'question'), L(0, `Isso quer dizer "estou com fome", ${c.n[1]}.`, 'laugh'), L(1, 'Todos os seus sinais dizem isso.', 'sweat')],
    outcome: { bond: 3 },
  },
  {
    id: 'bos-casal-nomes', kind: 'romance', title: 'Nomes na casca', emoji: '💘', cast: 2, weight: 3, when: (c) => coupled(c) && day(c),
    lines: (c) => [L(0, 'Será que essa árvore deixa a gente escrever os nossos nomes?', 'question'), L(1, 'Pergunta para ela.', 'laugh'), L(0, `(encosta a cabeça no tronco) ...ela disse que sim, se for bem pequeno. ${c.n[0]} e ${c.n[1]}.`, 'heart'), L(1, 'Pequeno e para sempre. Do jeitinho que eu gosto.', 'heart')],
    outcome: { bond: 4, spark: 5 },
    keep: true,
  },
  {
    id: 'bos-amizade-firme', kind: 'amizade', title: 'Ponte de tronco', emoji: '🌉', cast: 2, weight: 4, when: (c) => friendsNow(c) && day(c),
    lines: (c) => [L(0, 'Tem um tronco caído atravessando o riacho. Dá para passar.', 'idea'), L(1, 'Eu vou na frente. Segura no meu ombro.', 'fire'), L(0, '(atravessam devagar, balançando, sem soltar um do outro)', 'sweat'), L(1, `Chegamos, ${c.n[0]}. Sem molhar nem um pé. Que time.`, 'star')],
    outcome: { bond: 6 },
  },
  {
    id: 'bos-pedra-desenho', kind: 'solo', title: 'Pintando pedras', emoji: '🎨', cast: 1, weight: 4, when: (c) => day(c) && !rainy(c),
    lines: () => [L(0, 'Peguei pedras lisas na pedreira para pintar carinhas.', 'idea'), L(0, '(uma feliz, uma brava, uma dormindo, uma que ficou parecendo o treinador)', 'laugh'), L(0, 'Vou espalhar pela Vila. Quem achar ganha um sorriso de pedra.', 'heart')],
    outcome: { items: [['pedra', 1]] },
  },
];
