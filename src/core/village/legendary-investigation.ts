import { LEGEND_PLACES, legendStoryOf } from './legendary-stories';
import { legendaryOf, LEGENDARY_HISTORY_LIMIT } from './legendary';
import type { LegendaryState } from './legendary';
import type { Moment } from './social-state';

/** Toda investigação começa na Fonte e termina no cenário próprio; quando esse é a Fonte, passa pelo parque. */
export function investigationPlace(id: string, step: 0 | 1) {
  const story = legendStoryOf(id);
  if (!story) return null;
  return LEGEND_PLACES[step === 0 ? story.place === 'plaza' ? 'park' : 'plaza' : story.place];
}

export function beginInvestigation(state: LegendaryState, id: string): LegendaryState {
  if (!legendStoryOf(id) || state.active || state.seen[id]) return state;
  if (state.investigation?.id === id) return state;
  return { ...state, investigation: { id, step: 0 } };
}

/** Só avança por uma ação explícita perto da pista; menu, aproximação e replay não contam. */
export function inspectLegendClue(state: LegendaryState, player: { x: number; y: number }, now: string): { state: LegendaryState; message: string; encounter: boolean } {
  const task = state.investigation;
  const story = task && legendStoryOf(task.id);
  const place = task && investigationPlace(task.id, task.step);
  if (!task || !story || !place || state.active || state.seen[task.id] || !Number.isFinite(Date.parse(now))) return { state, message: 'Nenhuma pista disponível.', encounter: false };
  if (Math.abs(player.x - place.x) + Math.abs(player.y - place.y) > 2) return { state, message: `Aproxime-se de ${place.name} para investigar.`, encounter: false };
  if (task.step === 0) return { state: { ...state, investigation: { id: task.id, step: 1 } }, message: `${story.clue} Siga até ${LEGEND_PLACES[story.place].name}.`, encounter: false };
  return { state: { ...state, investigation: null, active: { id: task.id }, seen: { ...state.seen, [task.id]: now }, history: [...state.history, { id: task.id, at: now }].slice(-LEGENDARY_HISTORY_LIMIT) }, message: story.title, encounter: true };
}

export function legendDiaryPage(id: string, at: number, day: string, hour: number): Moment | null {
  const story = legendStoryOf(id), def = legendaryOf(id);
  if (!story || !def) return null;
  return { id: `legend-${id}-${at.toString(36)}`, t: at, day, hour, tpl: `lendario-${id}`, kind: 'solo', title: story.title, emoji: '✨',
    cast: [{ id: `lendario-${id}`, name: def.name }], lines: [{ who: 0, text: story.chapters[2]!.text }, { who: 0, text: story.chapters[3]!.text }],
    result: [`Encontro com ${def.name} registrado no Caderno de Lendas`], fav: true };
}
