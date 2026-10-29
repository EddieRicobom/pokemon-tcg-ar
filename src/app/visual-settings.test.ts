import { describe, expect, it } from 'vitest';
import { effectiveVisualSettings, normalizeVisual } from './visual-settings';

describe('configurações visuais', () => {
  it('aceita só modos de suavização conhecidos', () => {
    expect(normalizeVisual({ smoothing: 'macio' })).toMatchObject({ smoothing: 'macio', lighting: true, impactFx: true, terrain: true, social: true, weather: 'ciclo', scenery: true, sound: true, shadow: true, metallic: true, caseFx: true, villageFx: true, villageHd2d: false, evolutionFx: true, frameRate: 'auto', rotomMode: false });
    expect(normalizeVisual({ smoothing: 'xyz' as never })).toMatchObject({ smoothing: 'bordas', frameRate: 'auto', rotomMode: false });
    expect(normalizeVisual(null)).toMatchObject({ smoothing: 'bordas', frameRate: 'auto', rotomMode: false });
  });

  it('os reflexos da maleta vêm ligados e só desligam com false explícito', () => {
    expect(normalizeVisual({ caseFx: false }).caseFx).toBe(false);
    expect(normalizeVisual({ caseFx: 'x' as never }).caseFx).toBe(true);
  });

  it('os encontros e emoções vêm ligados e só desligam com false explícito', () => {
    expect(normalizeVisual({ social: false }).social).toBe(false);
    expect(normalizeVisual({ social: undefined }).social).toBe(true);
    expect(normalizeVisual({ social: 'x' as never }).social).toBe(true);
  });

  it('o som vem ligado e só desliga com false explícito', () => {
    expect(normalizeVisual({ sound: false }).sound).toBe(false);
    expect(normalizeVisual({ sound: undefined }).sound).toBe(true);
    expect(normalizeVisual({ sound: 'x' as never }).sound).toBe(true);
  });

  it('a luz dos golpes vem ligada e só desliga com false explícito', () => {
    expect(normalizeVisual({ lighting: false }).lighting).toBe(false);
    expect(normalizeVisual({ lighting: undefined }).lighting).toBe(true);
    expect(normalizeVisual({ lighting: 'x' as never }).lighting).toBe(true);
  });

  it('os impactos elementais intensos vêm ligados e respeitam a preferência para poupar a GPU', () => {
    expect(normalizeVisual({ impactFx: false }).impactFx).toBe(false);
    expect(normalizeVisual({ impactFx: undefined }).impactFx).toBe(true);
    expect(normalizeVisual({ impactFx: 'x' as never }).impactFx).toBe(true);
  });

  it('a sombra do Pokémon vem ligada e só desliga com false explícito', () => {
    expect(normalizeVisual({ shadow: false }).shadow).toBe(false);
    expect(normalizeVisual({ shadow: undefined }).shadow).toBe(true);
    expect(normalizeVisual({ shadow: 'x' as never }).shadow).toBe(true);
  });
});

describe('Modo Rotom', () => {
  it('aplica economia sem sobrescrever preferências e as restaura ao desligar', () => {
    const chosen = normalizeVisual({ rotomMode: true, frameRate: '30', impactFx: false, metallic: true, sound: false });
    const active = effectiveVisualSettings(chosen);
    expect(active).toMatchObject({ rotomMode: true, frameRate: '20', smoothing: 'nitido', impactFx: false, lighting: false, terrain: false, social: false, weather: 'off', scenery: false, shadow: false, metallic: false, caseFx: false, villageFx: false, evolutionFx: false, sound: false });
    expect(effectiveVisualSettings({ ...chosen, rotomMode: false })).toMatchObject({ frameRate: '30', smoothing: 'bordas', impactFx: false, terrain: true, social: true, scenery: true, metallic: true, caseFx: true, villageFx: true, sound: false, lighting: true, weather: 'ciclo' });
  });
});

describe('opção de clima', () => {
  it('guarda o modo do clima e cai no ciclo quando não conhece', () => {
    expect(normalizeVisual({ weather: 'neve' }).weather).toBe('neve');
    expect(normalizeVisual({ weather: 'off' }).weather).toBe('off');
    expect(normalizeVisual({ weather: 'granizo' as never }).weather).toBe('ciclo');
  });
});

describe('acabamento metálico dos Digital Pokémon', () => {
  it('vem ligado e só desliga com false explícito', () => {
    expect(normalizeVisual({ metallic: false }).metallic).toBe(false);
    expect(normalizeVisual({ metallic: undefined }).metallic).toBe(true);
    expect(normalizeVisual({ metallic: 'x' as never }).metallic).toBe(true);
  });
});

describe('efeitos da Vila', () => {
  it('migra saves antigos e preserva a escolha de desligar', () => {
    expect(normalizeVisual({}).villageFx).toBe(true);
    expect(normalizeVisual({ villageFx: false }).villageFx).toBe(false);
    // Halos noturnos e grama ao vento: ligados por padrão, desligáveis e desligados no modo Rotom.
    expect(normalizeVisual({})).toMatchObject({ villageGlow: true, villageWind: true, villageHd2d: false });
    expect(normalizeVisual({ villageGlow: false, villageWind: false, villageHd2d: true })).toMatchObject({ villageGlow: false, villageWind: false, villageHd2d: true });
    expect(effectiveVisualSettings({ ...normalizeVisual({ villageHd2d: true }), rotomMode: true })).toMatchObject({ villageGlow: false, villageWind: false, villageHd2d: false });
  });
});
