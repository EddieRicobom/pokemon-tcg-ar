import { describe, expect, it, vi } from 'vitest';
import type { BufferGeometry, Material, Mesh, MeshBasicMaterial } from 'three';
import { ShinyAura } from './shiny-aura';
import { sparkleAt } from '../core/shiny-fx';

const meshes = (aura: ShinyAura): Mesh<BufferGeometry, MeshBasicMaterial>[] => aura.group.children as Mesh<BufferGeometry, MeshBasicMaterial>[];

describe('ShinyAura', () => {
  it('custa dois desenhos: o halo e todas as estrelas num só', () => {
    const aura = new ShinyAura();
    expect(meshes(aura)).toHaveLength(2);
    expect(meshes(aura)[1]!.geometry.index!.count).toBe(6 * 6);
    aura.dispose();
  });

  it('todos os shinies dividem texturas e o plano do halo', () => {
    const a = new ShinyAura();
    const b = new ShinyAura(0.5);
    const [haloA, starsA] = meshes(a);
    const [haloB, starsB] = meshes(b);
    expect(haloA!.material.map).toBe(haloB!.material.map);
    expect(starsA!.material.map).toBe(starsB!.material.map);
    expect(haloA!.geometry).toBe(haloB!.geometry);
    a.dispose();
    b.dispose();
  });

  it('as texturas só saem da GPU quando o último shiny sai', () => {
    const a = new ShinyAura();
    const b = new ShinyAura();
    const map = meshes(a)[0]!.material.map!;
    const plane = meshes(a)[0]!.geometry;
    const freedMap = vi.fn();
    const freedPlane = vi.fn();
    map.addEventListener('dispose', freedMap);
    plane.addEventListener('dispose', freedPlane);
    a.dispose();
    a.dispose();
    expect(freedMap).not.toHaveBeenCalled();
    b.dispose();
    expect(freedMap).toHaveBeenCalledTimes(1);
    expect(freedPlane).toHaveBeenCalledTimes(1);
    const c = new ShinyAura();
    expect(meshes(c)[0]!.material.map).not.toBe(map);
    c.dispose();
  });

  it('libera os recursos próprios de cada shiny e sai do pai', () => {
    const aura = new ShinyAura();
    const [halo, stars] = meshes(aura);
    const freed = vi.fn();
    for (const item of [halo!.material as Material, stars!.material as Material, stars!.geometry]) item.addEventListener('dispose', freed);
    aura.dispose();
    expect(freed).toHaveBeenCalledTimes(3);
    expect(aura.group.parent).toBeNull();
  });

  it('cada estrela fica onde a matemática manda, com alfa próprio por vértice', () => {
    const aura = new ShinyAura(0.5);
    const nowMs = 1234;
    aura.update(nowMs);
    const geometry = meshes(aura)[1]!.geometry;
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    expect(color.itemSize).toBe(4);
    for (let i = 0; i < 6; i++) {
      const s = sparkleAt(i, 6, nowMs / 1000);
      const v = i * 4;
      const cx = (position.getX(v) + position.getX(v + 3)) / 2;
      const cy = (position.getY(v) + position.getY(v + 3)) / 2;
      expect(cx).toBeCloseTo(s.x, 5);
      expect(cy).toBeCloseTo(0.5 + s.y, 5);
      if (s.alpha > 0.02) {
        expect(position.getX(v + 3) - position.getX(v)).toBeCloseTo(s.size, 5);
        expect(color.getW(v)).toBeCloseTo(s.alpha, 5);
      } else {
        expect(color.getW(v)).toBe(0);
      }
    }
    aura.dispose();
  });
});
