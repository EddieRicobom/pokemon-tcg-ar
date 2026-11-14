import { describe, expect, it } from 'vitest';
import { HELD_ITEM_BY_ID, HELD_OFFER_PREFIX, heldMods, heldProjectileLook } from './survivor-held';
import type { HeldItemId } from './survivor-held';
import { applyUpgrade, createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';

const ITEMS: HeldItemId[] = ['garra-agarrar', 'presa-afiada', 'cauda-lenta', 'faixa-escolha', 'oculos-escolha', 'lenco-escolha'];

describe('seis novos transformadores ofensivos', () => {
  for (const id of ITEMS) {
    it(`${id} altera o golpe em área e mostra seu efeito`, () => {
      const move = { ...moveFor(['normal'], null), category: 'area' as const, estimated: false };
      const state = createSurvivorState(37, { kindCount: 1, move, profile: attackProfile(move, null) });
      state.nextBossAtMs = Infinity;
      state.spawnAccumMs = -1e9;
      state.pendingUpgrade = [{ id: `${HELD_OFFER_PREFIX}${id}`, name: id, description: '' }];
      applyUpgrade(state, `${HELD_OFFER_PREFIX}${id}`);
      const startX = state.player.x + 55;
      for (let i = 0; i < 5; i++) {
        const enemy: SurvivorEnemy = { id: 910 + i, kind: 0, boss: false, grade: 'comum', x: startX + i * 18, y: state.player.y, hp: 1e6, maxHp: 1e6, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
        state.enemies.push(enemy);
      }
      const effectKinds = new Set<string>();
      let showedColor = false;
      let queued = false;
      let shards = false;
      for (let i = 0; i < 250; i++) {
        stepSurvivor(state, { dx: 0, dy: 0 }, 16);
        for (const fx of state.fx) {
          effectKinds.add(fx.kind);
          if (fx.kind !== 'evolve' && fx.color === HELD_ITEM_BY_ID[id].color) showedColor = true;
        }
        queued ||= (state.heldQueue?.length ?? 0) > 0;
        shards ||= state.projectiles.some((shot) => shot.look?.held?.fang);
      }
      expect(showedColor).toBe(true);
      expect(state.enemies.some((enemy) => enemy.hp < enemy.maxHp)).toBe(true);
      if (id === 'garra-agarrar') expect(state.enemies[0]!.x).toBeLessThan(startX);
      if (id === 'presa-afiada') expect(shards).toBe(true);
      if (id === 'cauda-lenta') expect(queued).toBe(true);
      if (id === 'faixa-escolha') expect(effectKinds.has('blast')).toBe(true);
      if (id === 'oculos-escolha') expect(effectKinds.has('chain')).toBe(true);
      if (id === 'lenco-escolha') expect(effectKinds.has('echo')).toBe(true);
    });
  }

  it('limita cópias e combina marcas no mesmo disparo', () => {
    const stacks = Object.fromEntries(ITEMS.map((id) => [id, 3])) as Partial<Record<HeldItemId, number>>;
    const mods = heldMods(stacks);
    expect([mods.grip, mods.fang, mods.tail, mods.band, mods.specs, mods.scarf]).toEqual([2, 2, 2, 2, 2, 2]);
    expect(heldProjectileLook(stacks)).toMatchObject({ grip: true, fang: true, tail: true, band: true, specs: true, scarf: true });
  });
});
