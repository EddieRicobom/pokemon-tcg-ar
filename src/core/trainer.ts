/**
 * Treinador: XP, nível, sequência diária, missões do dia e conquistas. Tudo é conta pura sobre um estado simples
 * (guardado só no aparelho): `applyEvent(estado, evento, dia)` devolve o novo estado e as recompensas a mostrar.
 * O dia é passado de fora (`YYYY-MM-DD`, no fuso do aparelho), então os testes não dependem do relógio.
 */

export const TRAINER_VERSION = 1;

// ----------------------------------------------------------------------------- XP e nível

export const XP = {
  newCard: 50,
  repeatCardDaily: 10,
  battle: 15,
  /** Só as primeiras batalhas do dia rendem XP, para assistir lutas em sequência não virar fazenda de XP. */
  battlesPerDay: 5,
  mission: 40,
  allMissions: 100,
  /** Bônus por dia de sequência, no primeiro feito do dia (limitado). */
  streakPerDay: 5,
  streakMax: 50,
  minigameWin: 20,
  /** Só os primeiros minigames vencidos do dia rendem XP. */
  minigamesPerDay: 5,
  /** Revencer um Ginásio ou a Liga já vencida. */
  leagueRematch: 25,
  /** Vida na Vila: a primeira conversa do dia com cada Pokémon e cada pergunta respondida; só as primeiras do dia rendem XP. */
  villageTalk: 5,
  villageAnswer: 10,
  villagePerDay: 8,
  /** Uma batalha PvP (com um amigo) vale como uma batalha comum e conta para a missão. */
  pvpWin: 20,
} as const;

/** XP total para chegar ao nível `level` (nível 1 = 0). */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelOf(xp: number): number {
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 50)) / 2));
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP dentro do nível atual e quanto falta para o próximo. */
  into: number;
  span: number;
  frac: number;
  title: string;
}

const TITLES: [number, string][] = [
  [1, 'Novato'],
  [3, 'Colecionador'],
  [5, 'Treinador'],
  [8, 'Veterano'],
  [12, 'Mestre de cartas'],
  [18, 'Campeão'],
  [25, 'Lenda'],
];

export function titleOf(level: number): string {
  let title = TITLES[0]![1];
  for (const [from, name] of TITLES) if (level >= from) title = name;
  return title;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelOf(xp);
  const base = xpForLevel(level);
  const span = xpForLevel(level + 1) - base;
  const into = Math.max(0, xp - base);
  return { level, into, span, frac: Math.min(1, into / span), title: titleOf(level) };
}

// ----------------------------------------------------------------------------- estado

export type MissionKind = 'scan' | 'new' | 'battle' | 'team' | 'play' | 'talk' | 'answer';

export interface MissionDef {
  id: string;
  kind: MissionKind;
  target: number;
  label: string;
}

export interface SetProgress {
  name: string;
  total: number;
  ids: string[];
}

/** Energia de quem começa agora: dá para jogar o Pin Mode antes de ganhar o primeiro XP. */
export const STARTER_ENERGY = 120;

export interface TrainerState {
  v: number;
  xp: number;
  /** Energia do Pin Mode: sobe junto com o XP (na mesma quantia) e é gasta ao escolher um pin. O XP em si nunca é gasto. */
  energy: number;
  /** Cartas distintas já escaneadas (para saber se é nova) e coleções delas. */
  cardIds: string[];
  sets: Record<string, SetProgress>;
  /** Leituras no total (contando só as que valeram XP) e demais contadores de vida inteira. */
  scans: number;
  battles: number;
  teamBattles: number;
  minigames: number;
  minigameWins: number;
  /** Por minigame: partidas jogadas e melhor pontuação (0–100, quanto maior melhor). */
  games: Record<string, { played: number; best: number }>;
  streak: { current: number; best: number; lastDay: string };
  /** Vida na Vila (contadores de vida inteira): conversas do dia, perguntas respondidas, momentos novos no Álbum, apelidos dados. */
  life: { talks: number; answers: number; moments: number; nicknames: number };
  /** O maior nível de amizade que algum Pokémon já teve com você (0 a 4). */
  bestFriend: number;
  /** Liga: insígnias conquistadas e vezes que venceu a Campeã. */
  league: { badges: number; champion: number };
  /** Batalhas com um amigo (PvP): jogadas e vencidas. */
  pvp: { played: number; wins: number };
  /** Cartas shiny que já saíram. */
  shinies: number;
  /** Hoje: cartas que já valeram XP e progresso das missões. */
  today: { day: string; cards: string[]; battles: number; minigames: number; life: number; progress: Partial<Record<MissionKind, number>>; done: string[]; bonus: boolean };
  achievements: Record<string, string>;
}

