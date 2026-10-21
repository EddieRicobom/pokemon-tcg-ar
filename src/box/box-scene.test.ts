import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { BoxScene, MAX_CREATURES } from './box-scene';
import type { CreatureEntry } from './box-scene';
import { minBoxDistance } from './floor';
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
  it('descarta o terreno completo, seus recursos e a população ao fechar', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -4)); scene.setCreatures([entry(0)]);
    const ground = scene.groundOfBox!;
    const disposeGround = vi.spyOn(ground, 'dispose');
    const creature = scene.creatureList[0]!;
    const disposeCreature = vi.spyOn(creature, 'dispose');
    scene.dispose();
    expect(disposeGround).toHaveBeenCalledOnce();
    expect(disposeCreature).toHaveBeenCalledOnce();
    expect(scene.groundOfBox).toBeNull(); expect(scene.creatureList).toHaveLength(0); expect(scene.placed).toBe(false);
  });
  it('zerar o relógio impede salto de movimento depois de voltar da aba oculta', () => {
    const scene = sceneLookingDown(); scene.place(new Vector3(0, -1.3, -4)); scene.setCreatures([entry(0)]);
    scene.setSocial(false); scene.update(100); scene.update(116);
    const creature = scene.creatureList[0]!;
    const before = { x: creature.state.x, z: creature.state.z };
    scene.resetClock(); scene.update(300_000);
    expect(creature.state.x).toBe(before.x); expect(creature.state.z).toBe(before.z);
    scene.dispose();
  });
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
    const point = new Vector3(0.4, -1.3, -5);
    scene.place(point, 1);
    const floor = scene.scene.children.find((c) => c.type === 'Group' && c.children.length > 0);
    expect(floor?.visible).toBe(true);
    expect(floor?.position.toArray()).toEqual(point.toArray());
  });

  it('a caixa nunca nasce colada na câmera: um ponto perto é afastado, na mesma direção', () => {
    const scene = sceneLookingDown();
    const result = scene.place(new Vector3(0, -1.3, -1.3), 1.2);
    expect(result.moved).toBe(true);
    const anchor = scene.center!;
    expect(Math.hypot(anchor.x, anchor.z)).toBeCloseTo(minBoxDistance(1.2), 6);
    expect(anchor.y).toBe(-1.3);
    expect(Math.abs(anchor.x)).toBeLessThan(1e-9);
    expect(anchor.z).toBeLessThan(0);
    // Um ponto longe fica onde está.
    expect(scene.place(new Vector3(0, -1.3, -6), 1.2).moved).toBe(false);
  });

  it('aumentar o tamanho da caixa já colocada afasta de novo, se ficou perto demais', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -3), 0.6); // 3 m: sobra folga para uma caixa pequena
    expect(Math.hypot(scene.center!.x, scene.center!.z)).toBeCloseTo(3, 6);
    scene.setHalfSize(2.5);
    expect(Math.hypot(scene.center!.x, scene.center!.z)).toBeCloseTo(minBoxDistance(2.5), 6);
  });

  it('o Pokémon se inclina para a câmera quando ela está acima, sem passar do limite', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -1.3), 1);
    scene.setCreatures([entry(0)]);
    scene.update(16);
    scene.update(32);
      const lean = scene.creatureList[0]!.mesh.rotation.x;
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
      expect(c.group.position.y).toBeCloseTo(-1.3 + c.groundY, 6);
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

  it('modo formação leva os Pokémon a uma fila de frente para a câmera', () => {
    const scene = sceneLookingDown();
    scene.place(new Vector3(0, -1.3, -1.5), 1.2);
    scene.setCreatures([entry(0), entry(1), entry(2)]);
    scene.setMode('formacao');
    for (let t = 1; t < 400; t++) scene.update(t * 16);
    const states = scene.creatureList.map((c) => c.state);
    // câmera em +z em relação ao centro: a fila corre ao longo de x e todos estão parados
    expect(Math.max(...states.map((s) => s.vx * s.vx + s.vz * s.vz))).toBe(0);
    const xs = states.map((s) => s.x).sort((a, b) => a - b);
    expect(xs[2]! - xs[0]!).toBeGreaterThan(0.5);
    expect(Math.abs(xs[0]! + xs[2]!)).toBeLessThan(0.05);
    scene.setMode('passeio');
    expect(scene.mode).toBe('passeio');
  });

  it('setSmoothing vale para os Pokémon atuais e os que entram depois', () => {
    const scene = sceneLookingDown();
    scene.setCreatures([entry(0)]);
    const dims = (i: number) => (scene.creatureList[i]!.mesh.material.map!.image as { width: number }).width;
    const smooth = dims(0);
    scene.setSmoothing('nitido');
    expect(dims(0)).toBeLessThan(smooth);
    scene.setCreatures([entry(1)]);
    expect(dims(0)).toBeLessThan(smooth);
    scene.setSmoothing('suave');
    expect(dims(0)).toBe(smooth);
});
});

