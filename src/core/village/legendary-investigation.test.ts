import { describe, expect, it } from 'vitest';
import { firstSignPlace, LEGEND_STORIES, LEGEND_PLACES, legendStoryOf } from './legendary-stories';
import { inspectLegendClue, investigationPlace, legendDiaryPage, legendStep, nearbyLegendClues, openLegendClues } from './legendary-investigation';
import { dismissActive, emptyLegendary, legendaryEffects, normalizeLegendary, NO_EFFECTS, LEGENDARIES, LEGENDARY_HISTORY_LIMIT } from './legendary';
import { generateVillage, isWalkable, reachableFrom } from './map';
import { pathStep } from './pathing';
import { advance, makeWalker, tryStep } from './actors';

const NOW = '2026-10-21T12:00:00.000Z';
describe('catálogo completo das lendas', () => {
  it('inclui as 94 espécies da PokéAPI, sem duplicar formas ou perder os 13 visitantes anteriores', () => {
    expect(LEGEND_STORIES).toHaveLength(94);
    expect(LEGEND_STORIES.filter((story) => story.mythical)).toHaveLength(23);
    expect(new Set(LEGEND_STORIES.map((story) => story.dexId)).size).toBe(94);
    expect(new Set(LEGEND_STORIES.map((story) => story.id)).size).toBe(94);
    expect(LEGENDARIES.map((entry) => entry.id).sort()).toEqual(LEGEND_STORIES.map((entry) => entry.id).sort());
    expect(LEGEND_STORIES.map((entry) => entry.dexId)).toEqual(expect.arrayContaining([144,150,151,250,251,493,905,1017,1024,1025]));
    expect(new Set(LEGEND_STORIES.map((story) => story.title)).size).toBe(94);
    expect(new Set(LEGEND_STORIES.flatMap((story) => story.chapters.map((chapter) => chapter.text))).size).toBe(94 * 4);
  });
});

