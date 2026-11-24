import type { VillageMail } from './mail';

/**
 * Conversas curtas que os moradores puxam sozinhos no mapa. São só frases de ambiente: não criam momentos, não dão
 * recompensa e não dependem do RNG social. A escolha é determinística para o teste e para a fala não repetir em loop.
 */

export interface VillageChatterContext {
  hour?: number;
  weather?: string | null;
  friendPoints?: number;
  /** Título de um momento real do Diário; nunca inventa um acontecimento. */
  recentTitle?: string;
}

export type VillageMailView = 'todas' | 'novas' | 'arquivo';

const WEATHER_LINES: Record<string, readonly string[]> = {
  chuva: ['Essa chuva está ótima para um chá no Café.', 'Levei um susto com o trovão!', 'A praça fica com outro brilho na chuva.'],
  neve: ['Olha a neve! Quase escorreguei na fonte.', 'O telhado do Café ficou todo branco.', 'Alguém viu minhas luvas?'],
  sol: ['Que dia bonito para a praça.', 'O sol está convidando para uma volta.'],
};

const TIME_LINES: Record<'manha' | 'tarde' | 'noite', readonly string[]> = {
  manha: ['Bom dia! O pão do Café acabou de sair.', 'Acordei com os Wingull passando.', 'A horta já está pedindo água.'],
  tarde: ['A tarde está rendendo, hein?', 'Depois vou dar uma volta pelo parque.', 'O Museu está aberto se quiser espiar.'],
  noite: ['A fonte fica linda à noite, né?', 'Já é quase hora de dormir.', 'Os postes acenderam todos de uma vez.'],
};

const FRIEND_LINES: readonly string[] = [
  'Que bom te ver por aqui. Já estava com saudade.',
  'Guardei uma fruta para você, se quiser.',
  'Se precisar de companhia, é só chamar.',
];

const GENERAL_LINES: readonly string[] = [
  'Você viu o movimento da praça hoje?',
  'A Vila está crescendo, não está?',
  'Estou pensando em reformar a casa.',
  'O Correio deve trazer novidades logo.',
  'Vamos dar uma volta?',
  'Já reparou como o tempo passa aqui?',
];

const REPLIES: readonly string[] = [
  'É mesmo!',
  'Verdade.',
  'Haha, boa.',
  'Você tem razão.',
  'Olha só!',
  'Também acho.',
];

function pick<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(Math.floor(seed)) % list.length]!;
}

function period(hour: number | undefined): 'manha' | 'tarde' | 'noite' {
  const h = Number.isFinite(hour) ? ((hour! % 24) + 24) % 24 : 12;
  return h < 11 ? 'manha' : h < 19 ? 'tarde' : 'noite';
}

/** Duas falas curtas: uma observação de quem puxa assunto e uma resposta de outro morador. */
export function villageChatterExchange(seed: number, context: VillageChatterContext = {}): { a: string; b: string } {
  const pool: string[] = [];
  const weather = context.weather === 'chuva' || context.weather === 'neve' ? WEATHER_LINES[context.weather] : WEATHER_LINES.sol;
  if (weather) pool.push(...weather);
  pool.push(...TIME_LINES[period(context.hour)]);
  if ((context.friendPoints ?? 0) >= 45) pool.push(...FRIEND_LINES);
  pool.push(...GENERAL_LINES);
  if (context.recentTitle) pool.push(`Ainda penso naquele dia de “${context.recentTitle}”.`);
  const a = pick(pool, seed);
  const b = pick(REPLIES, seed * 7 + 3);
  return { a, b };
}

/** Mantém a caixa de entrada compreensível: busca por remetente/assunto/corpo e visão de novas ou arquivo. */
export function filterMail(inbox: readonly VillageMail[], archive: readonly VillageMail[], view: VillageMailView, query = ''): VillageMail[] {
  const source = view === 'arquivo' ? archive : inbox;
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const needle = normalize(query.trim());
  return source.filter((mail) => {
    if (view === 'novas' && mail.read) return false;
    if (!needle) return true;
    return normalize(`${mail.fromName} ${mail.subject} ${mail.body}`).includes(needle);
  });
}
