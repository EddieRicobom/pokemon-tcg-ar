import { describe, expect, it } from 'vitest';
import { emptyInstructorShift, INSTRUCTOR_REST_MS, INSTRUCTOR_TRAIN_MS, INSTRUCTOR_WALK_TIMEOUT_MS, stepInstructorShift } from './instructor';

describe('rotina do Instrutor', () => {
  it('sai para a Torre, treina parado e depois volta à rotina comum', () => {
    const shift = emptyInstructorShift();
    expect(stepInstructorShift(shift, 1000, true, false).action).toBe('walk');
    expect(stepInstructorShift(shift, 5000, true, false).action).toBe('walk');
    const arrive = stepInstructorShift(shift, 9000, true, true);
    expect(arrive.action).toBe('train');
    expect(arrive.bubble).not.toBeNull();
    expect(stepInstructorShift(shift, 9100, true, true).bubble).toBeNull();
    expect(stepInstructorShift(shift, 11_500, true, true).bubble).not.toBeNull();
    expect(stepInstructorShift(shift, 9000 + INSTRUCTOR_TRAIN_MS, true, true).action).toBe('free');
    expect(shift.phase).toBe('rest');
    // Descansa antes de sair de novo.
    expect(stepInstructorShift(shift, 9000 + INSTRUCTOR_TRAIN_MS + 1000, true, false).action).toBe('free');
    expect(stepInstructorShift(shift, 9000 + INSTRUCTOR_TRAIN_MS + INSTRUCTOR_REST_MS, true, false).action).toBe('walk');
  });

  it('desiste se não conseguir chegar e não trava na caminhada', () => {
    const shift = emptyInstructorShift();
    stepInstructorShift(shift, 0, true, false);
    expect(stepInstructorShift(shift, 30_000, true, false).action).toBe('walk');
    expect(stepInstructorShift(shift, INSTRUCTOR_WALK_TIMEOUT_MS, true, false).action).toBe('free');
    expect(shift.phase).toBe('rest');
  });

  it('sem lugar para treinar (Torre ainda bloqueada) ele só segue a rotina comum', () => {
    const shift = emptyInstructorShift();
    for (let t = 0; t < 120_000; t += 5000) expect(stepInstructorShift(shift, t, false, false)).toEqual({ action: 'free', bubble: null });
  });
});
