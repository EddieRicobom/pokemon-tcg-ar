import { describe, expect, it } from 'vitest';
import { applyUpgrade, banSurvivorUpgrade, createSurvivorState, rerollSurvivorUpgradeOffer, rollUpgrades, stepSurvivor, survivorBanBlockReason, survivorDefenseReduction } from './survivor';
import type { SurvivorState } from './survivor';
import { PURE_LOADOUT, towerLoadout } from './survivor-loadout';
import type { TowerLoadout } from './survivor-loadout';
import { lunchEffectFor } from './survivor-lunch';
import type { LunchEffect } from './survivor-lunch';
import { emptyTower, LESSONS, TRAININGS } from './village/tower-state';
import type { TowerState } from './village/tower-state';

function maxedTower(): TowerState {
  return {
    ...emptyTower(), dojoLevel: 3,
    training: Object.fromEntries(Object.values(TRAININGS).map((t) => [t.id, t.coins.length])),
    lessons: Object.keys(LESSONS) as TowerState['lessons'],
  };
}
const maxed = (lunch: LunchEffect | null = null): TowerLoadout => towerLoadout(maxedTower(), { pure: false, luck: true, lunch });

function quiet(state: SurvivorState): SurvivorState {
  state.nextBossAtMs = Number.POSITIVE_INFINITY;
  state.spawnAccumMs = -1e9;
  return state;
}
/** Sobe um nível e devolve a escolha aberta. */
function levelUp(state: SurvivorState): void {
  state.player.xp = state.player.xpToNext;
  stepSurvivor(state, { dx: 0, dy: 0 }, 16);
}

describe('loadout da Vila no motor do Survival', () => {
  it('sem loadout ou com a corrida pura o jogador é o de sempre', () => {
    const plain = createSurvivorState(5, { kindCount: 4 });
    const pure = createSurvivorState(5, { kindCount: 4, loadout: towerLoadout(maxedTower(), { pure: true, luck: true, lunch: null }) });
    expect(pure.player).toEqual(plain.player);
    expect(pure.bansLeft).toBe(0);
    expect(pure.trained).toBe(false);
    expect(PURE_LOADOUT.summary).toEqual([]);
  });

  it('tudo no máximo respeita os tetos combinados', () => {
    const loadout = maxed();
    expect(loadout.maxHpBonus).toBe(20);
    expect(loadout.defenseBonus).toBe(15);
    expect(loadout.speedBonus).toBeCloseTo(0.06);
    expect(loadout.pickupBonus).toBeCloseTo(0.15);
    expect(loadout.startingRerolls).toBe(2);
    expect(loadout.bans).toBe(3);
    expect(loadout.firstOfferExtraChoices).toBe(1);
    const base = createSurvivorState(5, { kindCount: 4 }).player;
    const trained = createSurvivorState(5, { kindCount: 4, loadout }).player;
    expect(trained.maxHp).toBe(base.maxHp + 20);
    expect(trained.hp).toBe(trained.maxHp);
    expect(trained.speed).toBeCloseTo(base.speed * 1.06);
    expect(trained.pickupRadius).toBeCloseTo(base.pickupRadius * 1.15);
    expect(trained.upgradeRerolls).toBe(2);
    expect(trained.trainingDefense).toBe(15);
    expect(trained.defenseBonus).toBeUndefined();
  });

  it('funciona igual no BONK, que usa o mesmo estado', () => {
    const state = createSurvivorState(5, { kindCount: 4, bonk: true, loadout: maxed() });
    expect(state.player.bonkMode).toBe(true);
    expect(state.player.maxHp).toBe(120);
    expect(state.bansLeft).toBe(3);
  });

  it('a defesa do Dojô e da marmita tem campo próprio e teto combinado de 20', () => {
    const base = survivorDefenseReduction({ dexId: 25 }, 'contato')!;
    const dojo = survivorDefenseReduction({ dexId: 25, trainingDefense: 15 }, 'contato')!;
    expect(dojo).toBeGreaterThan(base);
    const capped = survivorDefenseReduction({ dexId: 25, trainingDefense: 15, lunchDefense: 10 }, 'contato')!;
    expect(capped).toBeCloseTo(60 / 260);
    // Fica abaixo de uma única carta Casca firme (+25).
    expect(survivorDefenseReduction({ dexId: 25, trainingDefense: 20 }, 'contato')!).toBeLessThan(survivorDefenseReduction({ dexId: 25, defenseBonus: 25 }, 'contato')!);
  });

  it('o resumo lista só o que de fato entrou', () => {
    expect(maxed().summary.join('|')).toContain('Fôlego: +20');
    expect(towerLoadout(emptyTower(), { pure: false, luck: false, lunch: null }).trained).toBe(false);
    expect(towerLoadout(emptyTower(), { pure: false, luck: true, lunch: null }).trained).toBe(true);
  });
});

