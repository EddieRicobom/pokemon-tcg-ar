import type { PokemonType } from '../../pokemon-data';
import { L, calm, day, friendsNow, is, night, other, rainy } from './kit';
import type { Ctx, Template } from './kit';

/** O jeito de um Pokémon reagir ao monte pelo tipo (o primeiro que combinar), ou `null` se for de outro tipo. */
function typeOf(c: Ctx, i: number): PokemonType | null {
  const types = c.types[i] ?? [];
  return (['fire', 'water', 'grass', 'ghost', 'psychic', 'flying', 'rock'] as const).find((t) => types.includes(t)) ?? null;
}

/**
 * O Monte Miragem, a montanha em terraços a oeste, e a Estátua do Mew no topo. Os moradores comentam, sobem, discutem se
 * a estátua se mexe e convidam você a meditar. A estátua não dá nada de jogo: as falas nunca prometem efeito.
 */
export const MIRAGEM_MOMENTS: readonly Template[] = [
  {
    id: 'mir-vista-da-praca', kind: 'solo', title: 'O monte visto da praça', emoji: '⛰️', cast: 1, weight: 6, when: (c) => day(c) && calm(c),
    lines: () => [L(0, 'Da praça dá para ver o Monte Miragem inteirinho hoje.', 'sparkle'), L(0, 'Lá no topo tem um pontinho... é a Estátua do Mew!', 'star'), L(0, 'Um dia eu subo. Talvez hoje. Talvez depois do lanche.', 'zzz')],
    outcome: {},
    after: () => 'Você já reparou no Monte Miragem visto da praça? Tem dias em que ele parece pertinho.',
  },
  {
    id: 'mir-subida', kind: 'amizade', title: 'Degrau por degrau', emoji: '🪜', cast: 2, weight: 6, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, `${c.n[1]}, vamos subir as escadas do Monte Miragem até o topo?`, 'fire'), L(1, 'Quantos degraus tem?', 'question'), L(0, 'Não sei. Vamos contar juntos!', 'idea'), L(1, '(no terraço do meio) Perdi a conta no duzentos e pouco. Valeu a pena, olha essa vista!', 'sweat')],
    outcome: { bond: 4 },
    after: (n, who) => `Subi o Monte Miragem com ${other(n, who)}. Perdemos a conta dos degraus, mas a vista não sai da cabeça.`,
  },
  {
    id: 'mir-vista-do-topo', kind: 'amizade', title: 'A Vila de brinquedo', emoji: '🏞️', cast: 2, weight: 6, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Daqui de cima a Vila parece de brinquedo.', 'sparkle'), L(1, 'Olha a fonte! E o lago! E aquela é a minha casa?', 'shock'), L(0, `É sim, ${c.n[1]}. Você esqueceu a janela aberta.`, 'laugh'), L(1, 'Eu desço correndo. Daqui a uma meia hora. A vista primeiro.', 'heart')],
    outcome: { bond: 4 },
  },
  {
    id: 'mir-estatua-mexeu', kind: 'comedia', title: 'A estátua mexeu?', emoji: '🗿', cast: 2, weight: 6, when: (c) => calm(c),
    lines: (c) => [L(0, `${c.n[1]}! A cauda da Estátua do Mew mexeu. Eu vi!`, 'shock'), L(1, 'É pedra. Pedra não mexe.', 'sweat'), L(0, 'Então por que você está olhando para ela sem piscar?', 'question'), L(1, '...Só conferindo. Por precaução.', 'sweat')],
    outcome: { bond: 3 },
    after: (n, who) => (who === 0 ? `${other(n, who)} diz que pedra não mexe. Mas ficou um tempão olhando a estátua.` : 'Pedra não mexe. Eu sei. Mas o vento lá em cima faz cada coisa...'),
  },
  {
    id: 'mir-curioso-cetico', kind: 'amizade', title: 'O vulto rosado', emoji: '🩷', cast: 2, weight: 6, when: (c) => is(c, 0, 'Curioso', 'Sonhador', 'Brincalhão', 'Tímido'),
    lines: (c) => [L(0, 'Ontem, no alto do Monte Miragem, eu vi um vulto rosado passando entre as nuvens.', 'sparkle'), L(1, 'Era um balão. Ou uma nuvem cor-de-rosa. O pôr do sol faz isso.', 'question'), L(0, 'Balão não dá risada.', 'shock'), L(1, `Tá bom, ${c.n[0]}. Amanhã a gente sobe e confere. Juntos.`, 'idea')],
    outcome: { bond: 4 },
    after: (n, who) => (who === 0 ? `${other(n, who)} acha que era um balão. Eu sei o que vi... acho.` : `${other(n, who)} jura que viu um vulto rosado no monte. Eu vou subir junto, só para garantir.`),
  },
  {
    id: 'mir-nascer-do-sol', kind: 'solo', title: 'Meditar ao nascer do sol', emoji: '🌄', cast: 1, weight: 6, when: (c) => c.env.hour >= 5 && c.env.hour < 9 && calm(c),
    lines: () => [L(0, 'Acordei antes de todo mundo para ver o sol nascer atrás da Estátua do Mew.', 'zzz'), L(0, 'Sentei, fechei os olhos e só escutei o vento.', 'note'), L(0, 'Não aconteceu nada de especial. E foi perfeito assim.', 'heart')],
    outcome: {},
    after: () => 'Sabe o nascer do sol lá no topo do Monte Miragem? Um dia você precisa meditar ali comigo.',
  },
  {
    id: 'mir-pedra-morna', kind: 'solo', title: 'A pedra morna', emoji: '🌙', cast: 1, weight: 5, when: (c) => night(c) && calm(c),
    lines: () => [L(0, 'Subi o Monte Miragem de noite. Que frio!', 'sweat'), L(0, 'Mas a pedra da Estátua do Mew estava morninha, como se o sol ainda morasse nela.', 'sparkle'), L(0, 'Encostei e fiquei ali olhando as estrelas, quietinho.', 'heart')],
    outcome: {},
    after: () => 'De noite, a pedra da Estátua do Mew continua morna. Ninguém sabe explicar.',
  },
  {
    id: 'mir-do-seu-jeito', kind: 'solo', title: 'O monte do seu jeito', emoji: '⛰️', cast: 1, weight: 6, when: (c) => calm(c),
    lines: (c) => {
      const t = typeOf(c, 0);
      if (t === 'fire') return [L(0, 'Lá no alto do Monte Miragem o vento tenta apagar a minha chama.', 'fire'), L(0, 'Mas perto da estátua ele fica manso, como se pedisse desculpas.', 'sparkle')];
      if (t === 'water') return [L(0, 'Achei uma nascente entre as pedras do terraço.', 'idea'), L(0, 'A água desce o monte cantando até a Vila. Fiquei ouvindo um tempão.', 'note')];
      if (t === 'grass') return [L(0, 'O musgo das escadas do Monte Miragem é o mais macio da Vila.', 'heart'), L(0, 'E as florzinhas lá do topo se viram todas para a Estátua do Mew. Engraçado, né?', 'question')];
      if (t === 'ghost') return [L(0, 'Gosto do Monte Miragem de noite. Ninguém se assusta comigo lá em cima.', 'zzz'), L(0, 'E a estátua... a estátua me olha como se já me conhecesse.', 'sparkle')];
      if (t === 'psychic') return [L(0, 'Perto da Estátua do Mew a minha cabeça fica silenciosa.', 'sparkle'), L(0, 'Parece que alguém, muito longe, está brincando de esconde-esconde comigo.', 'laugh')];
      if (t === 'flying') return [L(0, 'Pousei no topo do Monte Miragem e o vento me carregou de volta duas vezes.', 'sweat'), L(0, 'Na terceira eu consegui. Sentei na cabeça da estátua. (Desculpa, Mew.)', 'laugh')];
      if (t === 'rock') return [L(0, 'As pedras dos terraços do monte são antigas. Dá para sentir.', 'idea'), L(0, 'A da Estátua do Mew é diferente de todas. Mais lisa. Mais quentinha.', 'heart')];
      return [L(0, 'Fui até o topo do Monte Miragem só para ver como é.', 'question'), L(0, 'É bonito. É calmo. É longe. Vou voltar amanhã.', 'heart')];
    },
    outcome: {},
  },
  {
    id: 'mir-convite-meditar', kind: 'amizade', title: 'Um convite para o topo', emoji: '🧘', cast: 2, weight: 6, when: (c) => day(c),
    lines: (c) => [L(0, `${c.n[1]}, você já meditou na Estátua do Mew?`, 'question'), L(1, 'Meditar? Eu nem sei ficar parado.', 'sweat'), L(0, 'É só sentar, fechar os olhos e ouvir o vento. Até o treinador devia subir lá.', 'idea'), L(1, 'Se o treinador for, eu vou. Mas sento do lado do lanche.', 'laugh')],
    outcome: { bond: 3 },
    after: (n, who) => (who === 0 ? 'Sobe o Monte Miragem um dia e medita um pouco diante da Estátua do Mew. É bom ficar quietinho lá.' : `${other(n, who)} quer que eu medite na Estátua do Mew. Você vai também?`),
  },
  {
    id: 'mir-subida-chuva', kind: 'comedia', title: 'A trilha escorregadia', emoji: '🌧️', cast: 2, weight: 5, when: (c) => rainy(c),
    lines: (c) => [L(0, 'Quem teve a ideia de subir o Monte Miragem na chuva?', 'sweat'), L(1, `Foi você, ${c.n[0]}.`, 'question'), L(0, 'Então foi uma ótima ideia. (escorrega três degraus)', 'shock'), L(1, '(segura a pata dele) Lá em cima a estátua está toda brilhando de chuva. Vale a pena.', 'sparkle')],
    outcome: { bond: 4 },
  },
  {
    id: 'mir-silencio-a-dois', kind: 'romance', title: 'Silêncio no topo', emoji: '🌌', cast: 2, weight: 5, when: (c) => (night(c) || c.env.hour >= 17) && calm(c) && (friendsNow(c) || (c.rel?.spark ?? 0) >= 40),
    lines: (c) => [L(0, `${c.n[1]}, senta aqui do lado da Estátua do Mew.`, 'heart'), L(1, 'Daqui as luzes da Vila parecem estrelas no chão.', 'sparkle'), L(0, '...', 'heart'), L(1, '(ficam em silêncio até o vento esfriar, e ninguém achou estranho)', 'heart')],
    outcome: { bond: 4, spark: 3 },
  },
  {
    id: 'mir-trio-piquenique', kind: 'festa', title: 'Lanche no terraço', emoji: '🧺', cast: 3, weight: 6, when: (c) => day(c) && calm(c),
    lines: (c) => [L(0, 'Piquenique no terraço do Monte Miragem!', 'star'), L(1, 'Eu trouxe frutas. Algumas sobreviveram à subida.', 'sweat'), L(2, 'Eu trouxe nada. Mas trouxe fôlego. Quase nenhum.', 'laugh'), L(0, `Da próxima vez a gente leva tudo até a estátua, ${c.n[2]}. Com calma.`, 'heart')],
    outcome: { bond: 3, bond02: 3, bond12: 3 },
  },
  {
    id: 'mir-quem-esculpiu', kind: 'amizade', title: 'Quem esculpiu o Mew?', emoji: '🔍', cast: 3, weight: 5, when: (c) => day(c),
    lines: (c) => [L(0, 'Pergunta séria: quem fez a Estátua do Mew?', 'question'), L(1, 'Alguém muito paciente. Olha o tamanho daquela cauda.', 'idea'), L(2, 'E se ninguém fez? E se ela sempre esteve lá?', 'sparkle'), L(0, `${c.n[2]}, agora eu não vou dormir.`, 'shock')],
    outcome: { bond: 2, bond02: 2, bond12: 2 },
  },
  {
    id: 'mir-cauda-nas-nuvens', kind: 'solo', title: 'A cauda nas nuvens', emoji: '☁️', cast: 1, weight: 5, when: (c) => day(c) && calm(c) && is(c, 0, 'Sonhador', 'Curioso', 'Calmo'),
    lines: () => [L(0, 'Deitei no topo do Monte Miragem para ver as nuvens.', 'zzz'), L(0, 'Uma delas tinha uma cauda fininha... e sumiu quando eu pisquei.', 'shock'), L(0, 'Deve ter sido o vento. Mas eu sorri mesmo assim.', 'heart')],
    outcome: {},
    after: () => 'Lá no alto do Monte Miragem, as nuvens têm cada forma... Uma delas tinha cauda.',
  },
  {
    id: 'mir-corrida-escadas', kind: 'rivalidade', title: 'Corrida nas escadas', emoji: '🏃', cast: 2, weight: 5, when: (c) => day(c) && calm(c) && (is(c, 0, 'Corajoso', 'Brincalhão', 'Mandão') || is(c, 1, 'Corajoso', 'Brincalhão')),
    lines: (c) => {
      const v = c.rng() < 0.5 ? 0 : 1;
      c.memo.v = v;
      return [L(0, `${c.n[1]}, aposto que eu chego primeiro na Estátua do Mew!`, 'fire'), L(1, 'Valendo! Pelas escadas, sem pular terraço!', 'fire'), L(v, `(lá no topo, sem fôlego) Ganhei! ${c.n[v]} é o rei do Monte Miragem!`, 'star'), L(v === 0 ? 1 : 0, '(deitado na pedra) A estátua viu tudo. Ela vai lembrar que foi por pouco.', 'sweat')];
    },
    outcome: { bond: 2 },
  },
];
