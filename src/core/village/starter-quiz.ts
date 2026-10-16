/**
 * Questionário do presente inicial (Digital Pokémon): 5 perguntas de personalidade decidem o tipo (Planta/Fogo/
 * Água) e 1 pergunta de "era" escolhe a geração — sempre um dos 27 iniciais reais (9 gerações × 3), nunca uma
 * espécie inventada. Pontuação simples e determinística: cada resposta de personalidade soma 1 ponto no tipo
 * marcado; o tipo com mais pontos vence, com desempate fixo Fogo > Água > Planta (documentado aqui, testável).
 * Função pura, sem UI — a tela fica em `VillageView.vue`.
 */

export type StarterTrack = 'planta' | 'fogo' | 'agua';

/** Os 3 iniciais de cada geração (dexId), dado real da Pokédex — nunca inventado. */
export const GEN_STARTERS: Readonly<Record<number, Record<StarterTrack, number>>> = {
  1: { planta: 1, fogo: 4, agua: 7 },
  2: { planta: 152, fogo: 155, agua: 158 },
  3: { planta: 252, fogo: 255, agua: 258 },
  4: { planta: 387, fogo: 390, agua: 393 },
  5: { planta: 495, fogo: 498, agua: 501 },
  6: { planta: 650, fogo: 653, agua: 656 },
  7: { planta: 722, fogo: 725, agua: 728 },
  8: { planta: 810, fogo: 813, agua: 816 },
  9: { planta: 906, fogo: 909, agua: 912 },
};

export interface QuizOption {
  id: string;
  text: string;
  track?: StarterTrack;
  gen?: number;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: readonly QuizOption[];
}

export const PERSONALITY_QUESTIONS: readonly QuizQuestion[] = [
  {
    id: 'desafio',
    prompt: 'Um desafio grande aparece na sua frente. O que você faz primeiro?',
    options: [
      { id: 'a', text: 'Paro pra pensar num jeito mais esperto de resolver.', track: 'planta' },
      { id: 'b', text: 'Encaro de peito aberto, sem pensar duas vezes.', track: 'fogo' },
      { id: 'c', text: 'Observo com calma até entender o que está acontecendo.', track: 'agua' },
    ],
  },
  {
    id: 'curiosidade',
    prompt: 'Você encontra uma porta trancada numa trilha desconhecida.',
    options: [
      { id: 'a', text: 'Procuro plantas ou pistas ao redor pra entender o lugar.', track: 'planta' },
      { id: 'b', text: 'Tento abrir na força, só pra ver se consigo.', track: 'fogo' },
      { id: 'c', text: 'Sigo em frente e deixo o mistério pra depois.', track: 'agua' },
    ],
  },
  {
    id: 'amigos',
    prompt: 'Um amigo está com problemas. Como você ajuda?',
    options: [
      { id: 'a', text: 'Fico do lado dele, com paciência, até passar.', track: 'planta' },
      { id: 'b', text: 'Entro na frente e resolvo o problema por ele.', track: 'fogo' },
      { id: 'c', text: 'Escuto primeiro, pra entender o que ele realmente precisa.', track: 'agua' },
    ],
  },
  {
    id: 'inesperado',
    prompt: 'Algo dá errado bem na hora em que tudo parecia certo.',
    options: [
      { id: 'a', text: 'Respiro fundo e ajusto o plano aos poucos.', track: 'planta' },
      { id: 'b', text: 'Viro o jogo na raça, no improviso.', track: 'fogo' },
      { id: 'c', text: 'Me adapto fácil — mudar de direção não me incomoda.', track: 'agua' },
    ],
  },
  {
    id: 'parceiro',
    prompt: 'Que tipo de parceiro de jornada você procura?',
    options: [
      { id: 'a', text: 'Um que cresça comigo devagar, com lealdade.', track: 'planta' },
      { id: 'b', text: 'Um com energia de sobra, sempre pronto pra ação.', track: 'fogo' },
      { id: 'c', text: 'Um tranquilo, que me acompanha sem pressa.', track: 'agua' },
    ],
  },
] as const;

