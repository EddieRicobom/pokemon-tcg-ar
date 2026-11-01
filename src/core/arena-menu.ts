import { BATTLE_MODE_LABELS_PT } from './battle';
import type { BattleMode } from './battle';
import { ENDLESS_ARENA_LABELS } from './endless-arena';
import type { EndlessArenaMode } from './endless-arena';

/** O que a pessoa quer fazer na Arena: a primeira escolha do menu, antes de montar equipe e opções. */
export type ArenaChoice = 'livre' | 'liga' | 'corridas' | 'pvp';

export const ARENA_CHOICES: readonly { id: ArenaChoice; icon: string; title: string; hint: string }[] = [
  { id: 'livre', icon: '⚔️', title: 'Batalha livre', hint: 'Seus Pokémon lutam sozinhos no Coliseu, sem desafio.' },
  { id: 'liga', icon: '🏅', title: 'Liga e desafios', hint: 'Enfrente líderes de ginásio e ganhe insígnias.' },
  { id: 'corridas', icon: '🏁', title: 'Corridas 6×6', hint: 'Batalhas em sequência, valendo pontos.' },
  { id: 'pvp', icon: '🤝', title: 'PvP com um amigo', hint: 'Luta contra um amigo, cada um no seu aparelho.' },
];

export const ARENA_CHOICE_IDS: readonly ArenaChoice[] = ARENA_CHOICES.map((c) => c.id);

export function isArenaChoice(value: unknown): value is ArenaChoice {
  return ARENA_CHOICE_IDS.some((id) => id === value);
}

/** Sinalizadores do endereço que já dizem a opção certa (Vila, Fliperama, PvP, Liga). Vazio = a pessoa escolhe. */
export function choiceFromFlags(flags: ReadonlySet<string>, hasPendingChallenge: boolean): ArenaChoice | null {
  if (flags.has('pvp')) return 'pvp';
  if (flags.has('corridas') || flags.has('formatacao') || flags.has('restauracao')) return 'corridas';
  if (flags.has('liga') || hasPendingChallenge) return 'liga';
  if (flags.has('batalha') || flags.has('livre')) return 'livre';
  return null;
}

/** Corrida pedida pelo endereço (`formatacao`/`restauracao`); a escolha padrão do menu é a primeira. */
export function endlessFromFlags(flags: ReadonlySet<string>): EndlessArenaMode | null {
  return flags.has('restauracao') ? 'restauracao' : flags.has('formatacao') ? 'formatacao' : null;
}

export interface ArenaPlanInput {
  choice: ArenaChoice | null;
  /** Quantos Pokémon estão na equipe de batalha. */
  teamCount: number;
  mode: BattleMode;
  endless: EndlessArenaMode;
  /** Líder do desafio da Liga já escolhido, se houver. */
  leader: string | null;
  /** PvP: já conectado com o amigo? */
  pvpConnected: boolean;
  /** PvP: nome do amigo conectado. */
  friend?: string | null;
  /** Batalha livre: por que o formato escolhido não cabe na equipe (`battleModeBlocker`), se não couber. */
  modeBlocker?: string | null;
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

function plural(n: number): string {
  return `${n} Pokémon`;
}

/** Resume o que o menu da Arena vai fazer e o que falta, sem tocar em tela nem em armazenamento. */
export function arenaPlan(input: ArenaPlanInput): ArenaPlan {
  const { choice, teamCount } = input;
  if (!choice) return { ready: false, blocker: 'Escolha o que quer fazer na Arena.', summary: '', cta: 'Escolha uma opção acima', step: 1 };
  const modeName = BATTLE_MODE_LABELS_PT[input.mode];
  if (choice === 'pvp') {
    if (!input.pvpConnected) {
      return { ready: false, blocker: 'Conecte com o amigo (código da sala) para continuar.', summary: 'Você e um amigo lutam cada um no seu aparelho, com a equipe que cada um montou.', cta: 'Conecte com um amigo primeiro', step: 2 };
    }
    const friend = input.friend || 'o amigo';
    if (teamCount < 1) return { ready: false, blocker: 'Escolha pelo menos 1 Pokémon para a luta.', summary: `Conectado com ${friend}.`, cta: 'Escolha a equipe primeiro', step: 3 };
    return { ready: true, blocker: null, summary: `PvP com ${friend}: o anfitrião escolhe o modo e toca em Batalhar; ${plural(teamCount)} seu${teamCount === 1 ? '' : 's'} entram na luta.`, cta: '🤝 Entrar na Arena do PvP', step: 4 };
  }
  if (choice === 'liga') {
    if (teamCount < 1) return { ready: false, blocker: 'Escolha pelo menos 1 Pokémon para o desafio.', summary: 'Você escolhe um líder, monta a equipe e enfrenta o desafio na Arena.', cta: 'Escolha a equipe primeiro', step: 2 };
    if (!input.leader) return { ready: false, blocker: 'Escolha um líder para desafiar.', summary: `${plural(teamCount)} prontos para a Liga.`, cta: 'Escolha um líder primeiro', step: 3 };
    return { ready: true, blocker: null, summary: `Desafio contra ${input.leader}: até 6 dos seus ${plural(teamCount)} lutam contra a equipe do líder, um duelo por vez.`, cta: `🏅 Entrar na Arena e desafiar ${input.leader}`, step: 4 };
  }
  if (choice === 'corridas') {
    const run = ENDLESS_ARENA_LABELS[input.endless].title;
    if (teamCount < 6) return { ready: false, blocker: `A corrida 6×6 pede exatamente 6 Pokémon (hoje ${teamCount}).`, summary: 'Batalhas automáticas em sequência, com a sua equipe de 6.', cta: 'Complete a equipe de 6 primeiro', step: 2 };
    return { ready: true, blocker: null, summary: `${run}: batalhas 6×6 em sequência até você desistir. O placar da sessão é guardado.`, cta: `🏁 Entrar na Arena · ${run}`, step: 4 };
  }
  if (teamCount < 2) return { ready: false, blocker: 'Escolha pelo menos 2 Pokémon para batalhar.', summary: 'Seus Pokémon lutam sozinhos no Coliseu virtual.', cta: 'Escolha a equipe primeiro', step: 2 };
  if (input.modeBlocker) return { ready: false, blocker: input.modeBlocker, summary: `Batalha livre (${modeName}).`, cta: 'Troque o formato ou a equipe', step: 3 };
  return { ready: true, blocker: null, summary: `Batalha livre (${modeName}): ${plural(teamCount)} lutam sozinhos no Coliseu virtual, sem câmera.`, cta: '⚔️ Entrar na Arena e batalhar', step: 4 };
}
