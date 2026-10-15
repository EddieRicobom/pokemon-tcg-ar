import { L, calm, coupled, day, evening, night, other, pick, rainy, snowy } from './kit';
import type { Ctx, Template } from './kit';

/** Quem está caidinho (faísca) mas ainda não é casal. */
const crush = (c: Ctx): boolean => !!c.rel && c.rel.flag === null && c.rel.spark >= 15 && c.rel.bond > -5;

/** Romance e vida de casal. Os marcos (pedido, casamento, término) ficam em `social.ts` e vão direto para o Álbum. */
export const ROMANCE_MOMENTS: readonly Template[] = [
  // ---------------------------------------------------------------------------- paquera
  {
    id: 'rom-bilhete', kind: 'romance', title: 'O bilhete anônimo', emoji: '✉️', cast: 2, weight: 5, when: (c) => crush(c) && day(c),
    lines: (c) => [
      L(0, `(deixa um bilhete na porta do ${c.n[1]} e corre para trás da árvore)`, 'heart'),
      L(1, '"Você tem o sorriso mais bonito do campo." Quem escreveu isso?!', 'shock'),
      L(1, 'A letra está tremida. E cheira a fruta.', 'question'),
      L(0, '(do esconderijo, com a respiração presa) ...', 'sweat'),
      L(1, '(olha de relance para a árvore, sorri, finge não ter visto nada)', 'sparkle'),
    ],
    outcome: { bond: 5, spark: 8 },
    after: (n, who) => (who === 0 ? 'Eu deixei um bilhete. Acho que ele descobriu. Eu vou me mudar para a Lua.' : `Recebi um bilhete anônimo. Eu sei muito bem quem foi, ${other(n, who)}.`),
  },
  {
    id: 'rom-estrelas', kind: 'romance', title: 'Contando estrelas', emoji: '🌠', cast: 2, weight: 6, when: (c) => crush(c) && night(c) && calm(c),
    lines: (c) => [
      L(0, `${c.n[1]}, olha aquela ali! Parece um sorvete!`, 'star'),
      L(1, 'Aquela? Eu achei que fosse um peixe.', 'laugh'),
      L(0, 'Você vê peixe em tudo.', 'laugh'),
      L(1, 'E você vê sorvete. A gente combina: um aquário-sorveteria.', 'sparkle'),
      L(0, '(deita mais perto; os ombros quase se tocam)', 'heart'),
    ],
    outcome: { bond: 6, spark: 9 },
  },
  {
    id: 'rom-guarda-chuva', kind: 'romance', title: 'Um guarda-chuva para dois', emoji: '☂️', cast: 2, weight: 8, when: (c) => crush(c) && rainy(c),
    lines: (_c) => [
      L(0, '(abre uma folha enorme sobre a cabeça) Quer abrigo?', 'sparkle'),
      L(1, 'Obrigado! (entra, e a folha cobre os dois por pouco)', 'heart'),
      L(0, 'Um lado está molhando. Chega mais perto.', 'sweat'),
      L(1, 'Assim?', 'sweat'),
      L(0, 'Assim. (o coração dispara; a chuva fica mais bonita)', 'heart'),
    ],
    outcome: { bond: 6, spark: 10 },
    after: (n, who) => `Dividi uma folha-guarda-chuva com ${other(n, who)}. Eu fiquei molhado de um lado. Valeu cada gota.`,
  },
  {
    id: 'rom-presente', kind: 'romance', title: 'Um presente com carinho', emoji: '🎀', cast: 2, weight: 5, when: (c) => crush(c) && day(c),
    lines: (c) => [
      L(0, `${c.n[1]}... eu achei isto e pensei em você.`, 'sweat'),
      L(1, '(abre o embrulho: uma pedrinha em forma de coração) Para mim?', 'shock'),
      L(0, 'Se não gostar, é só uma pedra. Eu levo de volta.', 'sweat'),
      L(1, 'Eu vou guardar até a pedra virar poeira.', 'heart'),
    ],
    outcome: { bond: 6, spark: 9, items: [['pedra', 1]] },
  },
  {
    id: 'rom-ciumento-bobo', kind: 'drama', title: 'Ciúme à toa', emoji: '😒', cast: 2, weight: 5, when: (c) => crush(c) || coupled(c),
    lines: (c) => [
      L(0, `${c.n[1]}, quem era aquele Pokémon com quem você estava conversando?`, 'anger'),
      L(1, 'O carteiro. Entregava uma carta.', 'question'),
      L(0, 'Ele ria muito. Ninguém ri tanto de carta.', 'anger'),
      L(1, 'Ele ri de tudo. Você devia ver quando ele espirra.', 'laugh'),
      L(0, '...Tá bom. Eu exagerei um pouquinho.', 'sweat'),
    ],
    outcome: { bond: 2, spark: 3 },
  },
  {
    id: 'rom-dancinha', kind: 'romance', title: 'Uma dança só', emoji: '💃', cast: 2, weight: 5, when: (c) => crush(c) && c.has('radio', 'caixa-som', 'bola-disco', 'piano') && evening(c),
    lines: (c) => [
      L(0, '(a música começa lenta)', 'note'),
      L(0, `${c.n[1]}, quer dançar? Eu piso nos pés. Mas só de leve.`, 'sweat'),
      L(1, 'Eu aceito o risco.', 'sparkle'),
      L(1, '(giram devagar, os pés se atrapalhando, ninguém se importa)', 'heart'),
    ],
    outcome: { bond: 7, spark: 12 },
  },
  {
    id: 'rom-pensando', kind: 'romance', title: 'No mundo da lua', emoji: '💭', cast: 2, weight: 4, when: (c) => !!c.rel && c.rel.spark >= 25 && c.rel.flag !== 'brigados' && day(c),
    lines: (c) => [
      L(0, `(olha para o ${c.n[1]} de longe, sorrindo sem perceber)`, 'heart'),
      L(0, 'O que eu ia fazer mesmo? Ah, regar. Não... lanchar. Não...', 'question'),
      L(0, '(bate a testa na árvore, sem perceber) Aaai. Tudo bem. Está tudo bem.', 'sweat'),
      L(1, '(vendo a cena, esconde o riso com a pata)', 'laugh'),
    ],
    outcome: { bond: 2, spark: 4 },
    after: (n, who) => (who === 0 ? 'Eu estava distraído e bati a testa. Não tenho nada a declarar.' : `Vi ${other(n, who)} bater a testa na árvore olhando para mim. Eu não ri. Ri muito.`),
  },
  {
    id: 'rom-segurar-mao', kind: 'romance', title: 'Mãos que se esbarram', emoji: '🤝', cast: 2, weight: 5, when: (c) => crush(c) && c.rel!.spark >= 25 && calm(c),
    lines: (_c) => [
      L(0, '(caminham lado a lado; as patas se esbarram sem querer)', 'sweat'),
      L(1, 'Desculpa!', 'shock'),
      L(0, 'Eu que desculpo!', 'shock'),
      L(1, '(as patas se esbarram de novo) ...Eu acho que é de propósito agora.', 'heart'),
      L(0, '(segura a pata, bem de leve) ...Pode ser.', 'heart'),
    ],
    outcome: { bond: 7, spark: 12 },
    after: (n, who) => `${other(n, who)} segurou a minha pata. Eu não lavo mais. Quer dizer, lavo. Mas com carinho.`,
  },
  // ---------------------------------------------------------------------------- casais
  {
    id: 'rom-cafe-manha', kind: 'romance', title: 'Café da manhã a dois', emoji: '🥞', cast: 2, weight: 7, when: (c) => coupled(c) && c.env.hour >= 6 && c.env.hour < 11,
    lines: (c) => [
      L(0, `${c.n[1]}, acordou? Eu fiz panqueca. Uma delas está meio queimada.`, 'heart'),
      L(1, 'Qual?', 'question'),
      L(0, 'A que sobrou para mim. A sua está perfeita.', 'sparkle'),
      L(1, 'Troca. Eu como a queimada. (na verdade, está até gostosa)', 'heart'),
    ],
    outcome: (c) => ({ bond: 7, spark: 8, items: [[pick(c, ['pao-mel', 'geleia'] as const), 1]] }),
  },
  {
    id: 'rom-piquenique-casal', kind: 'romance', title: 'Piquenique de casal', emoji: '🧺', cast: 2, weight: 6, when: (c) => coupled(c) && day(c) && calm(c) && c.has('cesta-piquenique', 'banco', 'mesa', 'mesinha'),
    lines: (_c) => [
      L(0, 'Estendi a toalha embaixo da cerejeira. Trouxe suco, frutas e um bolo pequeno.', 'sparkle'),
      L(1, 'Você pensou em tudo!', 'heart'),
      L(0, 'Tudo, menos formigas. Elas chegaram primeiro.', 'sweat'),
      L(1, '(divide o bolo com as formigas, com muita paciência)', 'laugh'),
      L(0, 'Eu amo o seu coração grande.', 'heart'),
    ],
    outcome: { bond: 8, spark: 9 },
  },
  {
    id: 'rom-cinema-casa', kind: 'romance', title: 'Cinema em casa', emoji: '🎞️', cast: 2, weight: 6, when: (c) => coupled(c) && evening(c) && c.has('televisao', 'computador', 'sofa', 'poltrona'),
    lines: (_c) => [
      L(0, 'Escolhi um filme de terror. Você vai adorar!', 'fire'),
      L(1, 'Eu não gosto de terror.', 'sweat'),
      L(0, 'Nem eu. Mas é uma boa desculpa para ficar abraçado.', 'laugh'),
      L(1, '(puxa a manta) ...Pelo menos o final é feliz?', 'heart'),
      L(0, '(os dois dormem antes da metade)', 'zzz'),
    ],
    outcome: { bond: 8, spark: 9 },
  },
  {
    id: 'rom-aniversario-namoro', kind: 'romance', title: 'O mês de namoro', emoji: '🎂', cast: 2, weight: 4, when: (c) => coupled(c) && c.rel!.met >= 6 && c.rel!.bond >= 50,
    lines: (c) => [
      L(0, `${c.n[1]}, você sabe que dia é hoje?`, 'sparkle'),
      L(1, 'Um dia comum?', 'question'),
      L(0, 'É o dia em que eu inventei uma data só para te dar um presente.', 'heart'),
      L(1, '(ganha um cristalzinho) Eu não preparei nada. Só isso aqui: (abraço apertado)', 'heart'),
      L(0, 'É o melhor presente que já recebi.', 'sparkle'),
    ],
    outcome: { bond: 9, spark: 10, items: [['cristal', 1]] },
  },
  {
    id: 'rom-ressonar', kind: 'comedia', title: 'O ronco do amor', emoji: '😴', cast: 2, weight: 5, when: (c) => coupled(c) && night(c),
    lines: (c) => [
      L(0, `${c.n[1]}... você ronca.`, 'sweat'),
      L(1, 'Eu? Eu respiro com entusiasmo.', 'sweat'),
      L(0, 'O teto está tremendo. Uma coruja foi embora.', 'laugh'),
      L(1, 'Então a casa fica toda para a gente. Boa noite, meu amor.', 'heart'),
      L(0, '(coloca tampões de folha nas orelhas e dorme feliz)', 'zzz'),
    ],
    outcome: { bond: 6, spark: 5 },
  },
  {
    id: 'rom-dia-chuva-casal', kind: 'romance', title: 'Dia de chuva a dois', emoji: '🌧️', cast: 2, weight: 8, when: (c) => coupled(c) && rainy(c),
    lines: (_c) => [
      L(0, 'Chuva forte lá fora. Fogueira acesa aqui dentro. Quentinho.', 'sparkle'),
      L(1, 'Tem chocolate quente?', 'question'),
      L(0, 'Tem suco de oran morno. É a mesma coisa. Quase.', 'laugh'),
      L(1, '(encosta a cabeça no ombro) Hoje eu não saio daqui.', 'heart'),
    ],
    outcome: { bond: 9, spark: 10 },
  },
  {
    id: 'rom-neve-casal', kind: 'romance', title: 'Boneco de neve em dupla', emoji: '⛄', cast: 2, weight: 8, when: (c) => coupled(c) && snowy(c),
    lines: (c) => [
      L(0, `Eu faço a barriga, ${c.n[1]} faz a cabeça!`, 'star'),
      L(1, 'E o cachecol? Dele ou meu?', 'question'),
      L(0, 'Seu. Você tem frio nas orelhas.', 'heart'),
      L(1, '(enrola o cachecol no boneco e depois o puxa de volta para os dois) Cabe nós quatro.', 'laugh'),
    ],
    outcome: { bond: 9, spark: 10 },
  },
  {
    id: 'rom-surpresa-casal', kind: 'romance', title: 'A surpresa no jardim', emoji: '🌹', cast: 2, weight: 5, when: (c) => coupled(c) && c.env.hour >= 8 && c.env.hour < 19,
    lines: (c) => [
      L(0, `${c.n[1]}, fecha os olhos. Não vale espiar.`, 'sparkle'),
      L(1, 'Estou espiando só com um olho.', 'laugh'),
      L(0, 'Então fecha o outro também!', 'anger'),
      L(1, '(abre os olhos: um caminho de pétalas até um banquinho com uma flor)', 'shock'),
      L(1, 'Quando você fez tudo isso?!', 'heart'),
      L(0, 'Acordei às cinco. Quase caí do galho.', 'sweat'),
    ],
    outcome: { bond: 9, spark: 11, items: [['flor', 1]] },
  },
  {
    id: 'rom-saudade-casal', kind: 'romance', title: 'Cinco minutos de saudade', emoji: '🥹', cast: 2, weight: 5, when: (c) => coupled(c) && day(c),
    lines: (c) => [
      L(0, `${c.n[1]}! Faz cinco minutos que a gente não se vê!`, 'shock'),
      L(1, 'Cinco minutos e dez segundos! Eu estava contando!', 'sad'),
      L(0, '(correm um para o outro em câmera lenta, mesmo sem ninguém filmando)', 'heart'),
      L(1, 'Eu fui buscar água.', 'sweat'),
      L(0, 'Foi o pior cinco minutos da minha vida.', 'sad'),
    ],
    outcome: { bond: 5, spark: 6 },
  },
  {
    id: 'rom-ciuminho-casal', kind: 'drama', title: 'O ex-amigo do ex', emoji: '🙄', cast: 2, weight: 4, when: (c) => coupled(c) && c.rel!.bond < 70,
    lines: (c) => [
      L(0, `${c.n[1]}, aquele Pokémon piscou para você.`, 'anger'),
      L(1, 'Ele tinha um cisco no olho.', 'sweat'),
      L(0, 'Os dois olhos, em sequência.', 'anger'),
      L(1, 'Então um cisco de cada lado. Amor, é você que eu amo.', 'heart'),
      L(0, '...Tá bom. Mas eu vou ficar de olho no cisco.', 'sweat'),
    ],
    outcome: { bond: 3, spark: 4 },
    choice: {
      prompt: 'Uma pontinha de ciúme. O que você faz?',
      options: [
        { label: () => 'Pedir calma aos dois', lines: () => [L(0, 'Eu confio. Só ando meio bobo.', 'sad'), L(1, 'Eu gosto de você bobo.', 'heart')], outcome: { bond: 6, spark: 8 } },
        { label: () => 'Dar uma flor para a dupla', needs: { item: 'flor', qty: 1 }, lines: () => [L(0, 'Uma flor! Eu esqueci o motivo da briga.', 'sparkle'), L(1, 'Que lindo! Vamos plantá-la juntos.', 'heart')], outcome: { bond: 8, spark: 12 } },
        { label: () => 'Ficar quieto', lines: () => [L(0, '(cruza os braços)', 'anger'), L(1, '(também)', 'anger')], outcome: { bond: -4, spark: -3 } },
      ],
    },
  },
  {
    id: 'rom-pedido-nome', kind: 'romance', title: 'O apelido carinhoso', emoji: '🍯', cast: 2, weight: 5, when: (c) => coupled(c),
    lines: (_c) => [
      L(0, 'Oi, meu docinho de pecha.', 'heart'),
      L(1, 'Oi, meu pãozinho de mel.', 'heart'),
      L(0, 'Aí! Eu fico com fome só de falar.', 'laugh'),
      L(1, 'Então que tal um apelido que não seja de comida?', 'question'),
      L(0, 'Meu... ' + 'bolinho.', 'sweat'),
      L(1, 'Isso ainda é comida.', 'laugh'),
    ],
    outcome: { bond: 6, spark: 7 },
  },
  {
    id: 'rom-reconcilia', kind: 'romance', title: 'Recomeço', emoji: '🌱', cast: 2, weight: 5, when: (c) => !!c.rel && c.rel.flag === null && c.rel.spark >= 30 && c.rel.bond >= 20 && c.rel.met >= 5 && c.seen.has('rom-fim') && day(c),
    lines: (c) => [
      L(0, `${c.n[1]}... passou um tempo. Eu aprendi umas coisas.`, 'sad'),
      L(1, 'Eu também. Principalmente que te dou muita saudade.', 'sad'),
      L(0, 'A gente pode começar do zero? Sem pressa.', 'sparkle'),
      L(1, 'Sem pressa. Começando agora: oi, eu sou o ' + c.n[1] + '. Muito prazer.', 'laugh'),
      L(0, 'Prazer. Eu sou o ' + c.n[0] + '. Você tem um sorriso conhecido.', 'heart'),
    ],
    outcome: { bond: 8, spark: 12 },
  },
  {
    id: 'rom-aposta-bonita', kind: 'romance', title: 'Quem ama mais?', emoji: '💞', cast: 2, weight: 5, when: (c) => coupled(c) && day(c),
    lines: (c) => [
      L(0, `Eu amo você até a lua, ${c.n[1]}.`, 'heart'),
      L(1, 'Eu amo até a lua e de volta.', 'heart'),
      L(0, 'Eu amo até a lua, de volta, e mais uma vez!', 'fire'),
      L(1, 'Eu amo infinito mais um!', 'fire'),
      L(0, 'Isso não vale! Infinito não tem mais um!', 'anger'),
    ],
    outcome: { bond: 4 },
    choice: {
      prompt: 'Um duelo de declarações. Quem ganhou?',
      options: [
        { label: () => 'Os dois, empatados', lines: () => [L(0, 'Então a gente se ama igual!', 'sparkle'), L(1, 'Infinito dividido por dois!', 'laugh')], outcome: { bond: 8, spark: 10 } },
        { label: (c) => `${c.n[0]} ganhou`, lines: (c) => [L(0, 'EU SABIA!', 'star'), L(1, `${c.n[0]} sempre ganha. Eu deixo.`, 'sweat')], outcome: { bond: 5, spark: 6 } },
        { label: (c) => `${c.n[1]} ganhou`, lines: (_c) => [L(1, 'O infinito mais um é imbatível!', 'star'), L(0, 'Eu perdi? Mas ganhei esse abraço.', 'heart')], outcome: { bond: 5, spark: 6 } },
      ],
    },
  },
];
