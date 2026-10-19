import { describe, expect, it } from 'vitest';
import { survivorElementalStatus, survivorSynergyFor } from './survivor-synergies';

describe('sinergias elementais da Torre', () => {
  it('combina estados com multiplicador limitado e consumo explícito', () => {
    expect(survivorSynergyFor('electric', { wetMs: 100 })).toEqual({ id: 'agua-eletrico', damageMultiplier: 1.25, consume: 'wetMs' });
    expect(survivorSynergyFor('fire', { seededMs: 100 })).toEqual({ id: 'fogo-planta', damageMultiplier: 1.25, consume: 'seededMs' });
    expect(survivorSynergyFor('water', { slowMs: 100 })).toEqual({ id: 'gelo-agua', damageMultiplier: 1.1, refreshSlowMs: 2300 });
    expect(survivorSynergyFor('electric', { stunMs: 100 })).toEqual({ id: 'terra-eletrico', damageMultiplier: 1.1 });
  });

  it('não inventa combinação sem estado e limita os marcadores elementais', () => {
    expect(survivorSynergyFor('electric', {})).toBeNull();
    expect(survivorElementalStatus('water')).toEqual({ wetMs: 1800 });
    expect(survivorElementalStatus('grass')).toEqual({ seededMs: 1800 });
    expect(survivorElementalStatus('normal')).toEqual({});
  });
});

