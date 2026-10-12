import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('formata em unidades legíveis com vírgula decimal', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,50 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,00 MB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
  });
  it('valores inválidos viram travessão', () => {
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});
