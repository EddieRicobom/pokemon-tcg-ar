import { describe, expect, it } from 'vitest';
import { normalizeSurvivorMusicSettings } from './survivor-music';

describe('preferências de áudio da Torre', () => {
  it('mantém os sons de ataque ligados por padrão e aceita desligá-los separadamente', () => {
    expect(normalizeSurvivorMusicSettings(null).attackSounds).toBe(true);
    expect(normalizeSurvivorMusicSettings({ attackSounds: false }).attackSounds).toBe(false);
  });

  it('liga o tratamento 8-bit por padrão e respeita a escolha salva', () => {
    expect(normalizeSurvivorMusicSettings(null).chip).toBe(true);
    expect(normalizeSurvivorMusicSettings({}).chip).toBe(true);
    expect(normalizeSurvivorMusicSettings({ chip: false }).chip).toBe(false);
    expect(normalizeSurvivorMusicSettings({ chip: 'não' }).chip).toBe(true);
  });
});