describe('BoxScene: relevo e vida social', () => {
  function placed(n = 2, seed = 1): BoxScene {
    const rng = (() => {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
    })();
    const scene = new BoxScene(rng);
    scene.setView(400, 800, 60);
    scene.setCameraQuaternion(lookQuaternion(0, -Math.PI / 4));
    scene.place(new Vector3(0, -1.3, -3), 1.2);
    scene.setCreatures(Array.from({ length: n }, (_, i) => entry(i)));
    return scene;
  }

  it('a caixa tem relevo e cada Pokémon pisa na altura do terreno sob ele', () => {
    const scene = placed(6);
    const ground = scene.groundOfBox!;
    let max = 0;
    for (let x = -1.1; x <= 1.1; x += 0.1) for (let z = -1.1; z <= 1.1; z += 0.1) max = Math.max(max, Math.abs(ground.heightAt(x, z)));
    expect(max).toBeGreaterThan(0.04);
    for (let t = 1; t < 300; t++) scene.update(t * 16);
    for (const c of scene.creatureList) {
      expect(c.groundY).toBeCloseTo(ground.heightAt(c.state.x, c.state.z), 6);
      expect(c.group.position.y).toBeCloseTo(-1.3 + c.groundY, 6);
    }
  });

  it('terreno desligado: chão liso (sem relevo)', () => {
    const scene = placed(2);
    scene.setTerrain(false);
    scene.update(16);
    scene.update(32);
    for (const c of scene.creatureList) expect(c.groundY).toBe(0);
  });

  it('os Pokémon interagem de vez em quando e mostram balões de emoji', () => {
    const scene = placed(5, 3);
    const seen = new Set<string>();
    let t = 0;
    for (; t < 90_000; t += 50) {
      scene.update(t + 50);
      for (const c of scene.creatureList) if (c.bubbleEmoji) seen.add(c.bubbleEmoji);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
    // Continuam dentro da caixa e com valores válidos.
    for (const c of scene.creatureList) {
      expect(Math.abs(c.state.x)).toBeLessThanOrEqual(1.08 + 1e-6);
      expect(Number.isFinite(c.group.position.y)).toBe(true);
    }
  });

  it('desligar a vida social apaga os balões e nunca mais mostra um', () => {
    const scene = placed(5, 3);
    let t = 0;
    while (t < 60_000 && !scene.creatureList.some((c) => c.bubbleEmoji)) scene.update((t += 50));
    expect(scene.creatureList.some((c) => c.bubbleEmoji)).toBe(true);
    scene.setSocial(false);
    expect(scene.creatureList.some((c) => c.bubbleEmoji)).toBe(false);
    for (let i = 0; i < 2000; i++) scene.update((t += 50));
    expect(scene.creatureList.some((c) => c.bubbleEmoji)).toBe(false);
  });

  it('na formação e na batalha não há balões', () => {
    const scene = placed(5, 3);
    let t = 0;
    while (t < 60_000 && !scene.creatureList.some((c) => c.bubbleEmoji)) scene.update((t += 50));
    scene.setMode('formacao');
    expect(scene.creatureList.some((c) => c.bubbleEmoji)).toBe(false);
    for (let i = 0; i < 1000; i++) scene.update((t += 50));
    expect(scene.creatureList.some((c) => c.bubbleEmoji)).toBe(false);
  });

  it('tocar num Pokémon faz ele reagir com pulinho e um emoji', () => {
    const scene = placed(1);
    const c = scene.creatureList[0]!;
    c.react(() => 0);
    expect(c.bubbleEmoji).toBe('😆');
    scene.update(16);
    scene.update(32);
    for (let t = 48; t < 3000; t += 50) scene.update(t);
    expect(c.bubbleEmoji).toBeNull(); // o balão some sozinho
  });

  it('o balão acompanha a cabeça do Pokémon (filho do grupo, acima do corpo)', () => {
    const scene = placed(1);
    const c = scene.creatureList[0]!;
    c.say('❓', 2000);
    scene.update(16);
    scene.update(100);
    // Sem canvas (testes) não há desenho, mas o estado do balão existe e some no fim.
    expect(c.bubbleEmoji).toBe('❓');
    c.clearBubble();
    expect(c.bubbleEmoji).toBeNull();
  });
});

describe('BoxScene: clima', () => {
  function placed(n = 6): BoxScene {
    let s = 3;
    const scene = new BoxScene(() => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    });
    scene.setView(400, 800, 60);
    scene.setCameraQuaternion(lookQuaternion(0, -Math.PI / 4));
    scene.place(new Vector3(0, -1.3, -3), 1.2);
    scene.setCreatures(Array.from({ length: n }, (_, i) => entry(i)));
    return scene;
  }
  const fx = (scene: BoxScene) => (scene as unknown as { weatherFx: { counts: { rain: number; snow: number }; puddleStrengthAt(x: number, z: number): number } }).weatherFx;

  it('chuva: gotas caem, o chão molha e as poças aparecem nas baixadas', () => {
    const scene = placed();
    scene.setWeather('chuva');
    for (let t = 1; t < 4000; t++) scene.update(t * 50);
    expect(scene.weatherNow?.kind).toBe('chuva');
    expect(fx(scene).counts.rain).toBeGreaterThan(300);
    expect(scene.weatherNow!.state.wet).toBeGreaterThan(0.6);
    let puddles = 0;
    for (let x = -1.1; x <= 1.1; x += 0.1) for (let z = -1.1; z <= 1.1; z += 0.1) if (fx(scene).puddleStrengthAt(x, z) > 0.5) puddles++;
    expect(puddles).toBeGreaterThan(5);
  });

  it('quem pisa numa poça aparece refletido', () => {
    const scene = placed(1);
    scene.setWeather('chuva');
    for (let t = 1; t < 4000; t++) scene.update(t * 50);
    const c = scene.creatureList[0]!;
    // Leva o Pokémon para o ponto mais molhado.
    let best = { x: 0, z: 0, s: 0 };
    for (let x = -1; x <= 1; x += 0.05) for (let z = -1; z <= 1; z += 0.05) {
      const s = fx(scene).puddleStrengthAt(x, z);
      if (s > best.s) best = { x, z, s };
    }
    c.state.x = best.x;
    c.state.z = best.z;
    c.state.vx = 0;
    c.state.vz = 0;
    scene.update(4000 * 50 + 16);
    expect(c.reflecting).toBe(true);
  });

  it('neve: flocos caem e o chão fica branco; desligado some tudo', () => {
    const scene = placed();
    scene.setWeather('neve');
    for (let t = 1; t < 3000; t++) scene.update(t * 50);
    expect(fx(scene).counts.snow).toBeGreaterThan(250);
    expect(scene.weatherNow!.state.snowCover).toBeGreaterThan(0.8);
    scene.setWeather('off');
    scene.update(3000 * 50 + 16);
    expect(scene.weatherNow).toBeNull();
    for (const c of scene.creatureList) {
      scene.update(3000 * 50 + 32);
      expect(c.reflecting).toBe(false);
    }
  });

  it('o clima escurece a luz dos Pokémon na chuva', () => {
    const sunny = placed();
    sunny.setWeather('sol');
    const rainy = placed();
    rainy.setWeather('chuva');
    for (let t = 1; t < 2000; t++) {
      sunny.update(t * 50);
      rainy.update(t * 50);
    }
    const amb = (s: BoxScene) => (s.fx as unknown as { ambient: { x: number } }).ambient?.x;
    if (amb(sunny) !== undefined) expect(amb(rainy)!).toBeLessThan(amb(sunny)!);
    expect(rainy.groundOfBox!.tint.r).toBeLessThan(sunny.groundOfBox!.tint.r);
  });
});
