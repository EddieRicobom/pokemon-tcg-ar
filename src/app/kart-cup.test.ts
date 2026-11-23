import { beforeEach, describe, expect, it } from 'vitest';
import { clearKartCup, readKartCup, saveKartCup } from './kart-cup';

describe('Copa de Kart salva', () => {
  beforeEach(() => { localStorage.clear(); });

  it('volta com etapa, pontos e última ordem', () => {
    saveKartCup({ round: 1, scores: [10, 6, 3, 1], lastOrder: [0, 1, 2, 3] });
    expect(readKartCup()).toEqual({ round: 1, scores: [10, 6, 3, 1], lastOrder: [0, 1, 2, 3] });
  });

  it('recusa progresso inválido e limpa', () => {
    localStorage.setItem('tcg-ar-kart-cup-v1', '{"round":9,"scores":[]}');
    expect(readKartCup()).toBeNull();
    saveKartCup({ round: 2, scores: [10, 6, 3, 1], lastOrder: [] });
    clearKartCup();
    expect(readKartCup()).toBeNull();
  });
});