/** Uma frase por geração, pra escolher qual delas "chama" o jogador (não influencia o tipo). */
export const ERA_QUESTION: QuizQuestion = {
  id: 'era',
  prompt: 'Feche os olhos: que lugar essa jornada começa?',
  options: [
    { id: 'g1', text: 'Uma vila pacata, cercada de rotas e laboratórios.', gen: 1 },
    { id: 'g2', text: 'Terras douradas e prateadas, com templos antigos.', gen: 2 },
    { id: 'g3', text: 'Uma região tropical, com mar por toda parte.', gen: 3 },
    { id: 'g4', text: 'Montanhas e um santuário cheio de lendas.', gen: 4 },
    { id: 'g5', text: 'Uma grande cidade movimentada, em plena mudança.', gen: 5 },
    { id: 'g6', text: 'Terras elegantes, com arte e moda em cada esquina.', gen: 6 },
    { id: 'g7', text: 'Ilhas tropicais, num calendário só delas.', gen: 7 },
    { id: 'g8', text: 'Campos abertos e uma liga cheia de tradição.', gen: 8 },
    { id: 'g9', text: 'Uma terra aberta, livre pra explorar do seu jeito.', gen: 9 },
  ],
} as const;

export const ALL_QUESTIONS: readonly QuizQuestion[] = [...PERSONALITY_QUESTIONS, ERA_QUESTION];

/** Resposta escolhida por pergunta (id da pergunta → id da opção). */
export type QuizAnswers = Record<string, string>;

export function isComplete(answers: QuizAnswers): boolean {
  return ALL_QUESTIONS.every((q) => q.options.some((o) => o.id === answers[q.id]));
}

/** Desempate fixo e documentado: Fogo > Água > Planta. */
const TIE_BREAK: readonly StarterTrack[] = ['fogo', 'agua', 'planta'];

export function scoreTrack(answers: QuizAnswers): StarterTrack {
  const points: Record<StarterTrack, number> = { planta: 0, fogo: 0, agua: 0 };
  for (const q of PERSONALITY_QUESTIONS) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (opt?.track) points[opt.track]++;
  }
  return TIE_BREAK.reduce((best, t) => (points[t] > points[best] ? t : best), TIE_BREAK[0]!);
}

export function resolveGen(answers: QuizAnswers): number {
  const opt = ERA_QUESTION.options.find((o) => o.id === answers[ERA_QUESTION.id]);
  return opt?.gen ?? 1;
}

export interface StarterResult {
  gen: number;
  track: StarterTrack;
  dexId: number;
}

/** Só chame com `isComplete(answers)` verdadeiro. */
export function resolveStarter(answers: QuizAnswers): StarterResult {
  const gen = resolveGen(answers);
  const track = scoreTrack(answers);
  return { gen, track, dexId: GEN_STARTERS[gen]![track] };
}

/**
 * Cadeia de evolução (3 formas, dado real da Pokédex) de cada um dos 27 iniciais — o universo fechado de espécies
 * que o Digital Pokémon usa (presente inicial e Fonte), então a evolução nunca depende de buscar a cadeia inteira
 * numa API em tempo real. `nextForm` devolve o próximo dexId real, ou null se já estiver na forma final ou se o
 * dexId não for de um desses 27 iniciais.
 */
const STARTER_CHAINS: readonly (readonly [number, number, number])[] = [
  [1, 2, 3], [4, 5, 6], [7, 8, 9],
  [152, 153, 154], [155, 156, 157], [158, 159, 160],
  [252, 253, 254], [255, 256, 257], [258, 259, 260],
  [387, 388, 389], [390, 391, 392], [393, 394, 395],
  [495, 496, 497], [498, 499, 500], [501, 502, 503],
  [650, 651, 652], [653, 654, 655], [656, 657, 658],
  [722, 723, 724], [725, 726, 727], [728, 729, 730],
  [810, 811, 812], [813, 814, 815], [816, 817, 818],
  [906, 907, 908], [909, 910, 911], [912, 913, 914],
];

export function nextForm(dexId: number): number | null {
  for (const chain of STARTER_CHAINS) {
    const i = chain.indexOf(dexId);
    if (i >= 0) return chain[i + 1] ?? null;
  }
  return null;
}

/** Todos os dexId das 27 formas base (planta/fogo/água de cada geração) — o pool real de espécies da Fonte. */
export const FONTE_POOL: readonly number[] = Object.values(GEN_STARTERS).flatMap((g) => [g.planta, g.fogo, g.agua]);
