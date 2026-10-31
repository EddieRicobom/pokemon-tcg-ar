import { describe, expect, it } from 'vitest';
import { ARCHETYPES, archetypesOf } from './archetypes';
import { ARCHETYPE_FX, FX_MAX_LAYERS, FX_STAGGER_MS, fxLabel, layerProgress, particleAt, planArchetypeFx, planDurationMs } from './archetype-fx';
import type { FxMotion } from './archetype-fx';

const MOTIONS: FxMotion[] = ['rise', 'fall', 'orbit', 'spiral', 'erupt', 'strike', 'impact', 'pop', 'ring', 'streak'];

describe('receitas dos arquétipos', () => {
  it('todo arquétipo tem uma animação, e só eles', () => {
    for (const x of ARCHETYPES) expect(ARCHETYPE_FX[x.id], x.id).toBeDefined();
    expect(Object.keys(ARCHETYPE_FX).sort()).toEqual(ARCHETYPES.map((x) => x.id).sort());
  });

  it('receitas válidas: selos com texto, paletas em hex e tamanhos razoáveis', () => {
    for (const [id, fx] of Object.entries(ARCHETYPE_FX)) {
      if (fx.shape === 'badge') expect(fx.badge, id).toBeTruthy();
      for (const c of [...fx.palette, ...(fx.tints ?? [])]) expect(c, id).toMatch(/^#[0-9a-f]{6}$/);
      expect(fx.count, id).toBeGreaterThan(0);
      expect(fx.size, id).toBeGreaterThan(0);
      expect(fx.size, id).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('plano da animação', () => {
  const charizard = archetypesOf({ dexId: 6, name: 'Charizard ex', setId: 'sv03', rarity: 'Special illustration rare' });

  it('cada arquétipo da carta vira uma camada, sobrepostas em sequência', () => {
    const plan = planArchetypeFx(charizard);
    expect(plan.map((l) => l.id).sort()).toEqual([...charizard].sort());
    plan.forEach((l, i) => expect(l.startMs).toBe(i * FX_STAGGER_MS));
    // A próxima camada começa antes de a anterior acabar: elas se sobrepõem.
    expect(plan[1]!.startMs).toBeLessThan(plan[0]!.startMs + plan[0]!.durationMs);
    expect(planDurationMs(plan)).toBe(Math.max(...plan.map((l) => l.startMs + l.durationMs)));
  });

  it('mecânica e raridade vêm antes de tipo e região', () => {
    const ids = planArchetypeFx(charizard).map((l) => l.id);
    expect(ids[0]).toBe('ex-moderno');
    expect(ids.indexOf('ilustracao-especial')).toBeLessThan(ids.indexOf('tipo-fire'));
    expect(ids.indexOf('tipo-fire')).toBeLessThan(ids.indexOf('regiao-kanto'));
  });

  it('ignora ids desconhecidos e limita o número de camadas', () => {
    expect(planArchetypeFx(['nao-existe'])).toEqual([]);
    const all = planArchetypeFx(ARCHETYPES.map((x) => x.id));
    expect(all).toHaveLength(FX_MAX_LAYERS);
    expect(planArchetypeFx(charizard, 100, 3)).toHaveLength(3);
  });

  it('selos simultâneos ficam em andares diferentes; o andar volta a ser usado quando libera', () => {
    const plan = planArchetypeFx(['ex-moderno', 'secreta', 'basico', 'regiao-kanto', 'tipo-fire']);
    const pops = plan.filter((l) => l.recipe.motion === 'pop');
    for (const a of pops) {
      for (const b of pops) {
        const overlap = a !== b && a.startMs < b.startMs + b.durationMs && b.startMs < a.startMs + a.durationMs;
        if (overlap) expect(a.lane).not.toBe(b.lane);
      }
    }
    expect(plan.find((l) => l.id === 'tipo-fire')!.lane).toBe(0);
    const spaced = planArchetypeFx(['ex-moderno', 'secreta'], 2000);
    expect(spaced.map((l) => l.lane)).toEqual([0, 0]);
  });

  it('progresso da camada só existe enquanto ela toca', () => {
    const layer = planArchetypeFx(['tipo-fire', 'rara'])[1]!;
    expect(layerProgress(layer, layer.startMs - 1)).toBeNull();
    expect(layerProgress(layer, layer.startMs)).toBe(0);
    expect(layerProgress(layer, layer.startMs + layer.durationMs / 2)).toBeCloseTo(0.5);
    expect(layerProgress(layer, layer.startMs + layer.durationMs + 1)).toBeNull();
  });

  it('rótulo com ícone para a interface', () => {
    expect(fxLabel('tipo-fire')).toBe('🔥 Fogo');
    expect(fxLabel('nada')).toBe('nada');
  });
});

describe('movimento das partículas', () => {
  it('valores finitos, opacidade entre 0 e 1 e determinístico', () => {
    for (const motion of MOTIONS) {
      for (let i = 0; i < 8; i++) {
        for (let t = 0; t <= 1; t += 0.05) {
          const p = particleAt(motion, i, 8, t);
          for (const v of Object.values(p)) expect(Number.isFinite(v), `${motion} ${i} ${t}`).toBe(true);
          expect(p.alpha).toBeGreaterThanOrEqual(0);
          expect(p.alpha).toBeLessThanOrEqual(1);
          expect(p.frame).toBeGreaterThanOrEqual(0);
          expect(p.frame).toBeLessThanOrEqual(1);
          expect(particleAt(motion, i, 8, t)).toEqual(p);
        }
      }
    }
  });

  it('tudo some no fim da camada', () => {
    for (const motion of MOTIONS) for (let i = 0; i < 6; i++) expect(particleAt(motion, i, 6, 1).alpha, motion).toBeLessThan(0.05);
  });

  it('chuva cai do alto, fogo sobe do chão e selo fica acima da cabeça', () => {
    const fall = [0.1, 0.5, 0.9].map((t) => particleAt('fall', 0, 1, t).z).filter((z) => z > 0);
    expect(fall).toEqual([...fall].sort((a, b) => b - a));
    expect(particleAt('rise', 0, 1, 0.9).z).toBeGreaterThan(particleAt('rise', 0, 1, 0.5).z);
    expect(particleAt('pop', 0, 1, 0.5).z).toBeGreaterThan(1);
    expect(particleAt('ring', 0, 1, 0.5).z).toBe(0);
  });
});
