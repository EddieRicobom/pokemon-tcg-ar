import { describe, expect, it } from 'vitest';
import { normalizeName, normalizeProfile } from './profile-store';

describe('perfil do treinador', () => {
  it('sprite desconhecido volta ao padrão; nome é aparado e limitado', () => {
    expect(normalizeProfile(null)).toEqual({ sprite: 'lucas', name: 'Treinador' });
    expect(normalizeProfile({ sprite: 'dawn', name: '  Ash   Ketchum ' })).toEqual({ sprite: 'dawn', name: 'Ash Ketchum' });
    expect(normalizeProfile({ sprite: 'nao-existe' }).sprite).toBe('lucas');
    expect(normalizeName('x'.repeat(40))).toHaveLength(16);
    expect(normalizeName('   ')).toBe('Treinador');
  });
});