export function emptyTrainer(): TrainerState {
  return {
    v: TRAINER_VERSION, xp: 0, energy: STARTER_ENERGY, cardIds: [], sets: {}, scans: 0, battles: 0, teamBattles: 0, minigames: 0, minigameWins: 0, games: {},
    streak: { current: 0, best: 0, lastDay: '' },
    life: { talks: 0, answers: 0, moments: 0, nicknames: 0 }, bestFriend: 0, league: { badges: 0, champion: 0 }, pvp: { played: 0, wins: 0 }, shinies: 0,
    today: { day: '', cards: [], battles: 0, minigames: 0, life: 0, progress: {}, done: [], bonus: false },
    achievements: {},
  };
}

export type TrainerEvent =
  | { type: 'scan'; cardId: string; setId: string; setName: string; setTotal: number; shiny?: boolean }
  | { type: 'battle'; team: boolean }
  | { type: 'minigame'; game: string; won: boolean; score: number }
  /** Vitória num Ginásio, na Elite 4 ou contra o Campeão. `first` = primeira vitória contra esse desafio (vale o XP cheio). */
  | { type: 'league'; title: string; xp: number; first: boolean; /** Insígnias e vitórias sobre a Campeã depois desta luta. */ badges?: number; championWins?: number }
  /** Uma batalha com um amigo (PvP, na Caixa ou no Pin Mode). */
  | { type: 'pvp'; won: boolean }
  /** Vida na Vila: `talk` = primeira conversa do dia com um Pokémon (`level` = amizade dele, 0 a 4); `answer` = respondeu a uma pergunta; `moment` = momento novo no Álbum; `nickname` = deu um apelido. */
  | { type: 'village'; /** `friend` só atualiza o melhor nível de amizade (subiu por presente, por exemplo). */ action: 'talk' | 'answer' | 'moment' | 'nickname' | 'friend'; level?: number };

export type RewardTone = 'xp' | 'new' | 'mission' | 'level' | 'achievement' | 'streak';

export interface Reward {
  text: string;
  sub?: string;
  tone: RewardTone;
}

// ----------------------------------------------------------------------------- dias e missões

export function dayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Dia anterior de uma chave `YYYY-MM-DD` (por calendário, sem depender de fuso nem horário de verão). */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Missões e conquistas de minigame só valem quando os minigames existem no app. */
export const MINIGAMES_ENABLED = true;

