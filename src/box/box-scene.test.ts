import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BoxScene, MAX_CREATURES } from './box-scene';
import type { CreatureEntry } from './box-scene';
import { lookQuaternion } from './orientation';

function entry(i: number, size = 8): CreatureEntry {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let p = 0; p < size * size; p++) data.set([200, 50, 50, 255], p * 4);
  return { info: { id: `c${i}`, name: `Mon ${i}`, detail: 'Coleção 1/10', dexId: i + 1 }, source: { kind: 'image', image: { width: size, height: size, data } } };
}

function seeded(): () => number {
  let s = 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function sceneLookingDown(): BoxScene {
  const scene = new BoxScene(seeded());
  scene.setView(400, 800, 60);
  scene.setCameraQuaternion(lookQuaternion(0, -Math.PI / 4));
  return scene;
}

describe('BoxScene', () => {
  it('começa sem caixa e escondida', () => {
    const scene = new BoxScene(seeded());
    expect(scene.placed).toBe(false);
    expect(scene.center).toBeNull();
  });

  it('acha o chão no centro da tela quando a câmera olha para baixo', () => {
    const scene = sceneLookingDown();
    const r = scene.floorAt(0, 0, 1.3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.point.y).toBeCloseTo(-1.3, 5);
  });

  it('recusa chão quando a câmera olha para cima', () => {
    const scene = new BoxScene(seeded());
    scene.setView(400, 800, 60);
    scene.setCameraQuaternion(lookQuaternion(0, 0.5));
    expect(scene.floorAt(0, 0, 1.3).ok).toBe(false);
  });

  it('place / clearPlacement', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -1.3));
    expect(scene.placed).toBe(true);
    expect(scene.center?.y).toBeCloseTo(-1.3, 6);
    scene.clearPlacement();
    expect(scene.placed).toBe(false);
  });

  it('o chão da caixa é desenhado no ponto escolhido (não na origem da câmera)', () => {
    const scene = sceneLookingDown();
    const point = new Vector3(0.4, -1.3, -1.5);
    scene.place(point, 1);
    const floor = scene.scene.children.find((c) => c.type === 'Group' && c.children.length > 0);
    expect(floor?.visible).toBe(true);
    expect(floor?.position.toArray()).toEqual(point.toArray());
  });

  it('o Pokémon se inclina para a câmera quando ela está acima, sem passar do limite', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -1.3), 1);
    scene.setCreatures([entry(0)]);
    scene.update(16);
    scene.update(32);
    const lean = -scene.creatureList[0]!.mesh.rotation.x;
    expect(lean).toBeGreaterThan(0.1);
    expect(lean).toBeLessThanOrEqual(0.75);
  });

  it('limita a população e mantém todos dentro da caixa ao atualizar', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -1.3), 1);
    scene.setCreatures(Array.from({ length: MAX_CREATURES + 5 }, (_, i) => entry(i)));
    expect(scene.creatureList).toHaveLength(MAX_CREATURES);
    for (let t = 1; t < 400; t++) scene.update(t * 16);
    for (const c of scene.creatureList) {
      expect(Math.abs(c.state.x)).toBeLessThanOrEqual(0.9 + 1e-6);
      expect(Math.abs(c.state.z)).toBeLessThanOrEqual(0.9 + 1e-6);
      expect(c.group.position.y).toBeCloseTo(-1.3, 1);
    }
  });

  it('encolher a caixa traz quem estava fora para dentro', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -1.3), 2);
    scene.setCreatures([entry(0)]);
    const c = scene.creatureList[0]!;
    c.state.x = 1.7;
    scene.setHalfSize(0.5);
    expect(c.state.x).toBeLessThanOrEqual(0.45 + 1e-9);
  });

  it('criaturas ficam invisíveis até a caixa ser colocada', () => {
    const scene = sceneLookingDown();
    scene.setCreatures([entry(0)]);
    scene.update(16);
    expect(scene.creatureList[0]!.group.visible).toBe(false);
    scene.place(new Vector3(0, -1.3, -1.3));
    scene.update(32);
    expect(scene.creatureList[0]!.group.visible).toBe(true);
  });

  it('pick acerta o Pokémon sob o ponto e devolve null no vazio', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -1.3), 1);
    scene.setCreatures([entry(0)]);
    scene.update(16);
    scene.update(32);
    const c = scene.creatureList[0]!;
    // Projeta o meio do corpo do Pokémon para a tela.
    const target = c.group.position.clone().add(new Vector3(0, c.height / 2, 0)).project(scene.camera);
    expect(scene.pick(target.x, target.y)).toBe(c);
    expect(scene.pick(-0.99, 0.99)).toBeNull();
  });

  it('dispose esvazia a caixa', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -1.3));
    scene.setCreatures([entry(0), entry(1)]);
    scene.dispose();
    expect(scene.creatureList).toHaveLength(0);
  });
});