describe('Olhar treinado, desejos e banimento', () => {
  it('só a primeira escolha mostra a carta a mais', () => {
    const state = quiet(createSurvivorState(9, { kindCount: 4, loadout: maxed() }));
    levelUp(state);
    expect(state.pendingUpgrade).toHaveLength(4);
    applyUpgrade(state, state.pendingUpgrade![0]!.id);
    levelUp(state);
    expect(state.pendingUpgrade).toHaveLength(3);
  });

  it('a oferta nunca passa de 5 cartas mesmo com a carta "+1 opção"', () => {
    const state = quiet(createSurvivorState(9, { kindCount: 4, loadout: maxed() }));
    state.player.upgradeChoices = 5;
    levelUp(state);
    expect(state.pendingUpgrade!.length).toBeLessThanOrEqual(5);
  });

  it('o Desejo de Jirachi sai do sorteio quando o estoque está cheio', () => {
    const player = createSurvivorState(1, { kindCount: 4 }).player;
    player.level = 20;
    player.upgradeRerolls = 3;
    for (let seed = 0; seed < 60; seed++) {
      const ids = rollUpgrades(createSurvivorState(seed, { kindCount: 4 }).rng, 5, player.move, player).map((o) => o.id);
      expect(ids).not.toContain('jirachi-reroll');
    }
  });

  it('banir troca a carta por outra, gasta um banimento e ela não volta mais', () => {
    const state = quiet(createSurvivorState(11, { kindCount: 4, loadout: maxed() }));
    levelUp(state);
    const target = state.pendingUpgrade![0]!.id;
    const size = state.pendingUpgrade!.length;
    expect(survivorBanBlockReason(state, target)).toBeNull();
    expect(banSurvivorUpgrade(state, target)).toBe(true);
    expect(state.bansLeft).toBe(2);
    expect(state.pendingUpgrade).toHaveLength(size);
    expect(state.pendingUpgrade!.map((o) => o.id)).not.toContain(target);
    expect(state.bannedUpgradeIds).toEqual([target]);
    // Nem as próximas ofertas nem os desejos devolvem a carta banida.
    for (let i = 0; i < 25; i++) {
      state.player.upgradeRerolls = 1;
      rerollSurvivorUpgradeOffer(state);
      expect(state.pendingUpgrade!.map((o) => o.id)).not.toContain(target);
    }
    applyUpgrade(state, state.pendingUpgrade![0]!.id);
    for (let i = 0; i < 25; i++) {
      levelUp(state);
      expect(state.pendingUpgrade!.map((o) => o.id)).not.toContain(target);
      applyUpgrade(state, state.pendingUpgrade![0]!.id);
    }
  });

  it('recusa banir sem banimentos, carta fora da oferta, oferta especial e carta que já tem nível', () => {
    const state = quiet(createSurvivorState(11, { kindCount: 4, loadout: towerLoadout(emptyTower(), { pure: false, luck: true, lunch: null }) }));
    levelUp(state);
    const first = state.pendingUpgrade![0]!.id;
    expect(banSurvivorUpgrade(state, first)).toBe(false);
    expect(survivorBanBlockReason(state, first)).toMatch(/Sem banimentos/);

    state.bansLeft = 3;
    expect(survivorBanBlockReason(state, 'nao-esta-aqui')).toMatch(/não está/);
    state.pendingUpgrade = [{ id: 'second-attack', name: 'Apoio', description: '' }, ...state.pendingUpgrade!.slice(1)];
    expect(survivorBanBlockReason(state, 'second-attack')).toMatch(/especial/);
    state.pendingUpgrade = [{ id: 'evolve:26', name: 'Evoluir', description: '' }, ...state.pendingUpgrade.slice(1)];
    expect(banSurvivorUpgrade(state, 'evolve:26')).toBe(false);
    const owned = state.pendingUpgrade[1]!.id;
    state.player.upgradeLevels[owned] = 1;
    expect(survivorBanBlockReason(state, owned)).toMatch(/já tem/);
    expect(state.bansLeft).toBe(3);
  });

  it('não bane quando não há carta para repor a vaga', () => {
    const state = quiet(createSurvivorState(11, { kindCount: 4, loadout: maxed() }));
    levelUp(state);
    const pool = rollUpgrades(state.rng, 500, state.player.move, state.player).map((o) => o.id);
    state.bannedUpgradeIds = pool.filter((id) => id !== state.pendingUpgrade![0]!.id && !state.pendingUpgrade!.some((o) => o.id === id));
    const before = state.pendingUpgrade!.map((o) => o.id);
    expect(banSurvivorUpgrade(state, before[0]!)).toBe(false);
    expect(state.pendingUpgrade!.map((o) => o.id)).toEqual(before);
    expect(state.bansLeft).toBe(3);
  });
});