const MISSION_POOL: MissionDef[][] = [
  [
    { id: 'scan-3', kind: 'scan', target: 3, label: 'Escaneie 3 cartas' },
    { id: 'scan-5', kind: 'scan', target: 5, label: 'Escaneie 5 cartas' },
  ],
  [
    { id: 'new-1', kind: 'new', target: 1, label: 'Descubra 1 carta nova' },
    { id: 'new-2', kind: 'new', target: 2, label: 'Descubra 2 cartas novas' },
  ],
  [
    { id: 'battle-2', kind: 'battle', target: 2, label: 'Assista a 2 batalhas até o fim' },
    { id: 'team-1', kind: 'team', target: 1, label: 'Faça uma batalha em equipes ou 3 contra 3' },
  ],
  [
    { id: 'play-2', kind: 'play', target: 2, label: 'Jogue 2 minigames' },
    { id: 'play-1', kind: 'play', target: 1, label: 'Jogue 1 minigame' },
  ],
  [
    { id: 'talk-3', kind: 'talk', target: 3, label: 'Converse com 3 Pokémon na Vila' },
    { id: 'answer-1', kind: 'answer', target: 1, label: 'Responda a uma pergunta de um Pokémon' },
  ],
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** As 3 missões do dia: sempre uma de leitura, mais duas sorteadas (de forma fixa para o dia) entre as outras. */
export function missionsFor(day: string): MissionDef[] {
  const h = hash(day);
  const pick = (group: MissionDef[], salt: number) => group[(h >>> salt) % group.length]!;
  const others = (MINIGAMES_ENABLED ? [1, 2, 3, 4] : [1, 2, 4]).sort((a, b) => hash(`${day}:${a}`) - hash(`${day}:${b}`)).slice(0, 2);
  return [pick(MISSION_POOL[0]!, 1), ...others.map((g) => pick(MISSION_POOL[g]!, g + 3))];
}

// ----------------------------------------------------------------------------- conquistas

export interface AchievementDef {
  id: string;
  title: string;
  hint: string;
  test: (s: TrainerState) => boolean;
}

const bestSet = (s: TrainerState): number => Math.max(0, ...Object.values(s.sets).map((set) => set.ids.length));

const ALL_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'primeira-carta', title: 'Primeira carta', hint: 'Escaneie sua primeira carta.', test: (s) => s.cardIds.length >= 1 },
  { id: 'cartas-10', title: 'Pilha crescendo', hint: 'Tenha 10 cartas diferentes.', test: (s) => s.cardIds.length >= 10 },
  { id: 'cartas-50', title: 'Fichário cheio', hint: 'Tenha 50 cartas diferentes.', test: (s) => s.cardIds.length >= 50 },
  { id: 'cartas-150', title: 'Arquivista', hint: 'Tenha 150 cartas diferentes.', test: (s) => s.cardIds.length >= 150 },
  { id: 'colecao-8', title: 'Fã de coleção', hint: 'Tenha 8 cartas da mesma coleção.', test: (s) => bestSet(s) >= 8 },
  { id: 'colecao-20', title: 'Colecionador de verdade', hint: 'Tenha 20 cartas da mesma coleção.', test: (s) => bestSet(s) >= 20 },
  { id: 'sequencia-3', title: 'Três dias seguidos', hint: 'Jogue 3 dias seguidos.', test: (s) => s.streak.best >= 3 },
  { id: 'sequencia-7', title: 'Semana completa', hint: 'Jogue 7 dias seguidos.', test: (s) => s.streak.best >= 7 },
  { id: 'sequencia-30', title: 'Mês de treino', hint: 'Jogue 30 dias seguidos.', test: (s) => s.streak.best >= 30 },
  { id: 'batalha-1', title: 'Primeira batalha', hint: 'Faça uma batalha na Caixa.', test: (s) => s.battles >= 1 },
  { id: 'batalhas-10', title: 'Plateia fiel', hint: 'Assista a 10 batalhas até o fim.', test: (s) => s.battles >= 10 },
  { id: 'batalhas-50', title: 'Arena lotada', hint: 'Assista a 50 batalhas até o fim.', test: (s) => s.battles >= 50 },
  { id: 'equipe', title: 'Jogo de equipe', hint: 'Faça uma batalha em equipes ou 3 contra 3.', test: (s) => s.teamBattles >= 1 },
  { id: 'minigame-1', title: 'Hora do jogo', hint: 'Jogue um minigame.', test: (s) => s.minigames >= 1 },
  { id: 'minigame-10', title: 'Viciado em minigames', hint: 'Vença 10 minigames.', test: (s) => s.minigameWins >= 10 },
  { id: 'minigame-perfeito', title: 'Gabaritou', hint: 'Faça 100 pontos num minigame.', test: (s) => Object.values(s.games).some((g) => g.best >= 100) },
  { id: 'nivel-5', title: 'Nível 5', hint: 'Chegue ao nível 5.', test: (s) => levelOf(s.xp) >= 5 },
  { id: 'nivel-10', title: 'Nível 10', hint: 'Chegue ao nível 10.', test: (s) => levelOf(s.xp) >= 10 },
  { id: 'nivel-20', title: 'Nível 20', hint: 'Chegue ao nível 20.', test: (s) => levelOf(s.xp) >= 20 },
  // Vila.
  { id: 'vila-conversa', title: 'Bom vizinho', hint: 'Converse com os Pokémon da Vila em 30 ocasiões.', test: (s) => s.life.talks >= 30 },
  { id: 'vila-grande-amigo', title: 'Grande amigo', hint: 'Chegue ao nível 3 de amizade com um Pokémon (e dê um apelido a ele).', test: (s) => s.bestFriend >= 3 },
  { id: 'vila-melhor-amigo', title: 'Melhor amigo', hint: 'Chegue ao nível 4 de amizade com um Pokémon.', test: (s) => s.bestFriend >= 4 },
  { id: 'vila-apelido', title: 'Apelido carinhoso', hint: 'Dê um apelido a um Pokémon.', test: (s) => s.life.nicknames >= 1 },
  { id: 'vila-perguntas', title: 'Papo reto', hint: 'Responda a 10 perguntas dos Pokémon.', test: (s) => s.life.answers >= 10 },
  { id: 'vila-album', title: 'Memória de elefante', hint: 'Veja 25 momentos diferentes no Álbum da Vila.', test: (s) => s.life.moments >= 25 },
  // Liga e PvP.
  { id: 'liga-insignia', title: 'Primeira insígnia', hint: 'Vença um líder de Ginásio.', test: (s) => s.league.badges >= 1 },
  { id: 'liga-oito', title: 'Oito insígnias', hint: 'Conquiste as 8 insígnias da Liga.', test: (s) => s.league.badges >= 8 },
  { id: 'liga-campea', title: 'Campeão da Liga', hint: 'Vença a Campeã da Liga.', test: (s) => s.league.champion >= 1 },
  { id: 'pvp-1', title: 'Cara a cara', hint: 'Faça uma batalha com um amigo (PvP).', test: (s) => s.pvp.played >= 1 },
  { id: 'pvp-vitoria', title: 'Vitória em dupla', hint: 'Vença uma batalha PvP.', test: (s) => s.pvp.wins >= 1 },
  { id: 'shiny-1', title: 'Brilho raro', hint: 'Escaneie uma carta shiny.', test: (s) => s.shinies >= 1 },
];