const ALL = new Set(LEGEND_STORIES.map((story) => story.region));
describe('investigações com ações reais', () => {
  it.each(LEGEND_STORIES.map((story) => [story.id] as const))('%s: requer as duas pistas em locais distintos, persiste a etapa e não duplica visita', (id) => {
    // Os outros já vividos: vários lendários dividem a mesma pista e o mais antigo da lista tem prioridade.
    const initial = { ...emptyLegendary(), seen: Object.fromEntries(LEGEND_STORIES.filter((story) => story.id !== id).map((story) => [story.id, NOW])) };
    let state = initial;
    const first = investigationPlace(id, 0)!, last = investigationPlace(id, 1)!;
    expect(first).not.toEqual(last);
    expect(inspectLegendClue(state, { x: 0, y: 0 }, NOW, ALL).state).toBe(state);
    expect(inspectLegendClue(state, first, NOW, new Set()).state).toBe(state);
    expect(initial.history).toHaveLength(0);
    state = inspectLegendClue(state, first, NOW, new Set([legendStoryOf(id)!.region])).state;
    expect(legendStep(state, id)).toBe(1);
    expect(state.active).toBeNull();
    state = normalizeLegendary(JSON.parse(JSON.stringify(state)));
    expect(legendStep(state, id)).toBe(1);
    const result = inspectLegendClue(state, last, NOW, ALL);
    expect(result.encounter).toBe(true);
    expect(result.state.history).toEqual([{ id, at: NOW }]);
    expect(result.state.seen[id]).toBe(NOW);
    expect(result.state.active?.id).toBe(id);
    expect(result.state.progress[id]).toBeUndefined();
    expect(inspectLegendClue(result.state, last, NOW, ALL).encounter).toBe(false);
    expect(legendDiaryPage(id, Date.parse(NOW), '2026-10-21', 12)?.cast[0]?.name).toBe(LEGEND_STORIES.find((story) => story.id === id)?.name);
  });

  it('só abre pistas das regiões liberadas, todas ao mesmo tempo', () => {
    const state = emptyLegendary();
    expect(openLegendClues(state, new Set())).toHaveLength(0);
    const kanto = openLegendClues(state, new Set(['Kanto']));
    expect(kanto.length).toBeGreaterThan(1);
    expect(kanto.every((story) => story.region === 'Kanto')).toBe(true);
    const story = LEGEND_STORIES.find((entry) => entry.region === 'Johto')!;
    const spot = investigationPlace(story.id, 0)!;
    expect(inspectLegendClue(state, spot, NOW, new Set(['Kanto'])).state).toBe(state);
    expect(nearbyLegendClues(state, spot, new Set(['Johto'])).length).toBeGreaterThan(0);
  });

  it('não troca uma cena pendente por outra e rejeita data inválida', () => {
    const pending = { ...emptyLegendary(), active: { id: 'lugia' } };
    const place = investigationPlace('mew', 0)!;
    expect(inspectLegendClue(pending, place, NOW, ALL).state).toBe(pending);
    const initial = emptyLegendary();
    expect(inspectLegendClue(initial, place, 'invalid', ALL).state).toBe(initial);
  });

  it('vários lendários no mesmo ponto avançam juntos e os encontros entram em fila', () => {
    const regions = new Set(['Kanto', 'Johto', 'Hoenn']);
    const stories = openLegendClues(emptyLegendary(), regions);
    const spot = investigationPlace(stories[0]!.id, 0)!;
    const together = stories.filter((story) => investigationPlace(story.id, 0) === spot);
    expect(together.length).toBeGreaterThan(1);
    let state = inspectLegendClue(emptyLegendary(), spot, NOW, regions).state;
    for (const story of together) expect(legendStep(state, story.id)).toBe(1);
    const finalSpot = investigationPlace(together[0]!.id, 1)!;
    const sharing = together.filter((story) => investigationPlace(story.id, 1) === finalSpot);
    const result = inspectLegendClue(state, finalSpot, NOW, regions);
    state = result.state;
    expect(result.encounters).toEqual(sharing.map((story) => story.id));
    expect(state.active?.id).toBe(sharing[0]!.id);
    expect(state.queue).toEqual(sharing.slice(1).map((story) => story.id));
    for (const story of sharing) expect(state.seen[story.id]).toBe(NOW);
    expect(inspectLegendClue(state, finalSpot, NOW, regions).state).toBe(state);
    for (let i = 1; i < sharing.length; i++) {
      state = dismissActive(state);
      expect(state.active?.id).toBe(sharing[i]!.id);
    }
    state = dismissActive(state);
    expect(state.active).toBeNull();
    expect(state.queue).toEqual([]);
  });

  it('a primeira pista nunca fica no cenário final e usa vários pontos do mapa', () => {
    for (const story of LEGEND_STORIES) expect(firstSignPlace(story), story.id).not.toBe(story.place);
    expect(new Set(LEGEND_STORIES.map((story) => firstSignPlace(story))).size).toBeGreaterThanOrEqual(9);
  });

  it('preserva todas as 94 lembranças mesmo quando o histórico de efeitos descarta visitas antigas', () => {
    let state = emptyLegendary();
    const spots = Object.values(LEGEND_PLACES);
    for (let round = 0; round < 2; round++) for (const spot of spots) {
      state = inspectLegendClue(state, spot, NOW, ALL).state;
      while (state.active) state = dismissActive(state);
    }
    expect(legendaryEffects(state, Date.parse(NOW),'2026-10-21',(ms)=>new Date(ms).toISOString().slice(0,10)).coinMultiplier).toBe(1.3);
    state.history = [...state.history, ...Array.from({ length: 128 }, () => ({ id: 'articuno', at: NOW }))].slice(-LEGENDARY_HISTORY_LIMIT);
    const restored = normalizeLegendary(JSON.parse(JSON.stringify(state)));
    expect(Object.keys(restored.seen)).toHaveLength(94);
    expect(restored.history).toHaveLength(LEGENDARY_HISTORY_LIMIT);
    expect(restored).toEqual(state);
    expect(legendaryEffects(restored, Date.parse(NOW) + 86_400_000, '2026-10-22', (ms) => new Date(ms).toISOString().slice(0,10))).toEqual(NO_EFFECTS);
  });

  it('migra visitas antigas e descarta pesquisas concluídas e datas corrompidas', () => {
    const state = normalizeLegendary({ history: [{ id: 'suicune', at: NOW }], seen: { mew: 'not-a-date', fake: NOW }, investigation: { id: 'mew', step: 1 }, attempts: Infinity });
    expect(state.seen).toEqual({ suicune: NOW });
    expect(state.progress).toEqual({ mew: 1 });
    expect(state.attempts).toBe(0);
    expect(legendDiaryPage('fake',1,'2026-10-21',12)).toBeNull();
  });
});

describe('caminhos dos encontros', () => {
  it.each([20261014,1,7,42,99])('semente %i: todas as pistas têm rota completa a partir da praça', (seed) => {
    const map = generateVillage(seed), reached = reachableFrom(map,map.spawn.x,map.spawn.y);
    for (const place of Object.values(LEGEND_PLACES)) {
      expect(isWalkable(map,place.x,place.y),place.name).toBe(true);
      expect(reached[place.y * map.w + place.x],place.name).toBe(1);
      const walker = makeWalker('player',map.spawn.x,map.spawn.y,5.5);
      let steps = 0;
      while (Math.abs(walker.x-place.x)+Math.abs(walker.y-place.y)>1 && steps++<300) {
        const dir = pathStep(map,walker,place,()=>false);
        expect(dir,place.name).not.toBeNull();
        if (!dir) break;
        expect(tryStep(walker,dir,map,()=>false)).toBe(true);
        advance(walker,1);
      }
      expect(steps,place.name).toBeLessThan(300);
    }
  });
});
