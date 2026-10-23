import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import HomeInteriorMap from './HomeInteriorMap.vue';

describe('mapa do interior', () => {
  it('permite examinar móveis de moradores sem recolhê-los e sair pela porta', async () => {
    const host = document.createElement('div'); document.body.append(host);
    let moved = 0, exits = 0;
    const app = createApp(HomeInteriorMap, {
      interior: { wallpaper: 'floral', floor: 'xadrez', placed: [{ x: 3, y: 4, item: 'mesa-jantar' }] },
      residents: [{ id: 'a', name: 'Fofinho' }], editable: false,
      itemName: () => 'Mesa de jantar', icon: () => 'mesa.png',
      onCell: () => { moved++; }, onExit: () => { exits++; },
    });
    app.mount(host);
    expect(host.querySelectorAll('.home-furniture')).toHaveLength(1); // inclusive móveis antigos junto à entrada
    (host.querySelector('.home-furniture') as HTMLButtonElement).click(); await nextTick();
    expect(host.querySelector('.home-inspection')?.textContent).toContain('refeições');
    expect(moved).toBe(0);
    (host.querySelector('.home-map-door') as HTMLButtonElement).click();
    expect(exits).toBe(1);
    expect(host.querySelector('.home-empty')).toBeNull();
    app.unmount(); host.remove();
  });
  it('separa examinar e guardar, e mantém a porta disponível durante a decoração', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const moves: unknown[] = [];
    const app = createApp(HomeInteriorMap, {
      interior: { wallpaper: 'creme', floor: 'carvalho', placed: [{ x: 1, y: 1, item: 'comoda' }] },
      residents: [{ id: 'player', name: 'Treinador' }], editable: true,
      itemName: () => 'Cômoda', icon: () => 'comoda.png', onCell: (p: unknown) => moves.push(p),
    });
    app.mount(host);
    (host.querySelector('.home-furniture') as HTMLButtonElement).click();
    expect(moves).toHaveLength(0);
    (host.querySelector('.home-edit-toggle') as HTMLButtonElement).click(); await nextTick();
    (host.querySelector('.home-furniture') as HTMLButtonElement).click();
    expect(moves).toEqual([{ x: 1, y: 1 }]);
    expect(host.querySelectorAll('.home-empty')).toHaveLength(33);
    expect(host.querySelector('.home-map-door')).not.toBeNull();
    app.unmount(); host.remove();
  });
});