describe('marmita em jogo', () => {
  function withLunch(overrides: Partial<LunchEffect>): SurvivorState {
    const base = lunchEffectFor('pipoca')!;
    return quiet(createSurvivorState(3, { kindCount: 4, loadout: maxed({ ...base, ...overrides }) }));
  }

  it('a cura nunca passa de 30% da vida máxima por corrida e acaba com o prato', () => {
    const state = withLunch({ regenPerSec: 2, durationMs: 400_000 });
    state.player.hp = 1;
    for (let i = 0; i < 600; i++) { state.player.hp = Math.min(state.player.hp, 1); stepSurvivor(state, { dx: 0, dy: 0 }, 100); state.player.hp = Math.max(state.player.hp, 1); }
    expect(state.player.lunch!.healed).toBeLessThanOrEqual(state.player.maxHp * 0.3 + 1e-6);
    expect(state.player.lunch!.healed).toBeGreaterThan(state.player.maxHp * 0.29);
  });

  it('os bônus somem quando o tempo do prato acaba', () => {
    const state = withLunch({ durationMs: 3_000, defense: 10, speedBonus: 0.04, pickupBonus: 0.1, hitInvulnBonus: 0.25 });
    expect(state.player.lunchDefense).toBe(5);
    expect(state.player.lunchSpeedBonus).toBeCloseTo(0.02);
    stepSurvivor(state, { dx: 0, dy: 0 }, 100);
    expect(state.player.lunch!.active).toBe(true);
    for (let i = 0; i < 40; i++) stepSurvivor(state, { dx: 0, dy: 0 }, 100);
    expect(state.player.lunch!.active).toBe(false);
    expect(state.player.lunchDefense).toBe(0);
    expect(state.player.lunchSpeedBonus).toBe(0);
    expect(state.player.lunchPickupBonus).toBe(0);
    expect(state.player.lunchHitInvulnBonus).toBe(0);
  });

  it('o XP da marmita vale o maior entre ela e o ritmo da corrida, nunca o produto', () => {
    const plain = withLunch({ xpBonus: 0, regenPerSec: 0 });
    const peixe = withLunch({ xpBonus: 0.2, regenPerSec: 0, durationMs: 600_000 });
    const fast = createSurvivorState(3, { kindCount: 4, fast: true, loadout: maxed({ ...lunchEffectFor('pipoca')!, xpBonus: 0.2, regenPerSec: 0, durationMs: 600_000 }) });
    for (const s of [plain, peixe, fast]) { quiet(s); s.orbs.push({ id: 1, x: s.player.x, y: s.player.y, value: 10 } as SurvivorState['orbs'][number]); stepSurvivor(s, { dx: 0, dy: 0 }, 16); }
    const gain = (s: SurvivorState) => s.player.xp + (s.player.xpCarry ?? 0);
    expect(gain(peixe) / gain(plain)).toBeCloseTo(1.2, 1);
    expect(gain(fast) / gain(plain)).toBeCloseTo(1.75, 1);
  });
});
