import { describe, expect, it } from 'vitest';
import { DEFAULT_VILLAGE_SCALE, VILLAGE_AR_TILT_DEG, VILLAGE_DIORAMA_OBJECT_TILT_DEG, VILLAGE_SCALE_RANGE, VILLAGE_DIORAMA_BANDS, villageDioramaBand, villageDioramaBandBounds, villageDioramaFps, VILLAGE_DIORAMA_RENDER_FPS, VILLAGE_DIORAMA_SCENE_FPS, normalizeVillageScale } from './ar-diorama';

describe('diorama AR da Vila', () => {
  it('limita o zoom a uma escala que ainda cabe no ambiente', () => {
    expect(normalizeVillageScale(-2)).toBe(VILLAGE_SCALE_RANGE.min);
    expect(normalizeVillageScale(9)).toBe(VILLAGE_SCALE_RANGE.max);
    expect(normalizeVillageScale('inválido')).toBe(DEFAULT_VILLAGE_SCALE);
  });

  it('permite ampliar o tamanho real da Vila até 3×', () => {
    expect(normalizeVillageScale(2.5)).toBe(2.5);
    expect(normalizeVillageScale(4)).toBe(3);
  });

  it('mantém o chão nivelado e deixa a perspectiva para as camadas 2.5D', () => {
    expect(VILLAGE_AR_TILT_DEG).toBe(0);
  });

  it('limita a taxa do diorama e respeita limites menores do jogador', () => {
    expect(villageDioramaFps(0, VILLAGE_DIORAMA_SCENE_FPS)).toBe(15);
    expect(villageDioramaFps(60, VILLAGE_DIORAMA_RENDER_FPS)).toBe(24);
    expect(villageDioramaFps(10, VILLAGE_DIORAMA_SCENE_FPS)).toBe(10);
    expect(villageDioramaFps(Number.NaN, VILLAGE_DIORAMA_SCENE_FPS)).toBe(15);
  });

  it('distribui os pés pelas faixas e preserva espaço para sprites altos', () => {
    const height = 600;
    expect(villageDioramaBand(-10, height)).toBe(0);
    expect(villageDioramaBand(250, height)).toBe(2);
    expect(villageDioramaBand(height, height)).toBe(VILLAGE_DIORAMA_BANDS - 1);
    const bounds = villageDioramaBandBounds(2, height);
    expect(bounds).toEqual({ top: 120, bottom: 316, anchor: 250 });
  });

  it('mantém sprites verticais sobre o piso do diorama', () => {
    expect(VILLAGE_DIORAMA_OBJECT_TILT_DEG).toBe(0);
  });
});

