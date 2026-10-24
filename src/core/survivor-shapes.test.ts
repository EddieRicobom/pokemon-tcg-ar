import { describe, expect, it } from 'vitest';
import { applyUpgrade, createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy, SurvivorState } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';
import type { PokemonType } from './pokemon-data';
import {
  inSurvivorCone,
  SURVIVOR_CONE_HALF_ANGLE,
  SURVIVOR_ORBIT_MAX,
  survivorOrbitCount,
  survivorOrbiterHitRadius,
  survivorOrbiters,
  survivorOrbitRadius,
} from './survivor-shapes';

function run(type: PokemonType, category: MoveCategory): SurvivorState {
  const move = { ...moveFor([type], null), category, estimated: false };
  const state = createSurvivorState(9, { kindCount: 1, move, profile: attackProfile(move, null) });
  state.nextBossAtMs = Number.POSITIVE_INFINITY;
  state.spawnAccumMs = -1e9;
  return state;
}
function dummy(id: number, x: number, y: number, hp = 1000): SurvivorEnemy {
  return { id, kind: 0, boss: false, grade: 'comum', x, y, hp, maxHp: hp, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
}

describe('cone', () => {
  const player = { x: 0, y: 0, aimAngle: 0, facing: 1 as const };

  it('é um leque estreito à frente: nem os lados nem as costas', () => {
    expect(inSurvivorCone(player, 100, 0, 140)).toBe(true);
    expect(inSurvivorCone(player, 100, Math.tan(SURVIVOR_CONE_HALF_ANGLE * 0.9) * 100, 140)).toBe(true);
    expect(inSurvivorCone(player, 60, 60, 140)).toBe(false);
    expect(inSurvivorCone(player, 0, 80, 140)).toBe(false);
    expect(inSurvivorCone(player, -80, 0, 140)).toBe(false);
    expect(inSurvivorCone(player, 160, 0, 140)).toBe(false);
  });

  it('o corpo do alvo que invade a borda do leque conta', () => {
    const edge = SURVIVOR_CONE_HALF_ANGLE + 0.1;
    const x = Math.cos(edge) * 90;
    const y = Math.sin(edge) * 90;
    expect(inSurvivorCone(player, x, y, 140)).toBe(false);
    expect(inSurvivorCone(player, x, y, 140, 13)).toBe(true);
  });

  it('ataca na direção do último passo, inclusive para cima e para baixo', () => {
    const s = run('fighting', 'cone');
    const above = dummy(1, s.player.x, s.player.y - 70);
    const right = dummy(2, s.player.x + 70, s.player.y);
    s.enemies = [above, right];
    s.player.attackTimerMs = 1_000;
    stepSurvivor(s, { dx: 0, dy: -1 }, 16);
    s.player.attackTimerMs = 0;
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(above.hp).toBeLessThan(1000);
    expect(right.hp).toBe(1000);
    const fx = s.fx.find((mark) => mark.kind === 'cone');
    expect(fx?.angle).toBeCloseTo(-Math.PI / 2);
    expect(fx?.moveType).toBe('fighting');
  });

  it('no BONK a frente é a câmera: andar de lado não vira o cone para o lado', () => {
    const s = run('fighting', 'cone');
    const ahead = dummy(1, s.player.x, s.player.y + 70);
    const side = dummy(2, s.player.x + 70, s.player.y);
    s.enemies = [ahead, side];
    // Câmera olhando para +y e o jogador andando de lado (+x no mundo).
    stepSurvivor(s, { dx: 1, dy: 0, aimAngle: Math.PI / 2 }, 16);
    expect(ahead.hp).toBeLessThan(1000);
    expect(side.hp).toBe(1000);
  });
});

describe('órbita', () => {
  it('orbitais giram em volta do jogador, na distância do golpe', () => {
    const s = run('grass', 'orbit');
    const before = survivorOrbiters(s.player);
    expect(before).toHaveLength(3);
    for (const orbiter of before) {
      expect(Math.hypot(orbiter.x - s.player.x, orbiter.y - s.player.y)).toBeCloseTo(survivorOrbitRadius(s.player));
    }
    stepSurvivor(s, { dx: 0, dy: 0 }, 100);
    expect(survivorOrbiters(s.player)[0]!.angle).toBeGreaterThan(before[0]!.angle);
  });

  it('acerta só por contato: um inimigo entre os orbitais espera um deles passar', () => {
    const s = run('bug', 'orbit');
    const radius = survivorOrbitRadius(s.player);
    // No meio do caminho entre o primeiro e o segundo orbital, logo à frente da rotação.
    const gap = (Math.PI * 2) / survivorOrbitCount(s.player) / 2;
    const enemy = dummy(1, s.player.x + Math.cos(gap) * radius, s.player.y + Math.sin(gap) * radius);
    s.enemies = [enemy];
    const hitRadius = survivorOrbiterHitRadius(s.player);
    const nearest = Math.min(...survivorOrbiters(s.player).map((o) => Math.hypot(o.x - enemy.x, o.y - enemy.y)));
    expect(nearest).toBeGreaterThan(hitRadius + enemy.radius);
    stepSurvivor(s, { dx: 0, dy: 0 }, 1);
    expect(enemy.hp).toBe(1000);
    let steps = 0;
    while (enemy.hp === 1000 && steps < 200) { stepSurvivor(s, { dx: 0, dy: 0 }, 10); steps++; }
    expect(enemy.hp).toBeLessThan(1000);
    expect(steps).toBeGreaterThan(1);
  });

  it('não acerta o mesmo inimigo a cada quadro e não pulsa como a aura', () => {
    const s = run('grass', 'orbit');
    const [first] = survivorOrbiters(s.player);
    const enemy = dummy(1, first!.x, first!.y, 10_000);
    s.enemies = [enemy];
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    const afterFirst = enemy.hp;
    expect(afterFirst).toBeLessThan(10_000);
    stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(enemy.hp).toBe(afterFirst);
    expect(s.fx.some((mark) => mark.kind === 'pulse')).toBe(false);
  });

  it('o Disparo múltiplo acrescenta orbitais até o limite', () => {
    const s = run('grass', 'orbit');
    for (let i = 0; i < 6; i++) {
      s.pendingUpgrade = [{ id: 'multishot', name: '', description: '' }];
      applyUpgrade(s, 'multishot');
    }
    expect(survivorOrbitCount(s.player)).toBe(SURVIVOR_ORBIT_MAX);
    expect(survivorOrbiters(s.player)).toHaveLength(SURVIVOR_ORBIT_MAX);
  });
});
