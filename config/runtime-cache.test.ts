import { describe, expect, it } from 'vitest';
import { runtimeAssetPattern } from './runtime-cache';

describe('regras de cache publicadas', () => {
  it('inclui o base path na expressão, sem depender de closure dentro do worker', () => {
    for (const path of ['audio/', 'assets/', 'art/trainers/', 'ocr/', 'sprites/', 'data/art-index.']) {
      const rule = runtimeAssetPattern('/pokemon-tcg-ar/', path);
      const serialized = new RegExp(rule.source, rule.flags);
      expect(serialized.test(`https://eddiericobom.github.io/pokemon-tcg-ar/${path}example.mp3`)).toBe(true);
      expect(serialized.test(`https://eddiericobom.github.io/outro/${path}example.mp3`)).toBe(false);
      expect(serialized.test(`https://example.com/else/pokemon-tcg-ar/${path}example.mp3`)).toBe(false);
    }
  });
  it('arquivos exatos aceitam query, mas não nomes parecidos; caracteres especiais são escapados', () => {
    const rule = runtimeAssetPattern('/a.b/', 'data/catalog-index.json', true);
    expect(rule.test('http://localhost:4175/a.b/data/catalog-index.json?version=2')).toBe(true);
    expect(rule.test('http://localhost:4175/axb/data/catalog-index.json')).toBe(false);
    expect(rule.test('http://localhost:4175/a.b/data/catalog-index.json.extra')).toBe(false);
  });
});
