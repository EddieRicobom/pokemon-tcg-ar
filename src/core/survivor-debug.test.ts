import { describe, expect, it } from 'vitest';
import { createSurvivorDebug, debugTenLevels, DEBUG_TARGETS, setDebugInfinite, stepSurvivorDebug } from './survivor-debug';
import { autoChargeHeld } from './survivor-charge';
import type { MoveCategory } from './survivor-moves';

describe('laboratório do Survivor', () => {
  it('cria Ditto com stats médios e alvos identificados sem ondas', () => {
    const lab = createSurvivorDebug();
    expect(lab.state.player.dexId).toBe(132);
    expect(lab.targets.length).toBe(DEBUG_TARGETS.length);
    for (let i = 0; i < 120; i++) stepSurvivorDebug(lab, { dx: 0, dy: 0 }, 50);
    expect(lab.state.enemies).toHaveLength(DEBUG_TARGETS.length);
    expect(lab.state.kills).toBe(0);
  });
  it('começa com alvo visível ao alcance e sem sobrepor o Ditto', () => {
    const lab = createSurvivorDebug();
    const p = lab.state.player;
    const distances = lab.state.enemies.map(e => Math.hypot(e.x - p.x, e.y - p.y));
    expect(Math.min(...distances)).toBeGreaterThan(40);
    expect(Math.min(...distances)).toBeLessThan(p.attackRange);
  });
  it.each<MoveCategory>(['projetil', 'aura', 'area', 'cone', 'orbit', 'foco', 'rapido', 'teleporte', 'trilha'])('%s causa dano real e o laboratório mostra o acerto', category => {
    const lab = createSurvivorDebug('normal', category);
    const p = lab.state.player, target = lab.state.enemies[0]!;
    p.critChance = 0; p.x = target.x - 35; p.y = target.y; p.aimAngle = 0;
    if (category === 'trilha') p.trailCharge = 1;
    let displayed = false;
    for (let i = 0; i < 160; i++) {
      const held = (category === 'foco' || category === 'teleporte' || category === 'trilha') && autoChargeHeld(category, lab.state.charge);
      stepSurvivorDebug(lab, { dx: 0, dy: 0, charge: held }, 50);
      displayed ||= lab.damageHits.some(hit => !hit.critical && hit.amount > 0);
    }
    expect(lab.damage).toBeGreaterThan(0);
    expect(displayed).toBe(true);
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
    expect(lab.damageHits.reduce((sum, hit) => sum + hit.amount, 0)).toBeCloseTo(lab.damage);
    expect(lab.damageHits[0]?.critical).toBe(false);
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
