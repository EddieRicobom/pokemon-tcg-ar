import { describe, expect, it } from 'vitest';
import { createSurvivorDebug, debugTenLevels, DEBUG_TARGETS, setDebugInfinite, stepSurvivorDebug } from './survivor-debug';

describe('laboratório do Survivor', () => {
  it('cria Ditto com stats médios e alvos identificados sem ondas', () => {
    const lab = createSurvivorDebug();
    expect(lab.state.player.dexId).toBe(132);
    expect(lab.targets.length).toBe(DEBUG_TARGETS.length);
    for (let i = 0; i < 120; i++) stepSurvivorDebug(lab, { dx: 0, dy: 0 }, 50);
    expect(lab.state.enemies).toHaveLength(DEBUG_TARGETS.length);
    expect(lab.state.kills).toBe(0);
  });
  it('reaparece um alvo cinco segundos após morrer', () => {
    const lab = createSurvivorDebug(); setDebugInfinite(lab, false);
    lab.state.enemies[0]!.hp = 0;
    stepSurvivorDebug(lab, { dx: 0, dy: 0 }, 1);
    expect(lab.state.enemies).toHaveLength(DEBUG_TARGETS.length - 1);
    stepSurvivorDebug(lab, { dx: 0, dy: 0 }, 4999);
    expect(lab.state.enemies).toHaveLength(DEBUG_TARGETS.length - 1);
    stepSurvivorDebug(lab, { dx: 0, dy: 0 }, 1);
    expect(lab.state.enemies).toHaveLength(DEBUG_TARGETS.length);
  });
  it('mede a perda real de vida sem restaurar o alvo a cada quadro', () => {
    const lab = createSurvivorDebug('normal', 'aura');
    lab.state.player.critChance = 0;
    const target = lab.state.enemies[0]!;
    lab.state.player.x = target.x; lab.state.player.y = target.y;
    const before = target.hp;
    stepSurvivorDebug(lab, { dx: 0, dy: 0 }, 50);
    expect(target.hp).toBeLessThan(before);
    expect(lab.damage).toBeCloseTo(before - target.hp);
    expect(target.hp).toBeLessThan(target.maxHp);
  });
  it('não abre encontros automáticos de lendários no laboratório', () => {
    const lab = createSurvivorDebug();
    lab.state.elapsedMs = 430_000; lab.state.special.selected = 'dash';
    stepSurvivorDebug(lab, { dx: 0, dy: 0 }, 50);
    expect(lab.state.special.phase).toBe('ready');
    expect(lab.state.enemies).toHaveLength(DEBUG_TARGETS.length);
  });
  it('concede exatamente dez níveis e abre as escolhas', () => {
    const lab = createSurvivorDebug(); debugTenLevels(lab);
    stepSurvivorDebug(lab, { dx: 0, dy: 0 }, 1);
    expect(lab.state.player.level).toBe(11);
    expect(lab.state.pendingUpgrade).not.toBeNull();
  });
});