export const ACHIEVEMENTS: AchievementDef[] = ALL_ACHIEVEMENTS.filter((a) => MINIGAMES_ENABLED || !a.id.startsWith('minigame'));

// ----------------------------------------------------------------------------- eventos

/** Cópia profunda por JSON: o estado é só dados simples (e funciona também com objetos reativos do Vue). */
function clone(state: TrainerState): TrainerState {
  return JSON.parse(JSON.stringify(state)) as TrainerState;
}

export interface Applied {
  state: TrainerState;
  rewards: Reward[];
  /** Conquistas que este evento acabou de destravar. */
  unlocked: string[];
}

/** Começa o dia: zera o que é diário e mexe na sequência. Devolve o bônus de sequência da primeira atividade do dia. */
function startDay(s: TrainerState, day: string, rewards: Reward[]): number {
  if (s.today.day === day) return 0;
  s.today = { day, cards: [], battles: 0, minigames: 0, life: 0, progress: {}, done: [], bonus: false };
  const last = s.streak.lastDay;
  s.streak.current = last === previousDay(day) ? s.streak.current + 1 : 1;
  s.streak.best = Math.max(s.streak.best, s.streak.current);
  s.streak.lastDay = day;
  const bonus = s.streak.current > 1 ? Math.min(XP.streakMax, XP.streakPerDay * s.streak.current) : 0;
  if (s.streak.current > 1) rewards.push({ text: `Sequência de ${s.streak.current} dias!`, sub: bonus ? `+${bonus} XP de bônus` : undefined, tone: 'streak' });
  return bonus;
}

function bump(s: TrainerState, kind: MissionKind, rewards: Reward[]): number {
  s.today.progress[kind] = (s.today.progress[kind] ?? 0) + 1;
  let gained = 0;
  const missions = missionsFor(s.today.day);
  for (const mission of missions) {
    if (mission.kind !== kind || s.today.done.includes(mission.id)) continue;
    if ((s.today.progress[kind] ?? 0) < mission.target) continue;
    s.today.done.push(mission.id);
    gained += XP.mission;
    rewards.push({ text: 'Missão cumprida!', sub: `${mission.label} · +${XP.mission} XP`, tone: 'mission' });
  }
  if (!s.today.bonus && missions.every((m) => s.today.done.includes(m.id))) {
    s.today.bonus = true;
    gained += XP.allMissions;
    rewards.push({ text: 'Todas as missões de hoje!', sub: `+${XP.allMissions} XP`, tone: 'mission' });
  }
  return gained;
}

