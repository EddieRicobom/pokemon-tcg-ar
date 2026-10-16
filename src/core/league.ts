import type { PokemonType } from './pokemon-data';

/**
 * A Liga: 8 Ginásios em ordem, depois a Elite 4 em sequência e a Campeã. Os líderes e as equipes seguem a região de
 * Sinnoh (os sprites são os de Diamond/Pearl do repositório de sprites do Showdown). Cada vitória num Ginásio dá a
 * insígnia; a Elite 4 é uma corrida: perder para qualquer um volta ao começo dela, como nos jogos.
 * As batalhas acontecem na Caixa, em revezamento (um duelo por vez), contra a equipe do líder.
 */

/** Nomes das espécies das equipes dos líderes (iguais em português). */
export const SPECIES_NAMES: Readonly<Record<number, string>> = {
  74: 'Geodude',
  95: 'Onix',
  408: 'Cranidos',
  420: 'Cherubi',
  387: 'Turtwig',
  407: 'Roserade',
  307: 'Meditite',
  67: 'Machoke',
  448: 'Lucario',
  130: 'Gyarados',
  195: 'Quagsire',
  419: 'Floatzel',
  355: 'Duskull',
  93: 'Haunter',
  429: 'Mismagius',
  436: 'Bronzor',
  208: 'Steelix',
  411: 'Bastiodon',
  215: 'Sneasel',
  221: 'Piloswine',
  460: 'Abomasnow',
  478: 'Froslass',
  26: 'Raichu',
  424: 'Ambipom',
  224: 'Octillery',
  405: 'Luxray',
  469: 'Yanmega',
  212: 'Scizor',
  416: 'Vespiquen',
  214: 'Heracross',
  452: 'Drapion',
  340: 'Whiscash',
  472: 'Gliscor',
  450: 'Hippowdon',
  76: 'Golem',
  464: 'Rhyperior',
  229: 'Houndoom',
  136: 'Flareon',
  78: 'Rapidash',
  392: 'Infernape',
  467: 'Magmortar',
  122: 'Mr. Mime',
  196: 'Espeon',
  437: 'Bronzong',
  65: 'Alakazam',
  475: 'Gallade',
  442: 'Spiritomb',
  468: 'Togekiss',
  350: 'Milotic',
  445: 'Garchomp',
  // Espécies extras das equipes cheias dos Ginásios (6 Pokémon cada).
  75: 'Graveler',
  409: 'Rampardos',
  388: 'Grotle',
  389: 'Torterra',
  421: 'Cherrim',
  66: 'Machop',
  68: 'Machamp',
  308: 'Medicham',
  418: 'Buizel',
  423: 'Gastrodon',
  457: 'Lumineon',
  94: 'Gengar',
  426: 'Drifblim',
  477: 'Dusknoir',
  462: 'Magnezone',
  476: 'Probopass',
  461: 'Weavile',
  473: 'Mamoswine',
  403: 'Shinx',
  404: 'Luxio',
  135: 'Jolteon',
  466: 'Electivire',
};

export const speciesName = (dex: number): string => SPECIES_NAMES[dex] ?? `Pokémon nº ${dex}`;

export type ChallengeKind = 'gym' | 'elite' | 'champion';

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  /** Ordem dentro do tipo (Ginásio 0..7, Elite 0..3, Campeã 0). */
  order: number;
  leader: string;
  /** Título curto ("Líder de Ginásio", "Elite 4", "Campeã"). */
  role: string;
  /** Caminho do sprite (ver `trainerSpriteUrl`). */
  sprite: string;
  type: PokemonType | null;
  /** Equipe do líder, números da Pokédex. */
  team: readonly number[];
  /** Os atributos da equipe do líder são multiplicados por isto (os desafios ficam mais difíceis). */
  power: number;
  badge?: { name: string; color: string };
  /** XP (e as mesmas moedas) da primeira vitória. */
  xp: number;
  intro: string;
  defeat: string;
}

const DP = 'gen4/diamond-pearl/';

