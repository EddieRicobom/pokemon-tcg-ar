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
  /** Nome da espécie (a lista da PokéAPI); sem ela, o nome conhecido da Liga ou "Pokémon nº N". */
  nameOf?: (dexId: number) => string | undefined;
}

/**
 * Sua equipe com os golpes que você montou. Sem atributos da PokéAPI o Pokémon luta com valores médios e o aviso aparece
 * (como na Caixa); sem golpes montados ele fica de fora, com aviso.
 */
export async function preparePlayerSide(members: readonly ArenaMember[], deps: DuelSetupDeps): Promise<PreparedSide> {
  const profileOf = deps.profileOf ?? ((dex: number) => loadProfile(dex, deps));
  const out: PreparedSide = { mons: [], views: [], notes: [] };
  for (const member of members) {
    const moves = deps.savedMovesOf(member);
    if (member.dexId === undefined || moves.length === 0) {
      out.notes.push(`${member.name} ficou de fora: sem golpes montados.`);
      continue;
    }
    const profile = await profileOf(member.dexId);
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
    const [profile, learnset] = await Promise.all([profileOf(dexId), loadLearnset(dexId, deps)]);
    if (!profile || !learnset.ok) {
      out.failed.push(name);
      continue;
    }
    const levelUp = learnset.value.moves.filter((m) => m.methods.includes('level-up') && (m.level ?? 0) <= MOVE_LEVEL_CAP);
    const { data } = await loadMoveData(levelUp, deps);
    const options = levelUp.flatMap((m) => {
      const move = data[m.slug];
      const choice = move ? toChosenMove(m.slug, move) : null;
      return choice ? [choice] : [];
    });
    if (options.length === 0) {
      out.failed.push(name);
      continue;
    }
    const moves = suggestMoveset(options, profile.types, profile.stats.attack >= profile.stats.spAttack);
    const base = buildFighter({ id: `duelo:${i}`, name, profile, card: null, gameMoves: [] });
    out.mons.push(duelMonFrom(leaderFighter(base, spec.power), moves));
    out.views.push({ dexId, shiny: false });
  }
  return out;
}