/** Aplica um evento (leitura de carta, batalha, minigame). Não altera o estado recebido. */
export function applyEvent(prev: TrainerState, event: TrainerEvent, day: string): Applied {
  const s: TrainerState = clone(prev);
  const rewards: Reward[] = [];
  const levelBefore = levelOf(s.xp);
  let gain = startDay(s, day, rewards);

  if (event.type === 'scan') {
    const isNew = !s.cardIds.includes(event.cardId);
    if (isNew) {
      if (event.shiny) s.shinies++;
      s.cardIds.push(event.cardId);
      const set = (s.sets[event.setId] ??= { name: event.setName, total: event.setTotal, ids: [] });
      set.name = event.setName;
      set.total = event.setTotal;
      set.ids.push(event.cardId);
    }
    const firstToday = !s.today.cards.includes(event.cardId);
    if (firstToday) s.today.cards.push(event.cardId);
    if (isNew) {
      gain += XP.newCard;
      rewards.push({ text: 'Carta nova!', sub: `${event.setName} · +${XP.newCard} XP`, tone: 'new' });
      gain += bump(s, 'new', rewards);
    } else if (firstToday) {
      gain += XP.repeatCardDaily;
      rewards.push({ text: `+${XP.repeatCardDaily} XP`, sub: 'Carta já conhecida, primeira leitura de hoje', tone: 'xp' });
    }
    if (firstToday) {
      s.scans++;
      gain += bump(s, 'scan', rewards);
    }
  } else if (event.type === 'battle') {
    s.battles++;
    if (event.team) s.teamBattles++;
    s.today.battles++;
    if (s.today.battles <= XP.battlesPerDay) {
      gain += XP.battle;
      rewards.push({ text: 'Batalha concluída', sub: `+${XP.battle} XP`, tone: 'xp' });
    }
    gain += bump(s, 'battle', rewards);
    if (event.team) gain += bump(s, 'team', rewards);
  } else if (event.type === 'league') {
    s.battles++;
    s.today.battles++;
    if (typeof event.badges === 'number') s.league.badges = Math.max(s.league.badges, Math.max(0, Math.min(8, Math.floor(event.badges))));
    if (typeof event.championWins === 'number') s.league.champion = Math.max(s.league.champion, Math.max(0, Math.floor(event.championWins)));
    const xp = event.first ? Math.max(0, Math.round(event.xp)) : XP.leagueRematch;
    gain += xp;
    rewards.push({ text: event.title, sub: `+${xp} XP e energia`, tone: event.first ? 'achievement' : 'xp' });
    gain += bump(s, 'battle', rewards);
  } else if (event.type === 'pvp') {
    s.pvp.played++;
    if (event.won) s.pvp.wins++;
    s.battles++;
    s.today.battles++;
    if (s.today.battles <= XP.battlesPerDay) {
      const xp = event.won ? XP.pvpWin : XP.battle;
      gain += xp;
      rewards.push({ text: event.won ? 'Vitória contra um amigo!' : 'Batalha com um amigo', sub: `+${xp} XP`, tone: 'xp' });
    }
    gain += bump(s, 'battle', rewards);
  } else if (event.type === 'village') {
    const level = Math.max(0, Math.min(4, Math.floor(event.level ?? 0)));
    s.bestFriend = Math.max(s.bestFriend, level);
    let xp = 0;
    if (event.action === 'talk') {
      s.life.talks++;
      xp = XP.villageTalk;
      gain += bump(s, 'talk', rewards);
    } else if (event.action === 'answer') {
      s.life.answers++;
      xp = XP.villageAnswer;
      gain += bump(s, 'answer', rewards);
    } else if (event.action === 'moment') s.life.moments++;
    else if (event.action === 'nickname') s.life.nicknames++;
    if (xp > 0 && s.today.life < XP.villagePerDay) {
      gain += xp;
      rewards.push({ text: `+${xp} XP`, sub: event.action === 'talk' ? 'Primeira conversa de hoje com um Pokémon' : 'Pergunta respondida', tone: 'xp' });
    }
    if (xp > 0) s.today.life++;
  } else {
    s.minigames++;
    s.today.minigames++;
    const stats = (s.games[event.game] ??= { played: 0, best: 0 });
    stats.played++;
    stats.best = Math.max(stats.best, Math.max(0, Math.min(100, Math.round(event.score))));
    if (event.won) {
      s.minigameWins++;
      if (s.today.minigames <= XP.minigamesPerDay) {
        gain += XP.minigameWin;
        rewards.push({ text: 'Minigame vencido!', sub: `+${XP.minigameWin} XP`, tone: 'xp' });
      }
    }
    gain += bump(s, 'play', rewards);
  }

  s.xp += gain;
  s.energy += gain;
  const level = levelOf(s.xp);
  if (level > levelBefore) rewards.push({ text: `Nível ${level}!`, sub: titleOf(level), tone: 'level' });

  const unlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id] || !a.test(s)) continue;
    s.achievements[a.id] = day;
    unlocked.push(a.id);
    rewards.push({ text: 'Conquista!', sub: a.title, tone: 'achievement' });
  }
  return { state: s, rewards, unlocked };
}