export const GYMS: readonly Challenge[] = [
  { id: 'gym-0', kind: 'gym', order: 0, leader: 'Roark', role: 'Líder de Ginásio', sprite: `${DP}Roark`, type: 'rock', team: [74, 75, 76, 95, 408, 409], power: 0.9, badge: { name: 'Insígnia Carvão', color: '#8a8070' }, xp: 120, intro: 'Meus Pokémon de pedra são duros como a mina onde trabalho. Vamos ver do que você é feito!', defeat: 'Você rachou a minha defesa! Leve a Insígnia Carvão, você mereceu.' },
  { id: 'gym-1', kind: 'gym', order: 1, leader: 'Gardenia', role: 'Líder de Ginásio', sprite: `${DP}Gardenia`, type: 'grass', team: [387, 388, 389, 420, 421, 407], power: 0.95, badge: { name: 'Insígnia Floresta', color: '#4caf50' }, xp: 130, intro: 'Meus Pokémon de grama crescem fortes ao sol. Preparado para ser enraizado?', defeat: 'Que florada de batalha! A Insígnia Floresta é sua.' },
  { id: 'gym-2', kind: 'gym', order: 2, leader: 'Maylene', role: 'Líder de Ginásio', sprite: `${DP}Maylene`, type: 'fighting', team: [66, 67, 68, 307, 308, 448], power: 1.0, badge: { name: 'Insígnia Punho', color: '#c0504d' }, xp: 140, intro: 'Treino descalça na neve todos os dias. Mostre a força do seu coração!', defeat: 'Seus Pokémon lutaram com tudo. A Insígnia Punho é sua!' },
  { id: 'gym-3', kind: 'gym', order: 3, leader: 'Crasher Wake', role: 'Líder de Ginásio', sprite: `${DP}Crasher_Wake`, type: 'water', team: [130, 195, 418, 419, 423, 457], power: 1.05, badge: { name: 'Insígnia Pântano', color: '#3a8fe0' }, xp: 150, intro: 'Uma onda gigante está chegando! Segure firme ou vai ser levado!', defeat: 'Que tsunami de talento! Tome a Insígnia Pântano!' },
  { id: 'gym-4', kind: 'gym', order: 4, leader: 'Fantina', role: 'Líder de Ginásio', sprite: `${DP}Fantina`, type: 'ghost', team: [93, 94, 355, 429, 426, 477], power: 1.1, badge: { name: 'Insígnia Relíquia', color: '#7e57c2' }, xp: 160, intro: 'Meus Pokémon fantasmas dançam no escuro. Você consegue acompanhar?', defeat: 'Magnífique! Você dança muito bem. A Insígnia Relíquia é sua.' },
  { id: 'gym-5', kind: 'gym', order: 5, leader: 'Byron', role: 'Líder de Ginásio', sprite: `${DP}Byron`, type: 'steel', team: [208, 411, 436, 437, 462, 476], power: 1.15, badge: { name: 'Insígnia Mina', color: '#90a4ae' }, xp: 170, intro: 'Aço forjado na mina! Nenhum golpe vai amassar meus Pokémon!', defeat: 'Amassou o aço! Você é de ferro. Leve a Insígnia Mina.' },
  { id: 'gym-6', kind: 'gym', order: 6, leader: 'Candice', role: 'Líder de Ginásio', sprite: `${DP}Candice`, type: 'ice', team: [215, 461, 221, 473, 460, 478], power: 1.2, badge: { name: 'Insígnia Pingente', color: '#80deea' }, xp: 180, intro: 'Foco total! Meus Pokémon de gelo vão congelar sua equipe inteira!', defeat: 'Você derreteu meu gelo com a sua garra. A Insígnia Pingente é sua!' },
  { id: 'gym-7', kind: 'gym', order: 7, leader: 'Volkner', role: 'Líder de Ginásio', sprite: `${DP}Volkner`, type: 'electric', team: [403, 404, 405, 26, 135, 466], power: 1.25, badge: { name: 'Insígnia Farol', color: '#ffcb05' }, xp: 200, intro: 'Faz tempo que ninguém me dá um choque de verdade. Mostre essa faísca!', defeat: 'Finalmente uma batalha elétrica! A Insígnia Farol é sua. A Liga espera por você.' },
];

export const ELITE: readonly Challenge[] = [
  { id: 'elite-0', kind: 'elite', order: 0, leader: 'Aaron', role: 'Elite 4', sprite: `${DP}Aaron`, type: 'bug', team: [469, 212, 416, 214, 452], power: 1.3, xp: 220, intro: 'Os Pokémon inseto são lindos e fortes. Vou provar isso agora!', defeat: 'Você venceu com elegância. Siga em frente, a Bertha espera.' },
  { id: 'elite-1', kind: 'elite', order: 1, leader: 'Bertha', role: 'Elite 4', sprite: `${DP}Bertha`, type: 'ground', team: [340, 472, 450, 76, 464], power: 1.34, xp: 230, intro: 'Ah, que jovem animado! Vamos ver se você aguenta o tremor da terra.', defeat: 'Que maravilha! Faz tempo que não me divirto tanto. Vá, querido.' },
  { id: 'elite-2', kind: 'elite', order: 2, leader: 'Flint', role: 'Elite 4', sprite: `${DP}Flint`, type: 'fire', team: [229, 136, 78, 392, 467], power: 1.38, xp: 240, intro: 'Meu fogo queima mais quente que qualquer coisa! Vamos acender essa batalha!', defeat: 'Você apagou minhas chamas... mas acendeu meu coração. Siga!' },
  { id: 'elite-3', kind: 'elite', order: 3, leader: 'Lucian', role: 'Elite 4', sprite: `${DP}Lucian`, type: 'psychic', team: [122, 196, 437, 65, 475], power: 1.42, xp: 250, intro: 'Estava terminando um livro. Imagino que nossa batalha será um capítulo melhor.', defeat: 'Que final brilhante. A Campeã aguarda na próxima sala.' },
];

export const CHAMPION: Challenge = {
  id: 'champion', kind: 'champion', order: 0, leader: 'Cynthia', role: 'Campeã', sprite: `${DP}Cynthia`, type: null, team: [442, 407, 468, 448, 350, 445], power: 1.5, xp: 500,
  intro: 'Eu sou a Campeã. Vou dar tudo de mim, como os meus Pokémon dão tudo por mim.',
  defeat: 'Você é o novo Campeão! Seu nome e o de seus Pokémon vão para o Hall da Fama.',
};

