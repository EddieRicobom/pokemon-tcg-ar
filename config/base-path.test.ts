import { describe, expect, it } from 'vitest';
import { DEFAULT_BASE_PATH, normalizeBasePath } from './base-path';

describe('normalizeBasePath', () => {
  it('usa o caminho padrão do repositório quando não há valor', () => {
    expect(normalizeBasePath(undefined)).toBe(DEFAULT_BASE_PATH);
    expect(normalizeBasePath('')).toBe(DEFAULT_BASE_PATH);
    expect(normalizeBasePath('   ')).toBe(DEFAULT_BASE_PATH);
  });

  it('mantém a raiz quando pedida explicitamente', () => {
    expect(normalizeBasePath('/')).toBe('/');
  });

  it('acrescenta barras inicial e final', () => {
    expect(normalizeBasePath('repo')).toBe('/repo/');
    expect(normalizeBasePath('/repo')).toBe('/repo/');
    expect(normalizeBasePath('repo/')).toBe('/repo/');
    expect(normalizeBasePath('/repo/')).toBe('/repo/');
  });

  it('remove barras duplicadas', () => {
    expect(normalizeBasePath('//repo//')).toBe('/repo/');
    expect(normalizeBasePath('/a//b/')).toBe('/a/b/');
  });
});
