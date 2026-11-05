import { buildFighter } from '../core/battle';
import { speciesName } from '../core/league';
import { MOVE_LEVEL_CAP } from '../core/pokemon-data';
import type { PokemonProfile } from '../core/pokemon-data';
import { suggestMoveset, toChosenMove } from '../core/moveset';
import type { ChosenMove } from '../core/moveset';
import { duelMonFrom } from '../core/turn-battle';
import type { DuelMon } from '../core/turn-battle';
import type { ArenaMember } from './arena-members';
import { leaderFighter } from './challenge-battle';
import { loadLearnset, loadMoveData } from './learnset-service';
import type { LearnsetDeps } from './learnset-service';
import { loadProfile } from './pokemon-data-service';

/** Como desenhar cada Pokémon do duelo. */
export interface DuelMonView {
  dexId: number;
  shiny: boolean;
}

export interface DuelOpponentSpec {
  trainer: string;
  role: string;
  dexIds: readonly number[];
  /** Multiplica os atributos (a dificuldade da Liga); treino = 1. */
  power: number;
  /** Desafio da Liga: o resultado vale para a Liga. */
  challengeId?: string;
  /** Endereço do sprite do treinador, se houver. */
  trainerSprite?: string;
}

export interface PreparedSide {
  mons: DuelMon[];
  views: DuelMonView[];
  /** Avisos do que faltou (aparecem antes do duelo). */
  notes: string[];
}

export interface DuelSetupDeps extends LearnsetDeps {
  /** Para testes; o padrão é a PokéAPI com o mesmo cache do resto do app. */
  profileOf?: (dexId: number) => Promise<PokemonProfile | null>;
  savedMovesOf: (member: ArenaMember) => ChosenMove[];
  /** Quem não tem golpes montados entra com os sugeridos, em vez de ficar de fora. */
  suggestMissing?: boolean;
  /** Nome da espécie (a lista da PokéAPI); sem ela, o nome conhecido da Liga ou "Pokémon nº N". */
  nameOf?: (dexId: number) => string | undefined;
}

/**
 * 4 golpes reais que a espécie aprende por nível até o nível 50, escolhidos pela mesma sugestão do editor. Lista vazia
 * quando a PokéAPI não respondeu e não há cópia guardada: nada é inventado.
 */
async function naturalMoves(dexId: number, profile: PokemonProfile | null, deps: LearnsetDeps): Promise<ChosenMove[]> {
  const learnset = await loadLearnset(dexId, deps);
  if (!learnset.ok) return [];
  const levelUp = learnset.value.moves.filter((m) => m.methods.includes('level-up') && (m.level ?? 0) <= MOVE_LEVEL_CAP);
  const { data } = await loadMoveData(levelUp, deps);
  const options = levelUp.flatMap((m) => {
    const move = data[m.slug];
    const choice = move ? toChosenMove(m.slug, move) : null;
    return choice ? [choice] : [];
  });
  if (options.length === 0) return [];
  return suggestMoveset(options, profile?.types ?? [], profile ? profile.stats.attack >= profile.stats.spAttack : true);
}

/**
 * Sua equipe com os golpes que você montou. Sem atributos da PokéAPI o Pokémon luta com valores médios e o aviso aparece
 * (como na Caixa); sem golpes montados ele fica de fora, com aviso, ou entra com os sugeridos (`suggestMissing`).
 */
export async function preparePlayerSide(members: readonly ArenaMember[], deps: DuelSetupDeps): Promise<PreparedSide> {
  const profileOf = deps.profileOf ?? ((dex: number) => loadProfile(dex, deps));
  const out: PreparedSide = { mons: [], views: [], notes: [] };
  for (const member of members) {
    let moves = deps.savedMovesOf(member);
    const profile = member.dexId === undefined ? null : await profileOf(member.dexId);
    if (member.dexId !== undefined && moves.length === 0 && deps.suggestMissing) {
      moves = await naturalMoves(member.dexId, profile, deps);
      if (moves.length > 0) out.notes.push(`${member.name} entrou com golpes sugeridos. Monte os seus em «Golpes da equipe».`);
    }
    if (member.dexId === undefined || moves.length === 0) {
      out.notes.push(`${member.name} ficou de fora: sem golpes montados.`);
      continue;
    }
    const fighter = buildFighter({ id: member.id, name: member.name, profile, card: null, gameMoves: [] });
    const mon = duelMonFrom(member.bond > 0 ? { ...fighter, bond: member.bond } : fighter, moves);
    for (const note of mon.fighter.notes) out.notes.push(`${member.name}: ${note}.`);
    out.mons.push(mon);
    out.views.push({ dexId: member.dexId, shiny: member.shiny });
  }
  return out;
}

/**
 * Equipe do oponente: atributos reais e 4 golpes reais que cada espécie aprende por nível até o nível 50 (como um
 * treinador dos jogos), escolhidos pela mesma sugestão do editor. Espécie sem atributos ou sem golpes fica de fora.
 */
export async function prepareFoeSide(spec: DuelOpponentSpec, deps: Omit<DuelSetupDeps, 'savedMovesOf'>): Promise<PreparedSide & { failed: string[] }> {
  const profileOf = deps.profileOf ?? ((dex: number) => loadProfile(dex, deps));
  const out: PreparedSide & { failed: string[] } = { mons: [], views: [], notes: [], failed: [] };
  for (const [i, dexId] of spec.dexIds.entries()) {
    const name = deps.nameOf?.(dexId) ?? speciesName(dexId);
    const profile = await profileOf(dexId);
    const moves = profile ? await naturalMoves(dexId, profile, deps) : [];
    if (!profile || moves.length === 0) {
      out.failed.push(name);
      continue;
    }
    const base = buildFighter({ id: `duelo:${i}`, name, profile, card: null, gameMoves: [] });
    out.mons.push(duelMonFrom(leaderFighter(base, spec.power), moves));
    out.views.push({ dexId, shiny: false });
  }
  return out;
}