export const ALL_CHALLENGES: readonly Challenge[] = [...GYMS, ...ELITE, CHAMPION];

export function challengeById(id: string): Challenge | null {
  return ALL_CHALLENGES.find((c) => c.id === id) ?? null;
}

export interface LeagueProgress {
  /** Ginásios vencidos (índices). */
  badges: number[];
  /** Quantos da Elite 4 já foram vencidos nesta corrida (0 a 4; 4 = Campeã liberada). */
  eliteStreak: number;
  /** Quantas vezes venceu a Campeã. */
  championWins: number;
  /** Desafios já vencidos alguma vez (para o XP cheio só na primeira). */
  beaten: string[];
}

export function emptyLeague(): LeagueProgress {
  return { badges: [], eliteStreak: 0, championWins: 0, beaten: [] };
}

export function normalizeLeague(raw: unknown): LeagueProgress {
  const r = (raw ?? {}) as Partial<LeagueProgress>;
  const badges = Array.isArray(r.badges) ? [...new Set(r.badges.filter((b) => Number.isInteger(b) && b >= 0 && b < GYMS.length))].sort((a, b) => a - b) : [];
  const ids = new Set(ALL_CHALLENGES.map((c) => c.id));
  return {
    badges,
    eliteStreak: Number.isInteger(r.eliteStreak) ? Math.min(ELITE.length, Math.max(0, r.eliteStreak!)) : 0,
    championWins: Number.isInteger(r.championWins) ? Math.max(0, r.championWins!) : 0,
    beaten: Array.isArray(r.beaten) ? r.beaten.filter((id): id is string => typeof id === 'string' && ids.has(id)) : [],
  };
}

export type ChallengeStatus = 'locked' | 'open' | 'beaten';

/**
 * Ginásio: aberto se o anterior já foi vencido (o primeiro sempre). A Elite 4 só abre com as 8 insígnias, um de cada
 * vez, na ordem da corrida; a Campeã depois dos 4. Desafios já vencidos continuam jogáveis (revanche).
 */
export function statusOf(progress: LeagueProgress, challenge: Challenge): ChallengeStatus {
  if (challenge.kind === 'gym') {
    if (progress.badges.includes(challenge.order)) return 'beaten';
    return challenge.order === 0 || progress.badges.includes(challenge.order - 1) ? 'open' : 'locked';
  }
  const allBadges = progress.badges.length === GYMS.length;
  if (!allBadges) return 'locked';
  if (challenge.kind === 'elite') {
    if (challenge.order === progress.eliteStreak) return 'open';
    return challenge.order < progress.eliteStreak ? 'beaten' : 'locked';
  }
  return progress.eliteStreak >= ELITE.length ? 'open' : progress.championWins > 0 ? 'beaten' : 'locked';
}

export interface LeagueOutcome {
  progress: LeagueProgress;
  /** Primeira vitória contra esse desafio. */
  first: boolean;
  /** O que dizer ao jogador. */
  message: string;
}

/** Aplica o resultado de uma batalha da Liga. */
export function applyLeagueResult(prev: LeagueProgress, challenge: Challenge, won: boolean): LeagueOutcome {
  const p: LeagueProgress = { ...prev, badges: [...prev.badges], beaten: [...prev.beaten] };
  if (!won) {
    if (challenge.kind !== 'gym' && p.eliteStreak > 0) {
      p.eliteStreak = 0;
      return { progress: p, first: false, message: 'A corrida da Elite 4 voltou ao começo. Treine e tente de novo!' };
    }
    return { progress: p, first: false, message: `${challenge.leader} venceu desta vez. Treine e tente de novo!` };
  }
  const first = !p.beaten.includes(challenge.id);
  if (first) p.beaten.push(challenge.id);
  if (challenge.kind === 'gym') {
    if (!p.badges.includes(challenge.order)) p.badges = [...p.badges, challenge.order].sort((a, b) => a - b);
    return { progress: p, first, message: first ? `Você ganhou a ${challenge.badge?.name ?? 'insígnia'}!` : `Revanche vencida contra ${challenge.leader}!` };
  }
  if (challenge.kind === 'elite') {
    p.eliteStreak = Math.max(p.eliteStreak, challenge.order + 1);
    return { progress: p, first, message: p.eliteStreak >= ELITE.length ? 'Os 4 da Elite foram vencidos! A Campeã espera.' : `${challenge.leader} foi vencido(a). Próximo da Elite 4!` };
  }
  p.championWins++;
  p.eliteStreak = 0;
  return { progress: p, first, message: 'Você é o Campeão da Liga! Hall da Fama!' };
}

/** O próximo desafio aberto (o que o jogador "deveria" fazer agora), ou null se a Liga foi vencida e nada está aberto. */
export function nextChallenge(progress: LeagueProgress): Challenge | null {
  return ALL_CHALLENGES.find((c) => statusOf(progress, c) === 'open') ?? null;
}
