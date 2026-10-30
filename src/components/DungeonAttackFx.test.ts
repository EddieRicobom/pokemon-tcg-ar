import { createApp, h } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import DungeonAttackFx from './DungeonAttackFx.vue';
import { WEAPONS } from '../core/dungeon';
import type { WeaponId } from '../core/dungeon';

let host: HTMLDivElement | null = null;

afterEach(() => { host?.remove(); host = null; });

describe('DungeonAttackFx', () => {
  it('desenha um impacto próprio para cada arma do catálogo', () => {
    for (const weapon of Object.keys(WEAPONS) as WeaponId[]) {
      host = document.createElement('div');
      document.body.append(host);
      createApp({ render: () => h(DungeonAttackFx, { weapon, ammo: 'electric' }) }).mount(host);

      expect(host.querySelector(`.fx-${weapon}`)).not.toBeNull();
      expect(host.querySelector('svg .fx-hot, svg .fx-stroke, svg .fx-ring, svg .fx-beam')).not.toBeNull();
      host.remove();
    }
  });
});
