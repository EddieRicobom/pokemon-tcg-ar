import { describe, expect, it } from 'vitest';
import { pinRowInfo, pinSpecOf } from './pin-card-info';
import type { PinCardInfo } from './pin-card-info';
import type { CachedCard } from '../cache/types';

const card = { id: 'base1-1', name: 'Bulbasaur' } as CachedCard;
const info: PinCardInfo = { state: 'ok', profile: null, card: { types: ['Lightning', 'Metal', 'Unknown'], attacks: [], weaknesses: [] } };

describe('dados da carta na Pista de Pins', () => {
  it('mostra que está carregando e não inventa atributos', () => {
    expect(pinRowInfo(card)).toEqual({ cost: null, types: [], moves: 0, note: 'carregando…' });
    expect(pinSpecOf(card).stats).toBeNull();
  });
  it('usa os tipos reconhecidos da carta e informa o uso de valores neutros', () => {
    expect(pinSpecOf(card, info).types).toEqual(['electric', 'steel']);
    expect(pinRowInfo(card, info).note).toContain('valores neutros');
  });
  it('prioriza o perfil da espécie e usa os ataques da carta', () => {
    const stats = { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 };
    const full: PinCardInfo = { ...info, profile: { dexId: 1, types: ['grass', 'poison'], stats, weightKg: 6.9 }, card: { ...info.card!, attacks: [{ name: 'Teste', cost: ['Grass'] }] } };
    const spec = pinSpecOf(card, full);
    expect(spec.types).toEqual(['grass', 'poison']);
    expect(spec.stats).toEqual(stats);
    expect(spec.attacks?.[0]?.name).toBe('Teste');
    expect(pinRowInfo(card, full).note).toBe('');
  });
});
