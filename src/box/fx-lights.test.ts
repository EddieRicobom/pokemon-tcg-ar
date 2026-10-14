import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { ambientFromSample, FloorPools, FRAGMENT_PARS, FxLights, lightFalloff, MAX_FX_LIGHTS, patchRelightShader } from './fx-lights';
import type { FxLight } from './fx-lights';

const light = (over: Partial<FxLight> = {}): FxLight => ({ x: 0, y: 0, z: 0, color: 0xff0000, intensity: 1, radius: 1, ...over });

describe('queda da luz', () => {
  it('é máxima no ponto, cai com a distância e zera longe', () => {
    expect(lightFalloff(0, 1)).toBeCloseTo(1);
    expect(lightFalloff(1, 1)).toBeCloseTo(0.5);
    expect(lightFalloff(0.5, 1)).toBeGreaterThan(lightFalloff(1.5, 1));
    expect(lightFalloff(2.5, 1)).toBe(0);
    expect(lightFalloff(10, 1)).toBe(0);
  });
});

describe('FxLights', () => {
  it('fica com as mais fortes e converte para o mundo (posição e alcance)', () => {
    const root = new Group();
    root.position.set(10, 0, 0);
    root.scale.setScalar(0.5);
    const lights = new FxLights();
    const list = [light({ intensity: 0.2 }), light({ x: 1, intensity: 1, radius: 2 }), light({ intensity: 0.5 }), light({ intensity: 0.4 }), light({ intensity: 0.3 })];
    lights.setLights(list, root);
    expect(lights.count).toBe(MAX_FX_LIGHTS);
    // A mais forte vem primeiro: x local 1 → mundo 10 + 0,5; alcance 2 → 1.
    expect(lights.uniforms.uLightPos.value[0]!.x).toBeCloseTo(10.5);
    expect(lights.uniforms.uLightRad.value[0]).toBeCloseTo(1);
    // A mais fraca (0,2) ficou de fora.
    const strengths = lights.uniforms.uLightCol.value.map((v) => v.x);
    expect(Math.min(...strengths)).toBeGreaterThan(0.1);
  });

  it('apaga as vagas sem luz e ignora intensidade ~0', () => {
    const lights = new FxLights();
    lights.setLights([light(), light({ intensity: 0 })], null);
    expect(lights.count).toBe(1);
    lights.setLights([], null);
    expect(lights.count).toBe(0);
    expect(lights.uniforms.uLightCol.value.every((v) => v.lengthSq() === 0)).toBe(true);
  });

  it('a cor da luz multiplica pela intensidade (vermelho puro só tem canal R)', () => {
    const lights = new FxLights();
    lights.setLights([light({ color: 0xff0000, intensity: 0.5 })], null);
    const v = lights.uniforms.uLightCol.value[0]!;
    expect(v.x).toBeCloseTo(0.5);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });
});

describe('shader de relight', () => {
  it('injeta uniformes, varyings e a chamada antes do fim do fragmento', () => {
    const lights = new FxLights();
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main(){\nvec3 outgoingLight = vec3(1.0);\n#include <opaque_fragment>\n}',
    };
    patchRelightShader(shader as never, lights);
    expect(shader.uniforms.uLightPos).toBe(lights.uniforms.uLightPos);
    expect(shader.uniforms.uAmbient).toBe(lights.uniforms.uAmbient);
    expect(shader.vertexShader).toContain('vRlWorld = ');
    expect(shader.fragmentShader).toContain('outgoingLight = relight(outgoingLight);');
    expect(shader.fragmentShader.indexOf('relight(outgoingLight)')).toBeLessThan(shader.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(FRAGMENT_PARS).toContain(`uniform vec3 uLightPos[${MAX_FX_LIGHTS}]`);
  });
});

describe('luz do ambiente real', () => {
  const sample = (r: number, g: number, b: number, n = 48) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => [r, g, b, 255][i % 4]!);

  it('cena escura escurece os sprites um pouco; clara não passa de ~1,06', () => {
    const dark = ambientFromSample(sample(20, 20, 20));
    const normal = ambientFromSample(sample(100, 100, 100));
    const bright = ambientFromSample(sample(250, 250, 250));
    expect(dark.r).toBeLessThan(normal.r);
    expect(dark.r).toBeGreaterThanOrEqual(0.8);
    expect(bright.r).toBeLessThanOrEqual(1.07);
    expect(normal.r).toBeCloseTo(1, 1);
  });

  it('luz amarelada esquenta o sprite, mas só um pouco', () => {
    const warm = ambientFromSample(sample(200, 160, 90));
    expect(warm.r).toBeGreaterThan(warm.b);
    expect(warm.r / warm.b).toBeLessThan(1.25);
  });

  it('sem amostra devolve neutro', () => {
    expect(ambientFromSample([])).toMatchObject({ r: 1, g: 1, b: 1 });
  });
});

describe('poças de luz no chão', () => {
  it('uma poça por luz, sob ela e com a cor dela; as demais somem', () => {
    const pools = new FloorPools();
    pools.update([light({ x: 0.3, z: -0.2, color: 0x00ff00, intensity: 1, radius: 1 })]);
    const [first, second] = pools.group.children as unknown as { visible: boolean; position: Vector3; material: { color: { g: number; r: number } } }[];
    expect(first!.visible).toBe(true);
    expect(first!.position.x).toBeCloseTo(0.3);
    expect(first!.position.z).toBeCloseTo(-0.2);
    expect(first!.material.color.g).toBeGreaterThan(first!.material.color.r);
    expect(second!.visible).toBe(false);
    pools.update([]);
    expect(first!.visible).toBe(false);
    pools.dispose();
  });
});
