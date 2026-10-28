import { describe, expect, it } from 'vitest';
import { generateVillage, isWalkable, reachableFrom, tileAt } from './map';
import { cliffPart, elevationAt, MEW_STATUE, MEW_STATUE_FRONT, MOUNTAIN_GATE, MOUNTAIN_SPOTS, TERRACES } from './mountain';
import { pathStep } from './pathing';
import { makeWalker, advance, moving, tryStep, WALK_SPEED } from './actors';
import { TOWN } from './town-layout';
import { WEST } from './west';

describe('Monte Miragem', () => {
  it.each([1, 42, 20261014])('semente %i: os terraços sobem até a estátua, com paredões sólidos e escadas livres', (seed) => {
    const map = generateVillage(seed);
    expect(map.w).toBe(TOWN.w);
    TERRACES.forEach((t, i) => {
      // Paredão sul sólido fora da escada; a escada (2 de largura) é caminhável e leva ao patamar de cima.
      expect(tileAt(map, t.x1 - 1, t.y1)).toBe('cliff');
      for (const dx of [0, 1]) {
        expect(tileAt(map, t.stairsX + dx, t.y1)).toBe('stairs');
        expect(isWalkable(map, t.stairsX + dx, t.y1 - 2)).toBe(true);
        expect(isWalkable(map, t.stairsX + dx, t.y1 + 1)).toBe(true);
      }
      expect(elevationAt(map, t.x0 + 2, t.y0 + 1)).toBeGreaterThanOrEqual(i + 1);
    });
    expect(tileAt(map, MEW_STATUE.x, MEW_STATUE.y)).toBe('deco');
    expect(map.decor.some((d) => d.kind === 'mew-statue' && d.x === MEW_STATUE.x && d.y === MEW_STATUE.y)).toBe(true);
    const reached = reachableFrom(map, map.spawn.x, map.spawn.y);
    for (const p of [MEW_STATUE_FRONT, MOUNTAIN_GATE, ...MOUNTAIN_SPOTS]) expect(reached[p.y * map.w + p.x], JSON.stringify(p)).toBe(1);
    // Só se sobe pelas escadas: nenhum bloco caminhável do topo encosta direto no chão da Vila.
    for (let y = 0; y < map.h; y++) for (let x = 0; x < WEST; x++) {
      if (!isWalkable(map, x, y) || tileAt(map, x, y) === 'stairs') continue;
      const here = elevationAt(map, x, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (!isWalkable(map, nx, ny) || tileAt(map, nx, ny) === 'stairs') continue;
        expect(Math.abs(elevationAt(map, nx, ny) - here), `${x},${y}`).toBeLessThanOrEqual(0);
      }
    }
  });

  it('o treinador anda da praça até a frente da estátua pela trilha e pelas escadas', () => {
    const map = generateVillage(20261014);
    const player = makeWalker('eu', map.spawn.x, map.spawn.y, WALK_SPEED.player);
    let frames = 0;
    let climbed = false;
    const near = () => Math.abs(player.x - MEW_STATUE_FRONT.x) + Math.abs(player.y - MEW_STATUE_FRONT.y) <= 1;
    while (frames++ < 20000 && (moving(player) || !near())) {
      advance(player, 0.1);
      if (moving(player) || near()) continue;
      const d = pathStep(map, player, MEW_STATUE_FRONT, () => false);
      expect(d).not.toBeNull();
      if (d) tryStep(player, d, map, () => false);
      if (tileAt(map, player.x, player.y) === 'stairs') climbed = true;
    }
    expect(near()).toBe(true);
    expect(elevationAt(map, player.x, player.y)).toBe(TERRACES.length);
    expect(climbed).toBe(true);
  });

  it('cada bloco de penhasco sabe que parte mostra', () => {
    const t = TERRACES[0]!;
    expect(cliffPart(t.x0 + 3, t.y0)).toBe('top');
    expect(cliffPart(t.x0, t.y0 + 3)).toBe('side-left');
    expect(cliffPart(t.x1, t.y0 + 3)).toBe('side-right');
    expect(cliffPart(t.x0 + 1, t.y1 - 1)).toBe('face-top');
    expect(cliffPart(t.x0 + 1, t.y1)).toBe('face-bottom');
    expect(cliffPart(t.x0, t.y1)).toBe('corner-left');
    expect(cliffPart(t.x1, t.y1 - 1)).toBe('corner-right');
    expect(cliffPart(t.x0 + 1, t.y0 + 1)).toBeNull();
  });

  it('a cidade continua igual, só deslocada para dar lugar ao monte', () => {
    const map = generateVillage(20261014);
    expect(tileAt(map, TOWN.spawn.x, TOWN.spawn.y)).not.toBe('tree');
    expect(map.spawn).toEqual(TOWN.spawn);
    expect(map.buildings.find((b) => b.kind === 'dojo')!.x).toBe(WEST + 4);
  });
});
