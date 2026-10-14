import { ref } from 'vue';
import { loadSavedTeam, saveTeam, toggleMember } from './team';

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
