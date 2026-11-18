import { describe, expect, it } from 'vitest';
import { emptyVillage, normalizeVillage, talk } from './life';
import { SURVIVAL_ABSENCE_MOMENTS, SURVIVAL_ABSENCE_PREFIX } from './moments/survival-absence';
import { catchUp, makeEnv, pickMoment, resolveScene, sceneOfTemplate } from './social';
import { recordSurvivalDay, survivalAbsenceChance } from './survival-absence';

const spawn = { x: 1, y: 1 };
const fresh = () => emptyVillage(1, spawn);
const day = (date: number) => `2026-11-${String(date).padStart(2, '0')}`;
const actors = [{ id: 'p', name: 'Pikachu', types: [] }, { id: 's', name: 'Squirtle', types: [] }];

describe('saudade depois do Survival', () => {
  it('conta dias distintos dentro da janela e aumenta a chance até o teto', () => {
    const { survivalAbsence } = fresh();
    expect(recordSurvivalDay(survivalAbsence, day(1))).toBe(true);
    expect(recordSurvivalDay(survivalAbsence, day(1))).toBe(false);
    expect(survivalAbsenceChance(survivalAbsence, day(1))).toBe(0);
    const chances = [0.12, 0.20, 0.28, 0.36, 0.44, 0.52, 0.60, 0.60];
    for (const [index, chance] of chances.entries()) {
      const date = day(index + 2);
      expect(recordSurvivalDay(survivalAbsence, date)).toBe(true);
      expect(survivalAbsenceChance(survivalAbsence, date)).toBe(chance);
    }
    expect(survivalAbsenceChance(survivalAbsence, day(1))).toBe(0);
    expect(survivalAbsenceChance(survivalAbsence, day(22))).toBe(0);
  });

  it('zera quando o jogador conversa e volta a contar em dias seguintes ao da conversa', () => {
    const state = fresh();
    const { survivalAbsence } = state;
    recordSurvivalDay(survivalAbsence, day(1));
    recordSurvivalDay(survivalAbsence, day(2));
    expect(survivalAbsenceChance(survivalAbsence, day(2))).toBeGreaterThan(0);
    talk(state, 'p', 'Pikachu', [], day(2), 14, () => 0.9);
    expect(survivalAbsence.runDays).toEqual([]);
    expect(survivalAbsenceChance(survivalAbsence, day(2))).toBe(0);
    expect(recordSurvivalDay(survivalAbsence, day(2))).toBe(false);
    recordSurvivalDay(survivalAbsence, day(4));
    expect(survivalAbsenceChance(survivalAbsence, day(4))).toBe(0);
    recordSurvivalDay(survivalAbsence, day(5));
    expect(survivalAbsenceChance(survivalAbsence, day(5))).toBe(0.12);
  });

  it('normaliza o progresso real e conserva conversas de saves antigos sem presumir corridas', () => {
    const save = fresh();
    talk(save, 'p', 'Pikachu', [], day(1), 14, () => 0.9);
    const oldSave = { ...save, survivalAbsence: undefined };
    expect(normalizeVillage(oldSave, 1, spawn).survivalAbsence).toEqual({ runDays: [], lastTalkDay: day(1), lastMomentDay: '' });
    const stored = { ...save, survivalAbsence: { runDays: [day(2), day(2), day(1), day(3), '2026-02-30', null], lastMomentDay: day(3) } };
    expect(normalizeVillage(JSON.parse(JSON.stringify(stored)), 1, spawn).survivalAbsence).toEqual({
      runDays: [day(2), day(3)], lastTalkDay: day(1), lastMomentDay: day(3),
    });
  });

  it('exige o histórico de jogo e só sorteia o momento quando o jogador está presente', () => {
    const state = fresh();
    const env = makeEnv(state, day(3), 14, null);
    const id = () => pickMoment(actors, state, env, () => 0.15)?.tpl.id;
    expect(id()).not.toMatch(new RegExp(`^${SURVIVAL_ABSENCE_PREFIX}`));
    recordSurvivalDay(state.survivalAbsence, day(1));
    recordSurvivalDay(state.survivalAbsence, day(2));
    expect(id()).not.toMatch(new RegExp(`^${SURVIVAL_ABSENCE_PREFIX}`));
    recordSurvivalDay(state.survivalAbsence, day(3));
    expect(id()).toMatch(new RegExp(`^${SURVIVAL_ABSENCE_PREFIX}`));
    state.lastSeen = new Date(2026, 10, 3, 13, 0).getTime();
    const away = catchUp(state, actors, new Date(2026, 10, 3, 14, 0).getTime(), null, () => 0.01);
    expect(away).toHaveLength(2);
    expect(away.every((moment) => !moment.tpl.startsWith(SURVIVAL_ABSENCE_PREFIX))).toBe(true);
  });

  it('escolhe variações inéditas e guarda só uma por dia no Diário', () => {
    const state = fresh();
    const { survivalAbsence } = state;
    recordSurvivalDay(survivalAbsence, day(1));
    recordSurvivalDay(survivalAbsence, day(2));
    const firstEnv = makeEnv(state, day(2), 14, null);
    const first = pickMoment(actors, state, firstEnv, () => 0.01)!;
    expect(first.tpl.id.startsWith(SURVIVAL_ABSENCE_PREFIX)).toBe(true);
    const result = resolveScene(state, first, null, 1);
    expect(state.diary).toContain(result.moment);
    expect(result.moment.tpl).toBe(first.tpl.id);
    const restored = normalizeVillage(state, 1, spawn);
    expect(pickMoment(actors, restored, firstEnv, () => 0.01)?.tpl.id.startsWith(SURVIVAL_ABSENCE_PREFIX)).toBe(false);
    const second = pickMoment(actors, restored, makeEnv(restored, day(3), 14, null), () => 0.01);
    expect(second?.tpl.id.startsWith(SURVIVAL_ABSENCE_PREFIX)).toBe(true);
    expect(second?.tpl.id).not.toBe(first.tpl.id);
  });

  it('tem 30 momentos distintos, com falas próprias e elenco válido', () => {
    const state = fresh();
    const env = makeEnv(state, day(2), 14, null);
    expect(SURVIVAL_ABSENCE_MOMENTS).toHaveLength(30);
    expect(sceneOfTemplate(SURVIVAL_ABSENCE_MOMENTS[0]!, actors, state, env, () => 0)).toBeNull();
    recordSurvivalDay(state.survivalAbsence, day(1));
    recordSurvivalDay(state.survivalAbsence, day(2));
    const scenes = SURVIVAL_ABSENCE_MOMENTS.map((tpl) => sceneOfTemplate(tpl, actors, state, env, () => 0)!);
    expect(new Set(scenes.map((scene) => scene.lines.map((line) => line.text).join(' '))).size).toBe(30);
    for (const scene of scenes) {
      expect(scene.lines.some((line) => line.text.includes('Survival'))).toBe(true);
      expect(scene.lines.every((line) => line.who < scene.cast.length)).toBe(true);
    }
    expect(pickMoment(actors.slice(0, 1), state, env, () => 0.01)?.cast).toHaveLength(1);
  });
});
