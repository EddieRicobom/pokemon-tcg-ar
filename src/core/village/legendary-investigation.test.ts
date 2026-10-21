import { describe, expect, it } from 'vitest';
import { LEGEND_STORIES, LEGEND_PLACES } from './legendary-stories';
import { beginInvestigation, inspectLegendClue, investigationPlace, legendDiaryPage } from './legendary-investigation';
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

describe('investigações com ações reais', () => {
  it.each(LEGEND_STORIES.map((story) => [story.id] as const))('%s: requer as duas pistas em locais distintos, persiste a etapa e não duplica visita', (id) => {
    const initial = emptyLegendary();
    let state = beginInvestigation(initial, id);
    const first = investigationPlace(id, 0)!, last = investigationPlace(id, 1)!;
    expect(first).not.toEqual(last);
    expect(inspectLegendClue(state, { x: 0, y: 0 }, NOW).state).toBe(state);
    expect(initial.history).toHaveLength(0);
    state = inspectLegendClue(state, first, NOW).state;
    expect(state.investigation?.step).toBe(1);
    expect(state.active).toBeNull();
    state = normalizeLegendary(JSON.parse(JSON.stringify(state)));
    expect(state.investigation?.step).toBe(1);
    const result = inspectLegendClue(state, last, NOW);
    expect(result.encounter).toBe(true);
    expect(result.state.history).toEqual([{ id, at: NOW }]);
    expect(result.state.seen[id]).toBe(NOW);
    expect(result.state.active?.id).toBe(id);
    expect(inspectLegendClue(result.state, last, NOW).encounter).toBe(false);
    const finished = dismissActive(result.state);
    expect(beginInvestigation(finished, id)).toBe(finished);
    expect(legendDiaryPage(id, Date.parse(NOW), '2026-10-21', 12)?.cast[0]?.name).toBe(LEGEND_STORIES.find((story) => story.id === id)?.name);
  });

  it('não troca uma cena pendente por outra investigação e rejeita dados inválidos', () => {
    const initial = { ...emptyLegendary(), active: { id: 'lugia' } };
    expect(beginInvestigation(initial, 'mew')).toBe(initial);
    expect(beginInvestigation(emptyLegendary(), 'fake').investigation).toBeNull();
    const started = beginInvestigation(emptyLegendary(), 'mew');
    expect(inspectLegendClue(started, investigationPlace('mew',0)!, 'invalid').state).toBe(started);
  });

  it('preserva todas as 94 lembranças mesmo quando o histórico de efeitos descarta visitas antigas', () => {
    let state = emptyLegendary();
    for (const story of LEGEND_STORIES) {
      state = beginInvestigation(state, story.id);
      state = inspectLegendClue(state, investigationPlace(story.id,0)!,NOW).state;
      state = inspectLegendClue(state, investigationPlace(story.id,1)!,NOW).state;
      state = dismissActive(state);
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
    const state = normalizeLegendary({ history: [{ id: 'suicune', at: NOW }], seen: { mew: 'not-a-date', fake: NOW }, investigation: { id: 'suicune', step: 1 }, attempts: Infinity });
    expect(state.seen).toEqual({ suicune: NOW });
    expect(state.investigation).toBeNull();
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
