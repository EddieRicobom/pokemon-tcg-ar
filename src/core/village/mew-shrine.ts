import { hash } from './personality';
import type { PersonalityName } from './personality';
import { MEW_STATUE } from './mountain';

/**
 * O Monte Miragem e a Estátua do Mew, no topo. A meditação é só para contemplar: não dá amizade, itens ou sorte de
 * verdade. Os textos dela só descrevem a sensação do momento e nunca prometem efeito.
 */
export const MEW_SHRINE = { mountain: 'Monte Miragem', statue: 'Estátua do Mew', action: 'Meditar' } as const;
/** Segredo único: espere atrás da estátua sem andar para receber a bênção. */
export const MEW_BLESSING = { waitMs: 10_000, xp: 10_000, coins: 10_000 } as const;

/** Os dois blocos logo atrás da estátua, no alto do monte. */
export function behindMewStatue(point: { x: number; y: number }): boolean {
  return point.y === MEW_STATUE.y - 1 && point.x >= MEW_STATUE.x && point.x < MEW_STATUE.x + MEW_STATUE.w;
}

const TITLES = [
  'Você medita diante da Estátua do Mew',
  'Um instante no topo do Monte Miragem',
  'Silêncio diante da Estátua do Mew',
] as const;

/** Abertura: o vento e o alto do monte. */
const OPENINGS = [
  'O vento do alto do Monte Miragem passa devagar e leva embora o barulho da Vila.',
  'Lá embaixo, os telhados ficam pequenos; aqui em cima só existe o vento.',
  'Uma brisa morna sobe pelas trilhas e mexe na grama em volta da estátua.',
  'As nuvens passam tão perto que dá vontade de tocar nelas.',
  'O sol bate na pedra da estátua, e ela brilha como se tivesse acabado de acordar.',
  'Você fecha os olhos. O monte inteiro parece respirar junto com você.',
  'Um silêncio bom cobre o topo do monte, daqueles que não pedem nada.',
  'As pedras dos terraços ainda guardam o calor do dia.',
] as const;

/** Miolo: o Mew que ninguém vê. */
const MIDDLES = [
  'Ninguém vê o Mew, mas a estátua parece sorrir um pouquinho mais hoje.',
  'Por um instante, uma cauda fina some entre as nuvens. Ou foi só imaginação?',
  'Um riso baixinho passa com o vento e vai embora antes que você vire o rosto.',
  'Os olhos de pedra do Mew parecem olhar exatamente para você.',
  'Uma bolha rosada sobe do mato e se desfaz no ar, sem fazer barulho.',
  'Parece que alguém pequeno e travesso está sentado ao seu lado, quietinho.',
  'As folhas em volta da estátua giram num redemoinho alegre e depois se acalmam.',
  'A sombra da estátua se estica até os seus pés, como quem dá um abraço.',
] as const;

/** Fecho: a calma e o dia do seu lado. */
const CLOSINGS = [
  'Hoje, as almas da Vila caminham do seu lado.',
  'Você sente que o dia está do seu lado, aconteça o que acontecer.',
  'O coração fica leve. O destino parece sorrir de volta.',
  'Você desce o monte com a calma de quem sabe que não está sozinho.',
  'Seja qual for o caminho de hoje, ele parece bem acompanhado.',
  'Uma calma boa fica no peito, como uma fogueira pequena que não apaga.',
  'Lá embaixo, a Vila continua igual. Mas você volta mais tranquilo.',
  'O vento sussurra que hoje é um bom dia para seguir em frente.',
] as const;

const at = <T,>(list: readonly T[], seed: number): T => list[seed % list.length]!;

/**
 * A mensagem de quem medita diante da estátua: a mesma o dia inteiro (`day` = 'AAAA-MM-DD'); `salt` troca a combinação
 * (por exemplo, para uma segunda meditação no mesmo dia).
 */
export function meditationMessage(day: string, salt = 0): { title: string; lines: string[] } {
  const key = `${day}:${salt}`;
  return {
    title: at(TITLES, hash(`mew-titulo:${key}`)),
    lines: [at(OPENINGS, hash(`mew-abre:${key}`)), at(MIDDLES, hash(`mew-meio:${key}`)), at(CLOSINGS, hash(`mew-fecha:${key}`))],
  };
}

/** Quantas mensagens diferentes existem (aberturas × miolos × fechos). */
export const MEDITATION_VARIANTS = OPENINGS.length * MIDDLES.length * CLOSINGS.length;

/** Ditas por um morador passeando no monte, nas trilhas e nas escadas dos terraços. */
export const MOUNTAIN_REMARKS: readonly string[] = [
  'Ufa, que subida!',
  'Daqui dá pra ver a fonte da praça!',
  'Cada degrau dessa escada tem um musgo diferente.',
  'O vento aqui em cima despenteia qualquer um.',
  'Olha o lago lá embaixo, parece um espelho!',
  'Achei uma pedra lisinha no meio da trilha.',
  'Mais um terraço e eu chego lá. Acho.',
  'Lá de baixo o monte parecia menor...',
  'Que silêncio bom tem aqui em cima.',
  'As nuvens passam tão perto que dá vontade de pular nelas.',
  'Essa trilha cheira a terra molhada e flor do mato.',
  'Vou descansar um pouquinho nesta pedra.',
  'Será que a estátua lá do topo já me viu chegando?',
  'Daqui a Vila inteira cabe num olhar.',
];

/** Ditas perto da Estátua do Mew, no topo. */
export const STATUE_REMARKS: readonly string[] = [
  'A estátua parece sorrir quando o vento passa.',
  'Shhh... aqui todo mundo fala baixinho.',
  'A pedra está morna, mesmo com o sol indo embora.',
  'Juro que a cauda dela mexeu agora.',
  'Vem meditar um pouquinho comigo?',
  'Quem será que esculpiu um Mew tão fofinho?',
  'Aqui em cima o coração fica quieto.',
  'Dizem que o Mew adora brincar de esconde-esconde por aqui.',
  'Fecho os olhos e só escuto o vento.',
];

/**
 * Uma fala por jeito, para a conversa com o morador (`talk` em `life.ts`). Para não dominar, o jogo deve usá-la só de
 * vez em quando (algo como 1 conversa em 12).
 */
export const MOUNTAIN_TALK_LINES: Readonly<Record<PersonalityName, string>> = {
  Brincalhão: 'Desafio: quem chega primeiro no topo do Monte Miragem! ...Vai você na frente, eu vou de pensamento.',
  Calmo: 'Lá no alto do Monte Miragem o vento é tão calmo... Sobe um dia e medita um pouco diante da Estátua do Mew.',
  Tímido: 'E-eu gosto da Estátua do Mew. Ela não fica olhando torto para ninguém.',
  Corajoso: 'Subi o Monte Miragem inteiro sem parar! Tá, parei duas vezes. Três.',
  Guloso: 'Lá no topo do monte bate uma fome... Leva um lanche se for meditar na estátua.',
  Sonhador: 'Do topo do Monte Miragem as nuvens passam tão perto... Uma tinha cauda. Juro.',
  Curioso: 'Quem será que fez a Estátua do Mew? Já procurei uma assinatura na pedra e nada.',
  Mandão: 'Recomendo, com firmeza: sobe o Monte Miragem e medita um pouco na estátua. Faz bem para a cabeça.',
};