/** Gasta energia (ao escolher um pin). Devolve o novo estado, ou null se não houver energia suficiente. */
export function spendEnergy(prev: TrainerState, amount: number): TrainerState | null {
  const cost = Math.max(0, Math.floor(amount));
  if (cost > prev.energy) return null;
  return { ...clone(prev), energy: prev.energy - cost };
}

/** Importa o histórico já guardado no aparelho (cartas e leituras) sem dar XP, uma vez só. */
export function importHistory(prev: TrainerState, cards: { id: string; setId: string; setName: string; setOfficial: number; scanCount: number }[], day: string): TrainerState {
  const s: TrainerState = clone(prev);
  for (const card of cards) {
    if (s.cardIds.includes(card.id)) continue;
    s.cardIds.push(card.id);
    const set = (s.sets[card.setId] ??= { name: card.setName, total: card.setOfficial, ids: [] });
    set.ids.push(card.id);
    s.scans += Math.max(1, card.scanCount);
  }
  for (const a of ACHIEVEMENTS) if (!s.achievements[a.id] && a.test(s)) s.achievements[a.id] = day;
  return s;
}

/** Normaliza o que veio do armazenamento: só aceita o formato conhecido, o resto volta ao estado vazio. */
export function normalizeTrainer(raw: unknown): TrainerState {
  const base = emptyTrainer();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<TrainerState>;
  if (r.v !== TRAINER_VERSION) return base;
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  const strs = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  const sets: Record<string, SetProgress> = {};
  if (r.sets && typeof r.sets === 'object') {
    for (const [id, v] of Object.entries(r.sets)) {
      if (v && typeof v.name === 'string') sets[id] = { name: v.name, total: num(v.total), ids: strs(v.ids) };
    }
  }
  const games: Record<string, { played: number; best: number }> = {};
  if (r.games && typeof r.games === 'object') {
    for (const [id, g] of Object.entries(r.games)) if (g && typeof g === 'object') games[id] = { played: num(g.played), best: Math.min(100, num(g.best)) };
  }
  const achievements: Record<string, string> = {};
  if (r.achievements && typeof r.achievements === 'object') {
    for (const [id, day] of Object.entries(r.achievements)) if (typeof day === 'string') achievements[id] = day;
  }
  const progress: Partial<Record<MissionKind, number>> = {};
  for (const kind of ['scan', 'new', 'battle', 'team', 'play', 'talk', 'answer'] as const) {
    const value = r.today?.progress?.[kind];
    if (value) progress[kind] = num(value);
  }
  return {
    v: TRAINER_VERSION, xp: num(r.xp),
    // Progresso salvo antes da energia existir: parte do XP já ganho (nunca menos que a energia inicial).
    energy: typeof r.energy === 'number' ? num(r.energy) : Math.max(STARTER_ENERGY, num(r.xp)),
    cardIds: strs(r.cardIds), sets, scans: num(r.scans), battles: num(r.battles), teamBattles: num(r.teamBattles), minigames: num(r.minigames), minigameWins: num(r.minigameWins), games,
    streak: { current: num(r.streak?.current), best: num(r.streak?.best), lastDay: typeof r.streak?.lastDay === 'string' ? r.streak.lastDay : '' },
    life: { talks: num(r.life?.talks), answers: num(r.life?.answers), moments: num(r.life?.moments), nicknames: num(r.life?.nicknames) },
    bestFriend: Math.min(4, num(r.bestFriend)),
    league: { badges: Math.min(8, num(r.league?.badges)), champion: num(r.league?.champion) },
    pvp: { played: num(r.pvp?.played), wins: Math.min(num(r.pvp?.played), num(r.pvp?.wins)) },
    shinies: num(r.shinies),
    today: { day: typeof r.today?.day === 'string' ? r.today.day : '', cards: strs(r.today?.cards), battles: num(r.today?.battles), minigames: num(r.today?.minigames), life: num(r.today?.life), progress, done: strs(r.today?.done), bonus: r.today?.bonus === true },
    achievements,
  };
}
