import { describe, expect, it } from 'vitest';
import { guidedWalkArrived, guidedWalkProgress } from './guided-walk';

const destination = { x: 10, y: 10 };

describe('passeio guiado', () => {
  it('só conclui quando jogador e companheiro chegam ao destino', () => {
    const player = { x: 10, y: 10, t: 1 };
    expect(guidedWalkArrived(player, undefined, destination)).toBe(false);
    expect(guidedWalkArrived(player, { x: 14, y: 10, t: 1 }, destination)).toBe(false);
    expect(guidedWalkArrived(player, { x: 11, y: 10, t: 1 }, destination)).toBe(true);
  });

  it('expõe distâncias úteis para a interface sem alterar o estado', () => {
    expect(guidedWalkProgress({ x: 7, y: 8, t: 1 }, { x: 13, y: 10, t: 1 }, destination)).toEqual({
      playerDistance: 5, companionDistance: 3, arrived: false,
    });
  });
});
