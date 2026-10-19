import { describe, expect, it } from 'vitest';
import { createSurvivorState } from './survivor';
import { SURVIVOR_OBJECTIVE_IDS } from './survivor-objectives';
import { availableSurvivorPreparations, survivorPreparation } from './survivor-preparations';

describe('preparações da Torre', () => {
  it('libera escolhas por objetivos distintos registrados e ignora IDs desconhecidos', () => {
    expect(availableSurvivorPreparations([]).map(({ id }) => id)).toEqual(['classica']);
    expect(availableSurvivorPreparations(['tempo-1m', 'tempo-1m', 'inventado']).map(({ id }) => id)).toEqual(['classica']);
    expect(availableSurvivorPreparations(SURVIVOR_OBJECTIVE_IDS.slice(0, 3)).map(({ id }) => id)).toEqual(['classica', 'passo-leve']);
    expect(availableSurvivorPreparations(SURVIVOR_OBJECTIVE_IDS.slice(0, 6)).map(({ id }) => id)).toEqual(['classica', 'passo-leve', 'mira-calculada']);
    expect(availableSurvivorPreparations(SURVIVOR_OBJECTIVE_IDS.slice(0, 9)).map(({ id }) => id)).toEqual(['classica', 'passo-leve', 'mira-calculada', 'ima-de-campo']);
    expect(availableSurvivorPreparations(SURVIVOR_OBJECTIVE_IDS).map(({ id }) => id)).toEqual(['classica', 'passo-leve', 'mira-calculada', 'ima-de-campo', 'mira-longa']);
  });

  it('aplica trocas moderadas aos atributos iniciais, sem somar bônus de preparações anteriores', () => {
    const options = { kindCount: 4, profile: { damage: 100, walkSpeed: 200, maxHp: 300, range: 170, cooldownMs: 600, projectileSpeed: 360, radius: 0, projectileSize: 4 } };
    const normal = createSurvivorState(1, options).player;
    const quick = createSurvivorState(1, { ...options, preparation: 'passo-leve' }).player;
    const aim = createSurvivorState(1, { ...options, preparation: 'mira-calculada' }).player;
    const magnet = createSurvivorState(1, { ...options, preparation: 'ima-de-campo' }).player;
    const longAim = createSurvivorState(1, { ...options, preparation: 'mira-longa' }).player;

    expect(quick.speed).toBeCloseTo(216);
    expect(quick.attackDamage).toBeCloseTo(92);
    expect(quick.maxHp).toBe(normal.maxHp);
    expect(aim.speed).toBeCloseTo(184);
    expect(aim.attackDamage).toBeCloseTo(108);
    expect(magnet.pickupRadius).toBeCloseTo(normal.pickupRadius * 1.2);
    expect(magnet.attackDamage).toBeCloseTo(92);
    expect(longAim.attackRange).toBeCloseTo(normal.attackRange * 1.12);
    expect(longAim.speed).toBeCloseTo(normal.speed * 0.92);
    expect(longAim.maxHp).toBe(normal.maxHp);
    expect(survivorPreparation('save-antigo').id).toBe('classica');
  });
});
