import { describe, expect, it } from 'vitest';
import { wrapSpeech } from './speech-layout';

const measure = (text: string): number => text.length;

describe('quebra de fala da Vila', () => {
  it('quebra por palavras e preserva a leitura', () => {
    expect(wrapSpeech('Uma fala curta para testar', 11, measure)).toEqual(['Uma fala', 'curta para', 'testar']);
  });

  it('corta uma palavra longa em blocos que cabem no balão', () => {
    const lines = wrapSpeech('hipermegaultralongo', 5, measure);
    expect(lines).toEqual(['hiper', 'megau', 'ltral', 'ongo']);
    expect(lines.every((line) => measure(line) <= 5)).toBe(true);
  });
});
