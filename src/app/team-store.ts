import { ref } from 'vue';
import type { Ref } from 'vue';
import { loadArenaTeam, loadSavedTeam, saveArenaTeam, saveTeam, toggleMember } from './team';
import { seedArenaTeam } from '../core/arena-team';

/** Equipe escolhida pelo usuário (ids), compartilhada entre as telas. Vazia = automática (as mais recentes). */
export const savedTeam = ref<string[]>(loadSavedTeam());

export function setSavedTeam(ids: string[]): void {
  savedTeam.value = ids;
  saveTeam(ids);
}

/** Liga/desliga uma carta. Devolve true se não coube (equipe cheia). */
export function toggleSaved(id: string): boolean {
  const { team, full } = toggleMember(savedTeam.value, id);
  if (!full) setSavedTeam(team);
  return full;
}

/** De onde o TeamPicker lê e para onde grava. */
export interface TeamSource {
  readonly team: Ref<string[]>;
  save(ids: string[]): void;
  /** Chamado com as cartas já lidas, antes de mostrar a equipe. */
  prepare?(knownIds: ReadonlySet<string>): void;
}

export const villageTeamSource: TeamSource = { team: savedTeam, save: setSavedTeam };

const storedArenaTeam = loadArenaTeam();
/** Equipe das lutas da Arena (até 6). Mexer nela nunca altera a da Caixa/Vila. */
export const arenaTeam = ref<string[]>(storedArenaTeam ?? []);
let arenaMigrated = storedArenaTeam !== null;

export function setArenaTeam(ids: string[]): void {
  arenaTeam.value = ids;
  arenaMigrated = true;
  saveArenaTeam(ids);
}

/** Na primeira vez, a Arena nasce da equipe da Caixa; a validade dos ids depende das cartas, por isso não roda ao carregar o módulo. */
function migrateArenaTeam(knownIds: ReadonlySet<string>): void {
  if (arenaMigrated) return;
  const seed = seedArenaTeam(savedTeam.value, knownIds);
  if (seed.settled) setArenaTeam(seed.ids);
}

/** Relê o que está gravado, descartando o estado em memória. */
export function reloadArenaTeam(): void {
  const stored = loadArenaTeam();
  arenaTeam.value = stored ?? [];
  arenaMigrated = stored !== null;
}

export const arenaTeamSource: TeamSource = { team: arenaTeam, save: setArenaTeam, prepare: migrateArenaTeam };
