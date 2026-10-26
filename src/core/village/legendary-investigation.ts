import { firstSignPlace, LEGEND_PLACES, LEGEND_STORIES, legendStoryOf } from './legendary-stories';
import type { LegendStory } from './legendary-stories';
import { legendaryOf, LEGENDARY_HISTORY_LIMIT } from './legendary';
import type { LegendaryState } from './legendary';
import { isLegendUnlocked } from './legendary-unlock';
import type { Moment } from './social-state';

/** A primeira pista fica num lugar espalhado pelo mapa (`firstSignPlace`); a segunda, no cenário próprio. */
export function investigationPlace(id: string, step: 0 | 1) {
  const story = legendStoryOf(id);
  if (!story) return null;
  return LEGEND_PLACES[step === 0 ? firstSignPlace(story) : story.place];
}

/** Etapa atual da pista de um lendário (0 enquanto ninguém a investigou). */
export function legendStep(state: LegendaryState, id: string): 0 | 1 {
  return state.progress[id] === 1 ? 1 : 0;
}

/** Lendários com pista aberta: região liberada pela Liga e ainda não vividos. Todos ficam ativos ao mesmo tempo. */
export function openLegendClues(state: LegendaryState, regions: ReadonlySet<string>): LegendStory[] {
  return LEGEND_STORIES.filter((story) => !state.seen[story.id] && isLegendUnlocked(story.id, regions));
}

export interface NearbyClue { story: LegendStory; step: 0 | 1; place: NonNullable<ReturnType<typeof investigationPlace>> }

/** Todas as pistas abertas ao alcance do jogador: vários lendários podem dividir o mesmo ponto e avançam juntos. */
export function nearbyLegendClues(state: LegendaryState, player: { x: number; y: number }, regions: ReadonlySet<string>): NearbyClue[] {
  const out: NearbyClue[] = [];
  for (const story of openLegendClues(state, regions)) {
    const step = legendStep(state, story.id), place = investigationPlace(story.id, step);
    if (place && Math.abs(player.x - place.x) + Math.abs(player.y - place.y) <= 2) out.push({ story, step, place });
  }
  return out;
}

const listNames = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0] ?? '';

/**
 * Só avança por uma ação explícita perto da pista; menu, aproximação e replay não contam. Todas as pistas do ponto
 * avançam de uma vez: as primeiras ganham a etapa seguinte e as finais viram encontros, vistos um após o outro.
 */
export function inspectLegendClue(state: LegendaryState, player: { x: number; y: number }, now: string, regions: ReadonlySet<string>): { state: LegendaryState; message: string; encounter: boolean; encounters: string[] } {
  const near = nearbyLegendClues(state, player, regions);
  if (state.active || !Number.isFinite(Date.parse(now)) || !near.length) return { state, message: 'Nenhuma pista por aqui.', encounter: false, encounters: [] };
  const firsts = near.filter((clue) => clue.step === 0), finals = near.filter((clue) => clue.step === 1);
  const progress = { ...state.progress };
  for (const { story } of firsts) progress[story.id] = 1;
  for (const { story } of finals) delete progress[story.id];
  const ids = finals.map((clue) => clue.story.id);
  const next: LegendaryState = { ...state, progress };
  if (ids.length) {
    next.seen = { ...state.seen, ...Object.fromEntries(ids.map((id) => [id, now])) };
    next.history = [...state.history, ...ids.map((id) => ({ id, at: now }))].slice(-LEGENDARY_HISTORY_LIMIT);
    next.active = { id: ids[0]! };
    next.queue = [...state.queue, ...ids.slice(1)];
  }
  const message = ids.length ? (finals.length === 1 ? finals[0]!.story.title : `${listNames(finals.map((clue) => clue.story.name))} se revelam, um de cada vez.`)
    : firsts.length === 1 ? `${firsts[0]!.story.clue} Siga até ${LEGEND_PLACES[firsts[0]!.story.place].name}.`
    : `Pistas de ${listNames(firsts.map((clue) => clue.story.name))}. Elas levam a ${listNames([...new Set(firsts.map((clue) => LEGEND_PLACES[clue.story.place].name))])}.`;
  return { state: next, message, encounter: ids.length > 0, encounters: ids };
}

export function legendDiaryPage(id: string, at: number, day: string, hour: number): Moment | null {
  const story = legendStoryOf(id), def = legendaryOf(id);
  if (!story || !def) return null;
  return { id: `legend-${id}-${at.toString(36)}`, t: at, day, hour, tpl: `lendario-${id}`, kind: 'solo', title: story.title, emoji: '✨',
    cast: [{ id: `lendario-${id}`, name: def.name }], lines: [{ who: 0, text: story.chapters[2]!.text }, { who: 0, text: story.chapters[3]!.text }],
    result: [`Encontro com ${def.name} registrado no Caderno de Lendas`], fav: true };
}
