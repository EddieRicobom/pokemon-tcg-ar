import { describe, expect, it } from 'vitest';
import { isFrameDue } from './frame-rate';

describe('limite de quadros', () => {
  it('não limita automático e respeita o intervalo configurado', () => {
    expect(isFrameDue(5, 4, 0)).toBe(true);
    expect(isFrameDue(32, 0, 30)).toBe(false);
    expect(isFrameDue(34, 0, 30)).toBe(true);
    expect(isFrameDue(49, 0, 20)).toBe(false);
    expect(isFrameDue(51, 0, 20)).toBe(true);
  });
});
