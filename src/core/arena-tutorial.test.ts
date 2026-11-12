import { describe, expect, it } from 'vitest';
import { ArenaCoach, COACH_DODGE_AFTER_MS, COACH_TIP_MS } from './arena-tutorial';
import type { ArenaCoachInput } from './arena-tutorial';

const at = (timeMs: number, over: Partial<ArenaCoachInput> = {}): ArenaCoachInput => ({ timeMs, energy: 0, danger: false, dodged: false, usedSpecial: false, over: false, ...over });

describe('tutorial da primeira luta', () => {
  it('quem já passou pela primeira luta não vê nada', () => {
    const coach = new ArenaCoach(true);
    expect(coach.done).toBe(true);
    expect(coach.update(at(9000, { danger: true, energy: 1 }))).toBeNull();
  });

  it('a dica da esquiva vem com o primeiro golpe marcado', () => {
    const coach = new ArenaCoach(false);
    expect(coach.update(at(500))).toBeNull();
    expect(coach.update(at(800, { danger: true }))).toBe('dodge');
  });

  it('sem golpe marcado, a dica vem assim mesmo depois de um tempo', () => {
    const coach = new ArenaCoach(false);
    expect(coach.update(at(COACH_DODGE_AFTER_MS - 1))).toBeNull();
    expect(coach.update(at(COACH_DODGE_AFTER_MS))).toBe('dodge');
  });

  it('usar o botão apaga a dica na hora', () => {
    const coach = new ArenaCoach(false);
    coach.update(at(1000, { danger: true }));
    expect(coach.update(at(1200, { dodged: true }))).toBeNull();
    expect(coach.update(at(1300, { danger: true }))).toBeNull();
  });

  it('a dica sai sozinha, sem ficar presa na tela', () => {
    const coach = new ArenaCoach(false);
    coach.update(at(1000, { danger: true }));
    expect(coach.update(at(1000 + COACH_TIP_MS - 1, { danger: true }))).toBe('dodge');
    expect(coach.update(at(1000 + COACH_TIP_MS, { danger: true }))).toBeNull();
  });

  it('uma dica por vez: o Especial espera a esquiva sair', () => {
    const coach = new ArenaCoach(false);
    expect(coach.update(at(1000, { danger: true, energy: 1 }))).toBe('dodge');
    expect(coach.update(at(1500, { dodged: true, energy: 1 }))).toBe('special');
    expect(coach.update(at(1800, { usedSpecial: true }))).toBeNull();
    expect(coach.done).toBe(true);
  });

  it('quem esquivou antes da dica não recebe a dica', () => {
    const coach = new ArenaCoach(false);
    coach.update(at(300, { dodged: true }));
    expect(coach.update(at(COACH_DODGE_AFTER_MS + 100, { danger: true }))).toBeNull();
  });

  it('nada aparece depois do fim da luta', () => {
    const coach = new ArenaCoach(false);
    coach.update(at(1000, { danger: true }));
    expect(coach.update(at(1200, { danger: true, energy: 1, over: true }))).toBeNull();
  });
});
