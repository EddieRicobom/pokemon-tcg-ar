import { ENDLESS_ARENA_LABELS } from './endless-arena';
import type { EndlessArenaMode } from './endless-arena';

/** O que a pessoa quer fazer na Arena: a primeira escolha do menu, antes de montar equipe e opções. */
export type ArenaChoice = 'treino' | 'liga' | 'corridas' | 'pvp';

export const ARENA_CHOICES: readonly { id: ArenaChoice; icon: string; title: string; hint: string }[] = [
  { id: 'treino', icon: '⚔️', title: 'Luta 6×6', hint: 'Contra um treinador sorteado, em tempo real.' },
  { id: 'liga', icon: '🏅', title: 'Liga e desafios', hint: 'Enfrente líderes de ginásio e ganhe insígnias.' },
  { id: 'corridas', icon: '🏁', title: 'Corridas 6×6', hint: 'Lutas em sequência, valendo pontos.' },
  { id: 'pvp', icon: '🤝', title: 'PvP com um amigo', hint: 'Luta contra um amigo, cada um no seu aparelho.' },
];

export const ARENA_CHOICE_IDS: readonly ArenaChoice[] = ARENA_CHOICES.map((c) => c.id);

export function isArenaChoice(value: unknown): value is ArenaChoice {
  return ARENA_CHOICE_IDS.some((id) => id === value);
}

/** Sinalizadores do endereço que já dizem a opção certa (Vila, Fliperama, PvP, Liga). Vazio = a pessoa escolhe. */
export function choiceFromFlags(flags: ReadonlySet<string>, hasPendingChallenge: boolean): ArenaChoice | null {
  // O pedido do endereço vem antes do desafio guardado: quem vem do Fliperama luta, mesmo com um líder marcado.
  if (flags.has('pvp')) return 'pvp';
  if (flags.has('corridas') || flags.has('formatacao') || flags.has('restauracao')) return 'corridas';
  if (flags.has('liga')) return 'liga';
  if (flags.has('batalha') || flags.has('livre')) return 'treino';
  return hasPendingChallenge ? 'liga' : null;
}

/** Corrida pedida pelo endereço (`formatacao`/`restauracao`); a escolha padrão do menu é a primeira. */
export function endlessFromFlags(flags: ReadonlySet<string>): EndlessArenaMode | null {
  return flags.has('restauracao') ? 'restauracao' : flags.has('formatacao') ? 'formatacao' : null;
}

export interface ArenaPlanInput {
  choice: ArenaChoice | null;
  /** Quantos Pokémon estão na equipe de batalha. */
  teamCount: number;
  /** Por que esta equipe não pode lutar (Pokémon sem número da Pokédex), se for o caso. */
  teamBlocker?: string | null;
  endless: EndlessArenaMode;
  /** Líder do desafio da Liga já escolhido, se houver. */
  leader: string | null;
  /** O líder escolhido ainda está bloqueado. */
  leaderLocked?: boolean;
  /** PvP: já conectado com o amigo? */
  friendReady?: boolean;
}

export interface ArenaPlan {
  /** O botão principal pode ser tocado. */
  ready: boolean;
  /** Por que ainda não: a próxima coisa que a pessoa precisa fazer. */
  blocker: string | null;
  /** Uma frase com o que vai acontecer ao entrar. */
  summary: string;
  /** Texto do botão principal. */
  cta: string;
  /** Passo em que a pessoa está: 1 escolher, 2 equipe, 3 opções, 4 entrar. */
  step: 1 | 2 | 3 | 4;
}

/** A equipe da luta: sempre 6 de cada lado. */
export const ARENA_TEAM = 6;

/** Resume o que o menu da Arena vai fazer e o que falta, sem tocar em tela nem em armazenamento. */
export function arenaPlan(input: ArenaPlanInput): ArenaPlan {
  const { choice, teamCount } = input;
  if (!choice) return { ready: false, blocker: 'Escolha o que quer fazer na Arena.', summary: '', cta: 'Escolha uma opção acima', step: 1 };
  const pitch = 'Cada Pokémon ganha 10 níveis antes da luta, e você escolhe as cartas.';
  if (teamCount !== ARENA_TEAM) {
    return { ready: false, blocker: `A luta é 6×6: escolha exatamente ${ARENA_TEAM} Pokémon (hoje ${teamCount}).`, summary: pitch, cta: 'Complete a equipe de 6 primeiro', step: 2 };
  }
  if (input.teamBlocker) return { ready: false, blocker: input.teamBlocker, summary: pitch, cta: 'Troque a equipe primeiro', step: 2 };
  if (choice === 'pvp') {
    return { ready: true, blocker: null, summary: `Você e um amigo lutam em tempo real, cada um no seu aparelho. ${pitch}`, cta: '🤝 Conectar com um amigo', step: 4 };
  }
  if (choice === 'liga') {
    if (!input.leader) return { ready: false, blocker: 'Escolha um líder para desafiar.', summary: pitch, cta: 'Escolha um líder primeiro', step: 3 };
    if (input.leaderLocked) return { ready: false, blocker: `${input.leader} ainda está bloqueado: vença os desafios anteriores.`, summary: pitch, cta: 'Escolha um líder aberto', step: 3 };
    return { ready: true, blocker: null, summary: `Desafio contra ${input.leader}, valendo a Liga. ${pitch}`, cta: `🏅 Desafiar ${input.leader}`, step: 4 };
  }
  if (choice === 'corridas') {
    const run = ENDLESS_ARENA_LABELS[input.endless].title;
    return { ready: true, blocker: null, summary: `${run}: lutas 6×6 em sequência até você sair. ${pitch}`, cta: `🏁 Começar ${run}`, step: 4 };
  }
  return { ready: true, blocker: null, summary: `Luta 6×6 contra um treinador sorteado. ${pitch}`, cta: '⚔️ Preparar a luta', step: 4 };
}
