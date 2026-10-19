import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGIONAL_ENCOUNTERS, REGIONAL_ENEMY_SPRITES, REGIONAL_KIND_COUNT, regionalEnemyDexId } from './survivor-encounters';
import { REGION_DURATION_MS as D, REGION_TRANSITION_MS as T, SURVIVOR_REGIONS } from './survivor-regions';
import { applyUpgrade, BALANCE, createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorState } from './survivor';

describe('espécies regionais da Torre', () => {
  it('usa espécies da geração certa, com animações e arquivos locais reais', () => {
    const meta = JSON.parse(readFileSync('public/data/village-sprite-meta.json', 'utf8')) as Record<string, { a: Record<string, unknown> }>;
    const bounds = [0, 151, 251, 386, 493, 649, 721, 809, 905, 1025];
    expect(REGIONAL_ENCOUNTERS).toHaveLength(SURVIVOR_REGIONS.length);
    expect(new Set(REGIONAL_ENEMY_SPRITES).size).toBe(45);
    REGIONAL_ENCOUNTERS.forEach((r, i) => {
      expect(r.wild).toHaveLength(REGIONAL_KIND_COUNT);
      for (const dexId of [...r.wild, r.boss]) {
        expect(dexId).toBeGreaterThan(bounds[i]!);
        expect(dexId).toBeLessThanOrEqual(bounds[i + 1]!);
        expect(meta[String(dexId)]?.a.Walk).toBeDefined();
        expect(existsSync(`public/sprites/pokemon/${dexId}/Walk.png`)).toBe(true);
      }
    });
  });

  it('troca o elenco inteiro e o chefe em cada região, inclusive no loop', () => {
    for (let i = 0; i <= REGIONAL_ENCOUNTERS.length; i++) {
      const r = REGIONAL_ENCOUNTERS[i % REGIONAL_ENCOUNTERS.length]!;
      for (let kind = 0; kind < REGIONAL_KIND_COUNT; kind++) {
        const e = { id: 42, kind, boss: false };
        expect(regionalEnemyDexId(e, i * D)).toBe(r.wild[kind]);
        expect(regionalEnemyDexId({ ...e, boss: true }, i * D)).toBe(r.boss);
      }
    }
  });

  it('mistura os nascimentos em proporção à transição, sem trocar tudo de uma vez', () => {
    const incoming = (time: number): number => {
      let count = 0;
      for (let id = 1; id <= 4096; id++) {
        if (regionalEnemyDexId({ id, kind: 0, boss: false }, time) === 161) count++;
      }
      return count / 4096;
    };
    expect(incoming(D - T)).toBe(0);
    expect(incoming(D - T * 0.75)).toBeCloseTo(0.15625, 1);
    expect(incoming(D - T / 2)).toBeCloseTo(0.5, 1);
    expect(incoming(D - T * 0.25)).toBeCloseTo(0.84375, 1);
    expect(incoming(D)).toBe(1);
  });

  it('fixa a espécie no nascimento mesmo se o cenário muda ou é desligado', () => {
    const s = createSurvivorState(7, { kindCount: 4, enemyDexId: regionalEnemyDexId });
    s.elapsedMs = D - T - 100;
    s.nextBossAtMs = Infinity;
    s.nextTrainerAtMs = Infinity;
    s.finalBossAtMs = null;
    const interval = Math.max(BALANCE.spawnFloorMs, BALANCE.spawnStartMs - (s.elapsedMs / 1000) * BALANCE.spawnPerSecMs - s.wave * BALANCE.spawnPerWaveMs);
    s.spawnAccumMs = interval - 1;
    stepSurvivor(s, { dx: 0, dy: 0 }, 50);
    const enemy = s.enemies[0]!;
    expect(REGIONAL_ENCOUNTERS[0].wild).toContain(enemy.dexId);
    const dexId = enemy.dexId;
    s.elapsedMs = D + 100;
    s.spawnAccumMs = -1e9;
    stepSurvivor(s, { dx: 0, dy: 0 }, 50);
    expect(s.enemies.find((e) => e.id === enemy.id)?.dexId).toBe(dexId);
  });
});

function combatSnapshot(s: SurvivorState) {
  const { rng: _rng, enemyDexId: _appearance, evolutions: _evolutions, enemies, ...rest } = s;
  return { ...rest, enemies: enemies.map(({ dexId: _dex, kind: _kind, ...enemy }) => enemy) };
}

it('preserva combate, recompensas e RNG em ondas, treinadores, chefão e infinito', () => {
  for (const seed of [3, 17, 991]) {
    for (const infinite of [false, true]) {
      // O elenco anterior tinha 34 espécies; agora são quatro posições por região.
      const before = createSurvivorState(seed, { kindCount: 34, infinite });
      const regional = createSurvivorState(seed, { kindCount: 4, infinite, enemyDexId: regionalEnemyDexId });
      for (const time of [0, D - T / 2, D, 300_000, 600_000, 1_200_000, D * 9, D * 10]) {
        for (const s of [before, regional]) {
          s.elapsedMs = time;
          s.player.invulnMs = 1e9;
          s.player.attackDamage = 10000;
          s.player.attackRange = 2000;
          s.nextBossAtMs = time;
          s.nextTrainerAtMs = time;
        }
        for (let frame = 0; frame < 25; frame++) {
          const input = { dx: frame % 2, dy: -1 };
          expect(stepSurvivor(regional, input, 50)).toEqual(stepSurvivor(before, input, 50));
          for (const s of [before, regional]) {
            while (s.pendingUpgrade) applyUpgrade(s, s.pendingUpgrade[0]!.id);
          }
          const a = combatSnapshot(before);
          const b = combatSnapshot(regional);
          // kindCount só determina a aparência; o restante do estado é idêntico.
          expect({ ...b, kindCount: a.kindCount }).toEqual(a);
        }
      }
      expect(regional.rng()).toBe(before.rng());
    }
  }
});
